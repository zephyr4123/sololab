"""文档相关数据模型。"""

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel


class DocType(str, Enum):
    PDF = "pdf"
    MARKDOWN = "markdown"
    HTML = "html"
    DOCX = "docx"


class ParsedChunk(BaseModel):
    """解析后的文档块。"""

    content: str
    chunk_index: int
    page_numbers: List[int] = []
    content_type: str  # 文本 | 表格 | 公式 | 图注
    metadata: Dict = {}


class ParsedDocument(BaseModel):
    """完整的解析文档。"""

    doc_id: str
    filename: str
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    total_pages: int = 0
    chunks: List[ParsedChunk] = []
    status: str = "pending"  # 待处理 | 处理中 | 已完成 | 失败
