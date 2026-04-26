"""文档处理管道 - 通过 MinerU 解析学术 PDF。"""

import glob as glob_module
import json
import logging
import os
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


class DocType(str, Enum):
    PDF = "pdf"
    MARKDOWN = "markdown"
    HTML = "html"
    DOCX = "docx"


@dataclass
class ParsedChunk:
    """解析后的文档块。"""

    content: str
    chunk_index: int
    page_numbers: List[int]
    content_type: str  # 文本 | 表格 | 公式 | 图注
    metadata: dict


@dataclass
class ParsedDocument:
    """完整的文档解析结果。"""

    doc_id: str
    filename: str
    title: Optional[str]
    authors: Optional[List[str]]
    chunks: List[ParsedChunk]
    raw_markdown: str
    total_pages: int


class DocumentPipeline:
    """文档处理管道：上传 -> 解析 -> 分块 -> 嵌入 -> 存储

    核心解析器：MinerU (opendatalab/MinerU)
    - 双栏版面识别
    - LaTeX 公式提取
    - 表格结构提取
    - 图注关联
    """

    # 分块最大字符数（超过则拆分）
    MAX_CHUNK_CHARS = 2000

    def __init__(
        self,
        llm_gateway: Any,
        db: async_sessionmaker,
        storage_path: str,
    ) -> None:
        self.llm_gateway = llm_gateway
        self.db = db
        self.storage_path = storage_path

    async def process(self, file_path: str, project_id: str, doc_id: Optional[str] = None) -> ParsedDocument:
        """完整处理管道：解析 -> 分块 -> 元数据提取 -> 嵌入存储。"""
        doc_id = doc_id or str(uuid.uuid4())[:8]

        # 更新状态：processing
        await self._update_status(doc_id, "processing")

        try:
            # 步骤 1：MinerU 解析（返回 markdown + 真实页数）
            raw_markdown, actual_page_count = await self._parse_with_mineru(file_path)

            # 步骤 2：语义分块
            chunks = self._semantic_chunking(raw_markdown)

            # 步骤 3：LLM 提取元数据（不再依赖 LLM 猜测页数）
            metadata = await self._extract_metadata(raw_markdown)
            # 使用 PyMuPDF 的真实页数，覆盖 LLM 猜测值
            metadata["total_pages"] = actual_page_count

            # 步骤 4：嵌入并存储分块到向量数据库（先清理旧分块）
            await self._embed_and_store_chunks(doc_id, chunks)

            # 步骤 5：更新文档记录
            parsed = ParsedDocument(
                doc_id=doc_id,
                filename=os.path.basename(file_path),
                title=metadata.get("title"),
                authors=metadata.get("authors"),
                chunks=chunks,
                raw_markdown=raw_markdown,
                total_pages=actual_page_count,
            )

            await self._save_document_record(parsed, metadata, project_id)
            return parsed

        except Exception as e:
            logger.error("文档处理失败: doc_id=%s, error=%s", doc_id, e)
            await self._update_status(doc_id, "failed", error_message=str(e))
            raise

    async def upload_and_process(
        self, filename: str, content: bytes, project_id: str = "default"
    ) -> tuple[str, bool]:
        """上传文件并启动处理。SHA256 去重：相同文件直接返回已有 doc_id。

        Returns:
            (doc_id, is_new) - is_new 为 False 表示去重命中，无需再次处理。
        """
        import hashlib
        from sololab.models.orm import DocumentRecord

        # SHA256 去重检查（匹配所有非失败状态）
        file_hash = hashlib.sha256(content).hexdigest()
        async with self.db() as session:
            existing = await session.execute(
                select(DocumentRecord).where(
                    DocumentRecord.file_hash == file_hash,
                    DocumentRecord.status.in_(["completed", "processing", "pending"]),
                )
            )
            existing_doc = existing.scalars().first()
            if existing_doc:
                logger.info("文档去重命中: hash=%s, 复用 doc_id=%s", file_hash[:12], existing_doc.doc_id)
                return existing_doc.doc_id, False

        doc_id = str(uuid.uuid4())[:8]

        # 保存文件
        upload_dir = os.path.join(self.storage_path, "uploads", doc_id)
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(content)

        # 创建文档记录
        doc_type = self._detect_doc_type(filename)
        async with self.db() as session:
            record = DocumentRecord(
                doc_id=doc_id,
                filename=filename,
                file_path=file_path,
                doc_type=doc_type.value,
                status="pending",
                project_id=project_id,
                file_hash=file_hash,
            )
            session.add(record)
            await session.commit()

        logger.info("文档已上传: doc_id=%s, filename=%s, hash=%s", doc_id, filename, file_hash[:12])
        return doc_id, True

    async def get_status(self, doc_id: str) -> Optional[dict]:
        """获取文档处理状态。"""
        from sololab.models.orm import DocumentRecord

        async with self.db() as session:
            result = await session.execute(
                select(DocumentRecord).where(DocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None
            return {
                "doc_id": record.doc_id,
                "filename": record.filename,
                "status": record.status,
                "title": record.title,
                "authors": record.authors,
                "total_pages": record.total_pages,
                "total_chunks": record.total_chunks,
                "error_message": record.error_message,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "completed_at": record.completed_at.isoformat() if record.completed_at else None,
            }

    async def get_chunks(self, doc_id: str) -> List[dict]:
        """获取文档的所有分块。"""
        from sololab.models.orm import DocumentChunkRecord

        async with self.db() as session:
            result = await session.execute(
                select(DocumentChunkRecord)
                .where(DocumentChunkRecord.doc_id == doc_id)
                .order_by(DocumentChunkRecord.chunk_index)
            )
            records = result.scalars().all()
            return [
                {
                    "chunk_index": r.chunk_index,
                    "content": r.content,
                    "content_type": r.content_type,
                    "page_numbers": r.page_numbers or [],
                    "metadata": r.metadata_json or {},
                }
                for r in records
            ]

    async def search(
        self, query: str, top_k: int = 5, project_id: Optional[str] = None, doc_ids: Optional[List[str]] = None
    ) -> List[dict]:
        """跨文档语义搜索。支持按 doc_ids 过滤范围。"""
        # 生成查询嵌入
        query_embeddings = await self.llm_gateway.embed([query])
        query_embedding = query_embeddings[0]
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        from sqlalchemy import text as sql_text

        async with self.db() as session:
            # 构建 SQL（可选 doc_id 过滤）
            where_clause = "dc.embedding IS NOT NULL AND d.status = 'completed'"
            params: dict = {"embedding": embedding_str, "top_k": top_k}

            if doc_ids:
                # asyncpg 需要用 ANY(:param::text[]) 格式
                placeholders = ",".join(f"'{did}'" for did in doc_ids)
                where_clause += f" AND dc.doc_id IN ({placeholders})"

            sql = sql_text(f"""
                SELECT dc.doc_id, dc.chunk_index, dc.content, dc.content_type,
                       dc.metadata_json, d.title, d.filename,
                       1 - (dc.embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM document_chunks dc
                JOIN documents d ON dc.doc_id = d.doc_id
                WHERE {where_clause}
                ORDER BY dc.embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """)

            result = await session.execute(
                sql, {"embedding": embedding_str, "top_k": top_k}
            )
            rows = result.fetchall()

            return [
                {
                    "doc_id": row.doc_id,
                    "chunk_index": row.chunk_index,
                    "content": row.content,
                    "content_type": row.content_type,
                    "metadata": row.metadata_json or {},
                    "document_title": row.title,
                    "document_filename": row.filename,
                    "similarity": float(row.similarity),
                }
                for row in rows
            ]

    # -- 内部方法 --

    async def _parse_with_mineru(self, file_path: str) -> tuple[str, int]:
        """使用 PyMuPDF 解析 PDF，提取文本和表格为 Markdown。

        Returns:
            (raw_markdown, total_pages) - 真实页数来自 PyMuPDF，不依赖 LLM 猜测。
        """
        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        total_pages = doc.page_count  # 真实页数
        pages_md = []

        for page_num, page in enumerate(doc, 1):
            text = page.get_text("text")
            if text.strip():
                pages_md.append(f"## Page {page_num}\n\n{text.strip()}")

        doc.close()

        if not pages_md:
            raise RuntimeError("PDF contains no extractable text")

        return "\n\n---\n\n".join(pages_md), total_pages

    def _semantic_chunking(self, markdown: str) -> List[ParsedChunk]:
        """按语义边界（标题）拆分 markdown，保留表格/公式完整性。"""
        import re

        sections = re.split(r"\n(?=#{1,3}\s)", markdown)
        chunks: List[ParsedChunk] = []

        for i, section in enumerate(sections):
            section = section.strip()
            if not section:
                continue
            # 如果单个 section 过长，进一步拆分
            if len(section) > self.MAX_CHUNK_CHARS:
                sub_chunks = self._split_long_section(section, i)
                chunks.extend(sub_chunks)
            else:
                content_type = self._detect_content_type(section)
                chunks.append(
                    ParsedChunk(
                        content=section,
                        chunk_index=len(chunks),
                        page_numbers=[],
                        content_type=content_type,
                        metadata={"section_index": i},
                    )
                )

        # 重新编号
        for idx, chunk in enumerate(chunks):
            chunk.chunk_index = idx

        return chunks

    def _split_long_section(self, section: str, section_index: int) -> List[ParsedChunk]:
        """拆分过长的段落。"""
        paragraphs = section.split("\n\n")
        chunks = []
        current = ""

        for para in paragraphs:
            if len(current) + len(para) > self.MAX_CHUNK_CHARS and current:
                content_type = self._detect_content_type(current)
                chunks.append(
                    ParsedChunk(
                        content=current.strip(),
                        chunk_index=0,  # 后续重新编号
                        page_numbers=[],
                        content_type=content_type,
                        metadata={"section_index": section_index, "split": True},
                    )
                )
                current = para
            else:
                current = current + "\n\n" + para if current else para

        if current.strip():
            content_type = self._detect_content_type(current)
            chunks.append(
                ParsedChunk(
                    content=current.strip(),
                    chunk_index=0,
                    page_numbers=[],
                    content_type=content_type,
                    metadata={"section_index": section_index, "split": True},
                )
            )

        return chunks

    async def _extract_metadata(self, markdown: str) -> dict:
        """通过 LLM 从 markdown 中提取结构化元数据。

        注意：total_pages 不从 LLM 提取，由 _parse_with_mineru 返回的真实值覆盖。
        """
        try:
            response = await self.llm_gateway.generate(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Extract metadata from this academic paper. "
                            "Return JSON with: title, authors, abstract, keywords, year.\n"
                            "Do NOT guess total_pages - that will be determined separately.\n\n"
                            f"{markdown[:3000]}"
                        ),
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            return json.loads(response["content"])
        except Exception as e:
            logger.warning("元数据提取失败: %s", e)
            return {}

    async def _embed_and_store_chunks(self, doc_id: str, chunks: List[ParsedChunk]) -> None:
        """批量嵌入并存储分块到向量数据库。先清理旧分块，避免重复。"""
        from sololab.models.orm import DocumentChunkRecord
        from sqlalchemy import delete as sql_delete

        if not chunks:
            return

        # 批量嵌入（每次最多 20 个，避免 token 超限）
        batch_size = 6  # 阿里云 text-embedding-v4 限制 batch <= 10，留余量
        all_embeddings = []

        for i in range(0, len(chunks), batch_size):
            batch_texts = [c.content[:8000] for c in chunks[i:i + batch_size]]
            try:
                embeddings = await self.llm_gateway.embed(batch_texts)
                all_embeddings.extend(embeddings)
            except Exception as e:
                logger.warning("批量嵌入失败 (batch %d): %s", i // batch_size, e)
                # 使用空嵌入填充
                all_embeddings.extend([None] * len(batch_texts))

        # 存储到数据库（先清理旧分块，再插入新分块）
        async with self.db() as session:
            await session.execute(
                sql_delete(DocumentChunkRecord).where(DocumentChunkRecord.doc_id == doc_id)
            )
            for idx, chunk in enumerate(chunks):
                embedding = all_embeddings[idx] if idx < len(all_embeddings) else None
                record = DocumentChunkRecord(
                    doc_id=doc_id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    content_type=chunk.content_type,
                    embedding=embedding,
                    page_numbers=chunk.page_numbers,
                    metadata_json=chunk.metadata,
                )
                session.add(record)
            await session.commit()

        logger.info("文档分块已存储: doc_id=%s, chunks=%d", doc_id, len(chunks))

    async def _save_document_record(
        self, parsed: ParsedDocument, metadata: dict, project_id: str
    ) -> None:
        """保存文档记录到数据库。"""
        from sololab.models.orm import DocumentRecord

        async with self.db() as session:
            await session.execute(
                update(DocumentRecord)
                .where(DocumentRecord.doc_id == parsed.doc_id)
                .values(
                    title=parsed.title,
                    authors=metadata.get("authors"),
                    abstract=metadata.get("abstract"),
                    keywords=metadata.get("keywords"),
                    year=metadata.get("year"),
                    total_pages=parsed.total_pages,
                    total_chunks=len(parsed.chunks),
                    raw_markdown=parsed.raw_markdown,
                    status="completed",
                    completed_at=datetime.utcnow(),
                )
            )
            await session.commit()

        logger.info("文档记录已更新: doc_id=%s, title=%s", parsed.doc_id, parsed.title)

    async def _update_status(
        self, doc_id: str, status: str, error_message: Optional[str] = None
    ) -> None:
        """更新文档处理状态。"""
        from sololab.models.orm import DocumentRecord

        async with self.db() as session:
            values = {"status": status}
            if error_message:
                values["error_message"] = error_message
            await session.execute(
                update(DocumentRecord)
                .where(DocumentRecord.doc_id == doc_id)
                .values(**values)
            )
            await session.commit()

    @staticmethod
    def _detect_content_type(text: str) -> str:
        if "\\(" in text or "\\[" in text or "$$" in text:
            return "formula"
        if "|" in text and "---" in text:
            return "table"
        return "text"

    @staticmethod
    def _detect_doc_type(filename: str) -> DocType:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        return {
            "pdf": DocType.PDF,
            "md": DocType.MARKDOWN,
            "html": DocType.HTML,
            "htm": DocType.HTML,
            "docx": DocType.DOCX,
        }.get(ext, DocType.PDF)

    @staticmethod
    def _generate_id() -> str:
        return str(uuid.uuid4())[:8]
