"""工具管理的 API 路由。"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/tools")
async def list_tools(request: Request) -> list:
    """列出所有已注册的工具。"""
    registry = request.app.state.tool_registry
    return registry.list_tools()


@router.post("/tools/{tool_name}/test")
async def test_tool(tool_name: str, request: Request) -> dict:
    """测试工具。"""
    registry = request.app.state.tool_registry
    tool = registry.get_tool(tool_name)
    if not tool:
        raise HTTPException(404, f"Tool '{tool_name}' not found")
    result = await tool.execute({"test": True})
    return {"tool": tool_name, "status": "ok" if result.success else "failed", "data": result.data}
