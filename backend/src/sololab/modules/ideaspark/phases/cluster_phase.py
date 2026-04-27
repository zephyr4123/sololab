"""Cluster 阶段：用 KMeans + LLM embedding 把创意按语义相似度分组。

写出 ctx.idea_groups。除入场 status 外无业务事件。
"""

from __future__ import annotations

from typing import AsyncGenerator, Dict, List

import numpy as np
from sklearn.cluster import KMeans

from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent
from sololab.models.agent import Message


class ClusterPhase(Phase):
    name = "cluster"

    async def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        ideas = ctx.ideas

        yield {
            "type": "status",
            "phase": "cluster",
            "round": ctx.round,
            "idea_count": len(ideas),
        }

        # ≤3 个创意时不做语义切分 —— 把它们合到 1 组，
        # 让下游 together_phase 的 critic+connector 真正能围绕全部创意协同辩论。
        # 否则只有 2 个 idea 时会被拆成 2 组 × 1 idea，"分组"完全没意义。
        if len(ideas) <= 3:
            ctx.idea_groups = [list(ideas)] if ideas else []
        else:
            num_groups = min(4, max(2, len(ideas) // 3))
            try:
                texts = [m.content for m in ideas]
                vectors = await ctx.llm.embed(texts)
                arr = np.array(vectors)
                kmeans = KMeans(n_clusters=num_groups, random_state=42, n_init=10)
                labels = kmeans.fit_predict(arr)
                groups: Dict[int, List[Message]] = {}
                for i, label in enumerate(labels):
                    groups.setdefault(int(label), []).append(ideas[i])
                ctx.idea_groups = list(groups.values())
            except Exception:
                # 嵌入失败 → 均匀分组兜底
                chunk_size = max(1, len(ideas) // num_groups)
                ctx.idea_groups = [ideas[i : i + chunk_size] for i in range(0, len(ideas), chunk_size)]

        # ── 输出可视化分组数据，让前端能展示"分了几组、每组里有什么" ──
        yield {
            "type": "cluster_groups",
            "round": ctx.round,
            "groups": [
                [
                    {
                        "id": m.id,
                        "author": m.sender,
                        "preview": (m.content or "")[:120].replace("\n", " ").strip(),
                    }
                    for m in g
                ]
                for g in ctx.idea_groups
            ],
        }
