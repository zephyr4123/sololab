"""Sliding-window rate-limiting middleware backed by Redis.

`fail_open` controls behaviour when Redis is unreachable:
  - True  (default): log + pass through (single-host / dev / research tool)
  - False           : return 503 (multi-tenant / abuse-prone deployments)

Single-host deployments are kept fail-open because Redis being down already
breaks the rest of the app — adding a 503 from the limiter is double pain.
Flip to fail-closed in production deployments where rate-limiting protects
backend resources you care more about than user requests.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


class RateLimitConfig:
    """Rate-limit configuration."""

    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
        burst_size: int = 10,
        enabled: bool = True,
        fail_open: bool = True,
    ) -> None:
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_size = burst_size
        self.enabled = enabled
        self.fail_open = fail_open


class RedisRateLimiter:
    """Sliding-window rate limiter on a single Redis instance."""

    def __init__(
        self, redis: aioredis.Redis, config: Optional[RateLimitConfig] = None
    ) -> None:
        self.redis = redis
        self.config = config or RateLimitConfig()

    async def check_rate_limit(self, key: str) -> dict:
        """Check whether `key` is within its rate budget.

        Returns:
            {"allowed": bool, "remaining": int, "reset_after": int}
        """
        if not self.config.enabled:
            return {"allowed": True, "remaining": -1, "reset_after": 0}

        now = time.time()
        minute_key = f"ratelimit:{key}:minute"
        hour_key = f"ratelimit:{key}:hour"

        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(minute_key, 0, now - 60)
        pipe.zadd(minute_key, {str(now): now})
        pipe.zcard(minute_key)
        pipe.expire(minute_key, 120)
        pipe.zremrangebyscore(hour_key, 0, now - 3600)
        pipe.zadd(hour_key, {str(now): now})
        pipe.zcard(hour_key)
        pipe.expire(hour_key, 7200)

        results = await pipe.execute()
        minute_count = results[2]
        hour_count = results[6]

        if minute_count > self.config.requests_per_minute:
            return {"allowed": False, "remaining": 0, "reset_after": 60}
        if hour_count > self.config.requests_per_hour:
            return {"allowed": False, "remaining": 0, "reset_after": 3600}

        return {
            "allowed": True,
            "remaining": max(0, self.config.requests_per_minute - minute_count),
            "reset_after": 0,
        }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that runs every request through the rate limiter."""

    # Paths that bypass rate limiting entirely.
    _BYPASS_PATHS = frozenset({"/health", "/docs", "/openapi.json", "/redoc"})

    def __init__(self, app, config: Optional[RateLimitConfig] = None) -> None:
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self._limiter: Optional[RedisRateLimiter] = None

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not self.config.enabled or request.url.path in self._BYPASS_PATHS:
            return await call_next(request)

        if self._limiter is None:
            redis = getattr(request.app.state, "redis", None)
            if redis is None:
                # Bootstrapping race: app.state.redis not yet set. Pass through.
                return await call_next(request)
            self._limiter = RedisRateLimiter(redis, self.config)

        # Key on API key prefix when present; otherwise on client IP.
        client_ip = request.client.host if request.client else "unknown"
        api_key = request.headers.get("X-API-Key", "")
        rate_key = api_key[:16] if api_key else client_ip

        try:
            result = await self._limiter.check_rate_limit(rate_key)
        except Exception:
            logger.exception("rate_limiter_redis_failure key=%s", rate_key[:8])
            if self.config.fail_open:
                response = await call_next(request)
                response.headers["X-RateLimit-Remaining"] = "-1"
                return response
            raise HTTPException(
                status_code=503,
                detail="Rate limiter unavailable (Redis dependency is down).",
            )

        if not result["allowed"]:
            logger.warning(
                "rate_limit_triggered key=%s reset_after=%ds",
                rate_key[:8], result["reset_after"],
            )
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
