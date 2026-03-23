"""模块 API 路由单元测试（使用 httpx AsyncClient）。"""

import pytest


class TestModulesAPI:

    @pytest.mark.unit
    async def test_health_check(self, async_client):
        """GET /health 应返回 ok。"""
        response = await async_client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    @pytest.mark.unit
    async def test_list_modules_returns_ideaspark(self, async_client):
        """GET /api/modules 应返回包含 ideaspark 的列表。"""
        response = await async_client.get("/api/modules")
        assert response.status_code == 200
        modules = response.json()
        assert len(modules) >= 1
        ids = [m["id"] for m in modules]
        assert "ideaspark" in ids

    @pytest.mark.unit
    async def test_get_module_config(self, async_client):
        """GET /api/modules/ideaspark/config 应返回模块配置。"""
        response = await async_client.get("/api/modules/ideaspark/config")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "ideaspark"
        assert data["name"] == "IdeaSpark"

    @pytest.mark.unit
    async def test_get_missing_module_config(self, async_client):
        """GET /api/modules/nonexistent/config 应返回 404。"""
        response = await async_client.get("/api/modules/nonexistent/config")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_unload_and_reload_module(self, async_client):
        """卸载后重新加载模块应成功。"""
        # 卸载
        response = await async_client.delete("/api/modules/ideaspark/unload")
        assert response.status_code == 200
        assert response.json()["status"] == "unloaded"

        # 验证已卸载
        response = await async_client.get("/api/modules")
        assert all(m["id"] != "ideaspark" for m in response.json())

        # 重新加载
        response = await async_client.post("/api/modules/ideaspark/load")
        assert response.status_code == 200
        assert response.json()["status"] == "loaded"

    @pytest.mark.unit
    async def test_load_already_loaded(self, async_client):
        """加载已加载的模块应返回 already_loaded。"""
        response = await async_client.post("/api/modules/ideaspark/load")
        assert response.status_code == 200
        assert response.json()["status"] == "already_loaded"

    @pytest.mark.unit
    async def test_load_nonexistent_module(self, async_client):
        """加载不存在的模块应返回 404。"""
        response = await async_client.post("/api/modules/nonexistent/load")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_list_providers(self, async_client):
        """GET /api/providers 应返回配置的提供商信息。"""
        response = await async_client.get("/api/providers")
        assert response.status_code == 200
        data = response.json()
        assert "default_model" in data
        assert "fallback_chain" in data
        assert "embedding_model" in data

    @pytest.mark.unit
    async def test_list_tools(self, async_client):
        """GET /api/tools 应返回列表（可能为空）。"""
        response = await async_client.get("/api/tools")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
