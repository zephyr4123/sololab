"""WriterAI API 路由 — 文档管理、模板列表、Word 导出、知识库。

写作流式端点复用 /api/modules/writer/stream（通用模块流式路由）。
此文件提供 Writer 模块特有的文档操作端点。
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/writer", tags=["writer"])


def _get_document_manager(request: Request):
    """从 app state 获取 DocumentManager 实例。"""
    module_registry = getattr(request.app.state, "module_registry", None)
    if module_registry is None:
        raise HTTPException(status_code=503, detail="Module registry not available")

    writer_module = module_registry.get_module("writer")
    if writer_module is None:
        raise HTTPException(status_code=503, detail="WriterAI module not loaded")

    doc_manager = getattr(writer_module, "document_manager", None)
    if doc_manager is None:
        raise HTTPException(status_code=503, detail="DocumentManager not initialized (database may be unavailable)")

    return doc_manager


def _get_template_registry(request: Request):
    """从 app state 获取 TemplateRegistry 实例。"""
    module_registry = getattr(request.app.state, "module_registry", None)
    if module_registry is None:
        raise HTTPException(status_code=503, detail="Module registry not available")

    writer_module = module_registry.get_module("writer")
    if writer_module is None:
        raise HTTPException(status_code=503, detail="WriterAI module not loaded")

    registry = getattr(writer_module, "template_registry", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="TemplateRegistry not initialized")

    return registry


# ── 模板 ────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(request: Request):
    """列出所有可用的论文模板。"""
    registry = _get_template_registry(request)
    templates = registry.list_all()
    return [t.to_dict() for t in templates]


@router.get("/templates/{template_id}")
async def get_template(request: Request, template_id: str):
    """获取指定模板详情。"""
    registry = _get_template_registry(request)
    template = registry.get(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return template.to_dict()


# ── 文档 CRUD ───────────────────────────────────────────

@router.get("/documents")
async def list_documents(request: Request, session_id: Optional[str] = Query(None)):
    """列出所有文档，可按 session_id 过滤。"""
    doc_manager = _get_document_manager(request)
    documents = await doc_manager.list_documents(session_id=session_id)
    return documents


@router.get("/documents/{doc_id}")
async def get_document(request: Request, doc_id: str):
    """获取文档详情。"""
    doc_manager = _get_document_manager(request)
    doc = await doc_manager.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    return doc


@router.delete("/documents/{doc_id}")
async def delete_document(request: Request, doc_id: str):
    """删除文档。"""
    doc_manager = _get_document_manager(request)
    deleted = await doc_manager.delete(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    return {"status": "deleted", "doc_id": doc_id}


@router.post("/documents/{doc_id}/export")
async def export_document(request: Request, doc_id: str):
    """导出文档为 Word 文件。

    Phase 6.3 实现完整的 python-docx 导出。
    当前阶段返回占位响应。
    """
    doc_manager = _get_document_manager(request)
    doc = await doc_manager.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Phase 6.3: WordExporter 将在此实现
    return JSONResponse(
        status_code=501,
        content={
            "detail": "Word export will be implemented in Phase 6.3",
            "doc_id": doc_id,
            "template_id": doc.get("template_id"),
        },
    )


# ── 知识库（参考 PDF 管理）──────────────────────────────

@router.post("/knowledge")
async def upload_knowledge(
    request: Request,
    file: UploadFile = File(...),
    project_id: str = Query(default="writer"),
):
    """上传参考 PDF 到知识库。

    复用 DocumentPipeline 进行 PDF 解析、分块、嵌入。
    解析后的内容作为 Agent 的内部知识，不可作为论文引用。
    """
    document_pipeline = getattr(request.app.state, "document_pipeline", None)
    if document_pipeline is None:
        raise HTTPException(status_code=503, detail="Document pipeline not available")

    try:
        content = await file.read()
        result = await document_pipeline.upload_and_process(
            filename=file.filename or "unknown.pdf",
            content=content,
            project_id=project_id,
        )
        return {
            "doc_id": result.get("doc_id"),
            "filename": result.get("filename"),
            "status": result.get("status", "processing"),
            "message": "PDF uploaded for knowledge extraction. Content will be used as internal context only.",
        }
    except Exception as e:
        logger.exception("Knowledge upload failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/knowledge")
async def list_knowledge(
    request: Request,
    project_id: str = Query(default="writer"),
):
    """列出已上传的知识库文档。"""
    db_session_factory = getattr(request.app.state, "db_session_factory", None)
    if db_session_factory is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from sololab.models.orm import DocumentRecord
    from sqlalchemy import select

    async with db_session_factory() as session:
        result = await session.execute(
            select(DocumentRecord)
            .where(DocumentRecord.project_id == project_id)
            .order_by(DocumentRecord.created_at.desc())
        )
        records = result.scalars().all()

    return [
        {
            "doc_id": r.doc_id,
            "filename": r.filename,
            "title": r.title,
            "status": r.status,
            "total_pages": r.total_pages,
            "total_chunks": r.total_chunks,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.delete("/knowledge/{doc_id}")
async def delete_knowledge(request: Request, doc_id: str):
    """删除知识库中的参考文档。"""
    db_session_factory = getattr(request.app.state, "db_session_factory", None)
    if db_session_factory is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from sololab.models.orm import DocumentRecord
    from sqlalchemy import delete as sa_delete

    async with db_session_factory() as session:
        result = await session.execute(
            sa_delete(DocumentRecord).where(DocumentRecord.doc_id == doc_id)
        )
        await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"Knowledge document '{doc_id}' not found")

    return {"status": "deleted", "doc_id": doc_id}
