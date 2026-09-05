from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors_origins(raw: str) -> list[str]:
    """Comma-separated env var -> the list CORSMiddleware's allow_origins wants.
    Trims whitespace around each entry and drops empty ones (a trailing comma, or a
    blank value left in the list) rather than letting an origin silently become "",
    which would never match anything anyway."""
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    database_url: str = "sqlite:///./frontage.db"
    default_mandate_spend_ceiling_paise: int = 150000
    # Comma-separated list of origins the frontend is served from. Defaults to the
    # local Vite dev server; set to the real deployed frontend origin(s) in
    # production (e.g. CORS_ALLOWED_ORIGINS=https://frontage.vercel.app).
    cors_allowed_origins: str = "http://localhost:5173"


settings = Settings()
