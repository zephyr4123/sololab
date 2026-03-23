# Phase 3 增强功能 — 实现与测试报告

> 版本：v0.2.0 | 日期：2026-03-23 | 作者：huangsuxiang

---

## 1. 概述

Phase 3 聚焦于将 SoloLab 从 MVP 提升至生产级平台，涵盖 7 大功能模块：

| 模块 | 核心能力 | 状态 |
|------|---------|------|
| 记忆管理器 | pgvector 向量存储/检索，四级作用域 | 已完成 |
| 文档管道 | MinerU PDF 解析 → 分块 → 嵌入 → 语义搜索 | 已完成 |
| 会话管理 | CRUD、消息历史、跨模块上下文 | 已完成 |
| 上下文窗口管理 | 滑动窗口、摘要压缩、引用追踪 | 已完成 |
| 并发执行 | 信号量限速、并行执行器、非阻塞 HTTP | 已完成 |
| 错误处理与韧性 | 重试/降级/超时、输出校验、消息阈值 | 已完成 |
| 费用控制 | 运行时预算检查、持久化统计、仪表盘 | 已完成 |

---

## 2. 架构变更

### 2.1 新增数据库表（Alembic Migration 002）

```
memories          — pgvector 向量记忆存储（HNSW 索引）
documents         — 文档元数据记录
document_chunks   — 文档分块 + 向量嵌入（HNSW 索引）
sessions          — 会话记录
session_messages  — 会话消息历史
cost_records      — LLM 调用费用追踪
```

所有向量列使用 `vector(1536)` 类型（OpenAI text-embedding-3-small 维度），并创建 HNSW 近似最近邻索引以加速余弦相似度搜索。

### 2.2 ORM 模型

新增 `backend/src/sololab/models/orm.py`，使用 SQLAlchemy 2.0 声明式 Mapped 类型：

- `MemoryRecord` — 记忆存储，含 `embedding` 向量列
- `DocumentRecord` + `DocumentChunkRecord` — 文档及分块，一对多关系
- `SessionRecord` + `SessionMessageRecord` — 会话及消息，一对多关系
- `CostRecord` — 费用记录

### 2.3 应用生命周期（main.py）

Phase 3 服务在 `lifespan()` 中按依赖顺序初始化：

```
Redis → LLM Gateway → TaskStateManager → ToolRegistry → PromptManager
  → DB Engine/Session → MemoryManager → SessionManager → DocumentPipeline → CostTracker
    → ModuleRegistry（此时 ModuleContext 含 MemoryManager）
```

数据库初始化失败时优雅降级：Phase 3 服务标记为 `None`，API 返回 503。

---

## 3. 核心模块实现

### 3.1 记忆管理器 (`core/memory_manager.py`)

**功能：**
- `store()` — 生成嵌入向量并存储到 pgvector
- `retrieve()` — 余弦相似度搜索，支持跨作用域层级检索
- `delete()` / `delete_by_scope()` — 单条/批量删除
- `count()` — 统计记忆数量

**作用域层级：** GLOBAL → PROJECT → SESSION → MODULE

查询 `scope=PROJECT` 时，会同时搜索 GLOBAL 和 PROJECT 的记忆。

### 3.2 文档处理管道 (`core/document_pipeline.py`)

**完整管道流程：**
1. `upload_and_process()` — 文件保存 + 创建 DB 记录
2. `_parse_with_mineru()` — 调用 `magic-pdf` CLI 解析 PDF
3. `_semantic_chunking()` — 按标题拆分 Markdown，长段落自动切分（MAX_CHUNK_CHARS=2000）
4. `_extract_metadata()` — LLM 提取标题/作者/摘要/关键词/年份
5. `_embed_and_store_chunks()` — 批量嵌入（每批 20 个）并存储到 `document_chunks`
6. `search()` — pgvector 余弦距离搜索，JOIN documents 表返回文档信息

### 3.3 会话管理器 (`core/session_manager.py`)

**功能：**
- `create_session()` / `get_session()` / `list_sessions()` — 会话 CRUD
- `add_message()` — 添加消息并自动更新会话 `updated_at`
- `get_history()` — 分页获取消息历史
- `get_context_messages()` — OpenAI 格式输出，用于 LLM 上下文
- `delete_session()` — 软删除（标记 `status=deleted`）
- `archive_session()` — 归档

