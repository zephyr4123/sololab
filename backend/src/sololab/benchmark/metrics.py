"""自动化指标计算 - 不依赖 LLM-as-Judge 的定量指标。"""

from __future__ import annotations

import logging
import math
from itertools import combinations
from typing import Any, Callable, Coroutine, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# 类型别名
EmbedFn = Callable[[List[str]], Coroutine[Any, Any, List[List[float]]]]


# ---------------------------------------------------------------------------
# 1. Semantic Diversity Score（语义多样性）
# ---------------------------------------------------------------------------

async def semantic_diversity(
    ideas: List[str],
    embed_fn: EmbedFn,
) -> float:
    """计算创意集合的语义多样性（平均 pairwise 余弦距离）。

    返回值范围 [0, 2]，越大越多样：
    - 0: 所有创意完全相同
    - 1: 正交
    - 2: 完全相反（实践中不会出现）
    """
    if len(ideas) < 2:
        return 0.0

    embeddings = await embed_fn(ideas)
    vecs = np.array(embeddings)

    # L2 归一化
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    vecs = vecs / norms

    # 余弦相似度矩阵
    sim_matrix = vecs @ vecs.T

    # 提取上三角（排除对角线）
    n = len(ideas)
    distances = []
    for i in range(n):
        for j in range(i + 1, n):
            distances.append(1.0 - sim_matrix[i, j])

    return float(np.mean(distances))


# ---------------------------------------------------------------------------
# 2. Grounding Rate（信息接地率）
# ---------------------------------------------------------------------------

def grounding_rate(events: List[Dict[str, Any]]) -> float:
    """有工具调用证据支撑的创意占比。

    分析 SSE 事件流，计算使用了工具搜索的 agent 产出的创意比例。
    """
    # 收集调用了工具的 agent 名称
    tool_agents: set = set()
    for e in events:
        if e.get("type") == "tool" and e.get("success", False):
            tool_agents.add(e.get("agent", ""))

    # 收集产出创意的 agent 名称
    idea_agents: List[str] = []
    for e in events:
        if e.get("type") == "idea":
            idea_agents.append(e.get("author", ""))

    if not idea_agents:
        return 0.0

    grounded = sum(1 for a in idea_agents if a in tool_agents)
    return grounded / len(idea_agents)


# ---------------------------------------------------------------------------
# 3. Tool Call Stats（工具调用统计）
# ---------------------------------------------------------------------------

