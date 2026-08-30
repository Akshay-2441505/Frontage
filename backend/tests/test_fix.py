from unittest.mock import MagicMock, patch

import app.agents.fix as fix_mod
from app.models import ItemSource


def _fake_completion(text):
    completion = MagicMock()
    completion.choices = [MagicMock(message=MagicMock(content=text))]
    return completion


def test_blank_llm_response_is_treated_as_a_failure_not_a_success(db_session, merchant):
    from app.models import CatalogItem

    item = CatalogItem(
        merchant_id=merchant.id,
        name="Thin Product",
        description=None,
        price=100.0,
        currency="INR",
        availability="in_stock",
    )
    db_session.add(item)
    db_session.flush()

    fake_client = MagicMock()
    # Whitespace-only, same failure shape seen live with token-starved responses
    fake_client.chat.completions.create.return_value = _fake_completion("   ")

    with patch.object(fix_mod, "get_client", return_value=fake_client):
        result = fix_mod.generate_descriptions(db_session, merchant)

    assert result["generated"] == []
    assert len(result["failed"]) == 1
    assert result["failed"][0]["catalog_item_id"] == item.id

    # the item itself must be untouched -- not silently marked as having a real description
    assert item.description is None
    assert item.source != ItemSource.generated
    assert item.agent_readable is False


def test_nonblank_llm_response_still_generates_normally(db_session, merchant):
    from app.models import CatalogItem

    item = CatalogItem(
        merchant_id=merchant.id,
        name="Thin Product",
        description=None,
        price=100.0,
        currency="INR",
        availability="in_stock",
    )
    db_session.add(item)
    db_session.flush()

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion("A perfectly good real description.")

    with patch.object(fix_mod, "get_client", return_value=fake_client):
        result = fix_mod.generate_descriptions(db_session, merchant)

    assert result["failed"] == []
    assert len(result["generated"]) == 1
    assert item.description == "A perfectly good real description."
    assert item.source == ItemSource.generated
