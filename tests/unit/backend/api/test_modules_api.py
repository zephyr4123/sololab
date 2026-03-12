"""Unit tests for modules API routes."""

import pytest
from fastapi.testclient import TestClient


class TestModulesAPI:
    """Tests for /api/modules routes."""

    @pytest.mark.unit
    def test_list_modules_returns_empty(self):
        """GET /api/modules should return empty list initially."""
        from sololab.main import app

        client = TestClient(app)
        response = client.get("/api/modules")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.unit
    def test_health_check(self):
        """GET /health should return ok."""
        from sololab.main import app

        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
