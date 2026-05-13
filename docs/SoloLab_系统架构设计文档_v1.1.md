
# 🧪 SoloLab — 一人实验室 AI 平台

## 系统架构设计文档 v1.1

> ## ⚠️ FROZEN DESIGN SNAPSHOT
>
> **此文档是 v1.1 阶段的设计蓝图，不是当前实现状态。**
>
> 实际代码已多轮迭代，与本文档主要分歧点：
> - **LLM 网关**：不再用 LiteLLM。已重写为 `LLMProviderBase` ABC + `ProviderRegistry`（Strategy + Factory + Registry 三模式）+ `ProviderQuirks`（数据驱动的能力声明）。每个 provider 独立适配自家怪癖（DeepSeek reasoning passback、Anthropic temperature 上限、qwen 兼容层等）。详见 `backend/src/sololab/core/llm/`。
> - **PDF 解析**：MinerU 改为 PyMuPDF（`backend/src/sololab/core/document_pipeline.py`）。
> - **可观测**：新增 `RequestContextMiddleware` + `LLMCallTracer` + `BudgetAlert`，单点 hook 在 `CostTrackingProvider`（`core/llm/cost.py`）— 每次 LLM 调用前 enforce budget、调用中 trace、调用后写 cost record。
> - **数据层**：原 `models/orm.py` 单文件 8 表已拆为 `db/models/{auth,blackboard,cost,document,memory,session,writer}.py`。Pydantic transport models 迁到 `schemas/` 包。
> - **鉴权**：`verify_api_key` 通过 router-level `dependencies=[AuthDep]` 接入所有 mutation 路由。
> - **模块**：除文中提到的，还实装了 CodeLab（OpenCode HTTP 代理）和 WriterAI（单 Agent + 8 工具 + Docker 沙箱）。
>
> 当前实现的权威文档是 `CLAUDE.md`（项目根，gitignored）和 `README.md`。
> 这份 v1.1 设计文档保留作为"设计原始意图 + 演化对照"的历史参考。

---

## 一、产品定位与设计哲学

### 1.1 产品定位

SoloLab 是一个面向独立研究者的 **全栈 AI 辅助平台**，将研究工作流中的多个环节（idea 涌现、文献调研、编码实验、论文写作、数据分析等）封装为**可热插拔的功能模块**，通过统一的前后端架构进行调度和交互。

### 1.2 核心设计哲学

| 原则 | 说明 |
|------|------|
| **模块热插拔** | 每个功能模块（idea、coding、writing…）是独立插件，可随时启用/禁用/替换，零耦合 |
| **Provider 无关** | LLM 调用层通过 LiteLLM 网关统一代理，支持 100+ 模型无缝切换 |
| **透明可控** | 研究者能看到每一步的 prompt、token 消耗、Agent 决策链路，拒绝黑盒 |
| **一人可运维** | Docker Compose 一键部署，最小运维负担 |
| **断点可恢复** | 长耗时任务支持断线自动恢复，不丢失任何中间状态 |

---

## 二、系统总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ IdeaSpark│ │ CodeLab  │ │ WriterAI │ │ DataLens │ ...   │
│  │  Module   │ │  Module  │ │  Module  │ │  Module  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └─────────────┴────────────┴─────────────┘             │
│                         ▼                                    │
│              Module Shell (统一模块容器)                       │
│              ─ 标签页切换 / 侧边栏导航                         │
│              ─ SSE 流式渲染引擎 + 断线恢复                      │
│              ─ Zustand 全局状态管理                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST + SSE (带 Last-Event-ID)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway (FastAPI)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Module Router                           │    │
│  │   /api/modules/{module_id}/run                       │    │
│  │   /api/modules/{module_id}/stream                    │    │
│  │   /api/tasks/{task_id}/state    ← [NEW v1.1]        │    │
│  │   /api/tasks/{task_id}/resume   ← [NEW v1.1]        │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Core Services Layer                        │   │
│  │                                                       │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │   │
│  │  │ LiteLLM      │ │   Memory     │ │    Tool      │  │   │
│  │  │ Gateway  [✏] │ │   Manager    │ │   Registry   │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘  │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │   │
│  │  │  Module       │ │  Session     │ │   Prompt     │  │   │
│  │  │  Registry     │ │  Manager     │ │   Manager    │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘  │   │
│  │  ┌──────────────┐ ┌──────────────┐                   │   │
│  │  │ Task State   │ │  Document    │   [✏] = v1.1 改动 │   │
│  │  │ Manager [✏]  │ │  Pipeline [✏]│                   │   │
│  │  └──────────────┘ └──────────────┘                   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐┌─────────────┐┌────────────────┐
│  PostgreSQL  ││   Redis     ││  File Storage  │
│  + pgvector  ││  (Cache/MQ/ ││  (本地/MinIO)  │
│              ││  TaskState) ││               │
└──────────────┘└─────────────┘└────────────────┘
```

---

## 三、后端架构详细设计

### 3.1 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| Web 框架 | **FastAPI** | 原生 async、自动 OpenAPI 文档、Pydantic 校验、依赖注入 |
| LLM 网关 | **LiteLLM Proxy** | 统一 100+ 模型为 OpenAI 格式，内置降级链/负载均衡/成本追踪 |
| 数据库 | **PostgreSQL + pgvector** | 关系型 + 向量搜索一体，避免多数据库运维负担 |
| 缓存/消息/状态 | **Redis** | Agent 中间状态缓存、任务状态树存储、模块间事件发布订阅 |
| 文档解析 | **MinerU** | 开源高精度 PDF 提取，支持双栏/公式/表格，输出 LLM-ready Markdown |
| 文件存储 | **本地卷 / MinIO** | 论文 PDF、代码文件、生成物存储 |
| 容器化 | **Docker Compose** | 一键部署，一人可运维 |
| 反向代理 | **Caddy** | 自动 HTTPS，配置极简 |

### 3.2 核心抽象层

#### 3.2.1 [✏ v1.1 重构] LLM Gateway — 基于 LiteLLM 的多模型统一调用

**v1.0 的问题：** 自研 `BaseLLMClient` 抽象层需要手动维护 OpenAI / Anthropic / DeepSeek / Gemini 各家 SDK 的差异（如 Anthropic 的 Prompt Caching、OpenAI 的 Structured Outputs、Gemini 的原生多模态流），单人维护成本极高。

**v1.1 方案：** 引入 LiteLLM 作为 LLM 网关，将所有模型调用统一转换为 OpenAI 兼容格式。LiteLLM 支持 100+ LLM Provider、内置 Fallback 降级链、成本追踪和负载均衡，完美契合 SoloLab 的需求。

```python
# ============================================================
# LLM Gateway — 基于 LiteLLM 的薄封装
# 不再自研 BaseLLMClient 抽象，直接使用 LiteLLM 统一接口
# ============================================================