### 3.4 上下文窗口管理 (`core/context_manager.py`)

**三层策略：**
1. **滑动窗口** — 保留最近 `max_messages` 条消息
2. **摘要压缩** — 超过 `summary_threshold` 时，早期消息通过 LLM 压缩为摘要
3. **引用追踪** — 被引用的消息不会被裁剪，孤立消息优先裁剪

### 3.5 并发执行 (`core/concurrency.py`)

- **RateLimiter** — 基于 `asyncio.Semaphore` + 时间间隔的 API 限速器
- **ParallelExecutor** — 支持超时、错误隔离、进度回调的并行任务执行器
- **AsyncHTTPClient** — 基于 aiohttp 的非阻塞 HTTP 客户端，支持自动重试

### 3.6 错误处理与韧性 (`core/resilience.py`)

- **FallbackChain** — LLM 模型降级链（主模型 → 备选模型，每个重试 3 次）
- **@with_retry** — 通用重试装饰器（指数退避）
- **@with_timeout** — 超时装饰器（超时返回默认值）
- **OutputValidator** — Pydantic 模型校验 + LLM 自动修复
- **MessageThreshold** — 消息阈值控制（60% info / 80% warning / 100% critical）

### 3.7 费用追踪 (`core/cost_tracker.py`)

- **双轨追踪**：内存字典（快速预算检查）+ PostgreSQL（持久化统计）
- **BudgetExceededError** — 超预算时抛出，可被编排器捕获
- **统计维度**：按任务/模块/平台、按模型分组、按日趋势

---

## 4. API 路由

### 4.1 文档 API (`api/documents.py`)

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/documents/upload` | 上传文档，异步启动处理 |
| GET | `/api/documents/{doc_id}/status` | 获取解析状态 |
| GET | `/api/documents/{doc_id}/chunks` | 获取分块列表 |
| POST | `/api/documents/search` | 跨文档语义搜索 |

### 4.2 会话 API (`api/sessions.py`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 列出会话 |
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions/{id}` | 获取会话详情 |
| GET | `/api/sessions/{id}/history` | 获取消息历史 |
| POST | `/api/sessions/{id}/messages` | 添加消息 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| POST | `/api/memory/search` | 记忆搜索 |

### 4.3 提供商/费用 API (`api/providers.py`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/providers` | 提供商配置 |
| POST | `/api/providers/{name}/test` | 测试连通性 |
| GET | `/api/providers/cost` | 平台总费用统计 |
| GET | `/api/providers/cost/module/{id}` | 模块费用统计 |
| GET | `/api/providers/cost/task/{id}` | 任务费用统计 |

---

## 5. 前端组件

### 5.1 DocumentUploader

- 拖拽上传 / 文件选择器
- 支持 PDF、Markdown、HTML、DOCX
- 上传后自动轮询状态（2 秒间隔）
- 状态徽章：完成（绿）/ 处理中（蓝）/ 失败（红）

### 5.2 CostDashboard

- 时间段选择器（7 / 30 / 90 天）
- 四卡片总览：总费用、API 调用次数、Token 数、平均单次费用
- 按模型分布条形图
- 每日费用趋势柱状图

### 5.3 API 客户端扩展

新增 4 个导出对象：`documentApi`、`sessionApi`、`costApi`、`memoryApi`

---

## 6. 测试报告

### 6.1 测试统计

| 类别 | 文件数 | 测试数 | 通过 | 跳过 | 失败 |
|------|--------|--------|------|------|------|
| 单元测试 | 20 | 123 | 123 | 0 | 0 |
| 集成测试 | 7 | 23 | 15 | 8 | 0 |
| E2E 测试 | 2 | — | — | — | — |
| **总计** | **29** | **146** | **138** | **8** | **0** |

> 8 个跳过的集成测试原因：Phase 3 数据库表尚未迁移（需运行 `alembic upgrade head`），测试正确跳过。

### 6.2 新增测试文件（Phase 3）

