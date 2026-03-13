"""工具管理的 API 路由。"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/tools")
async def list_tools() -> list:
    """列出所有已注册的工具。"""
    # TODO: 查询 ToolRegistry
    return []


@router.post("/tools/{tool_name}/test")
async def test_tool(tool_name: str) -> dict:
    """测试工具。"""
    # TODO: 使用测试查询执行工具
    return {"tool": tool_name, "status": "unknown"}
