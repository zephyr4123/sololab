"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root (backend/src/sololab/config/settings.py → 4 levels up)
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    """SoloLab application configuration."""

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    debug: bool = False

    # ── persistence ────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://sololab:sololab@localhost:5432/sololab"
    redis_url: str = "redis://localhost:6379/0"

    # ── primary LLM (IdeaSpark + Writer + ...) ─────────────
    # No defaults — keys must be provided so startup fails loudly when missing.
    ideaspark_base_url: str = "https://api.openai.com/v1"
    ideaspark_api_key: Optional[str] = None
    ideaspark_model: str = "gpt-4o"
    budget_limit_usd: float = 50.0

    # ── embeddings (independent provider supported) ────────
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: Optional[str] = None
    embedding_model: str = "text-embedding-3-small"

    # ── workspace + storage ────────────────────────────────
    workspace_dir: str = ""
    storage_path: str = "./storage"

    # ── third-party APIs ───────────────────────────────────
    tavily_api_key: Optional[str] = None
    s2_api_key: Optional[str] = None  # Semantic Scholar

    # ── OpenCode engine (CodeLab proxy target) ─────────────
    opencode_url: str = "http://localhost:3100"

    # ── WriterAI (falls back to ideaspark_* if blank) ──────
    writer_base_url: Optional[str] = None
    writer_api_key: Optional[str] = None
    writer_model: Optional[str] = None
    writer_sandbox_timeout: int = 30
    writer_sandbox_memory: str = "512m"

    # ── API authentication ─────────────────────────────────
    # Comma-separated API keys; auth is disabled when this is empty.
    api_keys: Optional[str] = None

    # ── observability ──────────────────────────────────────
    log_level: str = "INFO"
    log_json: bool = False

    # ── CORS (defaults match the Docker-Caddy deployment) ──
    # Comma-separated list. Use "*" only when allow_credentials is False.
    cors_allow_origins: str = "http://localhost:3000"

    def llm_chat_credentials(self) -> tuple[str, Optional[str], str]:
        """Return (base_url, api_key, model) for the primary chat channel."""
        return self.ideaspark_base_url, self.ideaspark_api_key, self.ideaspark_model

    def llm_embed_credentials(self) -> tuple[str, Optional[str], str]:
        """Return (base_url, api_key, model) for the embedding channel."""
        return self.embedding_base_url, self.embedding_api_key, self.embedding_model

    def writer_llm_credentials(self) -> tuple[str, Optional[str], str]:
        """Return (base_url, api_key, model) for WriterAI, falling back to the primary."""
        return (
            self.writer_base_url or self.ideaspark_base_url,
            self.writer_api_key or self.ideaspark_api_key,
            self.writer_model or self.ideaspark_model,
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
