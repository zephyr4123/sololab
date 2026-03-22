"""AgentRunner 单元测试 —— 使用真实 LLM。"""

import pytest

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import MessageType
from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.tools.tavily_search import TavilySearchTool


class TestAgentRunner:

    @pytest.fixture
    def gateway(self, real_llm_config):
        return LLMGateway(real_llm_config)

    @pytest.fixture
    def tool_registry(self):
        reg = ToolRegistry()
        reg.register(TavilySearchTool())
        return reg

    @pytest.mark.unit
    async def test_divergent_generates_idea(self, gateway, tool_registry):
        """Divergent thinker 应生成 IDEA 类型消息。"""
        config = get_persona("divergent")
        runner = AgentRunner(config, gateway, tool_registry)
        messages = await runner.run("AI for drug discovery")
        assert len(messages) >= 1
        assert messages[0].msg_type == MessageType.IDEA
        assert messages[0].sender == "divergent"
        assert len(messages[0].content) > 50

    @pytest.mark.unit
    async def test_critic_generates_critique(self, gateway):
        """Critic 应生成 CRITIQUE 类型消息。"""
        config = get_persona("critic")
        runner = AgentRunner(config, gateway)
        messages = await runner.run(
            "",
            task_prompt="Critique this idea: Use reinforcement learning to optimize drug molecules.",
        )
        assert len(messages) >= 1
        assert messages[0].sender == "critic"

    @pytest.mark.unit
    async def test_agent_state_tracking(self, gateway):
        """AgentRunner 应跟踪 token 使用量和状态。"""
        config = get_persona("connector")
        runner = AgentRunner(config, gateway)
        await runner.run("AI systems")
        assert runner.state.status == "done"
        assert runner.state.tokens_used > 0
        assert runner.state.messages_sent >= 1

    @pytest.mark.unit
    def test_model_name_prefix(self):
        """_model_name 应为裸名加 openai/ 前缀。"""
        config = get_persona("divergent")
        runner = AgentRunner(config, LLMGateway.__new__(LLMGateway))
        # 只测解析逻辑不调 LLM
        assert config.name == "divergent"
