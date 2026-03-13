"""LiteLLM 网关的集成测试。"""

import pytest


class TestLiteLLMGateway:
    """需要运行 LiteLLM 代理或直接 API 访问的测试。"""

    @pytest.mark.integration
    async def test_generate_with_real_model(self):
        """测试通过 LiteLLM 的实际 LLM API 调用。"""
        # TODO: 需要配置 API 密钥
        # 1. 使用真实配置创建 LLMGateway
        # 2. 使用简单提示词调用 generate()
        # 3. 验证响应格式
        pass

    @pytest.mark.integration
    async def test_fallback_chain(self):
        """测试主模型失败时的降级。"""
        # TODO: 配置无效的主模型和有效的降级模型
        # 1. 将主模型设为不存在的模型
        # 2. 将降级模型设为可用模型
        # 3. 验证通过降级模型成功生成
        pass
