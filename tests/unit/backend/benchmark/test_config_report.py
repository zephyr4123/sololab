"""Benchmark 单元测试 - 配置与报告模块。"""

import pytest

from sololab.benchmark.config import (
    BENCHMARK_TOPICS,
    BenchmarkParams,
    Difficulty,
    get_topic_by_id,
    get_topics_by_category,
    get_topics_by_difficulty,
)
from sololab.benchmark.report import generate_ablation_table, generate_scorecard


class TestBenchmarkTopics:

    def test_has_15_topics(self):
        assert len(BENCHMARK_TOPICS) == 15

    def test_unique_ids(self):
        ids = [t.id for t in BENCHMARK_TOPICS]
        assert len(ids) == len(set(ids))

    def test_all_categories_covered(self):
        categories = {t.category for t in BENCHMARK_TOPICS}
        expected = {"CS/AI", "生物医学", "材料科学", "社会科学", "交叉学科", "方法论", "开放问题"}
        assert categories == expected

    def test_difficulty_distribution(self):
        low = get_topics_by_difficulty(Difficulty.LOW)
        medium = get_topics_by_difficulty(Difficulty.MEDIUM)
        high = get_topics_by_difficulty(Difficulty.HIGH)
        assert len(low) >= 2
        assert len(medium) >= 3
        assert len(high) >= 5
        assert len(low) + len(medium) + len(high) == 15

    def test_get_topic_by_id(self):
        topic = get_topic_by_id("cs-01")
        assert topic is not None
        assert topic.category == "CS/AI"

    def test_get_topic_nonexistent(self):
        assert get_topic_by_id("nonexistent") is None

    def test_get_by_category(self):
        cs = get_topics_by_category("CS/AI")
        assert len(cs) == 2


class TestBenchmarkParams:

    def test_defaults(self):
        params = BenchmarkParams()
        assert params.runs_per_topic == 3
        assert params.top_k == 5
        assert params.max_rounds == 3
        assert params.judge_repeat == 2
        assert len(params.topics) == 15


class TestScorecard:

    def test_generate_scorecard(self):
        result = {
            "topic_id": "cs-01",
            "condition": "full",
            "run_index": 0,
            "cost_usd": 1.23,
            "duration_seconds": 127,
            "metrics": {
                "avg_quality": 7.12,
                "diversity": 0.67,
                "grounding_rate": 0.8,
                "convergence_round": 2,
                "cost_efficiency": 5.79,
                "idea_distribution": {"total_ideas": 8},
            },
            "judge_scores": [
                {
                    "novelty": {"score": 7.2, "reason": "..."},
                    "feasibility": {"score": 6.8, "reason": "..."},
                    "impact": {"score": 7.5, "reason": "..."},
                    "specificity": {"score": 6.1, "reason": "..."},
                    "evidence": {"score": 7.8, "reason": "..."},
                }
            ],
            "top_ideas": [
                {"id": "1", "content": "基于图神经网络的分子-靶点交互预测框架...", "author": "divergent", "elo_score": 1672},
            ],
        }
        card = generate_scorecard(result)
        assert "IdeaSpark Benchmark Scorecard" in card
        assert "cs-01" in card
        assert "7.12" in card


class TestAblationTable:

    def test_generate_table(self):
        results = [
            {
                "condition": "full",
                "topic_id": "cs-01",
                "cost_usd": 1.5,
                "duration_seconds": 120,
                "metrics": {"avg_quality": 7.0, "diversity": 0.6, "grounding_rate": 0.8},
                "judge_scores": [
                    {"novelty": {"score": 7}, "feasibility": {"score": 6}, "impact": {"score": 8},
                     "specificity": {"score": 5}, "evidence": {"score": 9}},
                ],
            },
            {
                "condition": "baseline_single",
                "topic_id": "cs-01",
                "cost_usd": 0.5,
                "duration_seconds": 30,
                "metrics": {"avg_quality": 5.0, "diversity": 0.3, "grounding_rate": 0.0},
                "judge_scores": [
                    {"novelty": {"score": 5}, "feasibility": {"score": 5}, "impact": {"score": 5},
                     "specificity": {"score": 5}, "evidence": {"score": 5}},
                ],
            },
        ]
        table = generate_ablation_table(results)
        assert "Ablation Study" in table
        assert "full" in table
        assert "baseline_single" in table
