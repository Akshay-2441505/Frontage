from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.buyer import _all_discoverable_products, discover, shop
from app.db import get_db
from app.models import Merchant
from app.schemas import DiscoverGoalIn, ShoppingGoalIn

router = APIRouter(prefix="/buyer-agent", tags=["buyer"])


@router.post("/shop")
def buyer_shop(body: ShoppingGoalIn, db: Session = Depends(get_db)):
    merchant = db.get(Merchant, body.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    history = [turn.model_dump() for turn in body.history]
    result = shop(db, merchant, body.goal, history=history, dry_run=body.dry_run)
    db.commit()
    return result


@router.post("/discover")
def buyer_discover(body: DiscoverGoalIn, db: Session = Depends(get_db)):
    history = [turn.model_dump() for turn in body.history]
    result = discover(db, body.goal, history=history)
    db.commit()
    return result


@router.get("/reach")
def buyer_reach(db: Session = Depends(get_db)):
    """How much of the market Otto can actually read, right now.

    Counted from `_all_discoverable_products` -- the identical set `discover()`
    searches -- rather than from the merchant table, so the hero's claim and the
    funnel's first number can never disagree. A store that has connected but not
    published a manifest is not reachable and is not counted.
    """
    products = _all_discoverable_products(db)
    return {
        "products": len(products),
        "stores": len({p["merchant_id"] for p in products if p.get("merchant_id")}),
    }


@router.get("/showcase")
def buyer_showcase(count: int = 7, exclude: str = "", feature: str = "", db: Session = Depends(get_db)):
    """One photographed product from each of up to `count` different stores.

    The shop's hero wall used to build this itself by fetching the first five
    merchants' catalogs. Two of those five have no photography at all, so they
    took slots and contributed nothing, and six of the eleven stores -- including
    every clothing store -- could never appear no matter what they published.
    The wall's whole job is to show that one agent reads many catalogs, and it
    was quietly showing three.

    Chosen server-side because the alternative is one request per store on page
    load, and that cost grows with exactly the thing the page is advertising.

    Stores are spread across the full list rather than taken from the front, and
    each contributes one product, so no single catalog can dominate the wall.
    Photo-less products are excluded outright: a wall of images has nothing to do
    with a product that has none, and the 3D path needs every slot textured.

    `exclude` leaves stores out and `feature` gives a store a second slot, both
    as comma-separated merchant names or ids. Which stores belong on a hero wall,
    and how much room each gets, is an editorial call about the shopfront rather
    than a fact about the catalog -- so the endpoint stays policy-free and the
    surface making the choice passes it in and says why.
    """
    count = max(1, min(count, 24))
    excluded = {part.strip().casefold() for part in exclude.split(",") if part.strip()}
    featured = {part.strip().casefold() for part in feature.split(",") if part.strip()}

    by_merchant: dict[str, list[dict]] = {}
    for product in _all_discoverable_products(db):
        if not product.get("image_url"):
            continue
        if excluded and (
            str(product.get("merchant_id", "")).casefold() in excluded
            or str(product.get("merchant_name", "")).casefold() in excluded
        ):
            continue
        by_merchant.setdefault(product.get("merchant_id"), []).append(product)

    merchant_ids = [mid for mid in by_merchant if mid]
    if not merchant_ids:
        return {"products": []}

    def is_featured(mid: str) -> bool:
        if not featured:
            return False
        name = str(by_merchant[mid][0].get("merchant_name", "")).casefold()
        return str(mid).casefold() in featured or name in featured

    # Spread the picks across the whole list instead of taking a prefix.
    if len(merchant_ids) > count:
        step = len(merchant_ids) / count
        chosen = [merchant_ids[int(i * step)] for i in range(count)]
    else:
        chosen = merchant_ids

    # A featured store is guaranteed a place and gets a second one, so a single
    # category is not represented by a lone tile among six of something else.
    # The extra displaces the tail of the spread rather than growing the wall.
    for mid in merchant_ids:
        if not is_featured(mid):
            continue
        want = 2 if len(merchant_ids) > 2 else 1
        have = chosen.count(mid)
        for _ in range(want - have):
            chosen.insert(0, mid)
        while len(chosen) > count:
            # Drop from the end, but never a featured store's own slots.
            victim = next((m for m in reversed(chosen) if not is_featured(m)), None)
            if victim is None:
                break
            chosen.remove(victim)

    picked = []
    used: dict[str, int] = {}
    for i, mid in enumerate(chosen):
        items = by_merchant[mid]
        # A stable offset per store rather than always item 0, which tends to be
        # the same catalog-order hero every time. `used` keeps a featured store's
        # second slot from repeating its first product.
        seen_before = used.get(mid, 0)
        used[mid] = seen_before + 1
        picked.append(items[(i * 7 + seen_before * 11) % len(items)])

    # Fewer stores than slots: keep filling from the largest catalogs rather than
    # returning a short wall, since a partly-empty wall reads as a loading bug.
    if len(picked) < count:
        seen = {p["id"] for p in picked}
        for extra in sorted(by_merchant.values(), key=len, reverse=True):
            for item in extra:
                if len(picked) >= count:
                    break
                if item["id"] not in seen:
                    picked.append(item)
                    seen.add(item["id"])
            if len(picked) >= count:
                break

    return {
        "products": [
            {
                "id": p["id"],
                "name": p["name"],
                "price": p["price"],
                "currency": p.get("currency"),
                "image_url": p.get("image_url"),
                "merchant_id": p.get("merchant_id"),
                "merchant_name": p.get("merchant_name"),
            }
            for p in picked[:count]
        ]
    }
