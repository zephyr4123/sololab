"""API 认证单元测试。"""

import pytest


class TestAPIKeyAuth:
    """APIKeyAuth 测试。"""

    @pytest.mark.unit
    def test_disabled_auth_always_passes(self):
        """禁用时任何 key 都通过。"""
        from sololab.core.auth import APIKeyAuth

        auth = APIKeyAuth(enabled=False)
        assert auth.verify(None) is True
        assert auth.verify("") is True
        assert auth.verify("random") is True

    @pytest.mark.unit
    def test_enabled_auth_requires_key(self):
        """启用时必须提供有效 key。"""
        from sololab.core.auth import APIKeyAuth

        auth = APIKeyAuth(api_keys=["secret-key-1"], enabled=True)
        assert auth.verify(None) is False
        assert auth.verify("") is False
        assert auth.verify("wrong-key") is False
        assert auth.verify("secret-key-1") is True

    @pytest.mark.unit
    def test_multiple_keys(self):
        """支持多个 API key。"""
        from sololab.core.auth import APIKeyAuth

        auth = APIKeyAuth(api_keys=["key-a", "key-b", "key-c"], enabled=True)
        assert auth.verify("key-a") is True
        assert auth.verify("key-b") is True
        assert auth.verify("key-c") is True
        assert auth.verify("key-d") is False

    @pytest.mark.unit
    def test_add_and_remove_key(self):
        """动态添加/移除 key。"""
        from sololab.core.auth import APIKeyAuth

        auth = APIKeyAuth(api_keys=["key-1"], enabled=True)
        assert auth.verify("key-2") is False

        auth.add_key("key-2")
        assert auth.verify("key-2") is True

        auth.remove_key("key-2")
        assert auth.verify("key-2") is False

    @pytest.mark.unit
    def test_generate_key_format(self):
        """生成的 key 格式正确。"""
        from sololab.core.auth import APIKeyAuth

        key = APIKeyAuth.generate_key()
        assert key.startswith("sk-sololab-")
        assert len(key) > 20

    @pytest.mark.unit
    def test_keys_stored_as_hashes(self):
        """key 应以哈希形式存储。"""
        from sololab.core.auth import APIKeyAuth

        auth = APIKeyAuth(api_keys=["my-secret"], enabled=True)
        # 内部不应存储明文
        assert "my-secret" not in auth._key_hashes
        assert len(list(auth._key_hashes)[0]) == 64  # SHA-256 hex
