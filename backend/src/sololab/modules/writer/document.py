"""DocumentManager — central state management for WriterAI documents.

The document is the core artifact that all agent tools operate on.
Stored as a single PostgreSQL row with JSONB columns for sections,
references, and figures.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


class DocumentManager:
    """CRUD operations for WriterAI documents."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession] | None) -> None:
        self.session_factory = session_factory

    def _ensure_db(self) -> None:
        if self.session_factory is None:
            raise RuntimeError("Database not available — DocumentManager requires PostgreSQL")

    # ── Create ──────────────────────────────────────────────

    async def create(
        self,
        session_id: str,
        template_id: str = "nature",
        language: str = "en",
        title: str | None = None,
        sections: list[dict] | None = None,
    ) -> dict:
        """Create a new document linked to a session."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        doc_id = _new_id()
        now = _now()

        record = WriterDocumentRecord(
            doc_id=doc_id,
            session_id=session_id,
            title=title or "",
            template_id=template_id,
            language=language,
            status="draft",
            sections=sections or [],
            references=[],
            figures=[],
            metadata_json={},
            word_count=0,
            created_at=now,
            updated_at=now,
        )

        async with self.session_factory() as session:
            session.add(record)
            await session.commit()

        logger.info("Created document %s for session %s (template=%s)", doc_id, session_id, template_id)
        return self._record_to_dict(record)

    # ── Read ────────────────────────────────────────────────

    async def get(self, doc_id: str) -> dict | None:
        """Get a document by doc_id."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            return self._record_to_dict(record) if record else None

    async def get_by_session(self, session_id: str) -> dict | None:
        """Get the document associated with a session."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord)
                .where(WriterDocumentRecord.session_id == session_id)
                .order_by(WriterDocumentRecord.created_at.desc())
            )
            record = result.scalar_one_or_none()
            return self._record_to_dict(record) if record else None

    async def list_documents(self, session_id: str | None = None) -> list[dict]:
        """List all documents, optionally filtered by session_id."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            stmt = select(WriterDocumentRecord).order_by(
                WriterDocumentRecord.updated_at.desc()
            )
            if session_id:
                stmt = stmt.where(WriterDocumentRecord.session_id == session_id)
            result = await session.execute(stmt)
            records = result.scalars().all()
            return [self._record_to_dict(r) for r in records]

    # ── Section Operations ──────────────────────────────────

    async def update_section(
        self,
        doc_id: str,
        section_id: str,
        content: str | None = None,
        status: str | None = None,
        title: str | None = None,
    ) -> dict | None:
        """Update a specific section in the document."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            sections = list(record.sections) if record.sections else []
            updated = False

            for sec in sections:
                if sec.get("id") == section_id:
                    if content is not None:
                        sec["content"] = content
                        sec["word_count"] = _count_words(content)
                    if status is not None:
                        sec["status"] = status
                    if title is not None:
                        sec["title"] = title
                    updated = True
                    break

            if not updated:
                return None

            record.sections = sections
            record.word_count = sum(s.get("word_count", 0) for s in sections)
            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    async def init_sections(self, doc_id: str, sections: list[dict]) -> dict | None:
        """Initialize document sections (from outline creation)."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            record.sections = sections
            record.status = "writing"
            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    # ── Reference Operations ────────────────────────────────

    async def add_reference(self, doc_id: str, reference: dict) -> dict | None:
        """Add a reference to the document. Auto-assigns ref number."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            refs = list(record.references) if record.references else []

            # Deduplicate by title (case-insensitive)
            new_title = reference.get("title", "").lower().strip()
            for existing in refs:
                if existing.get("title", "").lower().strip() == new_title:
                    return self._record_to_dict(record)

            ref_number = len(refs) + 1
            reference["number"] = ref_number
            refs.append(reference)

            record.references = refs
            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    async def remove_reference(self, doc_id: str, ref_number: int) -> dict | None:
        """Remove a reference and renumber the remaining ones."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            refs = list(record.references) if record.references else []
            refs = [r for r in refs if r.get("number") != ref_number]

            # Renumber
            for i, ref in enumerate(refs, start=1):
                ref["number"] = i

            record.references = refs
            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    # ── Figure Operations ───────────────────────────────────

    async def add_figure(self, doc_id: str, figure: dict) -> dict | None:
        """Add a figure to the document."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            figures = list(record.figures) if record.figures else []

            if "id" not in figure:
                figure["id"] = _new_id()
            figure["order"] = len(figures) + 1

            figures.append(figure)

            record.figures = figures
            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    # ── Update Metadata ─────────────────────────────────────

    async def update(self, doc_id: str, **kwargs: Any) -> dict | None:
        """Update top-level document fields (title, status, language, template_id, etc.)."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        allowed_fields = {"title", "status", "language", "template_id", "metadata_json"}

        async with self.session_factory() as session:
            result = await session.execute(
                select(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None

            for key, value in kwargs.items():
                if key in allowed_fields:
                    setattr(record, key, value)

            record.updated_at = _now()
            await session.commit()
            await session.refresh(record)
            return self._record_to_dict(record)

    # ── Delete ──────────────────────────────────────────────

    async def delete(self, doc_id: str) -> bool:
        """Delete a document by doc_id."""
        self._ensure_db()
        from sololab.models.orm import WriterDocumentRecord

        async with self.session_factory() as session:
            result = await session.execute(
                sa_delete(WriterDocumentRecord).where(WriterDocumentRecord.doc_id == doc_id)
            )
            await session.commit()
            deleted = result.rowcount > 0
            if deleted:
                logger.info("Deleted document %s", doc_id)
            return deleted

    # ── Helpers ─────────────────────────────────────────────

    @staticmethod
    def _record_to_dict(record: Any) -> dict:
        """Convert an ORM record to a plain dict."""
        return {
            "doc_id": record.doc_id,
            "session_id": record.session_id,
            "title": record.title,
            "template_id": record.template_id,
            "language": record.language,
            "status": record.status,
            "sections": record.sections or [],
            "references": record.references or [],
            "figures": record.figures or [],
            "metadata": record.metadata_json or {},
            "word_count": record.word_count or 0,
            "created_at": record.created_at.isoformat() if record.created_at else None,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }


def _count_words(text: str) -> int:
    """Count words in text, handling both English and Chinese."""
    if not text:
        return 0
    import re

    # Strip HTML tags
    clean = re.sub(r"<[^>]+>", " ", text)
    # Count CJK characters as individual words
    cjk_count = len(re.findall(r"[\u4e00-\u9fff\u3400-\u4dbf]", clean))
    # Count English/other words
    non_cjk = re.sub(r"[\u4e00-\u9fff\u3400-\u4dbf]", " ", clean)
    eng_count = len(non_cjk.split())
    return cjk_count + eng_count
