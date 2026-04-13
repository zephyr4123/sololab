"""WriterAI API 路由 — 文档管理、模板列表、PDF 导出、附件。

写作流式端点复用 /api/modules/writer/stream（通用模块流式路由）。
此文件提供 Writer 模块特有的文档操作端点。

附件隔离策略：每篇文档的附件存储在 project_id = f"writer:{doc_id}" 命名空间，
search_knowledge 工具查询时也只会命中当前文档的附件，A 文档不会污染 B 文档。
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)


def _attachment_scope(doc_id: str) -> str:
    """Namespace key for per-document attachment storage."""
    return f"writer:{doc_id}"

router = APIRouter(prefix="/writer", tags=["writer"])


def _get_document_manager(request: Request):
    """从 app state 获取 DocumentManager 实例，懒注入 db_session_factory。"""
    module_registry = getattr(request.app.state, "module_registry", None)
    if module_registry is None:
        raise HTTPException(status_code=503, detail="Module registry not available")

    writer_module = module_registry.get_module("writer")
    if writer_module is None:
        raise HTTPException(status_code=503, detail="WriterAI module not loaded")

    doc_manager = getattr(writer_module, "document_manager", None)
    if doc_manager is None:
        raise HTTPException(status_code=503, detail="DocumentManager not initialized")

    # ModuleContext 不包含 db_session_factory，从 app.state 懒注入
    if doc_manager.session_factory is None:
        db_factory = getattr(request.app.state, "db_session", None)
        if db_factory is None:
            raise HTTPException(status_code=503, detail="Database not available")
        doc_manager.session_factory = db_factory

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


class CreateDocumentPayload(BaseModel):
    template_id: str = "nature"
    language: str = "auto"
    title: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/documents")
async def create_document(request: Request, payload: CreateDocumentPayload):
    """预创建一个空的 writer 文档 shell。

    用于：用户在新对话里直接上传附件时，需要一个 doc_id 挂载附件。
    不通过 SSE agent，只调用 DocumentManager.create 生成空记录。
    返回 session_id 和 doc_id，前端把两个都存下来，后续发 chat 消息时
    沿用同一个 session_id，agent 就能通过 get_by_session 找到这篇文档。
    """
    doc_manager = _get_document_manager(request)
    session_id = payload.session_id or str(uuid.uuid4())
    try:
        doc = await doc_manager.create(
            session_id=session_id,
            template_id=payload.template_id,
            language=payload.language,
            title=payload.title,
        )
    except Exception as e:
        logger.exception("create_document failed")
        raise HTTPException(status_code=500, detail=f"Create failed: {e}")
    return doc


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
    """导出文档为 PDF 文件 — 与预览像素一致。"""
    doc_manager = _get_document_manager(request)
    doc = await doc_manager.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    import re
    from urllib.parse import quote

    from fastapi.responses import Response

    from sololab.config.settings import get_settings
    from sololab.modules.writer.export.pdf_exporter import PDFExporter

    # Resolve citation style from template
    template_registry = _get_template_registry(request)
    template = template_registry.get(doc.get("template_id", "nature"))
    citation_style = template.citation.style if template else "nature-numeric"

    settings = get_settings()
    exporter = PDFExporter(storage_path=settings.storage_path)

    try:
        pdf_bytes = await exporter.export(doc, citation_style=citation_style)
    except Exception as e:
        logger.exception("PDF export failed for doc %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")

    title = doc.get("title", "paper")
    # Strict ASCII filename for Content-Disposition + UTF-8 fallback for clients
    # that honour `filename*` (HTTP headers are latin-1 by spec).
    safe_title = re.sub(r"[^A-Za-z0-9_\s-]", "", title).replace(" ", "_")[:50] or "paper"
    filename_ascii = f"{safe_title}.pdf"
    filename_utf8 = quote(f"{title[:50]}.pdf")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename_ascii}"; '
                f"filename*=UTF-8''{filename_utf8}"
            )
        },
    )


# ── 附件（按 writer 文档隔离的内部知识库）──────────────

@router.post("/knowledge")
async def upload_knowledge(
    request: Request,
    file: UploadFile = File(...),
    doc_id: str = Query(..., description="Writer 文档 ID — 附件按此隔离"),
):
    """上传附件到当前文档。

    附件存储在 project_id = f"writer:{doc_id}" 命名空间，
    保证 A 文档的附件不会污染 B 文档的搜索结果。
    """
    document_pipeline = getattr(request.app.state, "document_pipeline", None)
    if document_pipeline is None:
        raise HTTPException(status_code=503, detail="Document pipeline not available")

    # 验证 writer 文档存在（拒绝孤儿附件）
    doc_manager = _get_document_manager(request)
    writer_doc = await doc_manager.get(doc_id)
    if writer_doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"Writer document '{doc_id}' not found. Create the document first.",
        )

    try:
        content = await file.read()
        result = await document_pipeline.upload_and_process(
            filename=file.filename or "unknown.pdf",
            content=content,
            project_id=_attachment_scope(doc_id),
        )
        return {
            "doc_id": result.get("doc_id"),
            "filename": result.get("filename"),
            "status": result.get("status", "processing"),
            "writer_doc_id": doc_id,
            "message": "Attachment uploaded. Content will be used as internal context for this document only.",
        }
    except Exception as e:
        logger.exception("Attachment upload failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/knowledge")
async def list_knowledge(
    request: Request,
    doc_id: str = Query(..., description="Writer 文档 ID — 只列出该文档的附件"),
):
    """列出指定 writer 文档的附件。"""
    db_session_factory = getattr(request.app.state, "db_session", None)
    if db_session_factory is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from sololab.models.orm import DocumentRecord
    from sqlalchemy import select

    scope = _attachment_scope(doc_id)

    async with db_session_factory() as session:
        result = await session.execute(
            select(DocumentRecord)
            .where(DocumentRecord.project_id == scope)
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


@router.delete("/knowledge/{attachment_id}")
async def delete_knowledge(request: Request, attachment_id: str):
    """删除某个附件。

    注意：这里的 attachment_id 是附件自己的 doc_id（DocumentRecord 主键），
    不是 writer 文档的 doc_id。前端从 listKnowledge 返回的条目里拿。
    """
    db_session_factory = getattr(request.app.state, "db_session", None)
    if db_session_factory is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from sololab.models.orm import DocumentRecord
    from sqlalchemy import delete as sa_delete

    async with db_session_factory() as session:
        result = await session.execute(
            sa_delete(DocumentRecord).where(DocumentRecord.doc_id == attachment_id)
        )
        await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"Attachment '{attachment_id}' not found")

    return {"status": "deleted", "doc_id": attachment_id}
