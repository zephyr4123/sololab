"""任务 API 路由单元测试（使用 httpx AsyncClient）。"""

import pytest


class TestTasksAPI:

    @pytest.mark.unit
    async def test_get_nonexistent_task(self, async_client):
        """GET /api/tasks/{id}/state 对不存在的任务应返回 404。"""
        response = await async_client.get("/api/tasks/nonexistent/state")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_get_nonexistent_task_events(self, async_client):
        """GET /api/tasks/{id}/events 对不存在的任务应返回 404。"""
        response = await async_client.get("/api/tasks/nonexistent/events?after=0")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_cancel_nonexistent_task(self, async_client):
        """DELETE /api/tasks/{id} 对不存在的任务应返回 404。"""
        response = await async_client.delete("/api/tasks/nonexistent")
        assert response.status_code == 404
