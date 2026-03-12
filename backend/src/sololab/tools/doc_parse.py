"""Document parsing tool using MinerU pipeline."""

from sololab.core.tool_registry import ToolBase, ToolResult


class DocParseTool(ToolBase):
    """Parse academic PDFs using MinerU for full-text extraction."""

    @property
    def name(self) -> str:
        return "doc_parse"

    @property
    def description(self) -> str:
        return "Parse academic PDF documents, extracting text, tables, formulas, and figures"

    async def execute(self, params: dict) -> ToolResult:
        """Execute document parsing."""
        file_path = params.get("file_path", "")
        if not file_path:
            return ToolResult(success=False, data={}, error="file_path is required")

        # TODO: Delegate to DocumentPipeline
        return ToolResult(
            success=True,
            data={"file_path": file_path, "status": "pending"},
        )
