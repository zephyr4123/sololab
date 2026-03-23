"""限速中间件单元测试。"""

import pytest


class TestRateLimitConfig:
    """RateLimitConfig 测试。"""

    @pytest.mark.unit
    def test_default_config(self):
        """默认配置应合理。"""
        from sololab.core.rate_limiter import RateLimitConfig

        config = RateLimitConfig()
        assert config.requests_per_minute == 60
        assert config.requests_per_hour == 1000
        assert config.enabled is True

    @pytest.mark.unit
    def test_custom_config(self):
        """自定义配置。"""
        from sololab.core.rate_limiter import RateLimitConfig

        config = RateLimitConfig(requests_per_minute=10, requests_per_hour=100, enabled=False)
        assert config.requests_per_minute == 10
        assert config.enabled is False


class TestRedisRateLimiter:
    """RedisRateLimiter 测试。"""

    @pytest.mark.unit
    async def test_disabled_limiter_allows_all(self, mock_redis):
        """禁用时允许所有请求。"""
        from sololab.core.rate_limiter import RedisRateLimiter, RateLimitConfig

        config = RateLimitConfig(enabled=False)
        limiter = RedisRateLimiter(mock_redis, config)
        result = await limiter.check_rate_limit("test-key")
        assert result["allowed"] is True
        assert result["remaining"] == -1

    @pytest.mark.unit
    async def test_allows_within_limit(self, mock_redis):
        """在限制范围内应允许请求。"""
        from sololab.core.rate_limiter import RedisRateLimiter, RateLimitConfig

        config = RateLimitConfig(requests_per_minute=100, requests_per_hour=1000)
        limiter = RedisRateLimiter(mock_redis, config)
        result = await limiter.check_rate_limit("test-key")
        assert result["allowed"] is True
        assert result["remaining"] >= 0

    @pytest.mark.unit
    async def test_blocks_over_limit(self, mock_redis):
        """超出限制应阻止请求。"""
        from sololab.core.rate_limiter import RedisRateLimiter, RateLimitConfig

        config = RateLimitConfig(requests_per_minute=3, requests_per_hour=1000)
        limiter = RedisRateLimiter(mock_redis, config)

        # 发送多个请求
        for _ in range(5):
            await limiter.check_rate_limit("test-key")

        result = await limiter.check_rate_limit("test-key")
        assert result["allowed"] is False
        assert result["remaining"] == 0
