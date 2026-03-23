"""基于 MinerU 管道的文档解析工具。"""

import logging

from sololab.core.tool_registry import ToolBase, ToolResult

logger = logging.getLogger(__name__)


class DocParseTool(ToolBase):
    """使用 MinerU 解析学术 PDF，进行全文提取。

    委托给 DocumentPipeline 处理实际解析工作。
    支持 PDF、Markdown、HTML、DOCX 格式。
    """

    def __init__(self, document_pipeline=None) -> None:
        self._pipeline = document_pipeline

    def set_pipeline(self, pipeline) -> None:
        """延迟注入 DocumentPipeline（在 lifespan 中设置）。"""
        self._pipeline = pipeline

    @property
    def name(self) -> str:
        return "doc_parse"

    @property
    def description(self) -> str:
        return (
            "Parse academic PDF documents using MinerU, extracting text, tables, "
            "formulas, and figures. Input: {file_path: str, project_id?: str}. "
            "Returns parsed markdown content and metadata."
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

            return ToolResult(
                success=True,
                data={
                    "doc_id": parsed.doc_id,
                    "filename": parsed.filename,
                    "title": parsed.title,
                    "authors": parsed.authors,
                    "total_pages": parsed.total_pages,
                    "total_chunks": len(parsed.chunks),
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
