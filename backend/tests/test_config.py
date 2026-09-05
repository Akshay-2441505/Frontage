from app.config import parse_cors_origins


def test_parse_cors_origins_splits_on_comma():
    assert parse_cors_origins("http://localhost:5173,https://frontage.vercel.app") == [
        "http://localhost:5173",
        "https://frontage.vercel.app",
    ]


def test_parse_cors_origins_strips_whitespace_around_each_entry():
    assert parse_cors_origins(" http://localhost:5173 , https://frontage.vercel.app ") == [
        "http://localhost:5173",
        "https://frontage.vercel.app",
    ]


def test_parse_cors_origins_drops_empty_entries():
    # A trailing comma, or an unset/blank origin left in the list, shouldn't become
    # an empty-string origin -- CORSMiddleware would never match anything against it,
    # but it's a sign of a misconfigured env var worth not silently accepting.
    assert parse_cors_origins("http://localhost:5173,,") == ["http://localhost:5173"]


def test_parse_cors_origins_handles_a_single_origin():
    assert parse_cors_origins("http://localhost:5173") == ["http://localhost:5173"]
