"""Document Pipeline - Academic PDF parsing via MinerU."""

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
    """A parsed document chunk."""

    content: str
    chunk_index: int
    page_numbers: List[int]
    content_type: str  # text | table | formula | figure_caption
    metadata: dict


@dataclass
class ParsedDocument:
    """Complete parsed document result."""

    doc_id: str
    filename: str
    title: Optional[str]
    authors: Optional[List[str]]
    chunks: List[ParsedChunk]
    raw_markdown: str
    total_pages: int


class DocumentPipeline:
    """
    Document processing pipeline: Upload -> Parse -> Chunk -> Embed -> Store

    Core parser: MinerU (opendatalab/MinerU)
    - Dual-column layout recognition
    - LaTeX formula extraction
    - Table structure extraction
    - Figure caption association
    """

    def __init__(self, llm_gateway: Any, memory_manager: Any, storage_path: str) -> None:
        self.llm_gateway = llm_gateway
        self.memory_manager = memory_manager
        self.storage_path = storage_path

    async def process(self, file_path: str, project_id: str) -> ParsedDocument:
        """Full processing pipeline."""
        raw_markdown = await self._parse_with_mineru(file_path)
        chunks = self._semantic_chunking(raw_markdown)
        metadata = await self._extract_metadata(raw_markdown)

        # TODO: Embed and store chunks to vector database
        for chunk in chunks:
            _ = chunk  # Will store via memory_manager

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
        """Parse PDF using MinerU CLI."""
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
        """Split markdown by semantic boundaries (headers, preserving tables/formulas)."""
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
        """Extract structured metadata from markdown via LLM."""
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
