"""费用追踪器单元测试。"""

import pytest


class TestCostTracker:
    """CostTracker 测试。"""

    @pytest.mark.unit
    def test_budget_check_within_limit(self):
        """未超预算时应通过。"""
        from sololab.core.cost_tracker import CostTracker

        tracker = CostTracker(db=None, default_budget=5.0)
        # 不应抛出异常
        tracker.check_budget("task-1")

    @pytest.mark.unit
    def test_budget_check_exceeded(self):
        """超预算时应抛出异常。"""
        from sololab.core.cost_tracker import CostTracker, BudgetExceededError

        tracker = CostTracker(db=None, default_budget=1.0)
        tracker._runtime_costs["task-1"] = 1.5
        with pytest.raises(BudgetExceededError):
            tracker.check_budget("task-1")

    @pytest.mark.unit
    def test_runtime_cost_tracking(self):
        """运行时费用应正确累计。"""
        from sololab.core.cost_tracker import CostTracker

        tracker = CostTracker(db=None, default_budget=5.0)
        tracker._runtime_costs["task-1"] = 0.5
        assert tracker.get_runtime_cost("task-1") == 0.5
        assert tracker.get_runtime_cost("nonexistent") == 0.0

    @pytest.mark.unit
    def test_reset_runtime(self):
        """重置运行时费用。"""
        from sololab.core.cost_tracker import CostTracker

        tracker = CostTracker(db=None, default_budget=5.0)
        tracker._runtime_costs["task-1"] = 1.0
        tracker.reset_runtime("task-1")
        assert tracker.get_runtime_cost("task-1") == 0.0

    @pytest.mark.unit
    def test_budget_exceeded_error_message(self):
        """BudgetExceededError 应包含正确的信息。"""
        from sololab.core.cost_tracker import BudgetExceededError

        error = BudgetExceededError(budget=5.0, spent=7.5)
        assert error.budget == 5.0
        assert error.spent == 7.5
        assert "$7.5" in str(error)
