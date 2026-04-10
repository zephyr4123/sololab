"""WriterAI API 集成测试。

测试 Writer 模块注册、API 路由响应、文档 CRUD 端到端。
需要运行中的 PostgreSQL 和完整的 FastAPI 应用。
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from sololab.main import create_app


@pytest_asyncio.fixture
async def app_client():
    """创建带有完整 lifespan 的测试客户端。"""
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ── 模块注册 ───────────────────────────────────────────

@pytest.mark.integration
class TestWriterModuleRegistration:
    """验证 Writer 模块被正确发现和加载。"""

    async def test_module_listed(self, app_client):
        resp = await app_client.get("/api/modules")
        assert resp.status_code == 200
        modules = resp.json()
        module_ids = [m["id"] for m in modules]
        assert "writer" in module_ids

    async def test_module_config(self, app_client):
        resp = await app_client.get("/api/modules/writer/config")
        assert resp.status_code == 200
        config = resp.json()
        assert config["id"] == "writer"
        assert config["name"] == "WriterAI"


# ── 模板 API ──────────────────────────────────────────

@pytest.mark.integration
class TestTemplateAPI:
    """测试模板列表和详情 API。"""

    async def test_list_templates(self, app_client):
        resp = await app_client.get("/api/writer/templates")
        assert resp.status_code == 200
        templates = resp.json()
        assert isinstance(templates, list)
        assert len(templates) >= 1
        # 至少有 Nature 模板
        ids = [t["id"] for t in templates]
        assert "nature" in ids

    async def test_get_template(self, app_client):
        resp = await app_client.get("/api/writer/templates/nature")
        assert resp.status_code == 200
        template = resp.json()
        assert template["id"] == "nature"
        assert template["name"] == "Nature Article"
        assert len(template["sections"]) >= 5
        assert template["citation"]["style"] == "nature-numeric"

    async def test_get_nonexistent_template(self, app_client):
        resp = await app_client.get("/api/writer/templates/nonexistent")
        assert resp.status_code == 404


# ── 文档 API ──────────────────────────────────────────

@pytest.mark.integration
class TestDocumentAPI:
    """测试文档 CRUD API。"""

    async def test_list_documents_empty(self, app_client):
        resp = await app_client.get("/api/writer/documents")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_get_nonexistent_document(self, app_client):
        resp = await app_client.get("/api/writer/documents/nonexistent-id")
        assert resp.status_code == 404

    async def test_delete_nonexistent_document(self, app_client):
        resp = await app_client.delete("/api/writer/documents/nonexistent-id")
        assert resp.status_code == 404

    async def test_export_not_implemented(self, app_client):
        """Phase 6.3 才实现导出，当前应返回 501。"""
        resp = await app_client.post("/api/writer/documents/some-id/export")
        # 文档不存在时返回 404
        assert resp.status_code in (404, 501)


# ── 知识库 API ─────────────────────────────────────────

@pytest.mark.integration
class TestKnowledgeAPI:
    """测试知识库 API。"""

    async def test_list_knowledge(self, app_client):
        resp = await app_client.get("/api/writer/knowledge")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_delete_nonexistent_knowledge(self, app_client):
        resp = await app_client.delete("/api/writer/knowledge/nonexistent-id")
        assert resp.status_code == 404