import litellm
from litellm import acompletion, aembedding
from typing import AsyncGenerator, List, Dict, Optional
from pydantic import BaseModel


class LLMConfig(BaseModel):
    """全局 LLM 配置"""
    fallback_chain: List[str] = ["deepseek/deepseek-chat", "openai/gpt-4o-mini"]
    default_model: str = "openai/gpt-4o"
    budget_limit_usd: Optional[float] = 50.0  # 月度预算上限
    cache_enabled: bool = True


class LLMGateway:
    """
    LiteLLM 薄封装层
    - 统一 100+ 模型调用为 OpenAI 格式
    - 内置 Fallback / 重试 / 成本追踪
    - 不再维护各家 SDK 差异
    """

    def __init__(self, config: LLMConfig):
        self.config = config

        # 启用 LiteLLM 内置缓存（Redis）
        if config.cache_enabled:
            litellm.cache = litellm.Cache(type="redis", host="redis", port=6379)

        # 设置全局回调（成本追踪 & 日志）
        litellm.success_callback = ["langfuse"]  # 可选：接入 Langfuse 观测
        litellm.set_verbose = False

    async def generate(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
        **kwargs
    ) -> dict:
        """统一生成接口，自动处理降级"""
        model = model or self.config.default_model
        try:
            response = await acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
                fallbacks=self.config.fallback_chain,
                **kwargs
            )
            return {
                "content": response.choices[0].message.content,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "cost_usd": litellm.completion_cost(response)
                }
            }
        except Exception as e:
            raise RuntimeError(f"All LLM providers failed: {e}")

    async def stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """流式生成"""
        model = model or self.config.default_model
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            stream=True,
            fallbacks=self.config.fallback_chain,
            **kwargs
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(self, texts: List[str], model: str = "openai/text-embedding-3-small") -> List[List[float]]:
        """统一 Embedding 接口"""
        response = await aembedding(model=model, input=texts)
        return [item["embedding"] for item in response.data]
```

**LiteLLM 配置文件 (litellm_config.yaml):**

```yaml
model_list:
  # === 高质量推理 ===
  - model_name: "reasoning"
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  # === 长上下文写作 ===
  - model_name: "writer"
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  # === 低成本发散 ===
  - model_name: "divergent"
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY

  # === 多模态 ===
  - model_name: "multimodal"
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: os.environ/GOOGLE_API_KEY

  # === 本地离线 ===
  - model_name: "local"
    litellm_params:
      model: ollama/qwen2.5:14b
      api_base: http://ollama:11434

# 降级策略
litellm_settings:
  fallbacks:
    - {"reasoning": ["divergent"]}
    - {"writer": ["reasoning"]}

  # 预算控制
  max_budget: 50.0  # USD/月
  budget_duration: "30d"

  # 缓存
  cache: true
  cache_params:
    type: redis
    host: redis
    port: 6379
    ttl: 3600
```

**v1.0 → v1.1 对比：**

| 维度 | v1.0 自研 | v1.1 LiteLLM |
|------|----------|--------------|
| 代码量 | ~500 行抽象层 + 每个 Provider ~200 行适配 | ~80 行薄封装 |
| 支持模型数 | 5 家，手动维护 | 100+ 家，自动跟进 |
| Prompt Caching | 需各家单独实现 | LiteLLM 内置支持 |
| Structured Output | 需各家单独实现 | 透传 response_format 即可 |
| 成本追踪 | 手动计算 | 内置 `completion_cost()` |
| 降级链 | 手动实现 | 一行配置 `fallbacks` |
| 维护负担 | 高（SDK 破坏性更新） | 极低（升级 litellm 版本即可） |

#### 3.2.2 Module Registry — 模块热插拔核心

```python
from dataclasses import dataclass, field
from typing import Callable, Optional

@dataclass
class ModuleManifest:
    """每个模块的元信息声明"""
    id: str                          # 唯一标识，如 "ideaspark"
    name: str                        # 显示名称
    version: str                     # 语义化版本
    description: str                 # 模块描述
    icon: str                        # 前端图标
    entry_point: str                 # 入口类路径
    required_tools: List[str] = field(default_factory=list)
    required_models: List[str] = field(default_factory=list)  # 引用 LiteLLM model_name
    config_schema: Optional[dict] = None  # JSON Schema


class ModuleBase(ABC):
    """所有功能模块的基类"""

    @abstractmethod
    def manifest(self) -> ModuleManifest:
        pass

    @abstractmethod
    async def execute(self, request: ModuleRequest, ctx: ModuleContext) -> AsyncGenerator:
        """核心执行方法，流式返回结果"""
        pass

    async def on_load(self, ctx: ModuleContext):
        """模块加载时的初始化钩子"""
        pass

    async def on_unload(self):
        """模块卸载时的清理钩子"""
        pass


