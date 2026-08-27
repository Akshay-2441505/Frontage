"""Fix Agent: turns Diagnose gaps into artifacts, using only data the merchant
already has — no manual data entry required.

Two jobs, kept separate on purpose:
1. generate_descriptions — LLM-assisted description fill-in for thin items.
   Writes are flagged `source=generated` and left `agent_readable=False`
   (pending review) so nothing generated is silently published.
2. publish_manifest — builds the versioned, fetchable manifest from whichever
   items are currently `agent_readable=True` (hand-written good data, plus
   any generated descriptions a human has since approved).
"""
from sqlalchemy.orm import Session

from app.agents.claude_client import FIX_MODEL, get_client
from app.agents.diagnose import _description_ok
from app.models import AgentAction, AgentResult, CatalogItem, CatalogManifest, ItemSource, Merchant


def _generate_description(client, item: CatalogItem, merchant_name: str) -> str:
    prompt = (
        f"Write one concise, factual e-commerce product description (max 30 words) for a "
        f"shopping AI agent to read, not a human shopper. No marketing fluff, no emoji.\n\n"
        f"Merchant: {merchant_name}\n"
        f"Product name: {item.name}\n"
        f"Price: {item.currency} {item.price}\n"
        f"Variant info: {item.variant_info or 'not specified'}\n\n"
        f"Return only the description text, nothing else."
    )
    message = client.messages.create(
        model=FIX_MODEL,
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def generate_descriptions(db: Session, merchant: Merchant) -> dict:
    items = [i for i in merchant.catalog_items if not _description_ok(i)]

    if not items:
        db.add(
            AgentAction(
                agent_name="Fix",
                merchant_id=merchant.id,
                reasoning=f"All products for {merchant.name} already have usable descriptions — nothing to generate.",
                action_taken="Checked for thin/missing descriptions.",
                input={"merchant_id": merchant.id},
                output={"generated_count": 0},
                result=AgentResult.success,
            )
        )
        return {"generated": []}

    client = get_client()
    generated = []
    for item in items:
        text = _generate_description(client, item, merchant.name)
        item.description = text
        item.source = ItemSource.generated
        item.agent_readable = False  # pending human review before publish
        generated.append({"catalog_item_id": item.id, "name": item.name, "description": text})

    db.add(
        AgentAction(
            agent_name="Fix",
            merchant_id=merchant.id,
            reasoning=(
                f"Generated {len(generated)} product description(s) for {merchant.name} "
                "from name/price/variant data already on file. Each is flagged as generated "
                "and held for merchant approval before publishing."
            ),
            action_taken="Generated descriptions via Claude for items with missing/thin descriptions.",
            input={"merchant_id": merchant.id, "item_count": len(items)},
            output={"generated": generated},
            result=AgentResult.success,
        )
    )
    return {"generated": generated}


def approve_item(db: Session, item: CatalogItem) -> None:
    item.agent_readable = True


def publish_manifest(db: Session, merchant: Merchant) -> CatalogManifest:
    ready_items = [i for i in merchant.catalog_items if i.agent_readable]

    prev = (
        db.query(CatalogManifest)
        .filter(CatalogManifest.merchant_id == merchant.id)
        .order_by(CatalogManifest.version.desc())
        .first()
    )
    version = (prev.version + 1) if prev else 1

    manifest = CatalogManifest(
        merchant_id=merchant.id,
        version=version,
        url=f"/merchants/{merchant.id}/manifest.json",
        item_ids=[i.id for i in ready_items],
    )
    db.add(manifest)

    db.add(
        AgentAction(
            agent_name="Fix",
            merchant_id=merchant.id,
            reasoning=(
                f"Published catalog manifest v{version} for {merchant.name} with "
                f"{len(ready_items)} of {len(merchant.catalog_items)} products "
                "(only agent-readable, approved items are included)."
            ),
            action_taken=f"Published manifest v{version} at {manifest.url}.",
            input={"merchant_id": merchant.id},
            output={"version": version, "item_count": len(ready_items)},
            result=AgentResult.success,
        )
    )
    return manifest
