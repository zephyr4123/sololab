"""Unit tests for Task State Manager."""

import pytest


class TestTaskStateManager:
    """Tests for Redis-based task state management."""

    @pytest.mark.unit
    async def test_create_task(self, mock_redis):
        """Creating a task should return a valid task_id."""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {"input": "test"})
        assert task_id is not None
        assert len(task_id) > 0

    @pytest.mark.unit
    async def test_append_and_get_events(self, mock_redis):
        """Appending events should be retrievable."""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        eid = await manager.append_event(task_id, "text", {"content": "hello"})
        assert eid == 1

        events = await manager.get_events_after(task_id, 0)
        assert len(events) == 1
        assert events[0]["type"] == "text"

    @pytest.mark.unit
    async def test_complete_task(self, mock_redis):
        """Completing a task should update status."""
        from sololab.core.task_state_manager import TaskStateManager

        manager = TaskStateManager(mock_redis)
        task_id = await manager.create_task("ideaspark", {})
        await manager.complete_task(task_id, {"result": "done"})
        state = await manager.get_task_state(task_id)
        assert state is not None
        assert state["status"] == "completed"
