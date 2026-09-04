from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    database_url: str = "sqlite:///./frontage.db"
    default_mandate_spend_ceiling_paise: int = 150000


settings = Settings()
