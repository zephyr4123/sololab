"""费用追踪器 - 实时费用监控与预算控制。"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


class BudgetExceededError(Exception):
    """预算超限异常。"""

    def __init__(self, budget: float, spent: float) -> None:
        self.budget = budget
        self.spent = spent
        super().__init__(f"Budget exceeded: ${spent:.4f} / ${budget:.2f}")


class CostTracker:
    """实时费用追踪与预算控制。

    功能：
    - 记录每次 LLM 调用的费用
    - 按任务/模块/会话汇总费用
    - 预算限制与警告
    """

    def __init__(
        self,
        db: async_sessionmaker,
        default_budget: float = 5.0,
    ) -> None:
        self.db = db
        self.default_budget = default_budget
        # 内存中的运行时费用累计（用于快速检查，非持久化）
        self._runtime_costs: Dict[str, float] = {}

    async def record(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        cost_usd: float,
        task_id: Optional[str] = None,
        module_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> None:
        """记录一次 LLM 调用的费用。"""
        from sololab.models.orm import CostRecord

        async with self.db() as session:
            record = CostRecord(
                task_id=task_id,
                module_id=module_id,
                session_id=session_id,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            )
            session.add(record)
            await session.commit()

        # 更新运行时累计
        if task_id:
            self._runtime_costs[task_id] = self._runtime_costs.get(task_id, 0) + cost_usd

        logger.debug(
            "费用记录: model=%s, tokens=%d+%d, cost=$%.6f, task=%s",
            model, prompt_tokens, completion_tokens, cost_usd, task_id,
        )

    def check_budget(self, task_id: str, budget: Optional[float] = None) -> None:
        """检查任务是否超出预算（基于内存缓存，快速检查）。"""
        budget = budget or self.default_budget
        spent = self._runtime_costs.get(task_id, 0.0)
        if spent >= budget:
            raise BudgetExceededError(budget, spent)

    def get_runtime_cost(self, task_id: str) -> float:
        """获取运行时的任务累计费用。"""
        return self._runtime_costs.get(task_id, 0.0)

    def reset_runtime(self, task_id: str) -> None:
        """重置运行时费用计数。"""
        self._runtime_costs.pop(task_id, None)

    async def get_task_cost(self, task_id: str) -> Dict:
        """从数据库获取任务的完整费用统计。"""
        from sololab.models.orm import CostRecord

        async with self.db() as session:
            result = await session.execute(
                select(
                    func.sum(CostRecord.cost_usd).label("total_cost"),
                    func.sum(CostRecord.prompt_tokens).label("total_prompt_tokens"),
                    func.sum(CostRecord.completion_tokens).label("total_completion_tokens"),
                    func.count(CostRecord.id).label("call_count"),
                ).where(CostRecord.task_id == task_id)
            )
            row = result.first()
            return {
                "task_id": task_id,
                "total_cost_usd": float(row.total_cost or 0),
                "total_prompt_tokens": int(row.total_prompt_tokens or 0),
                "total_completion_tokens": int(row.total_completion_tokens or 0),
                "call_count": int(row.call_count or 0),
            }

    async def get_module_cost(self, module_id: str, days: int = 30) -> Dict:
        """获取模块在指定天数内的费用统计。"""
        from sololab.models.orm import CostRecord

        since = datetime.utcnow() - timedelta(days=days)
        async with self.db() as session:
            result = await session.execute(
                select(
                    func.sum(CostRecord.cost_usd).label("total_cost"),
                    func.sum(CostRecord.prompt_tokens).label("total_prompt_tokens"),
                    func.sum(CostRecord.completion_tokens).label("total_completion_tokens"),
                    func.count(CostRecord.id).label("call_count"),
                ).where(
                    CostRecord.module_id == module_id,
                    CostRecord.created_at >= since,
                )
            )
            row = result.first()
            return {
                "module_id": module_id,
                "period_days": days,
                "total_cost_usd": float(row.total_cost or 0),
                "total_prompt_tokens": int(row.total_prompt_tokens or 0),
                "total_completion_tokens": int(row.total_completion_tokens or 0),
                "call_count": int(row.call_count or 0),
            }

    async def get_total_cost(self, days: int = 30) -> Dict:
        """获取平台总费用统计。"""
        from sololab.models.orm import CostRecord

        since = datetime.utcnow() - timedelta(days=days)
        async with self.db() as session:
            # 总计
            total_result = await session.execute(
                select(
                    func.sum(CostRecord.cost_usd).label("total_cost"),
                    func.sum(CostRecord.prompt_tokens).label("total_prompt_tokens"),
                    func.sum(CostRecord.completion_tokens).label("total_completion_tokens"),
                    func.count(CostRecord.id).label("call_count"),
                ).where(CostRecord.created_at >= since)
            )
            total_row = total_result.first()

            # 按模型分组
            model_result = await session.execute(
                select(
                    CostRecord.model,
                    func.sum(CostRecord.cost_usd).label("cost"),
                    func.count(CostRecord.id).label("calls"),
                )
                .where(CostRecord.created_at >= since)
                .group_by(CostRecord.model)
                .order_by(func.sum(CostRecord.cost_usd).desc())
            )
            by_model = [
                {"model": row.model, "cost_usd": float(row.cost or 0), "calls": int(row.calls or 0)}
                for row in model_result.fetchall()
            ]

            # 按日分组
            daily_result = await session.execute(
                select(
                    func.date_trunc("day", CostRecord.created_at).label("day"),
                    func.sum(CostRecord.cost_usd).label("cost"),
                    func.count(CostRecord.id).label("calls"),
                )
                .where(CostRecord.created_at >= since)
                .group_by(func.date_trunc("day", CostRecord.created_at))
                .order_by(func.date_trunc("day", CostRecord.created_at))
            )
            daily = [
                {
                    "date": row.day.isoformat() if row.day else None,
                    "cost_usd": float(row.cost or 0),
                    "calls": int(row.calls or 0),
                }
                for row in daily_result.fetchall()
            ]

            return {
                "period_days": days,
                "total_cost_usd": float(total_row.total_cost or 0),
                "total_prompt_tokens": int(total_row.total_prompt_tokens or 0),
                "total_completion_tokens": int(total_row.total_completion_tokens or 0),
                "call_count": int(total_row.call_count or 0),
                "by_model": by_model,
                "daily": daily,
            }
