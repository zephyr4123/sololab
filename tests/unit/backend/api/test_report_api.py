"""报告导出 API 单元测试。"""

import pytest
from unittest.mock import AsyncMock, MagicMock


class TestReportExportAPI:
    """模块报告导出端点测试。"""

    @pytest.fixture
    async def client_with_mock(self):
        """带模拟的测试客户端。"""
        import httpx
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client

    @pytest.mark.unit
    async def test_report_module_not_found(self, client_with_mock):
        """不存在的模块应返回 404。"""
        resp = await client_with_mock.post(
            "/api/modules/nonexistent/report",
            json={
                "topic": "test",
                "ideas": [{"content": "idea", "author": "a", "elo_score": 1500, "rank": 1}],
            },
        )
        assert resp.status_code == 404

    @pytest.mark.unit
    async def test_report_empty_ideas(self, client_with_mock):
        """空 ideas 列表应返回 400。"""
        resp = await client_with_mock.post(
            "/api/modules/ideaspark/report",
            json={"topic": "quantum", "ideas": []},
        )
        assert resp.status_code == 400

    @pytest.mark.unit
    async def test_report_empty_topic(self, client_with_mock):
        """空 topic 应返回 400。"""
        resp = await client_with_mock.post(
            "/api/modules/ideaspark/report",
            json={
                "topic": "",
                "ideas": [{"content": "idea", "author": "a", "elo_score": 1500, "rank": 1}],
            },
        )
        assert resp.status_code == 400
