"""Tournament 阶段：评审者通过成对 Elo 比较选 Top-K。

写出 ctx.top_ideas、更新 ctx.elo_scores（跨轮保留）。
yield 入场 status + 每个 idea 的 vote 事件。
"""

from __future__ import annotations

import asyncio
import random
from typing import AsyncGenerator, List, Tuple

from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent
from sololab.models.agent import Message


class TournamentPhase(Phase):
    name = "evaluate"

    def __init__(self, num_pairs: int = 10, k_factor: int = 32) -> None:
        self.num_pairs = num_pairs
        self.k_factor = k_factor

    async def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        ideas = ctx.synthesized
        yield {
            "type": "status",
            "phase": "evaluate",
            "round": ctx.round,
            "candidate_count": len(ideas),
        }

        # 候选数 ≤ top_k 直接返回
        if len(ideas) <= ctx.top_k:
            for idea in ideas:
                ctx.elo_scores.setdefault(idea.id, 1500.0)
            ctx.top_ideas = list(ideas)
        else:
            # 初始化未评分创意
            for idea in ideas:
                ctx.elo_scores.setdefault(idea.id, 1500.0)

            evaluator_config = get_persona("evaluator")
            num_matches = min(len(ideas), self.num_pairs)
            pairs: List[Tuple[Message, Message]] = []
            for _ in range(num_matches):
                a, b = random.sample(ideas, 2)
                pairs.append((a, b))

            async def _evaluate_pair(idea_a: Message, idea_b: Message):
                runner = AgentRunner(evaluator_config, ctx.llm, ctx.tools)
                task_prompt = (
                    "比较以下两个研究创意，投票选出更优秀的一个。\n\n"
                    f"创意 A（来自 {idea_a.sender}）：\n{idea_a.content}\n\n"
                    f"创意 B（来自 {idea_b.sender}）：\n{idea_b.content}\n\n"
                    "哪个更好？输出：\n[msg_type: vote]\nWinner: A 或 B\nReason: <评审理由>"
                )
                # Tournament 用非流式 run() —— 短输出，10 对并发，无需 token 流
                result = await runner.run(ctx.original_topic, task_prompt=task_prompt)
                ctx.agent_states["evaluator"] = runner.state
                winner = self._parse_vote(result[0].content if result else "")
                return idea_a, idea_b, winner

            # 用 as_completed 流式 yield 每对完成 —— 让前端边比较边更新 Elo
            tasks = [asyncio.create_task(_evaluate_pair(a, b)) for a, b in pairs]
            for fut in asyncio.as_completed(tasks):
                try:
                    idea_a, idea_b, winner = await fut
                except Exception:
                    continue
                self._update_elo(ctx.elo_scores, idea_a.id, idea_b.id, winner)
                yield {
                    "type": "evaluate_match",
                    "round": ctx.round,
                    "a_id": idea_a.id,
                    "a_author": idea_a.sender,
                    "a_preview": (idea_a.content or "")[:80].replace("\n", " ").strip(),
                    "a_elo": round(ctx.elo_scores.get(idea_a.id, 1500)),
                    "b_id": idea_b.id,
                    "b_author": idea_b.sender,
                    "b_preview": (idea_b.content or "")[:80].replace("\n", " ").strip(),
                    "b_elo": round(ctx.elo_scores.get(idea_b.id, 1500)),
                    "winner": winner,
                }

            sorted_ideas = sorted(
                ideas, key=lambda m: ctx.elo_scores.get(m.id, 1500), reverse=True
            )
            ctx.top_ideas = sorted_ideas[: ctx.top_k]

        # 输出排名 vote 事件
        for rank, idea in enumerate(ctx.top_ideas, 1):
            score = ctx.elo_scores.get(idea.id, 1500)
            yield {
                "type": "vote",
                "idea_id": idea.id,
                "content": idea.content,
                "author": idea.sender,
                "elo_score": round(score),
                "rank": rank,
                "round": ctx.round,
            }

    @staticmethod
    def _parse_vote(content: str) -> str:
        upper = content.upper()
        if "WINNER: A" in upper or "WINNER:A" in upper:
            return "A"
        if "WINNER: B" in upper or "WINNER:B" in upper:
            return "B"
        return random.choice(["A", "B"])

    def _update_elo(self, scores: dict, id_a: str, id_b: str, winner: str) -> None:
        ra = scores.get(id_a, 1500)
        rb = scores.get(id_b, 1500)
        ea = 1 / (1 + 10 ** ((rb - ra) / 400))
        eb = 1 - ea
        if winner == "A":
            sa, sb = 1.0, 0.0
        elif winner == "B":
            sa, sb = 0.0, 1.0
        else:
            sa, sb = 0.5, 0.5
        scores[id_a] = ra + self.k_factor * (sa - ea)
        scores[id_b] = rb + self.k_factor * (sb - eb)
