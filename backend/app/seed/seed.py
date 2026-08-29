"""Seed script: populates 2 deliberately messy/incomplete merchant catalogs.

Run with:  python -m app.seed.seed
"""
from app.db import Base, SessionLocal, engine
from app.models import (
    AgentAction,
    CatalogItem,
    CatalogManifest,
    DiagnosticReport,
    ItemSource,
    Mandate,
    Merchant,
    Transaction,
)


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # wipe existing demo data for a clean reseed -- children before parents, and
        # everything that references a merchant_id, not just the merchant/catalog tables,
        # otherwise old rows orphan against the freshly-generated merchant/item ids
        db.query(Transaction).delete()
        db.query(AgentAction).delete()
        db.query(CatalogManifest).delete()
        db.query(DiagnosticReport).delete()
        db.query(CatalogItem).delete()
        db.query(Merchant).delete()
        db.query(Mandate).delete()
        db.commit()

        bloom = Merchant(
            name="Bloom & Thread",
            razorpay_account_ref="acc_demo_bloomthread",
            catalog_source="seed",
        )
        db.add(bloom)
        db.flush()

        bloom_items = [
            CatalogItem(
                merchant_id=bloom.id,
                name="Classic Blue Cotton Shirt",
                description=(
                    "Slim-fit men's shirt in 100% breathable cotton, mid blue, "
                    "button-down collar. Machine washable."
                ),
                price=1299,
                currency="INR",
                availability="in_stock",
                variant_info={"sizes": ["S", "M", "L", "XL"], "color": "blue"},
                agent_readable=True,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=bloom.id,
                name="Cotton Shirt - Sky Blue",
                description=None,  # thin data on purpose
                price=1450,
                currency="INR",
                availability=None,  # ambiguous availability on purpose
                variant_info=None,
                agent_readable=False,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=bloom.id,
                name="Premium Wool-Blend Jacket",
                description="Tailored jacket, wool-blend, charcoal grey, full lining.",
                price=4999,  # deliberately above the default mandate ceiling
                currency="INR",
                availability="in_stock",
                variant_info={"sizes": ["M", "L", "XL"], "color": "charcoal"},
                agent_readable=True,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=bloom.id,
                name="Linen Trousers",
                description=None,
                price=1899,
                currency="INR",
                availability="in_stock",
                variant_info=None,
                agent_readable=False,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=bloom.id,
                name="Everyday Crew Socks (Pack of 3)",
                description="Combed cotton crew socks, breathable, reinforced heel.",
                price=299,
                currency="INR",
                availability="in_stock",
                variant_info={"sizes": ["Free size"]},
                agent_readable=True,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=bloom.id,
                name="Formal Shirt Navy",
                description=None,
                price=1599,
                currency="INR",
                availability="out_of_stock",
                variant_info=None,
                agent_readable=False,
                source=ItemSource.manual,
            ),
        ]
        db.add_all(bloom_items)

        terracotta = Merchant(
            name="Terracotta & Co (Home Goods)",
            razorpay_account_ref="acc_demo_terracotta",
            catalog_source="seed",
        )
        db.add(terracotta)
        db.flush()

        terracotta_items = [
            CatalogItem(
                merchant_id=terracotta.id,
                name="Handmade Terracotta Planter (Medium)",
                description="Hand-thrown terracotta planter, unglazed, 8-inch diameter, drainage hole included.",
                price=549,
                currency="INR",
                availability="in_stock",
                variant_info={"size": "medium"},
                agent_readable=True,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=terracotta.id,
                name="Ceramic Table Lamp",
                description=None,
                price=2199,
                currency="INR",
                availability=None,
                variant_info=None,
                agent_readable=False,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=terracotta.id,
                name="Set of 4 Stoneware Mugs",
                description=None,
                price=899,
                currency="INR",
                availability="in_stock",
                variant_info=None,
                agent_readable=False,
                source=ItemSource.manual,
            ),
            CatalogItem(
                merchant_id=terracotta.id,
                name="Woven Jute Table Runner",
                description="Handwoven jute table runner, 72 inches, natural fibre, fringe edge.",
                price=449,
                currency="INR",
                availability="in_stock",
                variant_info={"length_in": 72},
                agent_readable=True,
                source=ItemSource.manual,
            ),
        ]
        db.add_all(terracotta_items)

        # global demo mandate: matches the spec's example shopping budget (~INR 1500),
        # and is deliberately lower than the jacket above so the spend-ceiling breach
        # failure case is reachable out of the box.
        db.add(
            Mandate(
                merchant_id=None,
                spend_ceiling=1500,
                allow_listed_merchants=[bloom.id, terracotta.id],
                created_by="demo-setup",
            )
        )

        db.commit()
        print(f"Seeded merchants: {bloom.name} ({bloom.id}), {terracotta.name} ({terracotta.id})")
    finally:
        db.close()


if __name__ == "__main__":
    run()
