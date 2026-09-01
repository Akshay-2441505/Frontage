"""Diagnose Agent: scores how "agent-readable" a merchant's catalog currently is.

Checks are deliberately structural/deterministic (no LLM call) so the score is
reproducible run-to-run during the demo — the spec allows an LLM-assisted quality
flag as an option, but a flaky/non-deterministic Diagnose score would undermine the
"score improves after Fix" narrative the demo depends on.
"""
from collections import Counter

from sqlalchemy.orm import Session

from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, Mandate, Merchant

MIN_DESCRIPTION_LEN = 15

# Weighted by how much each gap actually blocks an AI shopping agent: no feed or no
# checkout means the agent can't act at all, so those two anchor the rubric. Clarity
# (can it tell what it would actually be buying) matters more than disambiguation
# (can it tell two listings apart), which matters more than prose quality -- most
# real catalogs already have descriptions, so that's no longer the differentiator it
# once was. Imagery helps a human confirm the agent's pick but isn't itself a blocker.
CHECK_WEIGHTS = {
    "agent_readable_feed": 25,
    "programmatic_checkout": 25,
    "price_availability_clarity": 20,
    "name_disambiguation": 15,
    "product_descriptions": 10,
    "product_imagery": 5,
}


def _description_ok(item: CatalogItem) -> bool:
    if not item.description:
        return False
    text = item.description.strip()
    return len(text) >= MIN_DESCRIPTION_LEN and text.lower() != item.name.strip().lower()


def _clarity_ok(item: CatalogItem) -> bool:
    if not item.availability:
        return False
    # A single-SKU product (has_variants=False) has nothing to disambiguate -- there's
    # no real ambiguity in a product that only comes one way, so missing variant_info
    # isn't a gap for it. It's only a gap when the product genuinely has multiple
    # purchasable forms that weren't captured.
    if item.has_variants and not item.variant_info:
        return False
    return True


def _imagery_ok(item: CatalogItem) -> bool:
    return bool(item.image_url)


def _fractional_check(check_name: str, items: list[CatalogItem], predicate, fail_detail_suffix: str, pass_detail_suffix: str) -> tuple[float, dict]:
    total = len(items)
    passed = sum(1 for i in items if predicate(i)) if total else 0
    failed = total - passed
    fraction = (passed / total) if total else 0
    gap = {
        "check_name": check_name,
        "status": "pass" if failed == 0 and total > 0 else "fail",
        "detail": (
            f"{failed} of {total} {fail_detail_suffix}"
            if failed > 0
            else f"All {total} {pass_detail_suffix}"
        ),
    }
    return fraction, gap


def run_diagnose(db: Session, merchant: Merchant) -> dict:
    items: list[CatalogItem] = merchant.catalog_items
    total = len(items)

    gaps = []
    score = 0.0

    # Check: description completeness/quality
    desc_fraction, desc_gap = _fractional_check(
        "product_descriptions",
        items,
        _description_ok,
        "products have no description or a description too thin to be useful to a shopping agent.",
        "products have usable descriptions.",
    )
    score += CHECK_WEIGHTS["product_descriptions"] * desc_fraction
    gaps.append(desc_gap)

    # Check: machine-readable manifest/feed exists
    latest_manifest = (
        db.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == merchant.id)
        .order_by(CatalogManifest.version.desc())
        .first()
    )
    if latest_manifest:
        score += CHECK_WEIGHTS["agent_readable_feed"]
        gaps.append(
            {
                "check_name": "agent_readable_feed",
                "status": "pass",
                "detail": f"Manifest v{latest_manifest.version} available at {latest_manifest.url}.",
            }
        )
    else:
        gaps.append(
            {
                "check_name": "agent_readable_feed",
                "status": "fail",
                "detail": "No agent-readable catalog manifest found — an AI agent has no "
                "structured feed to fetch for this merchant.",
            }
        )

    # Check: price / availability / variant clarity
    clarity_fraction, clarity_gap = _fractional_check(
        "price_availability_clarity",
        items,
        _clarity_ok,
        "products have ambiguous availability or missing variant info.",
        "products have unambiguous availability and variant info.",
    )
    score += CHECK_WEIGHTS["price_availability_clarity"] * clarity_fraction
    gaps.append(clarity_gap)

    # Check: name disambiguation (no two products share an exact name)
    name_counts = Counter(i.name for i in items)
    name_fraction, name_gap = _fractional_check(
        "name_disambiguation",
        items,
        lambda i: name_counts[i.name] == 1,
        "products share their name exactly with another product, making them indistinguishable to a shopping agent.",
        "products have a name that uniquely identifies them.",
    )
    score += CHECK_WEIGHTS["name_disambiguation"] * name_fraction
    gaps.append(name_gap)

    # Check: product imagery
    imagery_fraction, imagery_gap = _fractional_check(
        "product_imagery",
        items,
        _imagery_ok,
        "products have no product image, leaving a shopping agent nothing to show a buyer.",
        "products have a product image.",
    )
    score += CHECK_WEIGHTS["product_imagery"] * imagery_fraction
    gaps.append(imagery_gap)

    # Check: programmatic checkout available (merchant allow-listed under an active mandate)
    mandates = db.query(Mandate).all()
    checkout_available = any(merchant.id in (m.allow_listed_merchants or []) for m in mandates)
    if checkout_available:
        score += CHECK_WEIGHTS["programmatic_checkout"]
        gaps.append(
            {
                "check_name": "programmatic_checkout",
                "status": "pass",
                "detail": "A mandate-gated programmatic checkout is configured for this merchant.",
            }
        )
    else:
        gaps.append(
            {
                "check_name": "programmatic_checkout",
                "status": "fail",
                "detail": "No programmatic checkout is available — a buyer agent cannot "
                "complete a purchase without a human clicking through a UI.",
            }
        )

    reasoning = (
        f"Scored {merchant.name}: "
        f"{'a manifest exists' if latest_manifest else 'no manifest exists'}, "
        f"programmatic checkout is {'available' if checkout_available else 'not available'}, "
        f"clarity {round(clarity_fraction * 100)}%, names unique {round(name_fraction * 100)}%, "
        f"descriptions {round(desc_fraction * 100)}%, imagery {round(imagery_fraction * 100)}%. "
        f"Final score: {round(score, 1)}/100."
    )

    db.add(
        AgentAction(
            agent_name="Diagnose",
            merchant_id=merchant.id,
            reasoning=reasoning,
            action_taken="Scored catalog agent-readability against the 6-check rubric.",
            input={"merchant_id": merchant.id, "catalog_item_count": total},
            output={"score": round(score, 1), "gaps": gaps},
            result=AgentResult.success,
        )
    )

    return {"score": round(score, 1), "gaps": gaps}
