"""API 限速中间件 - 基于 Redis 的滑动窗口限速。"""

import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


class RateLimitConfig:
    """限速配置。"""

    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
        burst_size: int = 10,
        enabled: bool = True,
    ) -> None:
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_size = burst_size
        self.enabled = enabled


class RedisRateLimiter:
    """基于 Redis 滑动窗口的限速器。"""

    def __init__(self, redis: aioredis.Redis, config: Optional[RateLimitConfig] = None) -> None:
        self.redis = redis
        self.config = config or RateLimitConfig()

    async def check_rate_limit(self, key: str) -> dict:
        """检查请求是否在限速范围内。

        返回:
            {"allowed": bool, "remaining": int, "reset_after": int}
        """
        if not self.config.enabled:
            return {"allowed": True, "remaining": -1, "reset_after": 0}

        now = time.time()
        minute_key = f"ratelimit:{key}:minute"
        hour_key = f"ratelimit:{key}:hour"

        pipe = self.redis.pipeline()

        # 清理过期记录 + 添加当前请求 + 计数
        # 分钟窗口
        pipe.zremrangebyscore(minute_key, 0, now - 60)
        pipe.zadd(minute_key, {str(now): now})
        pipe.zcard(minute_key)
        pipe.expire(minute_key, 120)

        # 小时窗口
        pipe.zremrangebyscore(hour_key, 0, now - 3600)
        pipe.zadd(hour_key, {str(now): now})
        pipe.zcard(hour_key)
        pipe.expire(hour_key, 7200)

        results = await pipe.execute()
        minute_count = results[2]
        hour_count = results[6]

        # 检查限制
        if minute_count > self.config.requests_per_minute:
            remaining = 0
            reset_after = 60
            allowed = False
        elif hour_count > self.config.requests_per_hour:
            remaining = 0
            reset_after = 3600
            allowed = False
        else:
            remaining = self.config.requests_per_minute - minute_count
            reset_after = 0
            allowed = True

        return {"allowed": allowed, "remaining": max(0, remaining), "reset_after": reset_after}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI 限速中间件。"""

    def __init__(self, app, config: Optional[RateLimitConfig] = None) -> None:
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self._limiter: Optional[RedisRateLimiter] = None

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """处理请求限速。"""
        if not self.config.enabled:
            return await call_next(request)

        # 跳过健康检查
        if request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)

        # 懒初始化 limiter
        if not self._limiter:
            redis = getattr(request.app.state, "redis", None)
            if not redis:
                return await call_next(request)
            self._limiter = RedisRateLimiter(redis, self.config)

        # 用客户端 IP 作为限速 key
        client_ip = request.client.host if request.client else "unknown"
        # 如果有 API Key，用 key 作为标识（更精确）
        api_key = request.headers.get("X-API-Key", "")
        rate_key = api_key[:16] if api_key else client_ip

        try:
            result = await self._limiter.check_rate_limit(rate_key)
        except Exception as e:
            # Redis 不可用时放行（降级策略）
            logger.warning("限速检查失败（降级放行）: %s", e)
            response = await call_next(request)
            response.headers["X-RateLimit-Remaining"] = "-1"
            return response

        if not result["allowed"]:
            logger.warning("限速触发: key=%s, reset=%ds", rate_key[:8], result["reset_after"])
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {result['reset_after']}s.",
                headers={
                    "Retry-After": str(result["reset_after"]),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(result["remaining"])
        return response
