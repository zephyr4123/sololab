"""消融实验配置 - 定义不同的对照条件来验证各组件的贡献。"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentConfig, AgentState, Message, MessageType
from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.modules.ideaspark.orchestrator import Orchestrator


class AblationCondition(str, Enum):
    """消融实验条件。"""

    FULL = "full"                     # 完整系统
    BASELINE_SINGLE = "baseline_single"  # 单 LLM 直接生成
    BASELINE_COT = "baseline_cot"        # 单 LLM + Chain-of-Thought
    NO_TOOLS = "no_tools"                # 多智能体但禁用工具
    NO_CRITIC = "no_critic"              # 移除 Critic 智能体
    NO_TOURNAMENT = "no_tournament"      # 移除锦标赛评估
    SINGLE_ROUND = "single_round"        # 只跑 1 轮


ABLATION_DESCRIPTIONS: Dict[str, str] = {
    AblationCondition.FULL: "完整系统（默认配置）",
    AblationCondition.BASELINE_SINGLE: "单 LLM 直接生成 5 个创意（无智能体框架）",
    AblationCondition.BASELINE_COT: "单 LLM + Chain-of-Thought 分步推理",
    AblationCondition.NO_TOOLS: "多智能体协作但禁用所有外部工具",
    AblationCondition.NO_CRITIC: "移除 Critic（审辩者）智能体",
    AblationCondition.NO_TOURNAMENT: "移除 Elo 锦标赛评估，随机排序",
    AblationCondition.SINGLE_ROUND: "只运行 1 轮（不迭代）",
}


# ---------------------------------------------------------------------------
# 消融 Runner 工厂
# ---------------------------------------------------------------------------

async def run_ablation(
    condition: AblationCondition,
    llm_gateway: LLMGateway,
    tool_registry: Optional[ToolRegistry],
    user_input: str,
    top_k: int = 5,
    max_rounds: int = 3,
) -> AsyncGenerator[Any, None]:
    """根据消融条件运行 IdeaSpark 并产出事件流。"""

    if condition == AblationCondition.FULL:
        async for event in _run_full(llm_gateway, tool_registry, user_input, top_k, max_rounds):
            yield event

    elif condition == AblationCondition.BASELINE_SINGLE:
        async for event in _run_baseline_single(llm_gateway, user_input, top_k):
            yield event

    elif condition == AblationCondition.BASELINE_COT:
        async for event in _run_baseline_cot(llm_gateway, user_input, top_k):
            yield event

    elif condition == AblationCondition.NO_TOOLS:
        async for event in _run_no_tools(llm_gateway, user_input, top_k, max_rounds):
            yield event

    elif condition == AblationCondition.NO_CRITIC:
        async for event in _run_no_critic(llm_gateway, tool_registry, user_input, top_k, max_rounds):
            yield event

    elif condition == AblationCondition.NO_TOURNAMENT:
        async for event in _run_no_tournament(llm_gateway, tool_registry, user_input, top_k, max_rounds):
            yield event

    elif condition == AblationCondition.SINGLE_ROUND:
        async for event in _run_full(llm_gateway, tool_registry, user_input, top_k, max_rounds=1):
            yield event


# ---------------------------------------------------------------------------
# 各条件具体实现
# ---------------------------------------------------------------------------

async def _run_full(
    llm: LLMGateway,
    tools: Optional[ToolRegistry],
    user_input: str,
    top_k: int,
    max_rounds: int,
) -> AsyncGenerator[Any, None]:
    """完整系统。"""
    orch = Orchestrator(llm, tools)
    async for event in orch.run(user_input, max_rounds=max_rounds, top_k=top_k):
        yield event


async def _run_baseline_single(
    llm: LLMGateway,
    user_input: str,
    top_k: int,
) -> AsyncGenerator[Any, None]:
    """单 LLM 直接生成 N 个创意，无智能体框架。"""
    import uuid

    yield {"type": "status", "phase": "separate", "round": 1}
    yield {"type": "agent", "agent": "single_llm", "action": "thinking"}

    prompt = (
        f"你是一位资深研究者。针对以下研究主题，直接提出 {top_k} 个创新且可行的研究方向。\n\n"
        f"研究主题：{user_input}\n\n"
        f"要求：\n"
        f"1. 每个创意 300-500 字\n"
        f"2. 包含：核心思路 → 为什么可行 → 具体怎么做 → 预期成果\n"
        f"3. 尽量多样化，覆盖不同角度\n\n"
        f"请用 '---' 分隔每个创意。"
    )

    result = await llm.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=8192,
    )

    content = result["content"]
    cost = result["usage"]["cost_usd"]
    ideas_text = [s.strip() for s in content.split("---") if s.strip()]

    yield {"type": "agent", "agent": "single_llm", "action": "done", "message_count": len(ideas_text)}

    top_ideas = []
    for i, text in enumerate(ideas_text[:top_k]):
        idea_id = str(uuid.uuid4())
        yield {"type": "idea", "id": idea_id, "content": text, "author": "single_llm"}
        top_ideas.append({
            "id": idea_id,
            "content": text,
            "author": "single_llm",
            "elo_score": 1500,
        })

    yield {
        "type": "done",
        "top_ideas": top_ideas,
        "cost_usd": round(cost, 4),
    }


async def _run_baseline_cot(
    llm: LLMGateway,
    user_input: str,
    top_k: int,
) -> AsyncGenerator[Any, None]:
    """单 LLM + Chain-of-Thought。"""
    import uuid

    yield {"type": "status", "phase": "separate", "round": 1}
    yield {"type": "agent", "agent": "cot_llm", "action": "thinking"}

    prompt = (
        f"你是一位资深研究者。针对以下研究主题，请通过分步推理提出 {top_k} 个创新研究方向。\n\n"
        f"研究主题：{user_input}\n\n"
        f"请按以下步骤思考：\n"
        f"Step 1: 分析该领域的核心挑战和痛点\n"
        f"Step 2: 回顾可能相关的跨领域方法和最新进展\n"
        f"Step 3: 为每个挑战构思可能的解决方案\n"
        f"Step 4: 对每个方案进行可行性和影响力评估\n"
        f"Step 5: 输出最终的 {top_k} 个精选研究方向\n\n"
        f"每个最终创意 300-500 字，格式：核心思路 → 为什么可行 → 具体怎么做 → 预期成果\n"
        f"请用 '---' 分隔每个创意。"
    )

    result = await llm.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=8192,
    )

    content = result["content"]
    cost = result["usage"]["cost_usd"]
    ideas_text = [s.strip() for s in content.split("---") if s.strip()]

    yield {"type": "agent", "agent": "cot_llm", "action": "done", "message_count": len(ideas_text)}

    top_ideas = []
    for i, text in enumerate(ideas_text[:top_k]):
        idea_id = str(uuid.uuid4())
        yield {"type": "idea", "id": idea_id, "content": text, "author": "cot_llm"}
        top_ideas.append({
            "id": idea_id,
            "content": text,
            "author": "cot_llm",
            "elo_score": 1500,
        })

    yield {
        "type": "done",
        "top_ideas": top_ideas,
        "cost_usd": round(cost, 4),
    }


async def _run_no_tools(
    llm: LLMGateway,
    user_input: str,
    top_k: int,
    max_rounds: int,
) -> AsyncGenerator[Any, None]:
    """多智能体但禁用所有工具（tool_registry=None）。"""
    orch = Orchestrator(llm, tool_registry=None)
    async for event in orch.run(user_input, max_rounds=max_rounds, top_k=top_k):
        yield event


async def _run_no_critic(
    llm: LLMGateway,
    tools: Optional[ToolRegistry],
    user_input: str,
    top_k: int,
    max_rounds: int,
) -> AsyncGenerator[Any, None]:
    """移除 Critic 的编排器。"""
    orch = NoCriticOrchestrator(llm, tools)
    async for event in orch.run(user_input, max_rounds=max_rounds, top_k=top_k):
        yield event


async def _run_no_tournament(
    llm: LLMGateway,
    tools: Optional[ToolRegistry],
    user_input: str,
    top_k: int,
    max_rounds: int,
) -> AsyncGenerator[Any, None]:
    """移除锦标赛评估，随机选 Top-K。"""
    orch = NoTournamentOrchestrator(llm, tools)
    async for event in orch.run(user_input, max_rounds=max_rounds, top_k=top_k):
        yield event


# ---------------------------------------------------------------------------
# 变体编排器
# ---------------------------------------------------------------------------

class NoCriticOrchestrator(Orchestrator):
    """跳过 Critic 环节的编排器。"""

    async def _together_phase_grouped(
        self, group: List[Message], group_idx: int, iterations: int = 2
    ) -> AsyncGenerator[Any, None]:
        """只有 Connector 综合，没有 Critic 审辩。"""
        connector_config = get_persona("connector")

        for i in range(iterations):
            yield {"type": "agent", "agent": "connector", "action": f"synthesizing group {group_idx + 1}, round {i + 1}"}
            conn_runner = AgentRunner(connector_config, self.llm, self.tools)
            task_prompt = (
                f"基于第 {group_idx + 1} 组的创意，"
                f"通过结合优势来整合出改进后的创意。"
            )
            syntheses = await conn_runner.run(
                self.user_topic, context_messages=group, task_prompt=task_prompt, doc_context=self.doc_context
            )
            self.agent_states["connector"] = conn_runner.state

            for msg in syntheses:
                self.blackboard.append(msg)
                yield {"type": "agent", "agent": "connector", "action": "synthesis", "content": msg.content}
                yield msg
                group.append(msg)


class NoTournamentOrchestrator(Orchestrator):
    """跳过锦标赛评估，随机排序的编排器。"""

    async def _tournament_evaluate(self, ideas: List[Message], k: int = 5) -> List[Message]:
        """随机选择 Top-K（不做 Elo 评估）。"""
        import random

        for idea in ideas:
            self.elo_scores[idea.id] = 1500.0

        random.shuffle(ideas)
        return ideas[:k]
