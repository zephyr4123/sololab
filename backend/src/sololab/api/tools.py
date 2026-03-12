"""API routes for tool management."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/tools")
async def list_tools() -> list:
    """List all registered tools."""
    # TODO: Query ToolRegistry
    return []


@router.post("/tools/{tool_name}/test")
async def test_tool(tool_name: str) -> dict:
    """Test a tool."""
    # TODO: Execute tool with test query
    return {"tool": tool_name, "status": "unknown"}
