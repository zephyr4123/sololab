"""Benchmark 单元测试 - Judge 模块。"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sololab.benchmark.judge import DimensionScore, IdeaJudge, JudgeResult


class TestJudgeResult:
    """JudgeResult 数据结构测试。"""

    def test_weighted_overall(self):
        result = JudgeResult(
            idea_id="test-1",
            novelty=DimensionScore(score=8.0, reason="good"),
            feasibility=DimensionScore(score=6.0, reason="ok"),
            impact=DimensionScore(score=7.0, reason="fine"),
            specificity=DimensionScore(score=5.0, reason="meh"),
            evidence=DimensionScore(score=9.0, reason="great"),
        )
        # 0.25*8 + 0.25*6 + 0.2*7 + 0.15*5 + 0.15*9 = 2.0 + 1.5 + 1.4 + 0.75 + 1.35 = 7.0
        assert abs(result.weighted_overall - 7.0) < 0.01

    def test_to_dict(self):
        result = JudgeResult(
            idea_id="test-1",
            novelty=DimensionScore(score=7.0, reason="novel"),
            feasibility=DimensionScore(score=6.0, reason="feasible"),
            impact=DimensionScore(score=8.0, reason="impactful"),
            specificity=DimensionScore(score=5.0, reason="vague"),
            evidence=DimensionScore(score=9.0, reason="well-cited"),
        )
        d = result.to_dict()
        assert d["idea_id"] == "test-1"
        assert d["novelty"]["score"] == 7.0
        assert isinstance(d["overall"], float)

    def test_default_scores_are_zero(self):
        result = JudgeResult(idea_id="empty")
        assert result.weighted_overall == 0.0


class TestIdeaJudge:
    """IdeaJudge 评分逻辑测试。"""

    def test_parse_valid_json(self):
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = json.dumps({
            "novelty": {"score": 7, "reason": "跨领域迁移"},
            "feasibility": {"score": 6, "reason": "技术可行"},
            "impact": {"score": 8, "reason": "广泛应用"},
            "specificity": {"score": 5, "reason": "缺细节"},
            "evidence": {"score": 9, "reason": "引用充分"},
            "overall": 7.0,
            "one_line_summary": "不错的创意",
        })
        result = judge._parse_response(raw, "idea-1")
        assert result.novelty.score == 7
        assert result.feasibility.score == 6
        assert result.evidence.score == 9
        assert result.one_line_summary == "不错的创意"

    def test_parse_json_with_markdown_wrapper(self):
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = '```json\n{"novelty": {"score": 7, "reason": "good"}, "feasibility": {"score": 6, "reason": "ok"}, "impact": {"score": 8, "reason": "big"}, "specificity": {"score": 5, "reason": "meh"}, "evidence": {"score": 9, "reason": "cited"}, "overall": 7.0, "one_line_summary": "test"}\n```'
        result = judge._parse_response(raw, "idea-2")
        assert result.novelty.score == 7
        assert result.evidence.score == 9

    def test_parse_json_with_think_tags(self):
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = '<think>让我仔细想想...</think>\n{"novelty": {"score": 7, "reason": "good"}, "feasibility": {"score": 6, "reason": "ok"}, "impact": {"score": 8, "reason": "big"}, "specificity": {"score": 5, "reason": "meh"}, "evidence": {"score": 9, "reason": "cited"}, "overall": 7.0, "one_line_summary": "test"}'
        result = judge._parse_response(raw, "idea-3")
        assert result.novelty.score == 7

    def test_parse_json_inside_think_tags(self):
        """JSON 完全在 <think> 标签内部（qwen3.5-plus 常见）。"""
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = '<think>我来分析一下...\n{"novelty": {"score": 7, "reason": "good"}, "feasibility": {"score": 6, "reason": "ok"}, "impact": {"score": 8, "reason": "big"}, "specificity": {"score": 5, "reason": "meh"}, "evidence": {"score": 9, "reason": "cited"}, "overall": 7.0, "one_line_summary": "inside think"}\n</think>'
        result = judge._parse_response(raw, "idea-inside-think")
        assert result.novelty.score == 7
        assert result.one_line_summary == "inside think"

    def test_parse_unclosed_think_tag(self):
        """<think> 标签未闭合。"""
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = '<think>思考中...\n一些分析内容\n{"novelty": {"score": 7, "reason": "good"}, "feasibility": {"score": 6, "reason": "ok"}, "impact": {"score": 8, "reason": "big"}, "specificity": {"score": 5, "reason": "meh"}, "evidence": {"score": 9, "reason": "cited"}, "overall": 7.0, "one_line_summary": "unclosed"}'
        result = judge._parse_response(raw, "idea-unclosed")
        assert result.novelty.score == 7

    def test_parse_think_then_markdown_json(self):
        """<think> 后面跟 markdown 代码块。"""
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = '<think>分析完毕</think>\n```json\n{"novelty": {"score": 8, "reason": "great"}, "feasibility": {"score": 7, "reason": "doable"}, "impact": {"score": 9, "reason": "huge"}, "specificity": {"score": 6, "reason": "ok"}, "evidence": {"score": 5, "reason": "weak"}, "overall": 7.2, "one_line_summary": "combo"}\n```'
        result = judge._parse_response(raw, "idea-combo")
        assert result.novelty.score == 8
        assert result.impact.score == 9

    def test_parse_invalid_json_returns_zero(self):
        judge = IdeaJudge(base_url="http://test", api_key="test")
        result = judge._parse_response("this is not json at all", "idea-bad")
        assert result.weighted_overall == 0.0

    def test_parse_numeric_scores(self):
        """测试维度直接是数字（非字典）的情况。"""
        judge = IdeaJudge(base_url="http://test", api_key="test")
        raw = json.dumps({
            "novelty": 7,
            "feasibility": 6,
            "impact": 8,
            "specificity": 5,
            "evidence": 9,
            "overall": 7.0,
            "one_line_summary": "test",
        })
        result = judge._parse_response(raw, "idea-numeric")
        assert result.novelty.score == 7
        assert result.novelty.reason == ""

    @pytest.mark.asyncio
    async def test_score_idea_api_error(self):
        """API 调用失败时返回零分。"""
        judge = IdeaJudge(base_url="http://test", api_key="bad-key")
        result = await judge.score_idea(
            topic="test topic",
            idea_content="test idea",
            idea_id="error-test",
        )
        assert result.idea_id == "error-test"
        # 连接会失败，返回零分
        assert result.weighted_overall == 0.0

    @pytest.mark.asyncio
    async def test_score_idea_repeated_averages(self):
        """多次评分应取平均。"""
        judge = IdeaJudge(base_url="http://test", api_key="test")

        call_count = 0
        scores = [
            {"novelty": {"score": 8, "reason": "a"}, "feasibility": {"score": 6, "reason": "b"},
             "impact": {"score": 7, "reason": "c"}, "specificity": {"score": 5, "reason": "d"},
             "evidence": {"score": 9, "reason": "e"}, "overall": 7.0, "one_line_summary": "first"},
            {"novelty": {"score": 6, "reason": "a"}, "feasibility": {"score": 8, "reason": "b"},
             "impact": {"score": 7, "reason": "c"}, "specificity": {"score": 7, "reason": "d"},
             "evidence": {"score": 7, "reason": "e"}, "overall": 7.0, "one_line_summary": "second"},
        ]

        async def mock_create(**kwargs):
            nonlocal call_count
            resp = MagicMock()
            resp.choices = [MagicMock()]
            resp.choices[0].message.content = json.dumps(scores[call_count % 2])
            call_count += 1
            return resp

        judge._client = MagicMock()
        judge._client.chat.completions.create = mock_create

        result = await judge.score_idea_repeated(
            topic="test", idea_content="idea", idea_id="avg-test", repeat=2
        )

        assert result.novelty.score == 7.0  # (8+6)/2
        assert result.feasibility.score == 7.0  # (6+8)/2
