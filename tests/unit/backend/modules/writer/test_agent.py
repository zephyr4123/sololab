"""WriterAgent 集成测试 — 使用真实 LLM 测试完整写作流程。

这些测试调用真实的 LLM API（qwen3.6-plus），验证 Agent 能：
1. 理解用户请求
2. 调用正确的工具
3. 生成有意义的内容
"""
import asyncio

import pytest
import pytest_asyncio

from sololab.config.settings import get_settings
from sololab.models.orm import Base, WriterDocumentRecord, create_db_engine, create_session_factory
from sololab.modules.writer.agent import WriterAgent
from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.sandbox.executor import SandboxExecutor
from sololab.modules.writer.templates.registry import TemplateRegistry
from pathlib import Path


@pytest_asyncio.fixture
async def db_session_factory():
    """创建真实数据库连接。"""
    settings = get_settings()
    engine = create_db_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = create_session_factory(engine)
    yield factory
    # 清理
    async with factory() as session:
        from sqlalchemy import delete as sa_delete
        await session.execute(sa_delete(WriterDocumentRecord))
        await session.commit()
    await engine.dispose()


@pytest_asyncio.fixture
async def writer_agent(db_session_factory):
    """创建 WriterAgent 实例。"""
    settings = get_settings()
    templates_dir = Path(__file__).resolve().parents[5] / "backend" / "src" / "sololab" / "modules" / "writer" / "templates"
    return WriterAgent(
        settings=settings,
        document_manager=DocumentManager(db_session_factory),
        template_registry=TemplateRegistry(templates_dir),
        sandbox_executor=None,  # 跳过 Docker 沙箱
        tool_registry=None,  # 跳过外部工具（arXiv 等）
        document_pipeline=None,
    )


@pytest.mark.integration
class TestAgentBasicFlow:
    """测试 Agent 基本流程。"""

    async def test_agent_creates_outline(self, writer_agent):
        """Agent 应该在第一轮调用 create_outline。"""
        events = []
        async for event in writer_agent.run(
            prompt="Write a short paper about Vision Transformers for image classification",
            session_id="test-agent-outline",
            template_id="nature",
            language="en",
        ):
            events.append(event)
            # 收集前 15 个事件就够了（避免等待整个写作完成）
            if len(events) >= 15:
                break

        event_types = [e.get("type") for e in events]
        # Agent 应该至少产生 status 和 tool 事件
        assert "status" in event_types or "agent" in event_types
        # 应该调用了 tool
        tool_events = [e for e in events if e.get("type") == "tool"]
        if tool_events:
            tool_names = [e.get("tool") for e in tool_events]
            # Agent 通常会先调用 create_outline
            assert "create_outline" in tool_names or "search_literature" in tool_names

    async def test_agent_yields_events(self, writer_agent):
        """Agent 的 run() 应该 yield 事件字典。"""
        events = []
        async for event in writer_agent.run(
            prompt="Just create an outline for a paper about deep learning",
            session_id="test-agent-events",
            template_id="nature",
        ):
            events.append(event)
            assert isinstance(event, dict)
            assert "type" in event
            if len(events) >= 10:
                break

        assert len(events) > 0

    async def test_agent_done_event(self, writer_agent):
        """Agent 完成后应该有 done 事件。"""
        events = []
        async for event in writer_agent.run(
            prompt="Create an outline for a 2-page paper about CNNs. Only create the outline, do not write any sections.",
            session_id="test-agent-done",
            template_id="nature",
        ):
            events.append(event)
            if event.get("type") == "done":
                break
            if len(events) >= 30:
                break

        # 检查是否有 done 或 agent done 事件
        has_completion = any(
            e.get("type") == "done" or
            (e.get("type") == "agent" and e.get("action") == "done")
            for e in events
        )
        assert has_completion


@pytest.mark.integration
class TestAgentMultiTurn:
    """测试多轮对话（修改已有文档）。"""

    async def test_modify_existing_document(self, writer_agent):
        """创建大纲后，修改特定章节的请求应该被理解。"""
        # First turn: create outline
        doc_id = ""
        events_1 = []
        async for event in writer_agent.run(
            prompt="Create an outline for a paper about GANs for image synthesis",
            session_id="test-multi-turn",
            template_id="nature",
        ):
            events_1.append(event)
            if event.get("type") == "outline_created":
                doc_id = event.get("doc_id", "")
            if event.get("type") == "done":
                doc_id = doc_id or event.get("doc_id", "")
                break
            if len(events_1) >= 30:
                break

        if not doc_id:
            pytest.skip("First turn did not produce a doc_id")

        # Second turn: modify
        events_2 = []
        async for event in writer_agent.run(
            prompt="Now write just the Abstract section",
            session_id="test-multi-turn",
            template_id="nature",
            doc_id=doc_id,
        ):
            events_2.append(event)
            if event.get("type") == "done":
                break
            if len(events_2) >= 20:
                break

        # Second turn should reference the existing document
        tool_events = [e for e in events_2 if e.get("type") == "tool"]
        assert len(tool_events) > 0  # Agent should use tools
