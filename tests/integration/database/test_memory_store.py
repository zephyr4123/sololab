"""使用 pgvector 的记忆存储集成测试。"""

import pytest


class TestMemoryStore:
    """需要 PostgreSQL 及 pgvector 扩展的测试。"""

    @pytest.mark.integration
    async def test_store_and_retrieve_by_similarity(self):
        """存储内容，然后通过语义相似度检索。"""
        # TODO: 需要 PostgreSQL 及 pgvector
        # 1. 存储多个带嵌入向量的记忆块
        # 2. 使用相似文本查询
        # 3. 验证排名靠前的结果语义相关
        pass

    @pytest.mark.integration
    async def test_scope_isolation(self):
        """不同作用域的记忆不应相互干扰。"""
        # TODO: 需要 PostgreSQL
        # 1. 在 MODULE 作用域存储
        # 2. 在 PROJECT 作用域存储
        # 3. 以 MODULE 作用域检索应仅获取 MODULE 记忆
        pass
