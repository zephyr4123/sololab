"""DocumentManager 单元测试。

测试文档 CRUD 操作、章节管理、引用管理、图表管理。
使用真实 PostgreSQL 数据库。
"""
import pytest
import pytest_asyncio

from sololab.config.settings import get_settings
from sololab.models.orm import Base, WriterDocumentRecord, create_db_engine, create_session_factory
from sololab.modules.writer.document import DocumentManager, _count_words


# ── Fixtures ────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session_factory():
    """创建真实数据库连接和 writer_documents 表。"""
    settings = get_settings()
    engine = create_db_engine(settings.database_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = create_session_factory(engine)
    yield factory

    # 清理测试数据
    async with factory() as session:
        from sqlalchemy import delete as sa_delete
        await session.execute(sa_delete(WriterDocumentRecord))
        await session.commit()

    await engine.dispose()


@pytest_asyncio.fixture
async def doc_manager(db_session_factory):
    """创建 DocumentManager 实例。"""
    return DocumentManager(db_session_factory)


# ── 字数统计 ────────────────────────────────────────────

class TestWordCount:
    """测试 _count_words 辅助函数。"""

    def test_english_text(self):
        assert _count_words("Hello world this is a test") == 6

    def test_chinese_text(self):
        assert _count_words("这是一个测试") == 6

    def test_mixed_text(self):
        count = _count_words("Hello 世界 this is 测试")
        assert count > 0

    def test_html_stripping(self):
        assert _count_words("<p>Hello <b>world</b></p>") == 2

    def test_empty(self):
        assert _count_words("") == 0
        assert _count_words(None) == 0


# ── 文档创建 ────────────────────────────────────────────

@pytest.mark.integration
class TestDocumentCreate:
    """测试文档创建。"""

    async def test_create_basic(self, doc_manager):
        doc = await doc_manager.create(
            session_id="test-session-1",
            template_id="nature",
            language="en",
            title="Test Paper",
        )
        assert doc["doc_id"] is not None
        assert doc["session_id"] == "test-session-1"
        assert doc["template_id"] == "nature"
        assert doc["language"] == "en"
        assert doc["title"] == "Test Paper"
        assert doc["status"] == "draft"
        assert doc["sections"] == []
        assert doc["references"] == []
        assert doc["figures"] == []
        assert doc["word_count"] == 0

    async def test_create_with_sections(self, doc_manager):
        sections = [
            {"id": "sec_1", "type": "abstract", "title": "Abstract", "content": "", "order": 0, "status": "empty", "word_count": 0},
            {"id": "sec_2", "type": "introduction", "title": "Introduction", "content": "", "order": 1, "status": "empty", "word_count": 0},
        ]
        doc = await doc_manager.create(
            session_id="test-session-2",
            template_id="cvpr",
            language="en",
            sections=sections,
        )
        assert len(doc["sections"]) == 2
        assert doc["sections"][0]["type"] == "abstract"

    async def test_create_defaults(self, doc_manager):
        doc = await doc_manager.create(session_id="test-session-3")
        assert doc["template_id"] == "nature"
        assert doc["language"] == "en"


# ── 文档读取 ────────────────────────────────────────────

@pytest.mark.integration
class TestDocumentRead:
    """测试文档读取。"""

    async def test_get_by_id(self, doc_manager):
        created = await doc_manager.create(session_id="test-read-1", title="Read Test")
        fetched = await doc_manager.get(created["doc_id"])
        assert fetched is not None
        assert fetched["doc_id"] == created["doc_id"]
        assert fetched["title"] == "Read Test"

    async def test_get_nonexistent(self, doc_manager):
        result = await doc_manager.get("nonexistent-id")
        assert result is None

    async def test_get_by_session(self, doc_manager):
        await doc_manager.create(session_id="test-read-session", title="Session Doc")
        fetched = await doc_manager.get_by_session("test-read-session")
        assert fetched is not None
        assert fetched["session_id"] == "test-read-session"

    async def test_list_documents(self, doc_manager):
        await doc_manager.create(session_id="list-1", title="Doc 1")
        await doc_manager.create(session_id="list-2", title="Doc 2")
        docs = await doc_manager.list_documents()
        assert len(docs) >= 2

    async def test_list_documents_filtered(self, doc_manager):
        await doc_manager.create(session_id="filter-session", title="Filtered")
        await doc_manager.create(session_id="other-session", title="Other")
        docs = await doc_manager.list_documents(session_id="filter-session")
        assert all(d["session_id"] == "filter-session" for d in docs)


# ── 章节操作 ────────────────────────────────────────────

@pytest.mark.integration
class TestSectionOperations:
    """测试章节 CRUD。"""

    async def test_init_sections(self, doc_manager):
        doc = await doc_manager.create(session_id="sec-init")
        sections = [
            {"id": "s1", "type": "abstract", "title": "Abstract", "content": "", "order": 0, "status": "empty", "word_count": 0},
            {"id": "s2", "type": "introduction", "title": "Introduction", "content": "", "order": 1, "status": "empty", "word_count": 0},
        ]
        updated = await doc_manager.init_sections(doc["doc_id"], sections)
        assert updated is not None
        assert len(updated["sections"]) == 2
        assert updated["status"] == "writing"

    async def test_update_section_content(self, doc_manager):
        doc = await doc_manager.create(session_id="sec-update")
        sections = [
            {"id": "s1", "type": "abstract", "title": "Abstract", "content": "", "order": 0, "status": "empty", "word_count": 0},
        ]
        await doc_manager.init_sections(doc["doc_id"], sections)

        updated = await doc_manager.update_section(
            doc["doc_id"], "s1",
            content="<p>This is the abstract content with multiple words.</p>",
            status="complete",
        )
        assert updated is not None
        assert updated["sections"][0]["status"] == "complete"
        assert updated["sections"][0]["word_count"] > 0
        assert updated["word_count"] > 0

    async def test_update_nonexistent_section(self, doc_manager):
        doc = await doc_manager.create(session_id="sec-nonexist")
        result = await doc_manager.update_section(doc["doc_id"], "nonexistent", content="test")
        assert result is None


# ── 引用操作 ────────────────────────────────────────────

@pytest.mark.integration
class TestReferenceOperations:
    """测试引用管理。"""

    async def test_add_reference(self, doc_manager):
        doc = await doc_manager.create(session_id="ref-add")
        updated = await doc_manager.add_reference(doc["doc_id"], {
            "title": "Attention Is All You Need",
            "authors": ["Vaswani, A.", "Shazeer, N."],
            "year": 2017,
            "venue": "NeurIPS",
        })
        assert updated is not None
        assert len(updated["references"]) == 1
        assert updated["references"][0]["number"] == 1
        assert updated["references"][0]["title"] == "Attention Is All You Need"

    async def test_add_multiple_references(self, doc_manager):
        doc = await doc_manager.create(session_id="ref-multi")
        await doc_manager.add_reference(doc["doc_id"], {"title": "Paper 1", "authors": [], "year": 2020, "venue": "CVPR"})
        updated = await doc_manager.add_reference(doc["doc_id"], {"title": "Paper 2", "authors": [], "year": 2021, "venue": "ICCV"})
        assert len(updated["references"]) == 2
        assert updated["references"][0]["number"] == 1
        assert updated["references"][1]["number"] == 2

    async def test_deduplicate_reference(self, doc_manager):
        doc = await doc_manager.create(session_id="ref-dedup")
        await doc_manager.add_reference(doc["doc_id"], {"title": "Same Paper", "authors": [], "year": 2020, "venue": "A"})
        updated = await doc_manager.add_reference(doc["doc_id"], {"title": "same paper", "authors": [], "year": 2020, "venue": "B"})
        assert len(updated["references"]) == 1  # Deduplication by title

    async def test_remove_reference(self, doc_manager):
        doc = await doc_manager.create(session_id="ref-remove")
        await doc_manager.add_reference(doc["doc_id"], {"title": "Paper 1", "authors": [], "year": 2020, "venue": "A"})
        await doc_manager.add_reference(doc["doc_id"], {"title": "Paper 2", "authors": [], "year": 2021, "venue": "B"})
        await doc_manager.add_reference(doc["doc_id"], {"title": "Paper 3", "authors": [], "year": 2022, "venue": "C"})

        updated = await doc_manager.remove_reference(doc["doc_id"], ref_number=2)
        assert len(updated["references"]) == 2
        # Verify renumbering
        assert updated["references"][0]["number"] == 1
        assert updated["references"][0]["title"] == "Paper 1"
        assert updated["references"][1]["number"] == 2
        assert updated["references"][1]["title"] == "Paper 3"


# ── 图表操作 ────────────────────────────────────────────

@pytest.mark.integration
class TestFigureOperations:
    """测试图表管理。"""

    async def test_add_figure(self, doc_manager):
        doc = await doc_manager.create(session_id="fig-add")
        updated = await doc_manager.add_figure(doc["doc_id"], {
            "section_id": "s1",
            "caption": "Training loss curve",
            "url": "/storage/writer/test/figures/fig1.png",
            "code": "import matplotlib.pyplot as plt\nplt.plot([1,2,3])",
        })
        assert updated is not None
        assert len(updated["figures"]) == 1
        assert updated["figures"][0]["caption"] == "Training loss curve"
        assert updated["figures"][0]["order"] == 1
        assert "id" in updated["figures"][0]


# ── 文档更新与删除 ──────────────────────────────────────

@pytest.mark.integration
class TestDocumentUpdateDelete:
    """测试文档更新和删除。"""

    async def test_update_title(self, doc_manager):
        doc = await doc_manager.create(session_id="upd-title", title="Old Title")
        updated = await doc_manager.update(doc["doc_id"], title="New Title")
        assert updated["title"] == "New Title"

    async def test_update_status(self, doc_manager):
        doc = await doc_manager.create(session_id="upd-status")
        updated = await doc_manager.update(doc["doc_id"], status="complete")
        assert updated["status"] == "complete"

    async def test_delete(self, doc_manager):
        doc = await doc_manager.create(session_id="del-test")
        deleted = await doc_manager.delete(doc["doc_id"])
        assert deleted is True
        fetched = await doc_manager.get(doc["doc_id"])
        assert fetched is None

    async def test_delete_nonexistent(self, doc_manager):
        deleted = await doc_manager.delete("nonexistent")
        assert deleted is False
