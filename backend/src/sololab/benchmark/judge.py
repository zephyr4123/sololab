"""LLM-as-Judge 评分模块 - 使用独立 LLM 对创意进行多维度评分。"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 评分结果数据结构
# ---------------------------------------------------------------------------

@dataclass
class DimensionScore:
    score: float
    reason: str


@dataclass
class JudgeResult:
    """单个创意的评审结果。"""

    idea_id: str
    novelty: DimensionScore = field(default_factory=lambda: DimensionScore(0, ""))
    feasibility: DimensionScore = field(default_factory=lambda: DimensionScore(0, ""))
    impact: DimensionScore = field(default_factory=lambda: DimensionScore(0, ""))
    specificity: DimensionScore = field(default_factory=lambda: DimensionScore(0, ""))
    evidence: DimensionScore = field(default_factory=lambda: DimensionScore(0, ""))
    overall: float = 0.0
    one_line_summary: str = ""
    raw_response: str = ""

    @property
    def weighted_overall(self) -> float:
        """加权总分: 0.25*novelty + 0.25*feasibility + 0.2*impact + 0.15*specificity + 0.15*evidence"""
        return (
            0.25 * self.novelty.score
            + 0.25 * self.feasibility.score
            + 0.20 * self.impact.score
            + 0.15 * self.specificity.score
            + 0.15 * self.evidence.score
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "idea_id": self.idea_id,
            "novelty": {"score": self.novelty.score, "reason": self.novelty.reason},
            "feasibility": {"score": self.feasibility.score, "reason": self.feasibility.reason},
            "impact": {"score": self.impact.score, "reason": self.impact.reason},
            "specificity": {"score": self.specificity.score, "reason": self.specificity.reason},
            "evidence": {"score": self.evidence.score, "reason": self.evidence.reason},
            "overall": self.weighted_overall,
            "one_line_summary": self.one_line_summary,
        }


# ---------------------------------------------------------------------------
# 评审 Prompt
# ---------------------------------------------------------------------------

JUDGE_SYSTEM_PROMPT = """你是一位资深学术评审专家，拥有跨学科背景。你的任务是独立、客观地评估研究创意的质量。

重要时间信息：当前日期是 {current_date}。被评估的创意是由 AI 系统通过实时搜索工具（arXiv、Semantic Scholar、Web Search）生成的，其中引用的 2024-2026 年论文是通过搜索 API 实时获取的真实预印本，不是虚构的。请不要因为论文发表时间较新就认为是"幻觉"或"虚构"。

评分原则：
- 严格按照评分标准打分，不要出现"所有创意都得 7 分"的情况
- 好的创意应该得高分（8-10），平庸的创意得中等分（4-6），差的创意得低分（1-3）
- 每个维度的评分必须独立，不要让某个维度的高分影响其他维度
- 理由必须具体，引用创意中的具体内容"""

JUDGE_USER_PROMPT_TEMPLATE = """\
请对以下研究创意进行独立评分。

<research_topic>{topic}</research_topic>

<idea_to_evaluate>
{idea_content}
</idea_to_evaluate>

<scoring_rubric>
请从以下 5 个维度分别打分（1-10 分），并给出简短理由：

1. **新颖性 (Novelty)**: 与现有研究相比，提出了多少新的视角或方法？
   - 1-3: 重复已知方法，无新意
   - 4-6: 有一定新意，但核心思路已有先例
   - 7-10: 提出了罕见的跨领域迁移或全新组合

2. **可行性 (Feasibility)**: 独立研究者或小团队能否在 1-2 年内启动并取得初步成果？
   - 1-3: 需要尚不存在的技术、大型集群或企业级资源才能启动
   - 4-6: 技术路线可行但有显著障碍，或仅给出宏大愿景而无最小可行方案
   - 7-8: 技术路线清晰，列出了可用的开源工具和数据集，但部分环节仍需攻关
   - 9-10: 给出了明确的最小可行原型（MVP），用现有开源工具+公开数据即可在 3 个月内验证核心假设

