"""Diagnose Agent: scores how "agent-readable" a merchant's catalog currently is.

Checks are deliberately structural/deterministic (no LLM call) so the score is
reproducible run-to-run during the demo — the spec allows an LLM-assisted quality
flag as an option, but a flaky/non-deterministic Diagnose score would undermine the
"score improves after Fix" narrative the demo depends on.
"""
from sqlalchemy.orm import Session

from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, Mandate, Merchant

MIN_DESCRIPTION_LEN = 15

CHECK_WEIGHT = 25  # 4 checks x 25 = 100


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


def run_diagnose(db: Session, merchant: Merchant) -> dict:
    items: list[CatalogItem] = merchant.catalog_items
    total = len(items)

    gaps = []
    score = 0.0

    # Check 1: description completeness/quality
    if total == 0:
        desc_pass = 0
    else:
        desc_pass = sum(1 for i in items if _description_ok(i))
    desc_fail = total - desc_pass
    desc_fraction = (desc_pass / total) if total else 0
    score += CHECK_WEIGHT * desc_fraction
    gaps.append(
        {
            "check_name": "product_descriptions",
            "status": "pass" if desc_fail == 0 and total > 0 else "fail",
            "detail": (
                f"{desc_fail} of {total} products have no description or a description "
                "too thin to be useful to a shopping agent."
                if desc_fail > 0
                else f"All {total} products have usable descriptions."
            ),
        }
    )

    # Check 2: machine-readable manifest/feed exists
    latest_manifest = (
        db.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == merchant.id)
        .order_by(CatalogManifest.version.desc())
        .first()
    )
    if latest_manifest:
        score += CHECK_WEIGHT
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

    # Check 3: price / availability / variant clarity
    if total == 0:
        clarity_pass = 0
    else:
        clarity_pass = sum(1 for i in items if _clarity_ok(i))
    clarity_fail = total - clarity_pass
    clarity_fraction = (clarity_pass / total) if total else 0
    score += CHECK_WEIGHT * clarity_fraction
    gaps.append(
        {
            "check_name": "price_availability_clarity",
            "status": "pass" if clarity_fail == 0 and total > 0 else "fail",
            "detail": (
                f"{clarity_fail} of {total} products have ambiguous availability or "
                "missing variant info."
                if clarity_fail > 0
                else f"All {total} products have unambiguous availability and variant info."
            ),
        }
    )

    # Check 4: programmatic checkout available (merchant allow-listed under an active mandate)
    mandates = db.query(Mandate).all()
    checkout_available = any(merchant.id in (m.allow_listed_merchants or []) for m in mandates)
    if checkout_available:
        score += CHECK_WEIGHT
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
        f"Scored {merchant.name}: {desc_pass}/{total} products have usable descriptions, "
        f"{'a manifest exists' if latest_manifest else 'no manifest exists'}, "
        f"{clarity_pass}/{total} products are unambiguous on availability/variants, "
        f"programmatic checkout is {'available' if checkout_available else 'not available'}. "
        f"Final score: {round(score, 1)}/100."
    )

    db.add(
        AgentAction(
            agent_name="Diagnose",
            merchant_id=merchant.id,
            reasoning=reasoning,
            action_taken="Scored catalog agent-readability against the 4-check rubric.",
            input={"merchant_id": merchant.id, "catalog_item_count": total},
            output={"score": round(score, 1), "gaps": gaps},
            result=AgentResult.success,
        )
    )

    return {"score": round(score, 1), "gaps": gaps}