class ModuleRegistry:
    """模块注册中心，支持动态加载/卸载"""

    def __init__(self):
        self._modules: Dict[str, ModuleBase] = {}

    async def load_module(self, manifest_path: str):
        manifest = load_manifest(manifest_path)
        module_cls = import_class(manifest.entry_point)
        module = module_cls()
        await module.on_load(self._build_context(manifest))
        self._modules[manifest.id] = module

    async def unload_module(self, module_id: str):
        if module_id in self._modules:
            await self._modules[module_id].on_unload()
            del self._modules[module_id]

    def list_modules(self) -> List[ModuleManifest]:
        return [m.manifest() for m in self._modules.values()]

    async def run(self, module_id: str, request: ModuleRequest) -> AsyncGenerator:
        module = self._modules[module_id]
        async for chunk in module.execute(request, self._build_context(module.manifest())):
            yield chunk
```

#### 3.2.3 Tool Registry — 外部 API 统一封装

```python
class ToolBase(ABC):
    """所有外部工具的基类"""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult: ...


class ToolRegistry:
    """工具注册中心"""
    tools: Dict[str, ToolBase] = {}

    def register(self, tool: ToolBase):
        self.tools[tool.name] = tool

    def get_tools_for_module(self, tool_names: List[str]) -> List[ToolBase]:
        return [self.tools[n] for n in tool_names if n in self.tools]
```

**内置工具清单：**

| 工具名 | 类 | 接入 API | 用途 |
|--------|-----|---------|------|
| `web_search` | TavilySearchTool | Tavily API | 通用网络搜索 |
| `arxiv_search` | ArxivTool | arXiv API | 预印本论文检索 |
| `scholar_search` | SemanticScholarTool | Semantic Scholar API | 引用图谱、论文元数据 |
| `code_exec` | SandboxTool | 本地 Docker 沙箱 | 安全代码执行 |
| `file_read` | FileReaderTool | 本地文件系统 | PDF/Markdown/CSV 读取 |
| `github_search` | GitHubTool | GitHub API | 开源项目检索 |
| `doc_parse` | DocParseTool | MinerU Pipeline | 学术 PDF 高精度解析 [NEW v1.1] |

#### 3.2.4 Memory Manager — 持久化记忆系统

```python
class MemoryManager:
    """基于 pgvector 的多层记忆管理"""

    class Scope(Enum):
        MODULE = "module"          # 当前模块内的记忆
        SESSION = "session"        # 当前会话跨模块记忆
        PROJECT = "project"        # 项目级长期记忆
        GLOBAL = "global"          # 全局知识库

    async def store(self, content: str, scope: Scope, metadata: dict):
        embedding = await self.llm_gateway.embed([content])
        chunk = MemoryChunk(
            content=content,
            embedding=embedding[0],
            scope=scope.value,
            metadata=metadata,
            timestamp=datetime.utcnow()
        )
        await self.db.save(chunk)

    async def retrieve(self, query: str, scope: Scope, top_k: int = 5) -> List[MemoryChunk]:
        query_embedding = await self.llm_gateway.embed([query])
        return await self.db.vector_search(
            embedding=query_embedding[0],
            scope=scope.value,
            top_k=top_k,
            rerank=True
        )
```

**记忆作用域设计：**

```
GLOBAL ──────────────────────────────── 全局知识（长期）
  └── PROJECT ───────────────────────── 项目上下文（中期）
        └── SESSION ─────────────────── 当前会话（短期）
              └── MODULE ────────────── 模块内部状态（临时）
```

每个模块运行时，可以读取所有上层作用域的记忆，但只能写入自己及以下层级。

#### 3.2.5 [✏ v1.1 新增] Task State Manager — 长耗时任务状态恢复

**问题背景：** v1.0 完全依赖 SSE 流式传输，但 SSE 连接脆弱——如果 CodeLab 正在生成几百行代码时用户网络闪断，所有中间状态将丢失。

**设计方案：** 在 Redis 中维护基于 `task_id` 的增量状态树，SSE 事件带序号 (`event_id`)。前端重连时通过 `Last-Event-ID` 或 REST 接口恢复断线期间的所有事件。

```python
# ============================================================
# Task State Manager — 基于 Redis 的任务状态持久化
# ============================================================

import redis.asyncio as aioredis
import json
import uuid
from typing import AsyncGenerator, Optional
from pydantic import BaseModel
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskEvent(BaseModel):
    """带序号的任务事件"""
    event_id: int              # 递增序号
    type: str                  # text | agent | tool | status | done | error
    data: dict                 # 事件数据
    timestamp: float           # Unix timestamp


class TaskState(BaseModel):
    """任务状态快照"""
    task_id: str
    module_id: str
    status: TaskStatus
    events: List[TaskEvent]
    total_events: int
    created_at: float
    updated_at: float


