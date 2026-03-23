"""API 认证 - 基于 API Key 的简单认证中间件。"""

import hashlib
import hmac
import logging
import secrets
from typing import Optional

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)

# API Key header name
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


class APIKeyAuth:
    """基于 API Key 的认证。

    支持：
    - 从环境变量加载 API key
    - SHA-256 哈希比较（防止时序攻击）
    - 可选启用（开发模式可禁用）
    """

    def __init__(self, api_keys: list[str] = [], enabled: bool = False) -> None:
        self.enabled = enabled
        # 存储哈希后的 key（安全）
        self._key_hashes = {self._hash_key(k) for k in api_keys if k}

    @staticmethod
    def _hash_key(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    def verify(self, api_key: Optional[str]) -> bool:
        """验证 API Key。"""
        if not self.enabled:
            return True
        if not api_key:
            return False
        return self._hash_key(api_key) in self._key_hashes

    def add_key(self, key: str) -> None:
        """添加新的 API Key。"""
        self._key_hashes.add(self._hash_key(key))

    def remove_key(self, key: str) -> None:
        """移除 API Key。"""
        self._key_hashes.discard(self._hash_key(key))

    @staticmethod
    def generate_key() -> str:
        """生成安全的 API Key。"""
        return f"sk-sololab-{secrets.token_urlsafe(32)}"


def get_api_key_auth(app_state) -> APIKeyAuth:
    """从 app.state 获取 APIKeyAuth 实例。"""
    return getattr(app_state, "api_key_auth", APIKeyAuth(enabled=False))


async def verify_api_key(request: Request, api_key: Optional[str] = Security(API_KEY_HEADER)):
    """FastAPI 依赖：验证 API Key。"""
    auth = get_api_key_auth(request.app.state)
    if not auth.verify(api_key):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
