"""CitationFormatter 单元测试 — 测试四种引用格式。"""
import pytest

from sololab.modules.writer.export.citation_formatter import (
    SUPPORTED_STYLES,
    format_reference,
    format_reference_list,
)


@pytest.fixture
def sample_ref():
    return {
        "number": 1,
        "title": "Attention Is All You Need",
        "authors": ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J.", "Jones, L.", "Gomez, A."],
        "year": 2017,
        "venue": "NeurIPS",
        "volume": "30",
        "pages": "5998-6008",
        "doi": "10.5555/3295222.3295349",
    }


@pytest.fixture
def minimal_ref():
    return {"number": 1, "title": "Some Paper", "authors": [], "year": 2024, "venue": "arXiv"}


class TestNatureFormat:
    def test_full_reference(self, sample_ref):
        result = format_reference(sample_ref, "nature-numeric")
        assert "Attention Is All You Need" in result
        assert "Vaswani" in result
        assert "2017" in result
        assert "NeurIPS" in result

    def test_et_al(self, sample_ref):
        result = format_reference(sample_ref, "nature-numeric")
        assert "et al." in result  # 6 authors > max 5

    def test_no_authors(self, minimal_ref):
        result = format_reference(minimal_ref, "nature-numeric")
        assert "Unknown" in result

    def test_with_doi(self, sample_ref):
        result = format_reference(sample_ref, "nature-numeric")
        assert "doi:" in result


class TestIEEEFormat:
    def test_full_reference(self, sample_ref):
        result = format_reference(sample_ref, "ieee-numeric")
        assert '"Attention Is All You Need,"' in result
        assert "2017" in result

    def test_single_author(self):
        ref = {"title": "Test", "authors": ["Smith, J."], "year": 2020, "venue": "IEEE"}
        result = format_reference(ref, "ieee-numeric")
        assert "Smith, J." in result


class TestAPAFormat:
    def test_full_reference(self, sample_ref):
        result = format_reference(sample_ref, "apa-author-year")
        assert "(2017)" in result
        assert "Attention Is All You Need" in result

    def test_no_year(self):
        ref = {"title": "Test", "authors": ["Smith"], "venue": "J"}
        result = format_reference(ref, "apa-author-year")
        assert "(n.d.)" in result


class TestGBT7714Format:
    def test_full_reference(self):
        ref = {
            "title": "基于深度学习的图像分割",
            "authors": ["张三", "李四", "王五", "赵六"],
            "year": 2023,
            "venue": "计算机学报",
            "volume": "46",
            "pages": "1-15",
        }
        result = format_reference(ref, "gbt-7714")
        assert "张三" in result
        assert "等" in result  # 4 authors > max 3
        assert "[J]" in result
        assert "2023" in result

    def test_no_authors_chinese(self):
        ref = {"title": "无作者论文", "authors": [], "year": 2020, "venue": "测试"}
        result = format_reference(ref, "gbt-7714")
        assert "佚名" in result


class TestReferenceList:
    def test_format_list(self):
        refs = [
            {"number": 1, "title": "Paper A", "authors": ["Author A"], "year": 2020, "venue": "J1"},
            {"number": 2, "title": "Paper B", "authors": ["Author B"], "year": 2021, "venue": "J2"},
        ]
        result = format_reference_list(refs, "nature-numeric")
        assert "[1]" in result
        assert "[2]" in result
        assert "Paper A" in result
        assert "Paper B" in result

    def test_empty_list(self):
        result = format_reference_list([], "nature-numeric")
        assert result == ""


class TestSupportedStyles:
    def test_all_styles_exist(self):
        assert "nature-numeric" in SUPPORTED_STYLES
        assert "ieee-numeric" in SUPPORTED_STYLES
        assert "apa-author-year" in SUPPORTED_STYLES
        assert "gbt-7714" in SUPPORTED_STYLES

    def test_unknown_style_falls_back(self):
        ref = {"title": "Test", "authors": ["A"], "year": 2020, "venue": "X"}
        result = format_reference(ref, "unknown-style")
        assert "Test" in result  # Falls back to nature
