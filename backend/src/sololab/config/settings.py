"""从环境变量加载的应用配置。"""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

# 项目根目录（backend/src/sololab/config/settings.py → 向上 4 级到项目根）
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


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

    # Judge LLM 配置（Benchmark 评测专用，可独立于主 LLM）
    judge_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    judge_api_key: str = "sk-xxx"
    judge_model: str = "qwen3.5-plus"

    # 存储
    storage_path: str = "./storage"

    # 地址
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # 外部 API 密钥
    tavily_api_key: Optional[str] = None
    s2_api_key: Optional[str] = None  # Semantic Scholar API Key

    # API 认证
    api_keys: Optional[str] = None  # 逗号分隔的 API Keys，为空则禁用认证

    model_config = {"env_file": str(_PROJECT_ROOT / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    """缓存的配置单例。"""
    return Settings()
