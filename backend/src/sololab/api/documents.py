"""文档上传与搜索的 API 路由。"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/documents/upload")
async def upload_document(
    request: Request, file: UploadFile, project_id: str = "default"
) -> dict:
    """上传文档进行解析。"""
    pipeline = request.app.state.document_pipeline
    if not pipeline:
        raise HTTPException(503, "Document pipeline not initialized")

    if not file.filename:
        raise HTTPException(400, "No filename provided")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")

    # 上传文件并创建记录
    doc_id = await pipeline.upload_and_process(file.filename, content, project_id)

    # 异步启动处理（不阻塞响应）
    async def _process():
        try:
            file_path = f"{pipeline.storage_path}/uploads/{doc_id}/{file.filename}"
            await pipeline.process(file_path, project_id, doc_id=doc_id)
        except Exception as e:
            logger.error("文档处理失败: doc_id=%s, error=%s", doc_id, e)

    asyncio.create_task(_process())

    return {"doc_id": doc_id, "filename": file.filename, "status": "processing"}


@router.get("/documents/{doc_id}/status")
async def get_document_status(request: Request, doc_id: str) -> dict:
    """获取文档解析状态。"""
    pipeline = request.app.state.document_pipeline
    if not pipeline:
        raise HTTPException(503, "Document pipeline not initialized")

    status = await pipeline.get_status(doc_id)
    if not status:
        raise HTTPException(404, f"Document '{doc_id}' not found")
    return status


@router.get("/documents/{doc_id}/chunks")
async def get_document_chunks(request: Request, doc_id: str) -> dict:
    """获取解析后的文档分块。"""
    pipeline = request.app.state.document_pipeline
    if not pipeline:
        raise HTTPException(503, "Document pipeline not initialized")

    # 先检查文档是否存在
    status = await pipeline.get_status(doc_id)
    if not status:
        raise HTTPException(404, f"Document '{doc_id}' not found")

    chunks = await pipeline.get_chunks(doc_id)
    return {"doc_id": doc_id, "chunks": chunks, "total": len(chunks)}


@router.post("/documents/search")
async def search_documents(
    request: Request, query: str, top_k: int = 5, project_id: Optional[str] = None
) -> dict:
    """跨所有文档的语义搜索。"""
    pipeline = request.app.state.document_pipeline
    if not pipeline:
        raise HTTPException(503, "Document pipeline not initialized")

    if not query.strip():
        raise HTTPException(400, "Query cannot be empty")

    results = await pipeline.search(query, top_k=top_k, project_id=project_id)
    return {"query": query, "results": results, "total": len(results)}
