"""Task State Manager 单元测试（使用 fakeredis）。"""

import pytest


class TestTaskStateManager:

    @pytest.mark.unit
    async def test_create_task(self, mock_redis):
        """创建任务应返回有效的 task_id。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {"input": "test"})
        assert task_id is not None
        assert len(task_id) == 36  # UUID 格式

    @pytest.mark.unit
    async def test_get_task_state(self, mock_redis):
        """获取任务状态应返回正确信息。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        state = await manager.get_task_state(task_id)
        assert state is not None
        assert state["status"] == "pending"
        assert state["module_id"] == "ideaspark"

    @pytest.mark.unit
    async def test_get_nonexistent_task(self, mock_redis):
        """获取不存在的任务应返回 None。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        state = await manager.get_task_state("nonexistent")
        assert state is None

    @pytest.mark.unit
    async def test_append_and_get_events(self, mock_redis):
        """追加事件后应能通过 get_events_after 获取。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        eid1 = await manager.append_event(task_id, "text", {"content": "hello"})
        eid2 = await manager.append_event(task_id, "agent", {"name": "divergent"})
        assert eid1 == 1
        assert eid2 == 2

        events = await manager.get_events_after(task_id, 0)
        assert len(events) == 2
        assert events[0]["type"] == "text"
        assert events[1]["type"] == "agent"

    @pytest.mark.unit
    async def test_get_events_after_filters(self, mock_redis):
        """get_events_after 应正确过滤已消费的事件。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        await manager.append_event(task_id, "text", {"content": "1"})
        await manager.append_event(task_id, "text", {"content": "2"})
        await manager.append_event(task_id, "text", {"content": "3"})

        events = await manager.get_events_after(task_id, 2)
        assert len(events) == 1
        assert events[0]["event_id"] == 3

    @pytest.mark.unit
    async def test_complete_task(self, mock_redis):
        """完成任务后状态应为 completed。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        await manager.complete_task(task_id, {"result": "done"})
        state = await manager.get_task_state(task_id)
        assert state["status"] == "completed"

    @pytest.mark.unit
    async def test_fail_task(self, mock_redis):
        """失败任务后状态应为 failed，且包含错误信息。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        await manager.fail_task(task_id, "something went wrong")
        state = await manager.get_task_state(task_id)
        assert state["status"] == "failed"
        assert state["error"] == "something went wrong"

    @pytest.mark.unit
    async def test_cancel_task(self, mock_redis):
        """取消任务后状态应为 cancelled。"""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        await manager.cancel_task(task_id)
        state = await manager.get_task_state(task_id)
        assert state["status"] == "cancelled"
