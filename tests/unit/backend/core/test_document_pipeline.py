"""文档处理管道单元测试。"""

import pytest


class TestDocumentPipeline:
    """DocumentPipeline 测试。"""

    @pytest.mark.unit
    def test_detect_content_type_formula(self):
        """检测公式内容类型。"""
        from sololab.core.document_pipeline import DocumentPipeline

        assert DocumentPipeline._detect_content_type("E = mc^2 \\(x\\)") == "formula"
        assert DocumentPipeline._detect_content_type("$$\\int f(x) dx$$") == "formula"

    @pytest.mark.unit
    def test_detect_content_type_table(self):
        """检测表格内容类型。"""
        from sololab.core.document_pipeline import DocumentPipeline

        text = "| Name | Value |\n| --- | --- |\n| A | 1 |"
        assert DocumentPipeline._detect_content_type(text) == "table"

    @pytest.mark.unit
    def test_detect_content_type_text(self):
        """普通文本类型。"""
        from sololab.core.document_pipeline import DocumentPipeline

        assert DocumentPipeline._detect_content_type("This is plain text.") == "text"

    @pytest.mark.unit
    def test_detect_doc_type(self):
        """检测文档类型。"""
        from sololab.core.document_pipeline import DocumentPipeline, DocType

        assert DocumentPipeline._detect_doc_type("paper.pdf") == DocType.PDF
        assert DocumentPipeline._detect_doc_type("notes.md") == DocType.MARKDOWN
        assert DocumentPipeline._detect_doc_type("page.html") == DocType.HTML
        assert DocumentPipeline._detect_doc_type("doc.docx") == DocType.DOCX
        assert DocumentPipeline._detect_doc_type("unknown") == DocType.PDF

    @pytest.mark.unit
    def test_semantic_chunking_basic(self):
        """基本语义分块。"""
        from sololab.core.document_pipeline import DocumentPipeline

        pipeline = DocumentPipeline(llm_gateway=None, db=None, storage_path="/tmp")
        markdown = "# Title\nContent here.\n\n## Section 1\nMore content.\n\n## Section 2\nFinal content."
        chunks = pipeline._semantic_chunking(markdown)
        assert len(chunks) >= 2
        assert all(c.content for c in chunks)

    @pytest.mark.unit
    def test_semantic_chunking_preserves_order(self):
        """分块应保持顺序。"""
        from sololab.core.document_pipeline import DocumentPipeline

        pipeline = DocumentPipeline(llm_gateway=None, db=None, storage_path="/tmp")
        markdown = "# A\nFirst\n\n## B\nSecond\n\n## C\nThird"
        chunks = pipeline._semantic_chunking(markdown)
        indices = [c.chunk_index for c in chunks]
        assert indices == sorted(indices)

    @pytest.mark.unit
    def test_long_section_split(self):
        """过长的段落应被拆分。"""
        from sololab.core.document_pipeline import DocumentPipeline

        pipeline = DocumentPipeline(llm_gateway=None, db=None, storage_path="/tmp")
        # 创建一个超过 MAX_CHUNK_CHARS 的段落
        long_section = "# Long\n\n" + "\n\n".join(["Paragraph " + "x" * 500 for _ in range(6)])
        chunks = pipeline._semantic_chunking(long_section)
        assert len(chunks) >= 2
        assert all(len(c.content) <= pipeline.MAX_CHUNK_CHARS + 500 for c in chunks)

    @pytest.mark.unit
    def test_generate_id_format(self):
        """生成的 ID 格式正确。"""
        from sololab.core.document_pipeline import DocumentPipeline

        id1 = DocumentPipeline._generate_id()
        id2 = DocumentPipeline._generate_id()
        assert len(id1) == 8
        assert id1 != id2


class TestDocType:
    """DocType 枚举测试。"""

    @pytest.mark.unit
    def test_doctype_values(self):
        """DocType 枚举值应正确。"""
        from sololab.core.document_pipeline import DocType

        assert DocType.PDF.value == "pdf"
        assert DocType.MARKDOWN.value == "markdown"
        assert DocType.HTML.value == "html"
        assert DocType.DOCX.value == "docx"
