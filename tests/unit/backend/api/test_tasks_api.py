"""Unit tests for tasks API routes."""

import pytest


class TestTasksAPI:
    """Tests for /api/tasks routes."""

    @pytest.mark.unit
    def test_get_nonexistent_task(self):
        """GET /api/tasks/{id}/state for nonexistent task should return 404."""
        from fastapi.testclient import TestClient
        from sololab.main import app

        client = TestClient(app)
        response = client.get("/api/tasks/nonexistent/state")
        assert response.status_code == 404

    @pytest.mark.unit
    def test_get_task_events(self):
        """GET /api/tasks/{id}/events should return events list."""
        from fastapi.testclient import TestClient
        from sololab.main import app

        client = TestClient(app)
        response = client.get("/api/tasks/test-id/events?after=0")
        assert response.status_code == 200
        assert "events" in response.json()
