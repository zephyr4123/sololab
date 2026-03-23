"""文档 API 路由单元测试。"""

import pytest
from unittest.mock import AsyncMock, MagicMock


class TestDocumentsAPI:
    """Document API 路由测试。"""

    @pytest.fixture
    async def client_with_pipeline(self):
        """带模拟 DocumentPipeline 的测试客户端。"""
        import httpx
        from sololab.main import app

        # 模拟 pipeline
        mock_pipeline = MagicMock()
        mock_pipeline.upload_and_process = AsyncMock(return_value="test-doc-id")
        mock_pipeline.storage_path = "/tmp/test"
        mock_pipeline.get_status = AsyncMock(return_value={
            "doc_id": "test-doc-id",
            "filename": "test.pdf",
            "status": "completed",
            "title": "Test Paper",
            "total_chunks": 5,
        })
        mock_pipeline.get_chunks = AsyncMock(return_value=[
            {"chunk_index": 0, "content": "chunk 0", "content_type": "text"},
            {"chunk_index": 1, "content": "chunk 1", "content_type": "text"},
        ])
        mock_pipeline.search = AsyncMock(return_value=[
            {"doc_id": "test-doc-id", "content": "result", "similarity": 0.95},
        ])
        mock_pipeline.process = AsyncMock()

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                app.state.document_pipeline = mock_pipeline
                yield client

    @pytest.mark.unit
    async def test_get_document_status(self, client_with_pipeline):
        """GET /documents/{doc_id}/status 应返回状态。"""
        response = await client_with_pipeline.get("/api/documents/test-doc-id/status")
        assert response.status_code == 200
        data = response.json()
        assert data["doc_id"] == "test-doc-id"
        assert data["status"] == "completed"

    @pytest.mark.unit
    async def test_get_document_status_not_found(self, client_with_pipeline):
        """不存在的文档应返回 404。"""
        client_with_pipeline._transport.app.state.document_pipeline.get_status = AsyncMock(return_value=None)
        response = await client_with_pipeline.get("/api/documents/nonexistent/status")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_get_document_chunks(self, client_with_pipeline):
        """GET /documents/{doc_id}/chunks 应返回分块。"""
        response = await client_with_pipeline.get("/api/documents/test-doc-id/chunks")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2

    @pytest.mark.unit
    async def test_search_documents(self, client_with_pipeline):
        """POST /documents/search 应返回搜索结果。"""
        response = await client_with_pipeline.post(
            "/api/documents/search?query=test+query&top_k=5"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    @pytest.mark.unit
    async def test_search_empty_query(self, client_with_pipeline):
        """空查询应返回 400。"""
        response = await client_with_pipeline.post(
            "/api/documents/search?query=+&top_k=5"
        )
        assert response.status_code == 400
