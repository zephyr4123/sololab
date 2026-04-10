"""WriterAI 工具单元测试 — 测试工具定义和非 LLM 依赖的工具逻辑。"""
import pytest

from sololab.modules.writer.tools import WRITER_TOOLS, STREAMING_TOOLS, WriterToolContext
from sololab.modules.writer.prompts.system_prompt import build_system_prompt, build_section_writing_prompt
from sololab.modules.writer.templates.base import CitationStyle, PaperTemplate, SectionTemplate


class TestToolDefinitions:
    """测试工具 Schema 定义。"""

    def test_tool_count(self):
        assert len(WRITER_TOOLS) == 8

    def test_all_tools_have_required_fields(self):
        for tool in WRITER_TOOLS:
            assert tool["type"] == "function"
            func = tool["function"]
            assert "name" in func
            assert "description" in func
            assert "parameters" in func
            assert func["parameters"]["type"] == "object"

    def test_tool_names(self):
        names = {t["function"]["name"] for t in WRITER_TOOLS}
        expected = {
            "search_literature", "create_outline", "write_section",
            "manage_reference", "execute_code", "insert_figure",
            "search_knowledge", "get_document",
        }
        assert names == expected

    def test_streaming_tools(self):
        assert STREAMING_TOOLS == {"write_section"}

    def test_search_literature_schema(self):
        tool = next(t for t in WRITER_TOOLS if t["function"]["name"] == "search_literature")
        params = tool["function"]["parameters"]
        assert "query" in params["properties"]
        assert "query" in params["required"]

    def test_write_section_schema(self):
        tool = next(t for t in WRITER_TOOLS if t["function"]["name"] == "write_section")
        params = tool["function"]["parameters"]
        assert "section_id" in params["properties"]
        assert "section_id" in params["required"]


class TestSystemPrompt:
    """测试系统提示构建。"""

    @pytest.fixture
    def template(self):
        return PaperTemplate(
            id="test",
            name="Test Template",
            sections=[
                SectionTemplate(type="abstract", title="Abstract", max_words=200),
                SectionTemplate(type="introduction", title="Introduction"),
                SectionTemplate(type="references", title="References", auto_generated=True),
            ],
            citation=CitationStyle(style="nature-numeric", format="test format", max_authors=5),
            page_limit=8,
        )

    def test_basic_prompt(self, template):
        prompt = build_system_prompt(template)
        assert "WriterAI" in prompt
        assert "Test Template" in prompt
        assert "Abstract" in prompt
        assert "Introduction" in prompt
        assert "nature-numeric" in prompt

    def test_language_en(self, template):
        prompt = build_system_prompt(template, language="en")
        assert "English" in prompt

    def test_language_zh(self, template):
        prompt = build_system_prompt(template, language="zh")
        assert "Chinese" in prompt or "中文" in prompt

    def test_language_auto(self, template):
        prompt = build_system_prompt(template, language="auto")
        assert "Detect the language" in prompt

    def test_with_document_state(self, template):
        prompt = build_system_prompt(template, document_state="Title: My Paper\nSections: 3")
        assert "My Paper" in prompt
        assert "Current Document State" in prompt

    def test_section_guidelines(self, template):
        prompt = build_system_prompt(template)
        assert "max 200 words" in prompt  # Abstract word limit


class TestSectionWritingPrompt:
    """测试章节写作提示构建。"""

    @pytest.fixture
    def template(self):
        return PaperTemplate(
            id="nature",
            name="Nature Article",
            sections=[
                SectionTemplate(
                    type="abstract", title="Abstract",
                    max_words=200,
                    guidelines="Single paragraph, no subheadings.",
                ),
            ],
            citation=CitationStyle(style="nature-numeric", format="test", max_authors=5),
        )

    def test_basic(self, template):
        prompt = build_section_writing_prompt(
            section_type="abstract",
            section_title="Abstract",
            instructions="Focus on methodology",
            template=template,
        )
        assert "Abstract" in prompt
        assert "Focus on methodology" in prompt
        assert "200 words" in prompt
        assert "Single paragraph" in prompt

    def test_with_references(self, template):
        prompt = build_section_writing_prompt(
            section_type="abstract",
            section_title="Abstract",
            instructions="",
            template=template,
            references_summary="[1] Paper A (2020)",
        )
        assert "[1] Paper A" in prompt

    def test_with_existing_sections(self, template):
        prompt = build_section_writing_prompt(
            section_type="abstract",
            section_title="Abstract",
            instructions="",
            template=template,
            existing_sections_summary="**Introduction** (500 words): ...",
        )
        assert "Introduction" in prompt

    def test_html_output_instruction(self, template):
        prompt = build_section_writing_prompt(
            section_type="abstract",
            section_title="Abstract",
            instructions="",
            template=template,
        )
        assert "HTML" in prompt
