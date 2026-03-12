"""Application settings loaded from environment variables."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """SoloLab application settings."""

    # Application
    app_name: str = "SoloLab"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://sololab:sololab@localhost:5432/sololab"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # LiteLLM
    litellm_config_path: str = "src/sololab/config/litellm_config.yaml"
    default_model: str = "openai/gpt-4o"
    budget_limit_usd: float = 50.0

    # Storage
    storage_path: str = "./storage"

    # URLs
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # API Keys (loaded from .env)
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
