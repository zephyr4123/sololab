"""Benchmark 单元测试 - 自动化指标模块。"""

import math
import pytest
import numpy as np

from sololab.benchmark.metrics import (
    convergence_round,
    cost_efficiency,
    grounding_rate,
    idea_distribution,
    rank_stability,
    rank_stability_by_author,
    semantic_diversity,
    tool_call_stats,
)


class TestGroundingRate:

    def test_all_grounded(self):
        events = [
            {"type": "tool", "agent": "divergent", "tool": "arxiv_search", "success": True},
            {"type": "tool", "agent": "expert", "tool": "scholar_search", "success": True},
            {"type": "idea", "id": "1", "content": "idea1", "author": "divergent"},
            {"type": "idea", "id": "2", "content": "idea2", "author": "expert"},
        ]
        assert grounding_rate(events) == 1.0

    def test_partial_grounded(self):
        events = [
            {"type": "tool", "agent": "divergent", "tool": "arxiv_search", "success": True},
            {"type": "idea", "id": "1", "content": "idea1", "author": "divergent"},
            {"type": "idea", "id": "2", "content": "idea2", "author": "connector"},
        ]
        assert grounding_rate(events) == 0.5

    def test_no_ideas(self):
        events = [{"type": "tool", "agent": "divergent", "tool": "arxiv_search", "success": True}]
        assert grounding_rate(events) == 0.0

    def test_no_tools(self):
        events = [
            {"type": "idea", "id": "1", "content": "idea1", "author": "divergent"},
        ]
        assert grounding_rate(events) == 0.0

    def test_failed_tool_not_counted(self):
        events = [
            {"type": "tool", "agent": "divergent", "tool": "arxiv_search", "success": False},
            {"type": "idea", "id": "1", "content": "idea1", "author": "divergent"},
        ]
        assert grounding_rate(events) == 0.0


class TestToolCallStats:

    def test_basic_stats(self):
        events = [
            {"type": "tool", "agent": "divergent", "tool": "web_search", "success": True},
            {"type": "tool", "agent": "divergent", "tool": "arxiv_search", "success": True},
            {"type": "tool", "agent": "expert", "tool": "arxiv_search", "success": False},
            {"type": "idea", "id": "1", "content": "...", "author": "divergent"},
        ]
        stats = tool_call_stats(events)
        assert stats["total_calls"] == 3
        assert stats["successful_calls"] == 2
        assert abs(stats["success_rate"] - 2 / 3) < 0.01
        assert stats["by_tool"]["arxiv_search"] == 2
        assert stats["by_agent"]["divergent"] == 2


class TestRankStability:

    def test_identical_runs(self):
        runs = [["a", "b", "c"], ["a", "b", "c"]]
        assert rank_stability(runs) == 1.0

    def test_completely_different(self):
        runs = [["a", "b", "c"], ["d", "e", "f"]]
        assert rank_stability(runs) == 0.0

    def test_partial_overlap(self):
        runs = [["a", "b", "c", "d"], ["a", "b", "e", "f"]]
        # overlap = 2/4 = 0.5
        assert abs(rank_stability(runs) - 0.5) < 0.01

    def test_single_run(self):
        assert rank_stability([["a", "b"]]) == 1.0


class TestRankStabilityByAuthor:

    def test_identical_author_sequences(self):
        runs = [["divergent", "expert", "connector"], ["divergent", "expert", "connector"]]
        assert rank_stability_by_author(runs) == 1.0

    def test_reversed_sequence(self):
        runs = [["a", "b", "c"], ["c", "b", "a"]]
        # reversed = kendall tau of -1
        assert rank_stability_by_author(runs) < 0


class TestConvergenceRound:

    def test_converged(self):
        events = [
            {"type": "status", "phase": "separate", "round": 1},
            {"type": "status", "phase": "evaluate", "round": 1},
            {"type": "status", "phase": "separate", "round": 2},
            {"type": "status", "phase": "converged", "round": 2},
        ]
        assert convergence_round(events) == 2

    def test_not_converged(self):
        events = [
            {"type": "status", "phase": "separate", "round": 1},
            {"type": "status", "phase": "evaluate", "round": 1},
            {"type": "status", "phase": "separate", "round": 2},
            {"type": "status", "phase": "evaluate", "round": 2},
            {"type": "status", "phase": "separate", "round": 3},
        ]
        assert convergence_round(events) == 3


class TestCostEfficiency:

    def test_normal(self):
        assert cost_efficiency(7.0, 1.0) == 7.0

    def test_zero_cost(self):
        assert cost_efficiency(7.0, 0.0) == 0.0


class TestIdeaDistribution:

    def test_basic(self):
        events = [
            {"type": "idea", "id": "1", "content": "...", "author": "divergent"},
            {"type": "idea", "id": "2", "content": "...", "author": "divergent"},
            {"type": "idea", "id": "3", "content": "...", "author": "expert"},
        ]
        dist = idea_distribution(events)
        assert dist["total_ideas"] == 3
        assert dist["by_author"]["divergent"] == 2
        assert dist["by_author"]["expert"] == 1
        assert dist["entropy"] > 0  # 非均匀分布有正熵

    def test_uniform_has_max_entropy(self):
        events = [
            {"type": "idea", "id": "1", "content": "...", "author": "a"},
            {"type": "idea", "id": "2", "content": "...", "author": "b"},
        ]
        dist = idea_distribution(events)
        assert abs(dist["entropy"] - 1.0) < 0.01  # log2(2) = 1.0


class TestSemanticDiversity:

    @pytest.mark.asyncio
    async def test_identical_ideas(self):
        """完全相同的文本应该有 0 多样性。"""
        async def mock_embed(texts):
            return [[1.0, 0.0, 0.0]] * len(texts)

        score = await semantic_diversity(["same", "same"], mock_embed)
        assert score == 0.0

    @pytest.mark.asyncio
    async def test_orthogonal_ideas(self):
        """正交向量应该有多样性 = 1.0。"""
        async def mock_embed(texts):
            return [[1.0, 0.0], [0.0, 1.0]]

        score = await semantic_diversity(["idea1", "idea2"], mock_embed)
        assert abs(score - 1.0) < 0.01

    @pytest.mark.asyncio
    async def test_single_idea(self):
        async def mock_embed(texts):
            return [[1.0, 0.0]]

        score = await semantic_diversity(["only one"], mock_embed)
        assert score == 0.0