3. **影响力 (Impact)**: 如果成功，对领域的推动程度？
   - 1-3: 边际改进，受众极小
   - 4-6: 对特定子领域有意义
   - 7-10: 可能改变研究范式或产生广泛应用

4. **具体性 (Specificity)**: 方案是否足够具体，能指导下一步行动？
   - 1-3: 纯概念性描述，无法执行
   - 4-6: 有大致方向但缺关键细节
   - 7-10: 包含具体技术路线、数据来源、评价标准

5. **证据支撑 (Evidence)**: 是否引用了真实的论文/数据/案例？
   - 1-3: 无任何外部证据
   - 4-6: 提到相关工作但不够具体
   - 7-10: 引用具体论文/数据集，论证有理有据
</scoring_rubric>

<output_format>
请严格以 JSON 格式输出（不要包含 markdown 代码块标记）：
{{
  "novelty": {{"score": N, "reason": "..."}},
  "feasibility": {{"score": N, "reason": "..."}},
  "impact": {{"score": N, "reason": "..."}},
  "specificity": {{"score": N, "reason": "..."}},
  "evidence": {{"score": N, "reason": "..."}},
  "overall": N,
  "one_line_summary": "..."
}}
其中 overall = 0.25*novelty + 0.25*feasibility + 0.2*impact + 0.15*specificity + 0.15*evidence
</output_format>"""


# ---------------------------------------------------------------------------
# IdeaJudge 核心类
# ---------------------------------------------------------------------------

class IdeaJudge:
    """使用独立 LLM 对创意进行多维度评分。"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str = "qwen3.5-plus",
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._temperature = temperature
        self._max_tokens = max_tokens

    @classmethod
    def from_settings(cls) -> "IdeaJudge":
        """从应用配置创建 Judge 实例。"""
        from sololab.config.settings import get_settings

        s = get_settings()
        return cls(
            base_url=s.judge_base_url,
            api_key=s.judge_api_key,
            model=s.judge_model,
        )

    async def score_idea(
        self,
        topic: str,
        idea_content: str,
        idea_id: str = "",
    ) -> JudgeResult:
        """对单个创意进行评分。"""
        from datetime import datetime

        prompt = JUDGE_USER_PROMPT_TEMPLATE.format(
            topic=topic,
            idea_content=idea_content,
        )

        system_prompt = JUDGE_SYSTEM_PROMPT.format(
            current_date=datetime.now().strftime("%Y-%m-%d"),
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )
            raw = response.choices[0].message.content or ""
            return self._parse_response(raw, idea_id)
        except Exception as e:
            logger.error("Judge 评分失败 (idea_id=%s): %s", idea_id, e)
            result = JudgeResult(idea_id=idea_id, raw_response=str(e))
            return result

    async def score_idea_repeated(
        self,
        topic: str,
        idea_content: str,
        idea_id: str = "",
        repeat: int = 2,
    ) -> JudgeResult:
        """多次评分取平均，减少随机性。"""
        results: List[JudgeResult] = []
        for _ in range(repeat):
            r = await self.score_idea(topic, idea_content, idea_id)
            if r.weighted_overall > 0:
                results.append(r)

        if not results:
            return JudgeResult(idea_id=idea_id)

        # 取各维度平均分
        avg = JudgeResult(idea_id=idea_id)
        n = len(results)
        avg.novelty = DimensionScore(
            score=round(sum(r.novelty.score for r in results) / n, 2),
            reason=results[0].novelty.reason,
        )
        avg.feasibility = DimensionScore(
            score=round(sum(r.feasibility.score for r in results) / n, 2),
            reason=results[0].feasibility.reason,
        )
        avg.impact = DimensionScore(
            score=round(sum(r.impact.score for r in results) / n, 2),
            reason=results[0].impact.reason,
        )
        avg.specificity = DimensionScore(
            score=round(sum(r.specificity.score for r in results) / n, 2),
            reason=results[0].specificity.reason,
        )
        avg.evidence = DimensionScore(
            score=round(sum(r.evidence.score for r in results) / n, 2),
            reason=results[0].evidence.reason,
        )
        avg.overall = avg.weighted_overall
        avg.one_line_summary = results[0].one_line_summary
        return avg

    async def score_batch(
        self,
        topic: str,
        ideas: List[Dict[str, str]],
        repeat: int = 2,
    ) -> List[JudgeResult]:
        """批量评分一组创意。

        Args:
            ideas: [{"id": "...", "content": "..."}, ...]
        """
        import asyncio

        tasks = [
            self.score_idea_repeated(
                topic=topic,
                idea_content=idea["content"],
                idea_id=idea.get("id", f"idea-{i}"),
                repeat=repeat,
            )
            for i, idea in enumerate(ideas)
        ]
        return await asyncio.gather(*tasks)

    # -----------------------------------------------------------------------
    # 内部方法
    # -----------------------------------------------------------------------

    def _parse_response(self, raw: str, idea_id: str) -> JudgeResult:
        """解析 LLM 返回的 JSON 评分。

        兼容 qwen3.5-plus 等思考模型的多种输出格式：
        1. 纯 JSON
        2. ```json ... ```
        3. <think>...</think> + JSON
        4. <think>包含JSON</think>（JSON 在 think 内部）
        5. 未闭合的 <think> 标签
        """
        result = JudgeResult(idea_id=idea_id, raw_response=raw)

        # 策略：先从完整原始文本中提取所有可能的 JSON 块，再逐个尝试解析
        data = self._extract_json(raw)
        if data is None:
            logger.warning("无法解析 Judge 响应 JSON (idea_id=%s)", idea_id)
            return result

        # 提取各维度分数
        for dim_name in ("novelty", "feasibility", "impact", "specificity", "evidence"):
            dim_data = data.get(dim_name, {})
            if isinstance(dim_data, dict):
                score = float(dim_data.get("score", 0))
                reason = str(dim_data.get("reason", ""))
            elif isinstance(dim_data, (int, float)):
                score = float(dim_data)
                reason = ""
            else:
                score = 0.0
                reason = ""
            setattr(result, dim_name, DimensionScore(score=score, reason=reason))

        result.overall = result.weighted_overall
        result.one_line_summary = str(data.get("one_line_summary", ""))

        return result

    def _extract_json(self, raw: str) -> Optional[dict]:
        """从原始文本中提取 JSON，按可靠性从高到低尝试多种策略。"""
        candidates = []

        # 策略 1: 移除 <think> 标签后，尝试直接解析
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        # 也处理未闭合的 <think>：移除 <think> 到末尾的内容不行，应保留 <think> 之后的内容
        cleaned = re.sub(r"<think>(?!.*</think>).*$", "", cleaned, flags=re.DOTALL).strip()
        candidates.append(cleaned)

        # 策略 2: 从 <think> 标签内部也尝试提取
        think_matches = re.findall(r"<think>(.*?)</think>", raw, flags=re.DOTALL)
        for think_content in think_matches:
            candidates.append(think_content.strip())

        # 策略 3: 原始文本本身
        candidates.append(raw.strip())

        for text in candidates:
            # 去除 markdown 代码块标记
            stripped = re.sub(r"```(?:json)?\s*", "", text)
            stripped = re.sub(r"\s*```", "", stripped).strip()

            # 尝试直接解析
            try:
                data = json.loads(stripped)
                if isinstance(data, dict) and "novelty" in data:
                    return data
            except (json.JSONDecodeError, ValueError):
                pass

            # 尝试用大括号匹配提取嵌套 JSON
            for match in re.finditer(r"\{", stripped):
                start = match.start()
                depth = 0
                end = start
                for i in range(start, len(stripped)):
                    if stripped[i] == "{":
                        depth += 1
                    elif stripped[i] == "}":
                        depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
                if depth == 0 and end > start:
                    try:
                        data = json.loads(stripped[start:end])
                        if isinstance(data, dict) and "novelty" in data:
                            return data
                    except (json.JSONDecodeError, ValueError):
                        continue

        return None