def tool_call_stats(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """统计工具调用情况。"""
    tool_events = [e for e in events if e.get("type") == "tool"]
    total = len(tool_events)
    successful = sum(1 for e in tool_events if e.get("success", False))

    by_tool: Dict[str, int] = {}
    by_agent: Dict[str, int] = {}
    for e in tool_events:
        tool_name = e.get("tool", "unknown")
        agent_name = e.get("agent", "unknown")
        by_tool[tool_name] = by_tool.get(tool_name, 0) + 1
        by_agent[agent_name] = by_agent.get(agent_name, 0) + 1

    return {
        "total_calls": total,
        "successful_calls": successful,
        "success_rate": successful / total if total > 0 else 0.0,
        "by_tool": by_tool,
        "by_agent": by_agent,
    }


# ---------------------------------------------------------------------------
# 4. Rank Stability（排名稳定性 - Kendall's τ）
# ---------------------------------------------------------------------------

def rank_stability(runs: List[List[str]]) -> float:
    """同一主题多次运行的 Top-K 排名一致性。

    Args:
        runs: 每次运行的 Top-K 创意 ID 列表（按排名顺序）

    Returns:
        平均 Kendall's τ [-1, 1]，1 表示完全一致

    注意：由于每次运行的创意 ID 不同，这里用 overlap-based 方法代替。
    """
    if len(runs) < 2:
        return 1.0

    overlaps = []
    for run_a, run_b in combinations(runs, 2):
        set_a = set(run_a)
        set_b = set(run_b)
        if not set_a or not set_b:
            overlaps.append(0.0)
            continue
        overlap = len(set_a & set_b) / max(len(set_a), len(set_b))
        overlaps.append(overlap)

    return float(np.mean(overlaps))


def rank_stability_by_author(runs: List[List[str]]) -> float:
    """基于创意作者（agent 类型）的排名稳定性。

    当创意 ID 每次不同时，使用 author 序列计算 Kendall's τ。

    Args:
        runs: 每次运行的 Top-K 创意 author 列表（按排名顺序）
    """
    if len(runs) < 2:
        return 1.0

    taus = []
    for run_a, run_b in combinations(runs, 2):
        if len(run_a) != len(run_b):
            min_len = min(len(run_a), len(run_b))
            run_a = run_a[:min_len]
            run_b = run_b[:min_len]
        if len(run_a) < 2:
            continue
        tau = _kendall_tau(run_a, run_b)
        taus.append(tau)

    return float(np.mean(taus)) if taus else 0.0


def _kendall_tau(seq_a: List[str], seq_b: List[str]) -> float:
    """计算两个序列的 Kendall's τ（基于序数位置）。"""
    n = len(seq_a)
    if n < 2:
        return 0.0

    # 将序列转换为排名
    rank_a = {v: i for i, v in enumerate(seq_a)}
    rank_b = {v: i for i, v in enumerate(seq_b)}

    # 只比较两个序列共有的元素
    common = set(seq_a) & set(seq_b)
    if len(common) < 2:
        return 0.0

    common_list = sorted(common)
    concordant = 0
    discordant = 0
    for i, j in combinations(range(len(common_list)), 2):
        a_i = rank_a[common_list[i]]
        a_j = rank_a[common_list[j]]
        b_i = rank_b[common_list[i]]
        b_j = rank_b[common_list[j]]
        if (a_i - a_j) * (b_i - b_j) > 0:
            concordant += 1
        elif (a_i - a_j) * (b_i - b_j) < 0:
            discordant += 1

    total = concordant + discordant
    if total == 0:
        return 0.0
    return (concordant - discordant) / total


# ---------------------------------------------------------------------------
# 5. Convergence Speed（收敛速度）
# ---------------------------------------------------------------------------

def convergence_round(events: List[Dict[str, Any]]) -> int:
    """从事件流中提取收敛轮次。

    返回收敛时的轮次号。如果未收敛，返回最大轮次。
    """
    max_round = 1
    for e in events:
        if e.get("type") == "status":
            r = e.get("round", 1)
            if r > max_round:
                max_round = r
            if e.get("phase") == "converged":
                return r
    return max_round


# ---------------------------------------------------------------------------
# 6. Cost Efficiency（成本效率）
# ---------------------------------------------------------------------------

def cost_efficiency(quality_score: float, cost_usd: float) -> float:
    """每美元获得的质量分。"""
    if cost_usd <= 0:
        return 0.0
    return quality_score / cost_usd


# ---------------------------------------------------------------------------
# 7. Idea Count & Agent Contribution（创意数量与贡献分布）
# ---------------------------------------------------------------------------

def idea_distribution(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """统计各 agent 的创意产出分布。"""
    by_author: Dict[str, int] = {}
    total = 0
    for e in events:
        if e.get("type") == "idea":
            author = e.get("author", "unknown")
            by_author[author] = by_author.get(author, 0) + 1
            total += 1

    return {
        "total_ideas": total,
        "by_author": by_author,
        "entropy": _entropy(list(by_author.values())) if by_author else 0.0,
    }


def _entropy(counts: List[int]) -> float:
    """计算分布的信息熵（衡量贡献均匀度）。"""
    total = sum(counts)
    if total == 0:
        return 0.0
    probs = [c / total for c in counts]
    return -sum(p * math.log2(p) for p in probs if p > 0)


# ---------------------------------------------------------------------------
# 8. Latency Metrics（延迟指标）
# ---------------------------------------------------------------------------

def phase_latencies(events: List[Dict[str, Any]]) -> Dict[str, float]:
    """从事件流中提取各阶段耗时（秒）。

    注意：需要事件中包含 timestamp 字段（ISO 格式或 epoch）。
    如果事件无时间戳，返回空字典。
    """
    from datetime import datetime

    phase_times: Dict[str, List[float]] = {}
    last_time: Optional[float] = None
    last_phase: Optional[str] = None

    for e in events:
        if e.get("type") != "status":
            continue

        ts = e.get("timestamp")
        if ts is None:
            continue

        if isinstance(ts, str):
            try:
                t = datetime.fromisoformat(ts).timestamp()
            except ValueError:
                continue
        elif isinstance(ts, (int, float)):
            t = float(ts)
        else:
            continue

        phase = e.get("phase", "")

        if last_time is not None and last_phase is not None:
            duration = t - last_time
            phase_times.setdefault(last_phase, []).append(duration)

        last_time = t
        last_phase = phase

    return {phase: sum(durations) for phase, durations in phase_times.items()}


# ---------------------------------------------------------------------------
# 综合指标计算
# ---------------------------------------------------------------------------

async def compute_all_metrics(
    top_ideas: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    embed_fn: EmbedFn,
    quality_score: float = 0.0,
    cost_usd: float = 0.0,
) -> Dict[str, Any]:
    """计算所有自动化指标。

    Args:
        top_ideas: [{"id": "...", "content": "...", "author": "...", "elo_score": N}, ...]
        events: 完整的 SSE 事件列表
        embed_fn: 嵌入函数
        quality_score: LLM-as-Judge 的平均质量分
        cost_usd: 总费用
    """
    idea_texts = [idea["content"] for idea in top_ideas]

    diversity = await semantic_diversity(idea_texts, embed_fn) if idea_texts else 0.0

    return {
        "diversity": round(diversity, 4),
        "grounding_rate": round(grounding_rate(events), 4),
        "tool_stats": tool_call_stats(events),
        "convergence_round": convergence_round(events),
        "cost_efficiency": round(cost_efficiency(quality_score, cost_usd), 4),
        "cost_usd": round(cost_usd, 4),
        "idea_distribution": idea_distribution(events),
        "phase_latencies": phase_latencies(events),
    }
