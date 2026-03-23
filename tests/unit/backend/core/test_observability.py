"""可观测性单元测试。"""

import pytest


class TestLLMCallTracer:
    """LLMCallTracer 测试。"""

    @pytest.mark.unit
    def test_start_and_end_trace(self):
        """追踪 LLM 调用。"""
        from sololab.core.observability import LLMCallTracer

        tracer = LLMCallTracer()
        trace = tracer.start_trace(agent_name="divergent", model="gpt-4o", task_id="t1")
        assert trace["status"] == "running"
        assert trace["agent_name"] == "divergent"

        trace = tracer.end_trace(trace, usage={"prompt_tokens": 100, "completion_tokens": 50, "cost_usd": 0.01})
        assert trace["status"] == "completed"
        assert trace["prompt_tokens"] == 100
        assert trace["latency_ms"] >= 0

    @pytest.mark.unit
    def test_end_trace_with_error(self):
        """追踪失败的 LLM 调用。"""
        from sololab.core.observability import LLMCallTracer

        tracer = LLMCallTracer()
        trace = tracer.start_trace(agent_name="critic", model="gpt-4o")
        trace = tracer.end_trace(trace, error="Rate limit exceeded")
        assert trace["status"] == "error"
        assert trace["error"] == "Rate limit exceeded"

    @pytest.mark.unit
    def test_get_traces(self):
        """获取追踪记录。"""
        from sololab.core.observability import LLMCallTracer

        tracer = LLMCallTracer()
        for i in range(5):
            t = tracer.start_trace(agent_name=f"agent_{i}", task_id="t1")
            tracer.end_trace(t, usage={"prompt_tokens": 10, "completion_tokens": 5, "cost_usd": 0.001})

        all_traces = tracer.get_traces()
        assert len(all_traces) == 5

        task_traces = tracer.get_traces(task_id="t1")
        assert len(task_traces) == 5

    @pytest.mark.unit
    def test_get_summary(self):
        """获取追踪统计摘要。"""
        from sololab.core.observability import LLMCallTracer

        tracer = LLMCallTracer()
        for i in range(3):
            t = tracer.start_trace(agent_name="divergent", model="gpt-4o", task_id="t2")
            tracer.end_trace(t, usage={"prompt_tokens": 100, "completion_tokens": 50, "cost_usd": 0.01})

        summary = tracer.get_summary(task_id="t2")
        assert summary["total_calls"] == 3
        assert summary["total_tokens"] == 450
        assert summary["total_cost_usd"] == 0.03
        assert "by_agent" in summary
        assert "divergent" in summary["by_agent"]


class TestMessageTracer:
    """MessageTracer 测试。"""

    @pytest.mark.unit
    def test_track_message(self):
        """追踪消息引用。"""
        from sololab.core.observability import MessageTracer

        tracer = MessageTracer()
        tracer.track_message("m1", references=[])
        tracer.track_message("m2", references=["m1"])
        tracer.track_message("m3", references=["m1", "m2"])

        chain = tracer.get_reference_chain("m1")
        assert "m2" in chain
        assert "m3" in chain

    @pytest.mark.unit
    def test_get_orphan_messages(self):
        """找出孤立消息。"""
        from sololab.core.observability import MessageTracer

        tracer = MessageTracer()
        tracer.track_message("m1", references=[])
        tracer.track_message("m2", references=["m1"])
        # m3 没有被追踪也没有引用任何消息

        orphans = tracer.get_orphan_messages(["m1", "m2", "m3"])
        assert "m3" in orphans
        assert "m1" not in orphans


class TestBudgetAlert:
    """BudgetAlert 测试。"""

    @pytest.mark.unit
    def test_no_alert_below_threshold(self):
        """低于阈值不触发告警。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        result = alert.check("t1", 2.0)
        assert result is None

    @pytest.mark.unit
    def test_info_alert_at_50_percent(self):
        """50% 触发 info 告警。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        result = alert.check("t1", 5.5)
        assert result is not None
        assert result["level"] == "info"

    @pytest.mark.unit
    def test_warning_alert_at_80_percent(self):
        """80% 触发 warning 告警。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        alert.check("t1", 5.5)  # 先触发 info
        result = alert.check("t1", 8.5)
        assert result is not None
        assert result["level"] == "warning"

    @pytest.mark.unit
    def test_critical_alert_at_100_percent(self):
        """100% 触发 critical 告警。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        alert.check("t1", 5.5)
        alert.check("t1", 8.5)
        result = alert.check("t1", 10.5)
        assert result is not None
        assert result["level"] == "critical"

    @pytest.mark.unit
    def test_no_duplicate_alert(self):
        """同级别不重复告警。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        alert.check("t1", 5.5)  # info
        result = alert.check("t1", 6.0)  # still info range
        assert result is None  # 已经告警过了

    @pytest.mark.unit
    def test_reset(self):
        """重置告警状态。"""
        from sololab.core.observability import BudgetAlert

        alert = BudgetAlert(budget_usd=10.0)
        alert.check("t1", 5.5)
        alert.reset("t1")
        result = alert.check("t1", 5.5)
        assert result is not None  # 重置后可以再次告警
