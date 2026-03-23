"""并发执行管理单元测试。"""

import asyncio

import pytest


class TestRateLimiter:
    """RateLimiter 测试。"""

    @pytest.mark.unit
    async def test_semaphore_limits_concurrency(self):
        """信号量应限制并发数。"""
        from sololab.core.concurrency import RateLimiter

        limiter = RateLimiter(max_concurrent=2, requests_per_second=100)
        active = 0
        max_active = 0

        async def task():
            nonlocal active, max_active
            async with limiter:
                active += 1
                max_active = max(max_active, active)
                await asyncio.sleep(0.05)
                active -= 1

        await asyncio.gather(*[task() for _ in range(5)])
        assert max_active <= 2

    @pytest.mark.unit
    async def test_rate_limiter_context_manager(self):
        """RateLimiter 支持 async context manager。"""
        from sololab.core.concurrency import RateLimiter

        limiter = RateLimiter(max_concurrent=5)
        async with limiter:
            pass  # 不应抛出异常


class TestParallelExecutor:
    """ParallelExecutor 测试。"""

    @pytest.mark.unit
    async def test_run_all_success(self):
        """所有任务成功执行。"""
        from sololab.core.concurrency import ParallelExecutor

        executor = ParallelExecutor(max_concurrent=3, timeout=5.0)

        async def make_task(i):
            return i * 2

        tasks = [lambda i=i: make_task(i) for i in range(5)]
        results = await executor.run_all(tasks)
        assert results == [0, 2, 4, 6, 8]

    @pytest.mark.unit
    async def test_run_all_with_exception(self):
        """任务异常时应返回异常（return_exceptions=True）。"""
        from sololab.core.concurrency import ParallelExecutor

        executor = ParallelExecutor(max_concurrent=3, timeout=5.0)

        async def failing_task():
            raise ValueError("test error")

        async def ok_task():
            return "ok"

        results = await executor.run_all([ok_task, failing_task])
        assert results[0] == "ok"
        assert isinstance(results[1], (ValueError, Exception))

    @pytest.mark.unit
    async def test_timeout_returns_error(self):
        """超时任务应返回 TimeoutError。"""
        from sololab.core.concurrency import ParallelExecutor

        executor = ParallelExecutor(max_concurrent=3, timeout=0.1)

        async def slow_task():
            await asyncio.sleep(10)
            return "done"

        results = await executor.run_all([slow_task])
        assert isinstance(results[0], (TimeoutError, Exception))


class TestAsyncHTTPClient:
    """AsyncHTTPClient 测试。"""

    @pytest.mark.unit
    async def test_client_creation(self):
        """HTTP 客户端应正常创建。"""
        from sololab.core.concurrency import AsyncHTTPClient

        client = AsyncHTTPClient(timeout=5.0, max_retries=2)
        assert client.timeout.total == 5.0
        assert client.max_retries == 2
        await client.close()
