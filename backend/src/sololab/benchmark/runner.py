"""Benchmark Runner - 编排完整的评测流程。"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sololab.benchmark.ablation import AblationCondition, run_ablation
from sololab.benchmark.config import (
    BENCHMARK_TOPICS,
    BenchmarkParams,
    BenchmarkTopic,
    get_topic_by_id,
)
from sololab.benchmark.judge import IdeaJudge, JudgeResult
from sololab.benchmark.metrics import compute_all_metrics, rank_stability_by_author
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.core.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 单次运行结果
# ---------------------------------------------------------------------------

@dataclass
class RunResult:
    """一次 IdeaSpark（或消融条件）运行的完整结果。"""

    topic_id: str
    condition: str
    run_index: int
    top_ideas: List[Dict[str, Any]] = field(default_factory=list)
    events: List[Dict[str, Any]] = field(default_factory=list)
    judge_scores: List[Dict[str, Any]] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    cost_usd: float = 0.0
    duration_seconds: float = 0.0
    error: Optional[str] = None
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "topic_id": self.topic_id,
            "condition": self.condition,
            "run_index": self.run_index,
            "top_ideas": self.top_ideas,
            "judge_scores": self.judge_scores,
            "metrics": self.metrics,
            "cost_usd": self.cost_usd,
            "duration_seconds": round(self.duration_seconds, 2),
            "error": self.error,
            "timestamp": self.timestamp,
        }


# ---------------------------------------------------------------------------
# Benchmark Runner
# ---------------------------------------------------------------------------

class BenchmarkRunner:
    """编排完整 benchmark 流程：运行 → 评分 → 指标 → 持久化。"""

    def __init__(
        self,
        llm_gateway: LLMGateway,
        tool_registry: Optional[ToolRegistry] = None,
        judge: Optional[IdeaJudge] = None,
        params: Optional[BenchmarkParams] = None,
    ) -> None:
        self.llm = llm_gateway
        self.tools = tool_registry
        self.judge = judge or IdeaJudge.from_settings()
        self.params = params or BenchmarkParams()
        self.results: List[RunResult] = []
        self._output_dir = Path(self.params.output_dir)

    @classmethod
    def from_settings(cls) -> "BenchmarkRunner":
        """从应用配置创建 Runner 实例。"""
        from sololab.config.settings import get_settings

        s = get_settings()

        llm_config = LLMConfig(
            base_url=s.llm_base_url,
            api_key=s.llm_api_key,
            default_model=s.llm_model,
            embedding_base_url=s.embedding_base_url,
            embedding_api_key=s.embedding_api_key,
            embedding_model=s.embedding_model,
        )
        llm = LLMGateway(llm_config)

        # 尝试创建 ToolRegistry 并注册工具
        tools = ToolRegistry()
        for register_fn in [
            lambda: __import__('sololab.tools.tavily_search', fromlist=['TavilySearchTool']).TavilySearchTool(),
            lambda: __import__('sololab.tools.arxiv_search', fromlist=['ArxivTool']).ArxivTool(),
            lambda: __import__('sololab.tools.scholar_search', fromlist=['SemanticScholarTool']).SemanticScholarTool(),
        ]:
            try:
                tools.register(register_fn())
            except Exception as e:
                logger.warning("工具注册失败: %s", e)

        judge = IdeaJudge(
            base_url=s.judge_base_url,
            api_key=s.judge_api_key,
            model=s.judge_model,
        )

        return cls(llm_gateway=llm, tool_registry=tools, judge=judge)

    # -----------------------------------------------------------------------
    # 主入口
    # -----------------------------------------------------------------------

    async def run_full_benchmark(
        self,
        conditions: Optional[List[AblationCondition]] = None,
        topic_ids: Optional[List[str]] = None,
    ) -> List[RunResult]:
        """运行完整 benchmark（所有主题 × 所有条件 × 重复次数）。

        Args:
            conditions: 要测试的消融条件，默认全部
            topic_ids: 要测试的主题 ID，默认使用 params 中的配置
        """
        if conditions is None:
            conditions = list(AblationCondition)

        topics = self._resolve_topics(topic_ids)

        self._output_dir.mkdir(parents=True, exist_ok=True)

        total = len(topics) * len(conditions) * self.params.runs_per_topic
        completed = 0

        for topic in topics:
            for condition in conditions:
                for run_idx in range(self.params.runs_per_topic):
                    completed += 1
                    logger.info(
                        "[%d/%d] topic=%s, condition=%s, run=%d",
                        completed, total, topic.id, condition.value, run_idx + 1,
                    )

                    result = await self.run_single(
                        topic=topic,
                        condition=condition,
                        run_index=run_idx,
                    )
                    self.results.append(result)
                    self._save_result(result)

        # 计算跨运行指标
        self._compute_cross_run_metrics()

        return self.results

    async def run_single(
        self,
        topic: BenchmarkTopic,
        condition: AblationCondition,
        run_index: int = 0,
    ) -> RunResult:
        """运行单次实验并评分。"""
        result = RunResult(
            topic_id=topic.id,
            condition=condition.value,
            run_index=run_index,
            timestamp=datetime.utcnow().isoformat(),
        )

        # 1. 运行 IdeaSpark（收集事件）
        start = time.monotonic()
        try:
            events: List[Dict[str, Any]] = []
            top_ideas: List[Dict[str, Any]] = []
            cost_usd = 0.0

            async for event in run_ablation(
                condition=condition,
                llm_gateway=self.llm,
                tool_registry=self.tools,
                user_input=topic.title,
                top_k=self.params.top_k,
                max_rounds=self.params.max_rounds if condition != AblationCondition.SINGLE_ROUND else 1,
            ):
                if isinstance(event, dict):
                    events.append(event)
                    if event.get("type") == "done":
                        top_ideas = event.get("top_ideas", [])
                        cost_usd = event.get("cost_usd", 0.0)

            result.events = events
            result.top_ideas = top_ideas
            result.cost_usd = cost_usd
            result.duration_seconds = time.monotonic() - start

        except Exception as e:
            result.error = str(e)
            result.duration_seconds = time.monotonic() - start
            logger.error("运行失败 (topic=%s, condition=%s): %s", topic.id, condition.value, e)
            return result

        # 2. LLM-as-Judge 评分
        if top_ideas:
            try:
                judge_results = await self.judge.score_batch(
                    topic=topic.title,
                    ideas=[{"id": idea["id"], "content": idea["content"]} for idea in top_ideas],
                    repeat=self.params.judge_repeat,
                )
                result.judge_scores = [jr.to_dict() for jr in judge_results]
            except Exception as e:
                logger.error("Judge 评分失败: %s", e)

        # 3. 计算自动化指标
        avg_quality = 0.0
        if result.judge_scores:
            avg_quality = sum(s["overall"] for s in result.judge_scores) / len(result.judge_scores)

        try:
            result.metrics = await compute_all_metrics(
                top_ideas=top_ideas,
                events=events,
                embed_fn=self.llm.embed,
                quality_score=avg_quality,
                cost_usd=cost_usd,
            )
            result.metrics["avg_quality"] = round(avg_quality, 4)
        except Exception as e:
            logger.error("指标计算失败: %s", e)

        return result

    async def run_quick_benchmark(
        self,
        topic_ids: Optional[List[str]] = None,
        n_topics: int = 3,
    ) -> List[RunResult]:
        """快速 benchmark：只跑 Full 条件 + 3 个主题 × 1 次。

        适合快速验证 benchmark 框架是否正常工作。
        """
        topics = self._resolve_topics(topic_ids)[:n_topics]
        self._output_dir.mkdir(parents=True, exist_ok=True)

        for i, topic in enumerate(topics):
            logger.info("[%d/%d] Quick run: topic=%s", i + 1, len(topics), topic.id)
            result = await self.run_single(
                topic=topic,
                condition=AblationCondition.FULL,
                run_index=0,
            )
            self.results.append(result)
            self._save_result(result)

        return self.results

    # -----------------------------------------------------------------------
    # 内部方法
    # -----------------------------------------------------------------------

    def _resolve_topics(self, topic_ids: Optional[List[str]] = None) -> List[BenchmarkTopic]:
        """解析主题列表。"""
        if topic_ids:
            topics = [get_topic_by_id(tid) for tid in topic_ids]
            return [t for t in topics if t is not None]
        return [get_topic_by_id(tid) for tid in self.params.topics if get_topic_by_id(tid) is not None]

    def _save_result(self, result: RunResult) -> None:
        """持久化单次运行结果。"""
        filename = f"{result.condition}_{result.topic_id}_run{result.run_index}.json"
        filepath = self._output_dir / filename

        # 不保存完整事件流（太大），只保存汇总
        save_data = result.to_dict()
        save_data.pop("events", None)  # events 可能很大，只保存摘要

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)

        logger.info("结果已保存: %s", filepath)

    def _compute_cross_run_metrics(self) -> None:
        """计算跨运行的汇总指标（排名稳定性等）。"""
        # 按 (topic_id, condition) 分组
        groups: Dict[tuple, List[RunResult]] = {}
        for r in self.results:
            key = (r.topic_id, r.condition)
            groups.setdefault(key, []).append(r)

        for (topic_id, condition), runs in groups.items():
            if len(runs) < 2:
                continue

            # 收集每次运行的 Top-K 作者序列
            author_seqs = []
            for run in runs:
                authors = [idea.get("author", "") for idea in run.top_ideas]
                if authors:
                    author_seqs.append(authors)

            if len(author_seqs) >= 2:
                stability = rank_stability_by_author(author_seqs)
                for run in runs:
                    run.metrics["rank_stability"] = round(stability, 4)

    # -----------------------------------------------------------------------
    # 加载历史结果
    # -----------------------------------------------------------------------

    def load_results(self, output_dir: Optional[str] = None) -> List[Dict[str, Any]]:
        """从磁盘加载历史运行结果。"""
        directory = Path(output_dir) if output_dir else self._output_dir
        results = []
        for filepath in sorted(directory.glob("*.json")):
            if filepath.name == "summary.json":
                continue
            with open(filepath, "r", encoding="utf-8") as f:
                results.append(json.load(f))
        return results
