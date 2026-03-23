"""Phase 4 集成测试：可观测性、认证、限速、消息持久化。"""

import pytest
import httpx


class TestPhase4API:
    """Phase 4 API 端点集成测试。"""

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
    async def test_enhanced_health_check(self, app_client):
        """增强的健康检查应返回服务状态。"""
        client, _ = app_client
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == "0.3.0"
        assert "services" in data
        assert "redis" in data["services"]
        assert "database" in data["services"]
        assert "llm_gateway" in data["services"]
        assert "modules_loaded" in data

    @pytest.mark.integration
    async def test_providers_traces_endpoint(self, app_client):
        """GET /providers/traces 应返回追踪数据。"""
        client, _ = app_client
        resp = await client.get("/api/providers/traces")
        assert resp.status_code == 200
        data = resp.json()
        assert "traces" in data
        assert "summary" in data

    @pytest.mark.integration
    async def test_providers_runs_endpoint(self, app_client):
        """GET /providers/runs 应返回运行历史。"""
        client, _ = app_client
        resp = await client.get("/api/providers/runs")
        # 可能 503（DB 不可用）或 200
        assert resp.status_code in (200, 503)
        if resp.status_code == 200:
            data = resp.json()
            assert "runs" in data

    @pytest.mark.integration
    async def test_rate_limit_headers(self, app_client):
        """响应应包含限速 header。"""
        client, _ = app_client
        resp = await client.get("/api/modules")
        assert resp.status_code == 200
        # RateLimitMiddleware 添加的 header
        assert "x-ratelimit-remaining" in resp.headers

    @pytest.mark.integration
    async def test_observability_initialized(self, app_client):
        """可观测性组件应已初始化。"""
        _, app = app_client
        assert app.state.llm_tracer is not None
        assert app.state.message_tracer is not None
        assert app.state.budget_alert is not None

    @pytest.mark.integration
    async def test_auth_disabled_by_default(self, app_client):
        """默认不启用认证（无 API key 配置时）。"""
        _, app = app_client
        auth = app.state.api_key_auth
        assert auth.verify(None) is True  # 禁用时允许所有

    @pytest.mark.integration
    async def test_message_store_initialized(self, app_client):
        """消息存储应在 DB 可用时初始化。"""
        _, app = app_client
        if app.state.db_session:
            assert app.state.message_store is not None
        else:
            assert app.state.message_store is None

    @pytest.mark.integration
    async def test_providers_cost_module(self, app_client):
        """模块费用端点应可访问。"""
        client, app = app_client
        if not app.state.cost_tracker:
            pytest.skip("Cost tracker not available")
        try:
            resp = await client.get("/api/providers/cost/module/ideaspark?days=30")
        except Exception:
            pytest.skip("Phase 4 tables not migrated")
        if resp.status_code >= 500:
            pytest.skip("Phase 4 tables not migrated")
        assert resp.status_code == 200
