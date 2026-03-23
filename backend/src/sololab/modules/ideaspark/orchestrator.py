"""IdeaSpark 编排器 - 管理分离-汇聚协作流程。"""

import asyncio
import random
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

import numpy as np
from sklearn.cluster import KMeans

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentState, Message, MessageType
from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import PERSONAS, get_persona


class Orchestrator:
    """
    控制分离-汇聚协作流程：

    1. 分离阶段：多元智能体并行独立生成创意
    2. 语义聚类：将相似创意分组以便聚焦讨论
    3. 汇聚阶段：分组讨论，进行扩展/组合/优化
    4. 全局综合：连接者智能体跨组融合
    5. 锦标赛评估：基于 Elo 的成对比较
    6. Top-K 选择与收敛检查
    7. 未收敛则迭代
    """

    def __init__(self, llm_gateway: LLMGateway, tool_registry: Optional[ToolRegistry] = None) -> None:
        self.llm = llm_gateway
        self.tools = tool_registry
        self.blackboard: List[Message] = []
        self.agent_states: Dict[str, AgentState] = {}
        self.elo_scores: Dict[str, float] = {}
        self.user_topic: str = ""  # 用户原始主题，供所有 agent 锚定
        self._prev_top_ids: List[str] = []

    async def run(
        self, user_input: str, max_rounds: int = 3, top_k: int = 5
    ) -> AsyncGenerator[Any, None]:
        """执行完整的分离-汇聚流程。"""
        self.user_topic = user_input
        total_cost = 0.0

        for round_num in range(1, max_rounds + 1):
            yield {"type": "status", "phase": "separate", "round": round_num}

            # 阶段 1：分离 - 并行生成创意
            ideas = []
            async for event in self._separate_phase(user_input):
                if isinstance(event, dict) and event.get("type") in ("agent", "tool", "idea"):
                    yield event
                if isinstance(event, Message):
                    ideas.append(event)

            yield {"type": "status", "phase": "cluster", "round": round_num, "idea_count": len(ideas)}

            # 阶段 1.5：语义聚类
            num_groups = min(4, max(2, len(ideas) // 3))
            idea_groups = await self._cluster_ideas(ideas, num_groups=num_groups)
            yield {"type": "status", "phase": "together", "round": round_num, "group_count": len(idea_groups)}

            # 阶段 2：汇聚 - 分组讨论（各组并行）
            async def _run_group(group, group_idx):
                events = []
                async for event in self._together_phase_grouped(group, group_idx, iterations=2):
                    events.append(event)
                return events

            group_tasks = [_run_group(group, idx) for idx, group in enumerate(idea_groups)]
            group_results = await asyncio.gather(*group_tasks, return_exceptions=True)

            refined_ideas = []
            for result in group_results:
                if isinstance(result, Exception):
                    yield {"type": "agent", "agent": "unknown", "action": "error", "error": str(result)}
                    continue
                for event in result:
                    if isinstance(event, dict):
                        yield event
                    if isinstance(event, Message):
                        refined_ideas.append(event)
            # 保留未讨论的原始 idea
            refined_ids = {m.id for m in refined_ideas}
            for idea in ideas:
                if idea.id not in refined_ids:
                    refined_ideas.append(idea)

            yield {"type": "status", "phase": "synthesize", "round": round_num}

            # 阶段 2.5：全局综合
            synthesized = await self._global_synthesis(refined_ideas)
            yield {"type": "status", "phase": "evaluate", "round": round_num, "candidate_count": len(synthesized)}

            # 阶段 3：锦标赛评估
            top_ideas = await self._tournament_evaluate(synthesized, k=top_k)

            for rank, idea in enumerate(top_ideas, 1):
                score = self.elo_scores.get(idea.id, 1500)
                yield {
                    "type": "vote",
                    "idea_id": idea.id,
                    "content": idea.content,
                    "author": idea.sender,
                    "elo_score": round(score),
                    "rank": rank,
                    "round": round_num,
                }

            # 统计费用
            for st in self.agent_states.values():
                total_cost += st.cost_usd

            # 收敛检查
            if self._convergence_check(top_ideas):
                yield {"type": "status", "phase": "converged", "round": round_num}
                break

            # 准备下一轮
            user_input = self._refine_prompt(user_input, top_ideas)

        # 最终输出
        final_ideas = []
        for idea in top_ideas:
            final_ideas.append({
                "id": idea.id,
                "content": idea.content,
                "author": idea.sender,
                "elo_score": round(self.elo_scores.get(idea.id, 1500)),
            })
        yield {"type": "done", "top_ideas": final_ideas, "cost_usd": round(total_cost, 4)}

    async def _separate_phase(self, topic: str) -> AsyncGenerator[Any, None]:
        """发散者和专家智能体并行独立生成创意。"""
        # 选择分离阶段的角色：divergent + expert
        sep_personas = [get_persona("divergent"), get_persona("expert")]

        runners = []
        for config in sep_personas:
            runner = AgentRunner(config, self.llm, self.tools)
            runners.append((config.name, runner))

        # 通知每个 agent 开始
        for name, _ in runners:
            yield {"type": "agent", "agent": name, "action": "thinking"}

        # 并行执行
        async def _run_agent(name, runner):
            return name, await runner.run(topic)

        tasks = [_run_agent(name, runner) for name, runner in runners]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                yield {"type": "agent", "agent": "unknown", "action": "error", "error": str(result)}
                continue
            name, messages = result
            # 更新状态
            runner = next(r for n, r in runners if n == name)
            self.agent_states[name] = runner.state

            # 发送工具调用事件（让前端看到搜索过程）
            for tool_event in runner.tool_events:
                yield tool_event

            yield {"type": "agent", "agent": name, "action": "done", "message_count": len(messages)}

            for msg in messages:
                self.blackboard.append(msg)
                yield {"type": "idea", "id": msg.id, "content": msg.content, "author": name}
                yield msg  # 传递 Message 对象

    async def _cluster_ideas(self, ideas: List[Message], num_groups: int = 4) -> List[List[Message]]:
        """使用 K-Means + 嵌入按语义相似度聚类创意。"""
        if len(ideas) <= num_groups:
            return [[idea] for idea in ideas]

        # 获取嵌入向量
        texts = [m.content for m in ideas]
        try:
            vectors = await self.llm.embed(texts)
            arr = np.array(vectors)

            kmeans = KMeans(n_clusters=num_groups, random_state=42, n_init=10)
            labels = kmeans.fit_predict(arr)

            groups: Dict[int, List[Message]] = {}
            for i, label in enumerate(labels):
                groups.setdefault(int(label), []).append(ideas[i])
            return list(groups.values())
        except Exception:
            # 降级：均匀分组
            chunk_size = max(1, len(ideas) // num_groups)
            return [ideas[i:i + chunk_size] for i in range(0, len(ideas), chunk_size)]

    async def _together_phase_grouped(
        self, group: List[Message], group_idx: int, iterations: int = 2
    ) -> AsyncGenerator[Any, None]:
        """分组讨论：连接者和批评者在组内辩论。"""
        connector_config = get_persona("connector")
        critic_config = get_persona("critic")

        for i in range(iterations):
            # Critic 提出批评
            yield {"type": "agent", "agent": "critic", "action": f"reviewing group {group_idx + 1}, round {i + 1}"}
            critic_runner = AgentRunner(critic_config, self.llm, self.tools)
            task_prompt = (
                f"审辩第 {group_idx + 1} 组的以下创意。"
                f"找出弱点并提出改进建议。\n\n"
                + "\n".join(f"- {m.content}" for m in group)
            )
            critiques = await critic_runner.run(self.user_topic, context_messages=group, task_prompt=task_prompt)
            self.agent_states["critic"] = critic_runner.state
            for tool_event in critic_runner.tool_events:
                yield tool_event

            for msg in critiques:
                self.blackboard.append(msg)
                yield {"type": "agent", "agent": "critic", "action": "critique", "content": msg.content}
                yield msg

            # Connector 综合
            yield {"type": "agent", "agent": "connector", "action": f"synthesizing group {group_idx + 1}, round {i + 1}"}
            conn_runner = AgentRunner(connector_config, self.llm, self.tools)
            task_prompt = (
                f"基于第 {group_idx + 1} 组的创意和审辩意见，"
                f"通过结合优势和解决弱点来整合出改进后的创意。"
            )
            all_context = group + critiques
            syntheses = await conn_runner.run(self.user_topic, context_messages=all_context, task_prompt=task_prompt)
            self.agent_states["connector"] = conn_runner.state

            for msg in syntheses:
                self.blackboard.append(msg)
                yield {"type": "agent", "agent": "connector", "action": "synthesis", "content": msg.content}
                yield msg
                group.append(msg)

    async def _global_synthesis(self, ideas: List[Message]) -> List[Message]:
        """连接者智能体进行跨组综合。"""
        if len(ideas) <= 3:
            return ideas

        connector_config = get_persona("connector")
        runner = AgentRunner(connector_config, self.llm, self.tools)
        task_prompt = (
            "你正在进行跨组全局整合。"
            "审阅之前讨论中的所有创意，识别最具独特性的优质创意。"
            "合并相似创意，去除重复，输出一个精简的最具前景研究方向列表。"
        )
        # 通过 context_messages 传递所有创意，走统一的 _build_messages 分类逻辑
        result = await runner.run(self.user_topic, context_messages=ideas, task_prompt=task_prompt)
        self.agent_states["connector"] = runner.state

        # 保留所有原始 idea + 综合结果
        return ideas + result

    async def _tournament_evaluate(self, ideas: List[Message], k: int = 5) -> List[Message]:
        """锦标赛选择：基于 Elo 的成对评估。"""
        if len(ideas) <= k:
            for idea in ideas:
                self.elo_scores[idea.id] = 1500
            return ideas

        # 初始化 Elo
        for idea in ideas:
            if idea.id not in self.elo_scores:
                self.elo_scores[idea.id] = 1500.0

        evaluator_config = get_persona("evaluator")
        num_matches = min(len(ideas), 10)
        pairs = []
        for _ in range(num_matches):
            a, b = random.sample(ideas, 2)
            pairs.append((a, b))

        async def _evaluate_pair(idea_a, idea_b):
            runner = AgentRunner(evaluator_config, self.llm, self.tools)
            task_prompt = (
                "比较以下两个研究创意，投票选出更优秀的一个。\n\n"
                f"创意 A（来自 {idea_a.sender}）：\n{idea_a.content}\n\n"
                f"创意 B（来自 {idea_b.sender}）：\n{idea_b.content}\n\n"
                "哪个更好？输出：\n[msg_type: vote]\nWinner: A 或 B\nReason: <评审理由>"
            )
            result = await runner.run(self.user_topic, task_prompt=task_prompt)
            self.agent_states["evaluator"] = runner.state
            winner = self._parse_vote(result[0].content if result else "")
            return idea_a.id, idea_b.id, winner

        # 并行执行所有评估
        eval_tasks = [_evaluate_pair(a, b) for a, b in pairs]
        eval_results = await asyncio.gather(*eval_tasks, return_exceptions=True)

        for result in eval_results:
            if isinstance(result, Exception):
                continue
            id_a, id_b, winner = result
            self._update_elo(id_a, id_b, winner)

        # 按 Elo 排序
        sorted_ideas = sorted(ideas, key=lambda m: self.elo_scores.get(m.id, 1500), reverse=True)
        return sorted_ideas[:k]

    def _parse_vote(self, content: str) -> str:
        """从评估者输出解析投票结果（A 或 B）。"""
        content_upper = content.upper()
        if "WINNER: A" in content_upper or "WINNER:A" in content_upper:
            return "A"
        if "WINNER: B" in content_upper or "WINNER:B" in content_upper:
            return "B"
        # 降级：随机
        return random.choice(["A", "B"])

    def _update_elo(self, id_a: str, id_b: str, winner: str, k: int = 32) -> None:
        """更新 Elo 评分。"""
        ra = self.elo_scores.get(id_a, 1500)
        rb = self.elo_scores.get(id_b, 1500)
        ea = 1 / (1 + 10 ** ((rb - ra) / 400))
        eb = 1 - ea

        if winner == "A":
            sa, sb = 1.0, 0.0
        elif winner == "B":
            sa, sb = 0.0, 1.0
        else:
            sa, sb = 0.5, 0.5

        self.elo_scores[id_a] = ra + k * (sa - ea)
        self.elo_scores[id_b] = rb + k * (sb - eb)

    def _convergence_check(self, top_ideas: List[Message]) -> bool:
        """检查 Elo 分数是否已稳定（Top-K ID 变化 < 20%）。"""
        current_ids = [m.id for m in top_ideas]
        if not self._prev_top_ids:
            self._prev_top_ids = current_ids
            return False

        overlap = len(set(current_ids) & set(self._prev_top_ids))
        stability = overlap / max(len(current_ids), 1)
        self._prev_top_ids = current_ids
        return stability >= 0.8  # 80% 相同则收敛

    def _refine_prompt(self, original_topic: str, top_ideas: List[Message]) -> str:
        """从 Top-K 创意生成优化提示词，用于下一轮。"""
        idea_summaries = "\n".join(
            f"- {m.content[:150]}" for m in top_ideas[:3]
        )
        return (
            f"原始主题：{original_topic}\n\n"
            f"目前最佳创意：\n{idea_summaries}\n\n"
            f"请深化、延展和改进这些创意，探索新的角度和组合。"
        )