**单元测试（51 个新增测试）：**

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `test_context_manager.py` | 6 | 滑动窗口、摘要压缩、引用追踪 |
| `test_concurrency.py` | 6 | 信号量限速、并行执行、HTTP 客户端 |
| `test_resilience.py` | 13 | 降级链、重试/超时装饰器、输出校验、消息阈值 |
| `test_cost_tracker.py` | 5 | 预算检查、运行时费用追踪 |
| `test_document_pipeline.py` | 9 | 内容类型检测、语义分块、ID 生成 |
| `test_documents_api.py` | 5 | 文档 API 路由（含错误处理） |
| `test_sessions_api.py` | 9 | 会话 API 路由（含记忆搜索） |

**集成测试（8 个新增测试）：**

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `test_document_flow.py` | 7 | 文档管道初始化、搜索、记忆搜索、费用 API |
| `test_session_flow.py` | 2 | 会话 CRUD 完整流程、健康检查 |
| `test_memory_store.py` | 3 | pgvector 存储/检索、作用域层级、批量删除 |

**端到端测试：**

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `phase3-flow.spec.ts` | 8 | Dashboard、导航、API 端点（sessions/providers/cost/documents） |

### 6.3 原有测试兼容性

Phase 3 修改了 `providers.py` API 的返回格式，相应更新了：
- `test_modules_api.py::test_list_providers` — 适配新的返回结构
- `test_module_flow.py::test_full_api_flow` — 适配新的提供商测试端点

---

## 7. 文件清单

### 新增文件

```
backend/src/sololab/models/orm.py               # SQLAlchemy ORM 模型
backend/src/sololab/core/context_manager.py      # 上下文窗口管理
backend/src/sololab/core/concurrency.py          # 并发执行管理
backend/src/sololab/core/resilience.py           # 错误处理与韧性
backend/src/sololab/core/cost_tracker.py         # 费用追踪
backend/alembic/versions/002_phase3_tables.py    # 数据库迁移
frontend/src/components/shared/CostDashboard.tsx # 费用仪表盘组件
tests/unit/backend/core/test_context_manager.py
tests/unit/backend/core/test_concurrency.py
tests/unit/backend/core/test_resilience.py
tests/unit/backend/core/test_cost_tracker.py
tests/unit/backend/core/test_document_pipeline.py
tests/unit/backend/api/test_documents_api.py
tests/unit/backend/api/test_sessions_api.py
tests/integration/api/test_document_flow.py
tests/integration/api/test_session_flow.py
tests/e2e/specs/phase3-flow.spec.ts
```

### 修改文件

```
backend/src/sololab/main.py                     # 整合 Phase 3 服务
backend/src/sololab/core/memory_manager.py       # 完整实现 pgvector 存储
backend/src/sololab/core/session_manager.py      # 完整实现 PostgreSQL CRUD
backend/src/sololab/core/document_pipeline.py    # 完整实现向量存储 + 搜索
backend/src/sololab/api/documents.py             # 完整实现文档 API
backend/src/sololab/api/sessions.py              # 完整实现会话 API
backend/src/sololab/api/providers.py             # 新增费用 API
frontend/src/lib/api-client.ts                   # 新增 API 客户端
frontend/src/components/shared/DocumentUploader.tsx  # 完整实现
CLAUDE.md                                        # Phase 3 清单标记完成
```

---

## 8. 部署前置条件

```bash
# 1. 安装 MinerU（已完成）
conda activate sololab
pip install magic-pdf aiofiles

# 2. 运行数据库迁移
cd backend
alembic upgrade head

# 3. 验证测试
pytest tests/unit/ -v         # 123 passed
pytest tests/integration/ -v  # 15 passed, 8 skipped
```

---

## 9. 已知限制与后续计划

1. **MinerU 依赖**：需要本地安装 `magic-pdf` CLI，Docker 部署需在镜像中预装
2. **向量维度固定**：当前硬编码 1536（text-embedding-3-small），更换模型需修改迁移
3. **文档处理异步**：使用 `asyncio.create_task()` 后台处理，重启后不恢复
4. **费用追踪精度**：依赖 LiteLLM 的 `completion_cost()` 函数，部分代理模型可能无法准确计费

**Phase 4 将聚焦：** 多 LLM 后端验证、可观测性、消息持久化、API 认证、Docker 生产配置。
