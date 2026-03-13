"""文档处理管道 - 通过 MinerU 解析学术 PDF。"""

import glob
import json
import os
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Any, List, Optional


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

    def __init__(self, llm_gateway: Any, memory_manager: Any, storage_path: str) -> None:
        self.llm_gateway = llm_gateway
        self.memory_manager = memory_manager
        self.storage_path = storage_path

    async def process(self, file_path: str, project_id: str) -> ParsedDocument:
        """完整处理管道。"""
        raw_markdown = await self._parse_with_mineru(file_path)
        chunks = self._semantic_chunking(raw_markdown)
        metadata = await self._extract_metadata(raw_markdown)

        # TODO: 嵌入并存储分块到向量数据库
        for chunk in chunks:
            _ = chunk  # 将通过 memory_manager 存储

        return ParsedDocument(
            doc_id=self._generate_id(),
            filename=os.path.basename(file_path),
            title=metadata.get("title"),
            authors=metadata.get("authors"),
            chunks=chunks,
            raw_markdown=raw_markdown,
            total_pages=metadata.get("total_pages", 0),
        )

    async def _parse_with_mineru(self, file_path: str) -> str:
        """使用 MinerU CLI 解析 PDF。"""
        output_dir = os.path.join(self.storage_path, "parsed", self._generate_id())
        os.makedirs(output_dir, exist_ok=True)

        result = subprocess.run(
            ["magic-pdf", "-p", file_path, "-o", output_dir, "-m", "auto"],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            raise RuntimeError(f"MinerU parsing failed: {result.stderr}")

        md_files = glob.glob(os.path.join(output_dir, "**/*.md"), recursive=True)
        if not md_files:
            raise RuntimeError("MinerU produced no output")

        with open(md_files[0], "r", encoding="utf-8") as f:
            return f.read()

    def _semantic_chunking(self, markdown: str) -> List[ParsedChunk]:
        """按语义边界（标题）拆分 markdown，保留表格/公式完整性。"""
        import re

        sections = re.split(r"\n(?=#{1,3}\s)", markdown)
        chunks: List[ParsedChunk] = []

        for i, section in enumerate(sections):
            section = section.strip()
            if not section:
                continue
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

        return chunks

    async def _extract_metadata(self, markdown: str) -> dict:
        """通过 LLM 从 markdown 中提取结构化元数据。"""
        response = await self.llm_gateway.generate(
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Extract metadata from this academic paper. "
                        "Return JSON with: title, authors, abstract, keywords, year.\n\n"
                        f"{markdown[:3000]}"
                    ),
                }
            ],
            model="deepseek/deepseek-chat",
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        return json.loads(response["content"])

    @staticmethod
    def _detect_content_type(text: str) -> str:
        if "\\(" in text or "\\[" in text or "$$" in text:
            return "formula"
        if "|" in text and "---" in text:
            return "table"
        return "text"

    @staticmethod
    def _generate_id() -> str:
        import uuid

        return str(uuid.uuid4())[:8]
