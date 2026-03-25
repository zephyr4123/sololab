"""报告生成模块 - 生成 Benchmark Scorecard 与汇总统计。"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scorecard 生成
# ---------------------------------------------------------------------------

def generate_scorecard(result: Dict[str, Any]) -> str:
    """为单次运行生成文本格式 Scorecard。"""
    topic_id = result.get("topic_id", "?")
    condition = result.get("condition", "?")
    run_index = result.get("run_index", 0)
    cost = result.get("cost_usd", 0)
    duration = result.get("duration_seconds", 0)
    metrics = result.get("metrics", {})
    judge_scores = result.get("judge_scores", [])
    top_ideas = result.get("top_ideas", [])

    # 计算各维度均分
    dims = {"novelty": [], "feasibility": [], "impact": [], "specificity": [], "evidence": []}
    for s in judge_scores:
        for dim in dims:
            dim_data = s.get(dim, {})
            score = dim_data.get("score", 0) if isinstance(dim_data, dict) else 0
            dims[dim].append(score)

    def avg(lst):
        return round(sum(lst) / len(lst), 2) if lst else 0

    avg_quality = metrics.get("avg_quality", 0)
    diversity = metrics.get("diversity", 0)
    grounding = metrics.get("grounding_rate", 0)
    conv_round = metrics.get("convergence_round", "?")
    efficiency = metrics.get("cost_efficiency", 0)
    idea_dist = metrics.get("idea_distribution", {})

    # 最佳创意预览
    best_idea = ""
    best_score = 0
    if top_ideas:
        best = top_ideas[0]
        best_idea = best.get("content", "")[:120] + "..."
        best_score = best.get("elo_score", 1500)

    lines = [
        "┌──────────────────────────────────────────────────┐",
        "│  IdeaSpark Benchmark Scorecard                   │",
        f"│  Topic: {topic_id:<42}│",
        f"│  Condition: {condition:<38}│",
        f"│  Run: #{run_index + 1:<44}│",
        "├──────────────────────────────────────────────────┤",
        "│  Quality Scores (LLM-Judge, avg of Top-K)        │",
        f"│    Novelty:      {avg(dims['novelty']):>5.2f} / 10                    │",
        f"│    Feasibility:  {avg(dims['feasibility']):>5.2f} / 10                    │",
        f"│    Impact:       {avg(dims['impact']):>5.2f} / 10                    │",
        f"│    Specificity:  {avg(dims['specificity']):>5.2f} / 10                    │",
        f"│    Evidence:     {avg(dims['evidence']):>5.2f} / 10                    │",
        f"│    Overall:      {avg_quality:>5.2f} / 10                    │",
        "│                                                  │",
        "│  System Metrics                                  │",
        f"│    Diversity:    {diversity:.4f} (cosine dist)            │",
        f"│    Grounding:    {grounding:.0%} ideas with tools          │",
        f"│    Rounds:       {conv_round} (converged)                   │",
        f"│    Latency:      {duration:.0f}s                              │",
        f"│    Cost:         ${cost:.4f}                            │",
        f"│    Efficiency:   {efficiency:.2f} quality/$                  │",
        f"│    Ideas:        {idea_dist.get('total_ideas', '?')} total                          │",
        "│                                                  │",
        f"│  Best: Elo {best_score}                                │",
        f"│    {best_idea[:46]:<46}│",
        "└──────────────────────────────────────────────────┘",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 消融对比表
# ---------------------------------------------------------------------------

def generate_ablation_table(results: List[Dict[str, Any]]) -> str:
    """生成消融实验对比表（Markdown 格式）。"""
    # 按条件分组汇总
    by_condition: Dict[str, List[Dict]] = defaultdict(list)
    for r in results:
        by_condition[r["condition"]].append(r)

    lines = [
        "# IdeaSpark Ablation Study Results",
        "",
        f"> Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "| Condition | Runs | Avg Quality | Novelty | Feasibility | Impact | Specificity | Evidence | Diversity | Grounding | Avg Cost | Avg Latency |",
        "|-----------|------|-------------|---------|-------------|--------|-------------|----------|-----------|-----------|----------|-------------|",
    ]

    for condition in sorted(by_condition.keys()):
        runs = by_condition[condition]
        n = len(runs)

        qualities = [r.get("metrics", {}).get("avg_quality", 0) for r in runs]
        diversities = [r.get("metrics", {}).get("diversity", 0) for r in runs]
        groundings = [r.get("metrics", {}).get("grounding_rate", 0) for r in runs]
        costs = [r.get("cost_usd", 0) for r in runs]
        latencies = [r.get("duration_seconds", 0) for r in runs]

        # 各维度均分
        dim_avgs = {}
        for dim in ("novelty", "feasibility", "impact", "specificity", "evidence"):
            scores = []
            for r in runs:
                for js in r.get("judge_scores", []):
                    dim_data = js.get(dim, {})
                    s = dim_data.get("score", 0) if isinstance(dim_data, dict) else 0
                    scores.append(s)
            dim_avgs[dim] = _safe_avg(scores)

        lines.append(
            f"| {condition:<18} | {n:>4} | {_safe_avg(qualities):>11.2f} | "
            f"{dim_avgs['novelty']:>7.2f} | {dim_avgs['feasibility']:>11.2f} | "
            f"{dim_avgs['impact']:>6.2f} | {dim_avgs['specificity']:>11.2f} | "
            f"{dim_avgs['evidence']:>8.2f} | {_safe_avg(diversities):>9.4f} | "
            f"{_safe_avg(groundings):>9.0%} | ${_safe_avg(costs):>7.4f} | "
            f"{_safe_avg(latencies):>10.0f}s |"
        )

    lines.extend([
        "",
        "## Key Insights",
        "",
        _generate_insights(by_condition),
    ])

    return "\n".join(lines)


def _generate_insights(by_condition: Dict[str, List[Dict]]) -> str:
    """从消融结果中自动生成关键洞察。"""
    insights = []

    condition_quality: Dict[str, float] = {}
    for cond, runs in by_condition.items():
        qualities = [r.get("metrics", {}).get("avg_quality", 0) for r in runs]
        condition_quality[cond] = _safe_avg(qualities)

    full_q = condition_quality.get("full", 0)
    if full_q == 0:
        return "（数据不足，无法生成洞察）"

    for cond, q in sorted(condition_quality.items()):
        if cond == "full":
            continue
        diff = full_q - q
        pct = (diff / full_q * 100) if full_q > 0 else 0
        direction = "↓" if diff > 0 else "↑"
        insights.append(
            f"- **{cond}** vs Full: quality {direction} {abs(pct):.1f}% "
            f"({q:.2f} vs {full_q:.2f})"
        )

    return "\n".join(insights) if insights else "（只有 Full 条件的数据）"


# ---------------------------------------------------------------------------
# 汇总报告
# ---------------------------------------------------------------------------

def generate_summary_report(results: List[Dict[str, Any]]) -> str:
    """生成完整的 Markdown 汇总报告。"""
    lines = [
        "# IdeaSpark Benchmark Summary Report",
        "",
        f"> Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"> Total runs: {len(results)}",
        "",
    ]

    # 总体统计
    all_quality = [r.get("metrics", {}).get("avg_quality", 0) for r in results if r.get("metrics")]
    all_cost = [r.get("cost_usd", 0) for r in results]
    all_duration = [r.get("duration_seconds", 0) for r in results]

    lines.extend([
        "## Overall Statistics",
        "",
        f"- **Average Quality**: {_safe_avg(all_quality):.2f} / 10",
        f"- **Total Cost**: ${sum(all_cost):.4f}",
        f"- **Average Cost per Run**: ${_safe_avg(all_cost):.4f}",
        f"- **Average Duration**: {_safe_avg(all_duration):.0f}s",
        "",
    ])

    # 按主题汇总
    lines.extend(["## By Topic", ""])
    by_topic: Dict[str, List[Dict]] = defaultdict(list)
    for r in results:
        by_topic[r["topic_id"]].append(r)

    lines.extend([
        "| Topic | Runs | Avg Quality | Avg Cost | Best Quality |",
        "|-------|------|-------------|----------|--------------|",
    ])
    for topic_id in sorted(by_topic.keys()):
        runs = by_topic[topic_id]
        qualities = [r.get("metrics", {}).get("avg_quality", 0) for r in runs]
        costs = [r.get("cost_usd", 0) for r in runs]
        lines.append(
            f"| {topic_id:<12} | {len(runs):>4} | {_safe_avg(qualities):>11.2f} | "
            f"${_safe_avg(costs):>7.4f} | {max(qualities) if qualities else 0:>12.2f} |"
        )

    lines.extend(["", "---", ""])

    # 消融对比
    lines.append(generate_ablation_table(results))

    # 每次运行的 Scorecard
    lines.extend(["", "---", "", "## Individual Scorecards", ""])
    for r in results:
        lines.extend(["```", generate_scorecard(r), "```", ""])

    return "\n".join(lines)


def save_report(results: List[Dict[str, Any]], output_dir: str = "benchmark_results") -> Path:
    """生成并保存完整报告。"""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Markdown 报告
    report = generate_summary_report(results)
    report_path = out / "benchmark_report.md"
    report_path.write_text(report, encoding="utf-8")

    # JSON 汇总
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_runs": len(results),
        "total_cost_usd": round(sum(r.get("cost_usd", 0) for r in results), 4),
        "results": results,
    }
    summary_path = out / "summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    logger.info("报告已保存: %s, %s", report_path, summary_path)
    return report_path


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _safe_avg(lst: List[float]) -> float:
    return sum(lst) / len(lst) if lst else 0.0
