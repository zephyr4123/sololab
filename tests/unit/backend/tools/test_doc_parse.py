"""DocParseTool 单元测试。"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class MockParsedChunk:
    content: str
    chunk_index: int
    page_numbers: list
    content_type: str
    metadata: dict


@dataclass
class MockParsedDocument:
    doc_id: str
    filename: str
    title: Optional[str]
    authors: Optional[List[str]]
    chunks: List[MockParsedChunk]
    raw_markdown: str
    total_pages: int


class TestDocParseTool:
    """DocParseTool 测试。"""

    @pytest.fixture
    def mock_pipeline(self):
        pipeline = MagicMock()
        pipeline.process = AsyncMock(return_value=MockParsedDocument(
            doc_id="abc12345",
            filename="paper.pdf",
            title="Test Paper Title",
            authors=["Author A", "Author B"],
            chunks=[
                MockParsedChunk(
                    content="Introduction section content",
                    chunk_index=0,
                    page_numbers=[1],
                    content_type="text",
                    metadata={},
                ),
                MockParsedChunk(
                    content="Methods section with formula \\(E=mc^2\\)",
                    chunk_index=1,
                    page_numbers=[2],
                    content_type="formula",
                    metadata={},
                ),
            ],
            raw_markdown="# Title\nIntroduction\n\n## Methods\nFormula",
            total_pages=10,
        ))
        return pipeline

    @pytest.mark.unit
    async def test_execute_success(self, mock_pipeline):
        """成功解析文档。"""
        from sololab.tools.doc_parse import DocParseTool

        tool = DocParseTool(document_pipeline=mock_pipeline)
        result = await tool.execute({"file_path": "/tmp/paper.pdf"})

        assert result.success is True
        assert result.data["doc_id"] == "abc12345"
        assert result.data["title"] == "Test Paper Title"
        assert result.data["total_chunks"] == 2
        assert len(result.data["chunks"]) == 2
        assert result.data["chunks"][0]["type"] == "text"

    @pytest.mark.unit
    async def test_execute_missing_file_path(self):
        """缺少 file_path 应返回错误。"""
        from sololab.tools.doc_parse import DocParseTool

        tool = DocParseTool()
        result = await tool.execute({})

        assert result.success is False
        assert "file_path is required" in result.error

    @pytest.mark.unit
    async def test_execute_no_pipeline(self):
        """未注入 pipeline 应返回错误。"""
        from sololab.tools.doc_parse import DocParseTool

        tool = DocParseTool()
        result = await tool.execute({"file_path": "/tmp/paper.pdf"})

        assert result.success is False
        assert "not initialized" in result.error

    @pytest.mark.unit
    async def test_set_pipeline(self, mock_pipeline):
        """set_pipeline 应正确注入 pipeline。"""
        from sololab.tools.doc_parse import DocParseTool

        tool = DocParseTool()
        assert tool._pipeline is None

        tool.set_pipeline(mock_pipeline)
        assert tool._pipeline is mock_pipeline

        result = await tool.execute({"file_path": "/tmp/paper.pdf"})
        assert result.success is True

    @pytest.mark.unit
    async def test_execute_parse_failure(self):
        """解析失败应返回错误。"""
        from sololab.tools.doc_parse import DocParseTool

        pipeline = MagicMock()
        pipeline.process = AsyncMock(side_effect=RuntimeError("MinerU crash"))

        tool = DocParseTool(document_pipeline=pipeline)
        result = await tool.execute({"file_path": "/tmp/bad.pdf"})

        assert result.success is False
        assert "MinerU crash" in result.error

    @pytest.mark.unit
    async def test_execute_file_not_found(self):
        """文件不存在应返回错误。"""
        from sololab.tools.doc_parse import DocParseTool

        pipeline = MagicMock()
        pipeline.process = AsyncMock(side_effect=FileNotFoundError("no such file"))

        tool = DocParseTool(document_pipeline=pipeline)
        result = await tool.execute({"file_path": "/nonexistent.pdf"})

        assert result.success is False
        assert "not found" in result.error.lower()

    @pytest.mark.unit
    def test_tool_metadata(self):
        """工具名称和描述应正确。"""
        from sololab.tools.doc_parse import DocParseTool

        tool = DocParseTool()
        assert tool.name == "doc_parse"
        assert "PDF" in tool.description
        assert "MinerU" in tool.description

    @pytest.mark.unit
    async def test_raw_markdown_preview_truncated(self, mock_pipeline):
        """raw_markdown_preview 应截断至 2000 字符。"""
        from sololab.tools.doc_parse import DocParseTool

        # 修改 mock 返回超长 markdown
        long_md = "x" * 5000
        mock_pipeline.process.return_value.raw_markdown = long_md

        tool = DocParseTool(document_pipeline=mock_pipeline)
        result = await tool.execute({"file_path": "/tmp/paper.pdf"})

        assert result.success is True
        assert len(result.data["raw_markdown_preview"]) == 2000
