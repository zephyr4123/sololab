"""从环境变量加载的应用配置。"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """SoloLab 应用配置。"""

    # 应用
    app_name: str = "SoloLab"
    debug: bool = False

    # 数据库
    database_url: str = "postgresql+asyncpg://sololab:sololab@localhost:5432/sololab"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # LLM 配置（OpenAI 兼容格式）
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = "sk-xxx"
    llm_model: str = "gpt-4o"
    budget_limit_usd: float = 50.0

    # Embedding 配置（OpenAI 兼容格式，可独立于 LLM 提供商）
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = "sk-xxx"
    embedding_model: str = "text-embedding-3-small"

    # 存储
    storage_path: str = "./storage"

    # 地址
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # 外部 API 密钥
    tavily_api_key: Optional[str] = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    """缓存的配置单例。"""
    return Settings()
