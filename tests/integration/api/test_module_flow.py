"""完整模块执行流程的集成测试 —— 使用真实 Redis。"""

import pytest
import httpx
import redis.asyncio as aioredis

from sololab.core.task_state_manager import TaskStateManager


class TestModuleFlow:
    """测试 API → 核心服务的完整流程。"""

    @pytest.fixture
    async def app_client(self):
        """带 lifespan 的 httpx client。"""
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client

    @pytest.mark.integration
    async def test_full_api_flow(self, app_client):
        """完整 API 流程：列出模块 → 获取配置 → 列出提供商 → 测试提供商。"""
        # 1. 列出模块
        resp = await app_client.get("/api/modules")
        assert resp.status_code == 200
        modules = resp.json()
        assert any(m["id"] == "ideaspark" for m in modules)

        # 2. 获取模块配置
        resp = await app_client.get("/api/modules/ideaspark/config")
        assert resp.status_code == 200
        assert resp.json()["name"] == "IdeaSpark"

        # 3. 列出提供商
        resp = await app_client.get("/api/providers")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        # 4. 测试 LLM 提供商连通性
        resp = await app_client.post("/api/providers/llm/test")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # 5. 测试 Embedding 提供商连通性
        resp = await app_client.post("/api/providers/embedding/test")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["dim"] == 1024

    @pytest.mark.integration
    async def test_module_unload_reload(self, app_client):
        """卸载并重新加载模块。"""
        # 卸载
        resp = await app_client.delete("/api/modules/ideaspark/unload")
        assert resp.status_code == 200

        # 验证已卸载
        resp = await app_client.get("/api/modules")
        assert all(m["id"] != "ideaspark" for m in resp.json())

        # 重新加载
        resp = await app_client.post("/api/modules/ideaspark/load")
        assert resp.status_code == 200
        assert resp.json()["status"] == "loaded"

        # 验证已加载
        resp = await app_client.get("/api/modules")
        assert any(m["id"] == "ideaspark" for m in resp.json())

    @pytest.mark.integration
    async def test_task_lifecycle_with_redis(self):
        """使用真实 Redis 测试任务完整生命周期。"""
        r = aioredis.from_url("redis://localhost:6379/0", decode_responses=False)
        try:
            mgr = TaskStateManager(r)

            # 创建
            task_id = await mgr.create_task("test", {"input": "integration test"})
            state = await mgr.get_task_state(task_id)
            assert state["status"] == "pending"

            # 追加事件
            await mgr.append_event(task_id, "text", {"content": "step 1"})
            await mgr.append_event(task_id, "text", {"content": "step 2"})
            await mgr.append_event(task_id, "done", {"summary": "done"})

            # 断线恢复
            events = await mgr.get_events_after(task_id, 1)
            assert len(events) == 2
            assert events[0]["data"]["content"] == "step 2"

            # 完成
            await mgr.complete_task(task_id, {"ideas": []})
            state = await mgr.get_task_state(task_id)
            assert state["status"] == "completed"

            # 清理
            await r.delete(f"task:{task_id}", f"task:{task_id}:events", f"task:{task_id}:seq")
        finally:
            await r.aclose()
