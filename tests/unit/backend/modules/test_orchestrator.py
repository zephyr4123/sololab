"""编排器单元测试。"""

import pytest
import uuid

from sololab.models.agent import Message, MessageType
from sololab.modules.ideaspark.orchestrator import Orchestrator


def _make_idea(content: str, sender: str = "divergent") -> Message:
    return Message(
        id=str(uuid.uuid4()),
        sender=sender,
        content=content,
        msg_type=MessageType.IDEA,
    )


class TestOrchestratorHelpers:
    """测试编排器的辅助方法（不需要 LLM）。"""

    @pytest.mark.unit
    def test_elo_update_winner_a(self):
        """A 获胜后 A 的分数应上升，B 的应下降。"""
        orch = Orchestrator(llm_gateway=None)
        orch.elo_scores["a"] = 1500
        orch.elo_scores["b"] = 1500
        orch._update_elo("a", "b", "A")
        assert orch.elo_scores["a"] > 1500
        assert orch.elo_scores["b"] < 1500

    @pytest.mark.unit
    def test_elo_update_draw(self):
        """平局时相同 Elo 的双方分数不变。"""
        orch = Orchestrator(llm_gateway=None)
        orch.elo_scores["a"] = 1500
        orch.elo_scores["b"] = 1500
        orch._update_elo("a", "b", "draw")
        assert abs(orch.elo_scores["a"] - 1500) < 0.01
        assert abs(orch.elo_scores["b"] - 1500) < 0.01

    @pytest.mark.unit
    def test_parse_vote_a(self):
        """应正确解析 Winner: A。"""
        orch = Orchestrator(llm_gateway=None)
        assert orch._parse_vote("Winner: A\nReason: better") == "A"

    @pytest.mark.unit
    def test_parse_vote_b(self):
        """应正确解析 Winner: B。"""
        orch = Orchestrator(llm_gateway=None)
        assert orch._parse_vote("Winner: B\nReason: more novel") == "B"

    @pytest.mark.unit
    def test_convergence_check_first_round(self):
        """第一轮不应收敛。"""
        orch = Orchestrator(llm_gateway=None)
        ideas = [_make_idea(f"idea {i}") for i in range(5)]
        assert orch._convergence_check(ideas) is False

    @pytest.mark.unit
    def test_convergence_check_same_ids(self):
        """相同 Top-K 应收敛。"""
        orch = Orchestrator(llm_gateway=None)
        ideas = [_make_idea(f"idea {i}") for i in range(5)]
        orch._convergence_check(ideas)  # 第一轮
        assert orch._convergence_check(ideas) is True  # 第二轮相同

    @pytest.mark.unit
    def test_refine_prompt(self):
        """优化提示词应包含原始主题和 idea 摘要。"""
        orch = Orchestrator(llm_gateway=None)
        ideas = [_make_idea("Use GNN for molecular design")]
        prompt = orch._refine_prompt("drug discovery", ideas)
        assert "drug discovery" in prompt
        assert "GNN" in prompt


class TestOrchestratorCluster:
    """测试聚类逻辑（需要 LLM embed）。"""

    @pytest.mark.unit
    async def test_cluster_small_set(self):
        """少于 num_groups 的 idea 应每个一组。"""
        orch = Orchestrator(llm_gateway=None)
        ideas = [_make_idea("idea 1"), _make_idea("idea 2")]
        groups = await orch._cluster_ideas(ideas, num_groups=4)
        assert len(groups) == 2
        assert all(len(g) == 1 for g in groups)

    @pytest.mark.unit
    async def test_cluster_with_real_embed(self, real_llm_config):
        """使用真实嵌入的聚类应产生多个组。"""
        from sololab.core.llm_gateway import LLMGateway

        gw = LLMGateway(real_llm_config)
        orch = Orchestrator(llm_gateway=gw)
        ideas = [
            _make_idea("Use graph neural networks for molecular property prediction"),
            _make_idea("Apply reinforcement learning for retrosynthesis planning"),
            _make_idea("Transfer learning from protein structures to drug binding"),
            _make_idea("Multi-agent debate for validating drug candidates"),
            _make_idea("Federated learning across pharmaceutical companies"),
            _make_idea("Generative models for novel molecule design"),
        ]
        groups = await orch._cluster_ideas(ideas, num_groups=3)
        assert len(groups) == 3
        total = sum(len(g) for g in groups)
        assert total == 6
