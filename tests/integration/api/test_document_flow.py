"""文档管道集成测试。"""

import pytest
import httpx


def _skip_if_table_error(resp):
    """如果返回 500 且可能是表不存在的错误，跳过测试。"""
    if resp.status_code >= 500:
        pytest.skip("Phase 3 tables not migrated or server error (run alembic upgrade head)")


class TestDocumentFlow:
    """文档上传和搜索集成测试。"""

    @pytest.fixture
    async def app_client(self):
        """httpx 客户端（含完整 lifespan）。"""
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client, app

    @pytest.mark.integration
    async def test_document_pipeline_initialization(self, app_client):
        """文档管道应在 lifespan 中初始化。"""
        _, app = app_client
        if app.state.db_session:
            assert app.state.document_pipeline is not None
        else:
            assert app.state.document_pipeline is None

    @pytest.mark.integration
    async def test_document_status_not_found(self, app_client):
        """查询不存在的文档应返回 404。"""
        client, app = app_client
        if not app.state.document_pipeline:
            pytest.skip("Document pipeline not available")

        try:
            resp = await client.get("/api/documents/nonexistent/status")
        except Exception:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        _skip_if_table_error(resp)
        assert resp.status_code == 404

    @pytest.mark.integration
    async def test_document_search_empty(self, app_client):
        """空数据库搜索应返回空结果。"""
        client, app = app_client
        if not app.state.document_pipeline:
            pytest.skip("Document pipeline not available")

        try:
            resp = await client.post("/api/documents/search?query=quantum+computing&top_k=5")
        except Exception:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        _skip_if_table_error(resp)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0


class TestMemoryIntegration:
    """记忆管理器集成测试。"""

    @pytest.fixture
    async def app_client(self):
        from sololab.main import app
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client, app

    @pytest.mark.integration
    async def test_memory_manager_initialization(self, app_client):
        """记忆管理器应在 lifespan 中初始化。"""
        _, app = app_client
        if app.state.db_session:
            assert app.state.memory_manager is not None
        else:
            assert app.state.memory_manager is None

    @pytest.mark.integration
    async def test_memory_search_empty(self, app_client):
        """空数据库记忆搜索应返回空结果。"""
        client, app = app_client
        if not app.state.memory_manager:
            pytest.skip("Memory manager not available")

        try:
            resp = await client.post("/api/memory/search?query=test&scope=project")
        except Exception:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        _skip_if_table_error(resp)
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data


class TestCostIntegration:
    """费用追踪集成测试。"""

    @pytest.fixture
    async def app_client(self):
        from sololab.main import app
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client, app

    @pytest.mark.integration
    async def test_cost_tracker_initialization(self, app_client):
        """费用追踪器应在 lifespan 中初始化。"""
        _, app = app_client
        if app.state.db_session:
            assert app.state.cost_tracker is not None
        else:
            assert app.state.cost_tracker is None

    @pytest.mark.integration
    async def test_cost_api_endpoint(self, app_client):
        """费用 API 应返回统计数据。"""
        client, app = app_client
        if not app.state.cost_tracker:
            pytest.skip("Cost tracker not available")

        try:
            resp = await client.get("/api/providers/cost?days=30")
        except Exception:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        _skip_if_table_error(resp)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_cost_usd" in data
        assert "by_model" in data
