"""TemplateRegistry 单元测试。

测试模板加载、解析、查询。
"""
import tempfile
from pathlib import Path

import pytest
import yaml

from sololab.modules.writer.templates.base import CitationStyle, PaperTemplate, SectionTemplate
from sololab.modules.writer.templates.registry import TemplateRegistry


# ── Fixtures ────────────────────────────────────────────

@pytest.fixture
def sample_template_yaml():
    """返回一个有效的模板 YAML 字典。"""
    return {
        "id": "test_template",
        "name": "Test Template",
        "language_default": "en",
        "sections": [
            {"type": "abstract", "title": "Abstract", "required": True, "max_words": 200},
            {"type": "introduction", "title": "Introduction", "required": True},
            {"type": "methods", "title": "Methods", "required": True},
            {"type": "references", "title": "References", "auto_generated": True},
        ],
        "citation": {
            "style": "ieee-numeric",
            "format": "{authors}, \"{title},\" {venue}, {year}.",
            "max_authors": 3,
        },
        "page_limit": 8,
        "word_template": "test.docx",
    }


@pytest.fixture
def templates_dir(sample_template_yaml):
    """创建临时目录并写入模板 YAML。"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yaml_path = Path(tmpdir) / "test_template.yaml"
        with open(yaml_path, "w") as f:
            yaml.dump(sample_template_yaml, f)
        yield tmpdir


@pytest.fixture
def multi_templates_dir():
    """创建包含多个模板的临时目录。"""
    with tempfile.TemporaryDirectory() as tmpdir:
        for name, display in [("nature", "Nature Article"), ("cvpr", "CVPR Paper")]:
            data = {
                "id": name,
                "name": display,
                "language_default": "en",
                "sections": [
                    {"type": "abstract", "title": "Abstract", "required": True},
                ],
                "citation": {"style": f"{name}-numeric", "format": "test", "max_authors": 5},
            }
            with open(Path(tmpdir) / f"{name}.yaml", "w") as f:
                yaml.dump(data, f)
        yield tmpdir


# ── Registry 加载 ──────────────────────────────────────

class TestRegistryLoading:
    """测试 Registry 从文件系统加载模板。"""

    def test_load_single_template(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        assert len(registry.list_all()) == 1
        assert "test_template" in registry.list_ids()

    def test_load_multiple_templates(self, multi_templates_dir):
        registry = TemplateRegistry(multi_templates_dir)
        assert len(registry.list_all()) == 2
        assert set(registry.list_ids()) == {"nature", "cvpr"}

    def test_load_empty_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = TemplateRegistry(tmpdir)
            assert len(registry.list_all()) == 0

    def test_load_nonexistent_directory(self):
        registry = TemplateRegistry("/nonexistent/path")
        assert len(registry.list_all()) == 0

    def test_skip_invalid_yaml(self, templates_dir):
        # 添加一个无效 YAML 文件
        invalid_path = Path(templates_dir) / "invalid.yaml"
        invalid_path.write_text("not: valid: yaml: {{")
        registry = TemplateRegistry(templates_dir)
        # 应该只加载有效的那一个
        assert len(registry.list_all()) >= 1


# ── 模板查询 ───────────────────────────────────────────

class TestRegistryQuery:
    """测试模板查询。"""

    def test_get_existing(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        template = registry.get("test_template")
        assert template is not None
        assert template.id == "test_template"
        assert template.name == "Test Template"

    def test_get_nonexistent(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        assert registry.get("nonexistent") is None

    def test_template_sections(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        template = registry.get("test_template")
        assert len(template.sections) == 4
        assert template.sections[0].type == "abstract"
        assert template.sections[0].max_words == 200
        assert template.sections[3].auto_generated is True

    def test_template_citation(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        template = registry.get("test_template")
        assert template.citation.style == "ieee-numeric"
        assert template.citation.max_authors == 3

    def test_template_metadata(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        template = registry.get("test_template")
        assert template.page_limit == 8
        assert template.word_template == "test.docx"
        assert template.language_default == "en"


# ── 模板热重载 ─────────────────────────────────────────

class TestRegistryReload:
    """测试模板热重载。"""

    def test_reload(self, templates_dir):
        registry = TemplateRegistry(templates_dir)
        assert len(registry.list_all()) == 1

        # 添加新模板
        new_template = {
            "id": "new_template",
            "name": "New Template",
            "sections": [],
            "citation": {"style": "new", "format": "test"},
        }
        with open(Path(templates_dir) / "new.yaml", "w") as f:
            yaml.dump(new_template, f)

        registry.reload()
        assert len(registry.list_all()) == 2
        assert registry.get("new_template") is not None


# ── PaperTemplate 方法 ──────────────────────────────────

class TestPaperTemplate:
    """测试 PaperTemplate 数据模型方法。"""

    def test_get_section(self):
        template = PaperTemplate(
            id="test", name="Test",
            sections=[
                SectionTemplate(type="abstract", title="Abstract"),
                SectionTemplate(type="methods", title="Methods"),
            ],
        )
        assert template.get_section("abstract") is not None
        assert template.get_section("abstract").title == "Abstract"
        assert template.get_section("nonexistent") is None

    def test_required_sections(self):
        template = PaperTemplate(
            id="test", name="Test",
            sections=[
                SectionTemplate(type="abstract", title="Abstract", required=True),
                SectionTemplate(type="methods", title="Methods", required=True),
                SectionTemplate(type="references", title="References", auto_generated=True),
                SectionTemplate(type="appendix", title="Appendix", required=False),
            ],
        )
        required = template.required_sections()
        assert len(required) == 2
        assert all(s.type != "references" for s in required)
        assert all(s.type != "appendix" for s in required)

    def test_to_dict(self):
        template = PaperTemplate(
            id="test", name="Test",
            language_default="en",
            sections=[SectionTemplate(type="abstract", title="Abstract")],
            citation=CitationStyle(style="nature", format="test", max_authors=5),
            page_limit=8,
        )
        d = template.to_dict()
        assert d["id"] == "test"
        assert d["name"] == "Test"
        assert len(d["sections"]) == 1
        assert d["citation"]["style"] == "nature"
        assert d["page_limit"] == 8


# ── 真实模板加载 ────────────────────────────────────────

class TestRealTemplates:
    """测试加载项目中的真实模板。"""

    def test_load_nature_template(self):
        templates_dir = Path(__file__).resolve().parents[5] / "backend" / "src" / "sololab" / "modules" / "writer" / "templates"
        if not templates_dir.exists():
            pytest.skip("Template directory not found")
        registry = TemplateRegistry(templates_dir)
        nature = registry.get("nature")
        assert nature is not None
        assert nature.name == "Nature Article"
        assert nature.language_default == "en"
        assert len(nature.sections) >= 5  # abstract, intro, results, discussion, methods, ...
        assert nature.citation.style == "nature-numeric"
        assert nature.page_limit == 8
