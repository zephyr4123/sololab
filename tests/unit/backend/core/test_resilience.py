"""错误处理与韧性单元测试。"""

import asyncio

import pytest
from pydantic import BaseModel


class SampleOutput(BaseModel):
    """测试用 Pydantic 模型。"""
    title: str
    score: float
    tags: list = []


class TestFallbackChain:
    """FallbackChain 测试。"""

    @pytest.mark.unit
    async def test_primary_model_success(self, mock_llm_gateway):
        """主模型成功时直接返回。"""
        from sololab.core.resilience import FallbackChain

        chain = FallbackChain(models=["primary", "fallback"])
        result = await chain.execute(
            mock_llm_gateway, messages=[{"role": "user", "content": "hi"}]
        )
        assert result["content"] == "Mock response"

    @pytest.mark.unit
    async def test_fallback_chain_config(self):
        """FallbackChain 配置应正确初始化。"""
        from sololab.core.resilience import FallbackChain, RetryConfig

        config = RetryConfig(max_retries=2, backoff_base=1.0)
        chain = FallbackChain(models=["m1", "m2", "m3"], retry_config=config)
        assert len(chain.models) == 3
        assert chain.config.max_retries == 2


class TestRetryDecorator:
    """with_retry 装饰器测试。"""

    @pytest.mark.unit
    async def test_retry_succeeds_after_failures(self):
        """重试后成功。"""
        from sololab.core.resilience import with_retry

        call_count = 0

        @with_retry(max_retries=3, backoff_base=0.01, exceptions=(ValueError,))
        async def flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("not ready")
            return "success"

        result = await flaky()
        assert result == "success"
        assert call_count == 3

    @pytest.mark.unit
    async def test_retry_exhausted_raises(self):
        """重试耗尽应抛出异常。"""
        from sololab.core.resilience import with_retry

        @with_retry(max_retries=2, backoff_base=0.01, exceptions=(ValueError,))
        async def always_fail():
            raise ValueError("always fails")

        with pytest.raises(RuntimeError, match="failed after"):
            await always_fail()


class TestTimeoutDecorator:
    """with_timeout 装饰器测试。"""

    @pytest.mark.unit
    async def test_timeout_returns_default(self):
        """超时时返回默认值。"""
        from sololab.core.resilience import with_timeout

        @with_timeout(timeout_seconds=0.05, default="timeout_result")
        async def slow_fn():
            await asyncio.sleep(10)
            return "done"

        result = await slow_fn()
        assert result == "timeout_result"

    @pytest.mark.unit
    async def test_fast_fn_returns_normally(self):
        """未超时时正常返回。"""
        from sololab.core.resilience import with_timeout

        @with_timeout(timeout_seconds=5.0, default="timeout")
        async def fast_fn():
            return "fast_result"

        result = await fast_fn()
        assert result == "fast_result"


class TestOutputValidator:
    """OutputValidator 测试。"""

    @pytest.mark.unit
    def test_validate_valid_data(self):
        """有效数据应通过校验。"""
        from sololab.core.resilience import OutputValidator

        validator = OutputValidator()
        data = {"title": "Test", "score": 0.9, "tags": ["a", "b"]}
        result = validator.validate(data, SampleOutput)
        assert result is not None
        assert result.title == "Test"

    @pytest.mark.unit
    def test_validate_invalid_data_returns_none(self):
        """无效数据应返回 None（非严格模式）。"""
        from sololab.core.resilience import OutputValidator

        validator = OutputValidator()
        data = {"wrong_field": "value"}
        result = validator.validate(data, SampleOutput)
        assert result is None

    @pytest.mark.unit
    def test_validate_strict_raises(self):
        """严格模式下无效数据应抛出异常。"""
        from sololab.core.resilience import OutputValidator

        validator = OutputValidator()
        with pytest.raises(Exception):
            validator.validate({"wrong": "data"}, SampleOutput, strict=True)

    @pytest.mark.unit
    def test_validate_json_string(self):
        """JSON 字符串也应可以校验。"""
        from sololab.core.resilience import OutputValidator
        import json

        validator = OutputValidator()
        data_str = json.dumps({"title": "JSON Test", "score": 1.0})
        result = validator.validate(data_str, SampleOutput)
        assert result is not None
        assert result.title == "JSON Test"


class TestMessageThreshold:
    """MessageThreshold 测试。"""

    @pytest.mark.unit
    def test_below_threshold(self):
        """未超阈值时不应强制评估。"""
        from sololab.core.resilience import MessageThreshold

        threshold = MessageThreshold(max_messages=100)
        assert threshold.should_force_evaluate(50) is False

    @pytest.mark.unit
    def test_at_threshold(self):
        """达到阈值时应强制评估。"""
        from sololab.core.resilience import MessageThreshold

        threshold = MessageThreshold(max_messages=100)
        assert threshold.should_force_evaluate(100) is True

    @pytest.mark.unit
    def test_warning_levels(self):
        """警告级别应正确。"""
        from sololab.core.resilience import MessageThreshold

        threshold = MessageThreshold(max_messages=100)
        assert threshold.get_warning_level(50) is None
        assert threshold.get_warning_level(65) == "info"
        assert threshold.get_warning_level(85) == "warning"
        assert threshold.get_warning_level(100) == "critical"
