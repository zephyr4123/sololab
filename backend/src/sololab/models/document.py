"""Document-related data models."""

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel


class DocType(str, Enum):
    PDF = "pdf"
    MARKDOWN = "markdown"
    HTML = "html"
    DOCX = "docx"


class ParsedChunk(BaseModel):
    """A parsed document chunk."""

    content: str
    chunk_index: int
    page_numbers: List[int] = []
    content_type: str  # text | table | formula | figure_caption
    metadata: Dict = {}


class ParsedDocument(BaseModel):
    """Complete parsed document."""

    doc_id: str
    filename: str
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    total_pages: int = 0
    chunks: List[ParsedChunk] = []
    status: str = "pending"  # pending | processing | completed | failed
