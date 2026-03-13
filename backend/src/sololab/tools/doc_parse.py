"""基于 MinerU 管道的文档解析工具。"""

from sololab.core.tool_registry import ToolBase, ToolResult


class DocParseTool(ToolBase):
    """使用 MinerU 解析学术 PDF，进行全文提取。"""

    @property
    def name(self) -> str:
        return "doc_parse"

    @property
    def description(self) -> str:
        return "Parse academic PDF documents, extracting text, tables, formulas, and figures"

    async def execute(self, params: dict) -> ToolResult:
        """执行文档解析。"""
        file_path = params.get("file_path", "")
        if not file_path:
            return ToolResult(success=False, data={}, error="file_path is required")

        # TODO: 委托给 DocumentPipeline
        return ToolResult(
            success=True,
            data={"file_path": file_path, "status": "pending"},
        )
