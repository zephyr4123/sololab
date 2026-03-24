"""arXiv 论文搜索工具。"""

import logging
import re
import xml.etree.ElementTree as ET

import aiohttp

from sololab.core.tool_registry import ToolBase, ToolResult

logger = logging.getLogger(__name__)

_ARXIV_API = "https://export.arxiv.org/api/query"

# arXiv AND 搜索中需要过滤的英文停用词
# 这些词在 all: 字段搜索时会导致误匹配或零结果
_STOP_WORDS = frozenset({
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not',
    'no', 'nor', 'so', 'if', 'then', 'than', 'that', 'this', 'these',
    'those', 'it', 'its', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'under', 'over', 'up', 'down',
    'out', 'off', 'such', 'only', 'also', 'very', 'just', 'using', 'via',
    'based', 'review', 'survey', 'study', 'analysis', 'approach',
    'method', 'methods', 'framework', 'towards', 'toward',
    'novel', 'new', 'recent', 'advanced', 'improved', 'efficient',
    'optimization', 'optimizing', 'strategies', 'strategy', 'mechanism',
    'mechanisms', 'architecture', 'abstract',
})

# AND 连接的最大关键词数量，超过此数量 arXiv 几乎返回 0
_MAX_AND_TERMS = 5


class ArxivTool(ToolBase):
    """在 arXiv 搜索预印本论文。"""

    @property
    def name(self) -> str:
        return "arxiv_search"

    @property
    def description(self) -> str:
        return "Search arXiv preprint repository for academic papers"

    async def execute(self, params: dict) -> ToolResult:
        """执行 arXiv 搜索。"""
        query = params.get("query", "")
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        # 清理 query：过滤中文和特殊字符（arXiv 是全英文数据库）
        clean_query = self._sanitize_query(query)
        if not clean_query:
            logger.info("arXiv query 过滤后为空（可能是纯中文）: %s", query[:50])
            return ToolResult(success=True, data={"query": query, "results": []})

        max_results = params.get("max_results", 5)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    _ARXIV_API,
                    params={
                        "search_query": f"all:{clean_query}",
                        "start": 0,
                        "max_results": max_results,
                        "sortBy": "relevance",
                        "sortOrder": "descending",
                    },
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    text = await resp.text()

                    # 检查响应是否为有效 XML（代理/防火墙可能返回 HTML 错误页）
                    if not self._is_valid_xml(text):
                        logger.warning(
                            "arXiv 返回非 XML 响应 (status=%d, len=%d): %s",
                            resp.status, len(text), text[:200],
                        )
                        return ToolResult(
                            success=False, data={"query": clean_query},
                            error=f"arXiv returned non-XML response (HTTP {resp.status}). Possible proxy/network issue.",
                        )

                    results = self._parse_atom(text)
                    return ToolResult(
                        success=True,
                        data={"query": clean_query, "results": results},
                    )
        except Exception as e:
            return ToolResult(success=False, data={}, error=f"arXiv search failed: {e}")

    @staticmethod
    def _sanitize_query(query: str) -> str:
        """清理查询字符串，构建 arXiv AND 查询。

        arXiv 是全英文数据库，中文 query 永远返回 0 结果。
        此方法会过滤中文字符，仅保留英文关键词。
        arXiv 默认用空格作 OR，改为 AND 连接确保精度。
        """
        # 如果 query 已经包含 arXiv 字段前缀，去掉它
        query = re.sub(r'^(all|ti|au|abs|cat):', '', query, flags=re.IGNORECASE)

        # 过滤中文字符（arXiv 是英文数据库）
        query = re.sub(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+', ' ', query)

        # 去除 arXiv 不支持的标点
        query = re.sub(r'[?!;@#$%^&*(){}[\]|\\<>]', ' ', query)
        query = query.replace('"', '').replace("'", '')
        # 多个空格合并
        query = re.sub(r'\s+', ' ', query).strip()

        if not query:
            return query

        # 去除孤立的布尔运算符
        query = re.sub(r'\b(AND|OR|ANDNOT)\b', ' ', query)
        # 去除独立的年份数字（如 2024、2025）—— arXiv 按 all: 搜索时，
        # 年份 AND 连接会导致大量 0 结果，应使用 sortBy 而非文本匹配年份
        query = re.sub(r'\b(19|20)\d{2}\b', ' ', query)
        query = re.sub(r'\s+', ' ', query).strip()

        if not query:
            return query

        # 多词查询：过滤停用词，保留有意义的关键词，用 AND 连接
        words = query.split()
        keywords = [w for w in words if w.lower() not in _STOP_WORDS]
        # 如果过滤后为空，回退到原始词列表
        if not keywords:
            keywords = words

        # 限制 AND 项数，防止过度限制（arXiv AND 项超过 5 个几乎返回 0）
        keywords = keywords[:_MAX_AND_TERMS]

        if len(keywords) > 1:
            return ' AND '.join(keywords)
        return keywords[0] if keywords else query

    @staticmethod
    def _is_valid_xml(text: str) -> bool:
        """快速检查响应是否为 XML 格式。"""
        stripped = text.strip()
        return stripped.startswith('<?xml') or stripped.startswith('<feed')

    @staticmethod
    def _parse_atom(xml_text: str) -> list:
        """解析 arXiv Atom XML 响应。"""
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(xml_text)
        results = []
        for entry in root.findall("atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            summary_el = entry.find("atom:summary", ns)
            published_el = entry.find("atom:published", ns)
            link_el = entry.find("atom:id", ns)
            authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns) if a.find("atom:name", ns) is not None]
            results.append({
                "title": title_el.text.strip() if title_el is not None else "",
                "summary": summary_el.text.strip()[:500] if summary_el is not None else "",
                "authors": authors[:5],
                "published": published_el.text[:10] if published_el is not None else "",
                "url": link_el.text if link_el is not None else "",
            })
        return results