class TaskStateManager:
    """
    核心能力：
    1. 每个 SSE 事件写入 Redis Stream，带递增 event_id
    2. 前端断线重连时，通过 event_id 游标拉取缺失事件
    3. 任务完成后，最终结果持久化到 PostgreSQL
    """

    def __init__(self, redis: aioredis.Redis):
        self.redis = redis
        self.TTL = 3600 * 24  # 任务状态保留 24 小时

    async def create_task(self, module_id: str, request: dict) -> str:
        task_id = str(uuid.uuid4())
        state = {
            "task_id": task_id,
            "module_id": module_id,
            "status": TaskStatus.PENDING,
            "request": json.dumps(request),
            "created_at": time.time()
        }
        await self.redis.hset(f"task:{task_id}", mapping=state)
        await self.redis.expire(f"task:{task_id}", self.TTL)
        return task_id

    async def append_event(self, task_id: str, event_type: str, data: dict) -> int:
        """追加事件到 Redis Stream，返回 event_id"""
        event_id = await self.redis.incr(f"task:{task_id}:seq")
        event = {
            "event_id": str(event_id),
            "type": event_type,
            "data": json.dumps(data),
            "timestamp": str(time.time())
        }
        await self.redis.xadd(f"task:{task_id}:events", event)
        await self.redis.hset(f"task:{task_id}", "status", TaskStatus.RUNNING)
        return event_id

    async def get_events_after(self, task_id: str, after_event_id: int) -> List[dict]:
        """获取指定 event_id 之后的所有事件（断线恢复用）"""
        events = await self.redis.xrange(f"task:{task_id}:events")
        result = []
        for stream_id, event_data in events:
            eid = int(event_data[b"event_id"])
            if eid > after_event_id:
                result.append({
                    "event_id": eid,
                    "type": event_data[b"type"].decode(),
                    "data": json.loads(event_data[b"data"]),
                    "timestamp": float(event_data[b"timestamp"])
                })
        return result

    async def get_task_state(self, task_id: str) -> Optional[dict]:
        """获取任务当前状态"""
        state = await self.redis.hgetall(f"task:{task_id}")
        if not state:
            return None
        return {k.decode(): v.decode() for k, v in state.items()}

    async def complete_task(self, task_id: str, final_result: dict):
        """标记任务完成，可选持久化到 PostgreSQL"""
        await self.redis.hset(f"task:{task_id}", mapping={
            "status": TaskStatus.COMPLETED,
            "updated_at": str(time.time())
        })
        # TODO: 持久化 final_result 到 PostgreSQL
```

**前后端断线恢复流程：**

```
正常流程:
  Client ──POST /stream──→ Server (返回 task_id + SSE 流)
  Client ←── SSE event (id: 1) ───
  Client ←── SSE event (id: 2) ───
  Client ←── SSE event (id: 3) ───
  ... (网络闪断) ...

恢复流程:
  Client ──GET /tasks/{id}/state──→ Server
  Client ←── { status: "running", total_events: 7 }

  Client ──GET /tasks/{id}/events?after=3──→ Server
  Client ←── [event 4, event 5, event 6, event 7]  (补齐缺失)

  Client ──POST /tasks/{id}/resume──→ Server (重新建立 SSE)
  Client ←── SSE event (id: 8) ───  (继续接收)
  ...
```

#### 3.2.6 [✏ v1.1 新增] Document Pipeline — 学术文档解析管道

**问题背景：** v1.0 仅提供 `file_read` 工具做简单文件读取，但学术 PDF 的双栏排版、LaTeX 公式、表格嵌套是解析重灾区。如果直接把乱码文本灌入向量数据库，后续的检索和生成质量会严重劣化。

**设计方案：** 引入 MinerU 作为文档解析引擎，构建 "上传 → 解析 → 分块 → 嵌入 → 存储" 的完整管道。

```python
# ============================================================
# Document Pipeline — 基于 MinerU 的学术文档解析管道
# ============================================================

from enum import Enum
from dataclasses import dataclass
from typing import List, Optional
import subprocess
import json


class DocType(str, Enum):
    PDF = "pdf"
    MARKDOWN = "markdown"
    HTML = "html"
    DOCX = "docx"


@dataclass
class ParsedChunk:
    """解析后的文档块"""
    content: str                    # 文本内容 (Markdown 格式)
    chunk_index: int                # 块序号
    page_numbers: List[int]         # 所在页码
    content_type: str               # text | table | formula | figure_caption
    metadata: dict                  # 标题层级、节信息等


@dataclass
class ParsedDocument:
    """完整的解析结果"""
    doc_id: str
    filename: str
    title: Optional[str]
    authors: Optional[List[str]]
    chunks: List[ParsedChunk]
    raw_markdown: str               # 完整 Markdown
    total_pages: int


