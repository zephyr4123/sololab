"""基于 MinerU 管道的文档解析工具。"""

import logging

from sololab.core.tool_registry import ToolBase, ToolResult

logger = logging.getLogger(__name__)


class DocParseTool(ToolBase):
    """Parse academic PDFs via MinerU, extracting text/tables/formulas.

    Delegates to DocumentPipeline. PDF / Markdown / HTML / DOCX supported.
    """

    parameters_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the document file (PDF, MD, HTML, DOCX).",
            },
            "project_id": {
                "type": "string",
                "description": "Project namespace for indexing the parsed chunks.",
                "default": "default",
            },
        },
        "required": ["file_path"],
    }

    def __init__(self, document_pipeline=None) -> None:
        self._pipeline = document_pipeline

    def set_pipeline(self, pipeline) -> None:
        """Lazy injection — pipeline is wired during app lifespan."""
        self._pipeline = pipeline

    @property
    def name(self) -> str:
        return "doc_parse"

    @property
    def description(self) -> str:
        return (
            "Parse academic documents (PDF/MD/HTML/DOCX) via MinerU; "
            "returns parsed markdown content and metadata."
        )

    async def execute(self, params: dict) -> ToolResult:
        """执行文档解析。

        参数:
            file_path: 文档文件路径
            project_id: 可选的项目 ID（默认 'default'）
        """
        file_path = params.get("file_path", "")
        if not file_path:
            return ToolResult(success=False, data={}, error="file_path is required")

        if not self._pipeline:
            return ToolResult(
                success=False, data={}, error="DocumentPipeline not initialized"
            )

        project_id = params.get("project_id", "default")

        try:
            parsed = await self._pipeline.process(file_path, project_id)
            # 返回精简结果供智能体使用（截断过长内容）
            chunks_summary = []
            for chunk in parsed.chunks[:10]:  # 最多返回前 10 个分块
                chunks_summary.append({
                    "index": chunk.chunk_index,
                    "type": chunk.content_type,
                    "content": chunk.content[:500],  # 截断至 500 字符
                })

            # 构建与搜索工具兼容的 results 格式，供前端 ToolCallCard 复用
            results = [
                {
                    "title": f"[{chunk.content_type}] Chunk {chunk.chunk_index + 1}",
                    "url": "",
                    "snippet": chunk.content[:200],
                }
                for chunk in parsed.chunks[:10]
            ]

            return ToolResult(
                success=True,
                data={
                    "doc_id": parsed.doc_id,
                    "filename": parsed.filename,
                    "title": parsed.title,
                    "authors": parsed.authors,
                    "total_pages": parsed.total_pages,
                    "total_chunks": len(parsed.chunks),
                    "results": results,
                    "chunks": chunks_summary,
                    "raw_markdown_preview": parsed.raw_markdown[:2000],
                },
            )
        except FileNotFoundError:
            return ToolResult(
                success=False, data={}, error=f"File not found: {file_path}"
            )
        except Exception as e:
            logger.error("文档解析失败: %s", e)
            return ToolResult(
                success=False, data={}, error=f"Document parsing failed: {str(e)[:200]}"
            )