class DocumentPipeline:
    """
    文档处理管道：Upload → Parse → Chunk → Embed → Store
    
    核心解析引擎: MinerU (opendatalab/MinerU)
    - 支持双栏排版识别
    - LaTeX 公式提取并保留原格式
    - 表格结构化提取
    - 图片 Caption 关联
    """

    def __init__(self, llm_gateway: LLMGateway, memory: MemoryManager, storage_path: str):
        self.llm_gateway = llm_gateway
        self.memory = memory
        self.storage_path = storage_path

    async def process(self, file_path: str, project_id: str) -> ParsedDocument:
        """完整处理管道"""

        # Stage 1: MinerU 解析 PDF → Markdown
        raw_markdown = await self._parse_with_mineru(file_path)

        # Stage 2: 智能分块（按语义边界，非固定字符数）
        chunks = await self._semantic_chunking(raw_markdown)

        # Stage 3: 提取元数据（标题、作者、摘要）
        metadata = await self._extract_metadata(raw_markdown)

        # Stage 4: 嵌入并存储到向量数据库
        for chunk in chunks:
            await self.memory.store(
                content=chunk.content,
                scope=MemoryManager.Scope.PROJECT,
                metadata={
                    "project_id": project_id,
                    "source_file": file_path,
                    "content_type": chunk.content_type,
                    "page_numbers": chunk.page_numbers,
                    **metadata
                }
            )

        return ParsedDocument(
            doc_id=generate_id(),
            filename=os.path.basename(file_path),
            title=metadata.get("title"),
            authors=metadata.get("authors"),
            chunks=chunks,
            raw_markdown=raw_markdown,
            total_pages=metadata.get("total_pages", 0)
        )

    async def _parse_with_mineru(self, file_path: str) -> str:
        """
        调用 MinerU 进行 PDF 解析
        MinerU 使用 PDF-Extract-Kit 模型进行版面分析、
        公式识别、表格结构提取，输出高质量 Markdown
        """
        output_dir = os.path.join(self.storage_path, "parsed", generate_id())
        os.makedirs(output_dir, exist_ok=True)

        # 调用 MinerU CLI（也可通过 Python API）
        result = subprocess.run(
            ["magic-pdf", "-p", file_path, "-o", output_dir, "-m", "auto"],
            capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            raise RuntimeError(f"MinerU parsing failed: {result.stderr}")

        # 读取输出的 Markdown 文件
        md_files = glob.glob(os.path.join(output_dir, "**/*.md"), recursive=True)
        if not md_files:
            raise RuntimeError("MinerU produced no output")

        with open(md_files[0], "r", encoding="utf-8") as f:
            return f.read()

    async def _semantic_chunking(self, markdown: str) -> List[ParsedChunk]:
        """
        基于语义边界的智能分块策略：
        1. 优先按 Markdown 标题层级切分（# → ## → ###）
        2. 对超长段落按句子边界二次切分
        3. 保持表格和公式块的完整性（不从中间切断）
        4. 每块控制在 500~1500 tokens 之间
        """
        chunks = []
        sections = self._split_by_headers(markdown)

        for i, section in enumerate(sections):
            content_type = self._detect_content_type(section)

            if self._estimate_tokens(section) > 1500:
                sub_chunks = self._split_long_section(section)
                for j, sub in enumerate(sub_chunks):
                    chunks.append(ParsedChunk(
                        content=sub,
                        chunk_index=len(chunks),
                        page_numbers=[],  # MinerU 输出中包含页码标记
                        content_type=content_type,
                        metadata={"section_index": i, "sub_index": j}
                    ))
            else:
                chunks.append(ParsedChunk(
                    content=section,
                    chunk_index=len(chunks),
                    page_numbers=[],
                    content_type=content_type,
                    metadata={"section_index": i}
                ))

        return chunks

    async def _extract_metadata(self, markdown: str) -> dict:
        """用 LLM 从 Markdown 中提取结构化元数据"""
        response = await self.llm_gateway.generate(
            messages=[{
                "role": "user",
                "content": f"Extract metadata from this academic paper. "
                          f"Return JSON with: title, authors, abstract, keywords, year.\n\n"
                          f"{markdown[:3000]}"
            }],
            model="deepseek/deepseek-chat",  # 低成本模型足矣
            response_format={"type": "json_object"},
            temperature=0.1
        )
        return json.loads(response["content"])

    @staticmethod
    def _detect_content_type(text: str) -> str:
        if "\\(" in text or "\\[" in text or "$$" in text:
            return "formula"
        if "|" in text and "---" in text:
            return "table"
        return "text"

    @staticmethod
    def _split_by_headers(markdown: str) -> List[str]:
        """按 Markdown 标题层级切分"""
        import re
        sections = re.split(r'\n(?=#{1,3}\s)', markdown)
        return [s.strip() for s in sections if s.strip()]

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return len(text) // 3  # 粗略估算

    @staticmethod
    def _split_long_section(text: str, max_tokens: int = 1200) -> List[str]:
        """对超长段落按句子边界切分"""
        import re
        sentences = re.split(r'(?<=[.!?。！？])\s+', text)
        chunks, current = [], ""
        for sent in sentences:
            if DocumentPipeline._estimate_tokens(current + sent) > max_tokens and current:
                chunks.append(current.strip())
                current = sent
            else:
                current += " " + sent
        if current.strip():
            chunks.append(current.strip())
        return chunks
```

**文档解析架构图：**

```
PDF 上传
  │
  ▼
┌──────────────────────────────────┐
│     MinerU Parser (Docker)       │
│  ┌──────────┐  ┌──────────────┐  │
│  │ PDF-     │  │ 公式识别     │  │
│  │ Extract  │→ │ (LaTeX)      │  │
│  │ -Kit     │  ├──────────────┤  │
│  │ (版面    │  │ 表格结构     │  │
│  │  分析)   │  │ 提取         │  │
│  └──────────┘  └──────────────┘  │
│              ▼                    │
│     高质量 Markdown 输出          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│    Semantic Chunker              │
│  · 按标题层级切分                 │
│  · 保持公式/表格完整性            │
│  · 500~1500 tokens/chunk         │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Embedding + Storage            │
│  · LLM Gateway → Embedding      │
│  · PostgreSQL + pgvector 存储    │
│  · 元数据（标题、作者、页码）     │
└──────────────────────────────────┘
```

### 3.3 API 路由设计

```
# 模块管理
GET    /api/modules                        # 列出已加载模块
POST   /api/modules/{id}/load              # 加载模块
DELETE /api/modules/{id}/unload             # 卸载模块
GET    /api/modules/{id}/config             # 获取模块配置

# 模块执行
POST   /api/modules/{id}/run               # 同步执行
POST   /api/modules/{id}/stream            # SSE 流式执行（返回 task_id）
POST   /api/modules/{id}/stop              # 中断执行

# [NEW v1.1] 任务状态管理
GET    /api/tasks/{task_id}/state           # 获取任务状态快照
GET    /api/tasks/{task_id}/events?after=N  # 获取 event_id > N 的所有事件
POST   /api/tasks/{task_id}/resume          # 重新建立 SSE 流（断线恢复）
DELETE /api/tasks/{task_id}                 # 取消任务

# [NEW v1.1] 文档管道
POST   /api/documents/upload               # 上传文档
GET    /api/documents/{doc_id}/status       # 解析状态
GET    /api/documents/{doc_id}/chunks       # 获取分块结果
POST   /api/documents/search               # 跨文档语义搜索

# 会话与记忆
GET    /api/sessions                        # 会话列表
POST   /api/sessions                        # 创建会话
GET    /api/sessions/{id}/history           # 会话历史
POST   /api/memory/search                   # 记忆检索

# LLM Provider
GET    /api/providers                       # 可用 Provider 列表（从 LiteLLM 获取）
POST   /api/providers/{name}/test           # 测试连通性
GET    /api/providers/cost                  # 成本统计

# 工具
GET    /api/tools                           # 可用工具列表
POST   /api/tools/{name}/test               # 测试工具
```

### 3.4 [✏ v1.1 增强] 流式响应设计

```python
@router.post("/api/modules/{module_id}/stream")
async def stream_module(module_id: str, request: ModuleRunRequest):
    """SSE 流式返回，每个事件带 event_id，支持断线恢复"""

    # 创建任务
    task_id = await task_state_mgr.create_task(module_id, request.dict())

    async def event_generator():
        try:
            async for chunk in module_registry.run(module_id, request):
                match chunk:
                    case TextChunk(content=text):
                        event_data = {'type': 'text', 'content': text}
                    case AgentAction(agent=name, action=act):
                        event_data = {'type': 'agent', 'agent': name, 'action': act}
                    case ToolCall(tool=name, result=res):
                        event_data = {'type': 'tool', 'tool': name, 'result': res}
                    case StatusUpdate(status=s):
                        event_data = {'type': 'status', 'status': s}

                # 写入 Redis 状态树
                event_id = await task_state_mgr.append_event(task_id, event_data['type'], event_data)

                # SSE 事件带 id 字段（前端可用 Last-Event-ID 恢复）
                yield f"id: {event_id}\ndata: {json.dumps({**event_data, 'task_id': task_id})}\n\n"

            await task_state_mgr.complete_task(task_id, {})
            yield f"data: {json.dumps({'type': 'done', 'task_id': task_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'task_id': task_id})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/api/tasks/{task_id}/events")
async def get_task_events(task_id: str, after: int = 0):
    """断线恢复：获取指定 event_id 之后的所有事件"""
    events = await task_state_mgr.get_events_after(task_id, after)
    return {"task_id": task_id, "events": events}


@router.post("/api/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    """重新建立 SSE 连接，继续接收后续事件"""
    state = await task_state_mgr.get_task_state(task_id)
    if not state or state["status"] in (TaskStatus.COMPLETED, TaskStatus.FAILED):
        raise HTTPException(404, "Task not found or already finished")
    # 从当前位置继续 SSE 推送
    # ... (实现同上 event_generator，但从当前 event_id 开始)
```

---

## 四、前端架构详细设计

### 4.1 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| 框架 | **Next.js 14+ (App Router)** | RSC 支持、文件路由、SSR/SSG 灵活 |
| 状态管理 | **Zustand** | 轻量、无样板代码、persist 中间件 |
| UI 组件 | **shadcn/ui + Tailwind CSS** | 可定制、无运行时、复制即用 |
| Markdown | **react-markdown + rehype** | 论文级渲染、代码高亮、LaTeX 支持 |
| 流式处理 | **fetch + ReadableStream** | 支持 POST SSE，比 EventSource 灵活 |
| 图表 | **Plotly.js** | 交互式数据可视化 |

### 4.2 前端模块化架构

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 全局布局（侧边栏 + 顶栏）
│   ├── page.tsx                  # 首页 / Dashboard
│   └── modules/
│       └── [moduleId]/
│           └── page.tsx          # 动态模块页面（通用容器）
│
├── components/
│   ├── shell/                    # 应用外壳
│   │   ├── Sidebar.tsx           # 模块导航侧边栏
│   │   ├── TopBar.tsx            # 顶栏（Provider 切换、设置）
│   │   └── ModuleContainer.tsx   # 模块通用容器
│   │
│   ├── shared/                   # 跨模块共享组件
│   │   ├── ChatPanel.tsx         # 通用对话面板
│   │   ├── StreamRenderer.tsx    # SSE 流式渲染器（含断线恢复逻辑）
│   │   ├── AgentTimeline.tsx     # Agent 执行时间线
│   │   ├── ToolCallCard.tsx      # 工具调用展示卡片
│   │   ├── MarkdownViewer.tsx    # Markdown 渲染器
│   │   └── DocumentUploader.tsx  # 文档上传组件 [NEW v1.1]
│   │
│   └── modules/                  # 各模块专属组件
│       ├── ideaspark/
│       │   ├── IdeaBoard.tsx
│       │   ├── AgentPanel.tsx
│       │   └── VoteResult.tsx
│       ├── codelab/
│       │   ├── CodeEditor.tsx
│       │   ├── Terminal.tsx
│       │   └── FileTree.tsx
│       └── writer/
│           ├── EditorPane.tsx
│           ├── OutlinePanel.tsx
│           └── CitationMgr.tsx
│
├── lib/
│   ├── api-client.ts             # 后端 API 客户端
│   ├── sse-client.ts             # SSE 流式客户端（含恢复逻辑）
│   └── module-loader.ts          # 前端模块动态加载
│
├── stores/
│   ├── app-store.ts              # 全局状态（当前模块、Provider）
│   ├── session-store.ts          # 会话状态
│   ├── task-store.ts             # 任务状态（断线恢复用）[NEW v1.1]
│   └── module-stores/
│       ├── ideaspark-store.ts
│       ├── codelab-store.ts
│       └── writer-store.ts
│
└── types/
    ├── module.ts
    ├── agent.ts
    └── stream.ts
```

### 4.3 模块容器设计（Module Shell）

```typescript
// ModuleContainer.tsx

interface ModuleViewProps {
  moduleId: string;
  config: ModuleConfig;
}

export function ModuleContainer({ moduleId, config }: ModuleViewProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'board' | 'detail'>('chat');

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <ModuleTabBar tabs={config.tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'chat' && (
          <ChatPanel moduleId={moduleId} onSend={(msg) => streamModule(moduleId, msg)} />
        )}
        {activeTab === 'board' && <ModuleBoardView moduleId={moduleId} />}
        {activeTab === 'detail' && <ModuleDetailView moduleId={moduleId} />}
      </div>

      <CollapsiblePanel title="Agent Activity">
        <AgentTimeline moduleId={moduleId} />
      </CollapsiblePanel>
    </div>
  );
}
```

### 4.4 [✏ v1.1 增强] SSE 流式客户端（含断线恢复）

```typescript
// sse-client.ts — v1.1 增强版，支持断线自动恢复

type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'agent'; agent: string; action: string }
  | { type: 'tool'; tool: string; result: any }
  | { type: 'status'; status: string }
  | { type: 'done'; task_id: string }
  | { type: 'error'; message: string };

interface StreamHandlers {
  onText: (text: string) => void;
  onAgent: (agent: string, action: string) => void;
  onTool: (tool: string, result: any) => void;
  onStatus: (status: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onReconnecting?: () => void;  // [NEW v1.1]
}

export class ResilientSSEClient {
  private taskId: string | null = null;
  private lastEventId: number = 0;
  private abortController: AbortController | null = null;
  private maxRetries = 3;

  async start(
    moduleId: string,
    request: ModuleRunRequest,
    handlers: StreamHandlers
  ) {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`/api/modules/${moduleId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      await this.consumeStream(response, handlers);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // 网络错误 → 尝试恢复
      await this.recover(handlers);
    }
  }

  private async consumeStream(response: Response, handlers: StreamHandlers) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 解析 event_id
        if (line.startsWith('id: ')) {
          this.lastEventId = parseInt(line.slice(4), 10);
          continue;
        }
        if (!line.startsWith('data: ')) continue;

        const event: SSEEvent & { task_id?: string } = JSON.parse(line.slice(6));
        if (event.task_id) this.taskId = event.task_id;

        this.dispatchEvent(event, handlers);
        if (event.type === 'done' || event.type === 'error') return;
      }
    }
  }

  /**
   * [NEW v1.1] 断线恢复流程：
   * 1. 获取任务状态（是否仍在运行）
   * 2. 拉取缺失的事件（从 lastEventId 开始）
   * 3. 重新建立 SSE 连接
   */
  private async recover(handlers: StreamHandlers, retryCount = 0) {
    if (!this.taskId || retryCount >= this.maxRetries) {
      handlers.onError('Connection lost and recovery failed');
      return;
    }

    handlers.onReconnecting?.();
    await this.delay(1000 * Math.pow(2, retryCount));  // 指数退避

    try {
      // Step 1: 检查任务状态
      const stateRes = await fetch(`/api/tasks/${this.taskId}/state`);
      const state = await stateRes.json();

      if (state.status === 'completed') {
        // 任务已完成，补齐缺失事件
        const eventsRes = await fetch(
          `/api/tasks/${this.taskId}/events?after=${this.lastEventId}`
        );
        const { events } = await eventsRes.json();
        for (const event of events) {
          this.dispatchEvent(event, handlers);
        }
        handlers.onDone();
        return;
      }

      if (state.status === 'running') {
        // Step 2: 补齐缺失事件
        const eventsRes = await fetch(
          `/api/tasks/${this.taskId}/events?after=${this.lastEventId}`
        );
        const { events } = await eventsRes.json();
        for (const event of events) {
          this.lastEventId = event.event_id;
          this.dispatchEvent(event, handlers);
        }

        // Step 3: 重建 SSE 连接
        const resumeRes = await fetch(`/api/tasks/${this.taskId}/resume`, {
          method: 'POST',
          signal: this.abortController?.signal,
        });
        await this.consumeStream(resumeRes, handlers);
      }
    } catch (error) {
      await this.recover(handlers, retryCount + 1);
    }
  }

  private dispatchEvent(event: SSEEvent, handlers: StreamHandlers) {
    switch (event.type) {
      case 'text':   handlers.onText(event.content); break;
      case 'agent':  handlers.onAgent(event.agent, event.action); break;
      case 'tool':   handlers.onTool(event.tool, event.result); break;
      case 'status': handlers.onStatus(event.status); break;
      case 'done':   handlers.onDone(); break;
      case 'error':  handlers.onError(event.message); break;
    }
  }

  stop() {
    this.abortController?.abort();
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 五、模块设计规范

### 5.1 已规划模块

| 模块 ID | 名称 | 功能 | 状态 |
|---------|------|------|------|
| `ideaspark` | 💡 IdeaSpark | 多 Agent idea 涌现、Persona 辩论、进化筛选 | ✅ 已设计 |
| `codelab` | 🔧 CodeLab | AI 辅助编码、代码审查、调试、重构 | 📋 待开发 |
| `writer` | ✍️ WriterAI | 学术论文写作、大纲生成、段落润色 | 📋 待开发 |
| `datalens` | 📊 DataLens | 数据分析、可视化生成、统计检验 | 📋 待开发 |
| `litreview` | 📚 LitReview | 文献综述、引用图谱分析、研究趋势 | 📋 待开发 |
| `reviewer` | 🔍 Reviewer | 模拟审稿人，对论文进行批判性审查 | 📋 待开发 |

### 5.2 模块开发模板

开发一个新模块只需三步：

**第一步：创建 manifest.json**

```json
{
  "id": "codelab",
  "name": "🔧 CodeLab",
  "version": "0.1.0",
  "description": "AI 辅助编码与代码审查",
  "icon": "terminal",
  "entry_point": "modules.codelab.CodeLabModule",
  "required_tools": ["code_exec", "github_search", "web_search"],
  "required_models": ["divergent", "reasoning"],
  "config_schema": {
    "language": { "type": "string", "default": "python" },
    "review_strictness": { "type": "number", "default": 0.7 }
  }
}
```

**第二步：实现 ModuleBase**

```python
class CodeLabModule(ModuleBase):

    def manifest(self) -> ModuleManifest:
        return load_from_json("modules/codelab/manifest.json")

    async def execute(self, request: ModuleRequest, ctx: ModuleContext) -> AsyncGenerator:
        project_ctx = await ctx.memory.retrieve(request.input, scope=Scope.PROJECT)

        # 使用 LiteLLM model_name 而非具体 provider
        coder = Agent(role="coder", model="divergent", temperature=0.7)
        reviewer = Agent(role="reviewer", model="reasoning", temperature=0.3)

        code = await coder.run(request.input, context=project_ctx)
        yield TextChunk(content=code)

        review = await reviewer.run(f"Review this code:\n{code}")
        yield AgentAction(agent="reviewer", action=review)
```

**第三步：添加前端组件（可选）**

在 `components/modules/codelab/` 下添加模块专属 UI。如果不添加，模块将使用默认的 ChatPanel + AgentTimeline 通用界面。

---

## 六、部署架构

### 6.1 Docker Compose 部署

```yaml
# docker-compose.yml — v1.1 更新
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: sololab
      POSTGRES_PASSWORD: ${DB_PASSWORD:?required}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  # [NEW v1.1] LiteLLM Proxy — LLM 网关
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    restart: unless-stopped
    volumes:
      - ./litellm_config.yaml:/app/config.yaml:ro
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY:?required}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    ports: ["4000:4000"]

  # [NEW v1.1] MinerU — 文档解析服务
  mineru:
    build:
      context: ./services/mineru
      dockerfile: Dockerfile
    restart: unless-stopped
    volumes:
      - ./storage:/app/storage
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]  # MinerU 模型推理需要 GPU

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }
      litellm: { condition: service_started }
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/sololab
      REDIS_URL: redis://redis:6379
      LITELLM_BASE_URL: http://litellm:4000   # [NEW] 指向 LiteLLM 网关
      MINERU_SERVICE_URL: http://mineru:8000   # [NEW] 指向 MinerU 服务
      TAVILY_API_KEY: ${TAVILY_API_KEY:-}
    volumes:
      - ./modules:/app/modules
      - ./storage:/app/storage

  ui:
    build:
      context: .
      dockerfile: Dockerfile.ui
      args:
        NEXT_PUBLIC_API_URL: ${PUBLIC_URL:-http://localhost}/api
    depends_on: [api]

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on: [api, ui]

volumes:
  pgdata:
  caddy_data:
```

### 6.2 部署流程

```bash
# 1. 克隆仓库
git clone https://github.com/yourname/sololab.git && cd sololab

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Keys

# 3. 一键启动
docker-compose up -d

# 4. 验证服务
curl http://localhost:4000/health   # LiteLLM 健康检查
curl http://localhost/api/modules    # API 模块列表

# 5. 访问
open http://localhost
```

---

## 七、开发路线图

### Phase 1 — 基础骨架（2 周）

- [ ] FastAPI 后端骨架 + Module Registry
- [ ] LiteLLM 网关集成 + litellm_config.yaml 配置
- [ ] PostgreSQL + pgvector 数据模型
- [ ] Redis 任务状态管理 (TaskStateManager)
- [ ] Next.js 前端骨架 + Module Shell + SSE 流式渲染（含断线恢复）
- [ ] Docker Compose 部署脚本（含 LiteLLM + MinerU 容器）
- [ ] IdeaSpark 模块移植接入

### Phase 2 — 模块扩展（3 周）

- [ ] Document Pipeline 集成（MinerU 解析 + 语义分块 + 向量存储）
- [ ] CodeLab 模块（AI 编码 + 代码审查）
- [ ] WriterAI 模块（论文写作辅助）
- [ ] Memory Manager 跨模块记忆
- [ ] Tool Registry + Tavily/arXiv/Semantic Scholar 集成
- [ ] 前端模块导航 + 配置面板 + 文档上传界面

### Phase 3 — 打磨上线（2 周）

- [ ] DataLens 模块（数据分析可视化）
- [ ] LitReview 模块（文献综述）
- [ ] 全局 Dashboard（项目进度、使用统计、LLM 成本看板）
- [ ] Prompt Manager（prompt 版本管理）
- [ ] 性能优化 + 错误处理 + 日志系统

---

## 八、关键设计决策备忘

| 决策 | 选择 | 否决方案 | 理由 |
|------|------|---------|------|
| LLM 调用 [✏ v1.1] | **LiteLLM 网关** | 自研 Client 抽象层 | 100+ 模型统一格式，内置降级/成本追踪，单人无法维护各家 SDK 差异 |
| 任务状态 [✏ v1.1] | **Redis Stream + event_id** | 纯 SSE 无状态 | SSE 脆弱，长耗时任务必须支持断线恢复 |
| 文档解析 [✏ v1.1] | **MinerU** | 简单 file_read | 学术 PDF 双栏/公式/表格是重灾区，MinerU 使用 PDF-Extract-Kit 模型专业处理 |
| 数据库 | PostgreSQL + pgvector | Pinecone / Qdrant | 一体化，少一个服务少一个故障点 |
| 前端框架 | Next.js | SPA (Vite + React) | 需要 SSR 能力，未来可做 SEO |
| 状态管理 | Zustand | Redux | 一人项目不需要 Redux 的仪式感 |
| 模块通信 | SSE (Server-Sent Events) | WebSocket | 单向流足够，SSE 更简单；断线恢复由 TaskStateManager 补齐 |
| 模块加载 | 文件系统 manifest | 数据库注册 | 开发阶段改文件比改数据库快 |

---

*文档版本：v1.1 | 更新日期：2026-03-12 | 项目代号：SoloLab*
*变更：LLM 网关重构 / 任务状态恢复 / 文档解析管道*
