# Phase 2 阶段性报告 — IdeaSpark 多智能体创意生成模块

> 完成日期：2026-03-22
> 状态：✅ 核心功能完成（2 项延后至 Phase 3）

---

## 一、目标回顾

Phase 2 的目标是实现 **IdeaSpark 模块** —— 一个基于分离-汇聚（Separate-Together）协作模式的多智能体创意生成系统。

核心功能：
1. 5 个差异化角色智能体（发散者/专家/批评者/连接者/评估者）
2. 完整的分离-汇聚编排流程
3. 外部工具集成（Tavily/arXiv/Semantic Scholar）
4. 前端实时 SSE 流式展示
5. 全面的单元/集成/端到端测试

---

## 二、完成情况

### 2.1 后端实现

#### 外部工具（3/4 完成）

| 工具 | 文件 | 状态 | API |
|------|------|------|-----|
| Tavily 搜索 | `tools/tavily_search.py` | ✅ | Tavily REST API，aiohttp |
| arXiv 搜索 | `tools/arxiv_search.py` | ✅ | arXiv Atom API，XML 解析 |
| Semantic Scholar | `tools/scholar_search.py` | ✅ | S2 Graph API，aiohttp |
| PDF 阅读 | `tools/doc_parse.py` | ⏳ | 延后至 Phase 3（MinerU 集成）|

工具在 `main.py` lifespan 中自动注册到 ToolRegistry。

#### AgentRunner 智能体执行引擎

**文件**: `modules/ideaspark/agents/agent_runner.py`

- 接收 AgentConfig + LLMGateway + ToolRegistry
- 构建 system prompt + context messages → 调用 LLM generate
- 工具调用支持：解析 `[tool: tool_name(query="...")]` 格式，执行工具后将结果注入上下文再次调用 LLM
- 输出解析：自动检测 msg_type（idea/critique/synthesis/vote），清理认知规划前缀
- 状态追踪：tokens_used、cost_usd、messages_sent

#### Orchestrator 编排器

**文件**: `modules/ideaspark/orchestrator.py`

完整实现分离-汇聚流程：

| 阶段 | 方法 | 实现 |
|------|------|------|
| 分离 | `_separate_phase()` | divergent + expert 角色 asyncio.gather 并行，每角色生成 idea |
| 聚类 | `_cluster_ideas()` | LLMGateway.embed() + scikit-learn KMeans，降级为均匀分组 |
| 汇聚 | `_together_phase_grouped()` | critic 批评 + connector 综合，2 轮迭代 |
| 综合 | `_global_synthesis()` | connector 跨组融合去重 |
| 评估 | `_tournament_evaluate()` | evaluator Elo 锦标赛，随机配对比较 |
| 收敛 | `_convergence_check()` | Top-K ID 重叠率 ≥ 80% 则收敛 |
| 迭代 | `run()` | 多轮循环，全程 yield SSE 事件 |

SSE 事件格式：
- `status` — 阶段/轮次更新
- `agent` — 智能体动作（thinking/critique/synthesis/done）
- `idea` — 生成的创意
- `vote` — Elo 评分排名
- `done` — 最终结果 + 费用

### 2.2 前端实现

| 组件 | 文件 | 功能 |
|------|------|------|
| ChatPanel | `shared/ChatPanel.tsx` | 接入 ResilientSSEClient，实时 SSE 流式，Stop 按钮 |
| AgentPanel | `modules/ideaspark/AgentPanel.tsx` | 5 角色状态面板（图标 + 颜色 + 实时状态） |
| IdeaBoard | `modules/ideaspark/IdeaBoard.tsx` | 卡片网格展示 ideas（Elo 排序 + 排名徽章） |
| VoteResult | `modules/ideaspark/VoteResult.tsx` | 锦标赛结果（金银铜排名 + Elo 分 + 费用） |
| AgentTimeline | `shared/AgentTimeline.tsx` | 彩色时间线（agent 活动流 + 时间戳） |
| ModuleContainer | `shell/ModuleContainer.tsx` | 集成所有组件（Chat/Ideas/Results 标签页 + 侧边栏） |

状态管理更新：
- `ideaspark-store.ts` — 新增 agentEvents、costUsd、phase 扩展（cluster/synthesize/converged）
- `stream.ts` — 新增 idea/vote/task_created 事件类型
- `sse-client.ts` — 更新 dispatchEvent 支持所有新事件

---

## 三、测试报告

### 3.1 单元测试（70 个）

```
tests/unit/backend/api/test_modules_api.py       9 passed
tests/unit/backend/api/test_tasks_api.py          3 passed
tests/unit/backend/core/test_llm_gateway.py       6 passed（真实 Qwen API）
tests/unit/backend/core/test_memory_manager.py    3 passed
tests/unit/backend/core/test_module_registry.py   9 passed
tests/unit/backend/core/test_task_state_manager.py 8 passed（fakeredis）
tests/unit/backend/core/test_tool_registry.py     6 passed
tests/unit/backend/modules/test_ideaspark.py      4 passed
tests/unit/backend/modules/test_agent_runner.py   4 passed（真实 LLM）
tests/unit/backend/modules/test_orchestrator.py   9 passed（含真实 Embedding 聚类）
tests/unit/backend/tools/test_tavily.py           3 passed（真实 Tavily API）
tests/unit/backend/tools/test_arxiv.py            3 passed（XML 解析）
tests/unit/backend/tools/test_scholar.py          3 passed
─────────────────────────────────────────────
总计：70 passed
```

### 3.2 集成测试（13 个）

```
tests/integration/api/test_ideaspark_flow.py      4 passed（完整 SSE 流 + 真实 LLM）
tests/integration/api/test_module_flow.py         3 passed
tests/integration/database/test_memory_store.py   2 passed
tests/integration/llm/test_litellm_gateway.py     4 passed（真实 Qwen + Embedding）
─────────────────────────────────────────────
总计：13 passed（耗时 ~8 分钟，含真实 LLM 多轮调用）
```

### 3.3 端到端测试（4 个）

```
Dashboard › displays SoloLab title and module cards    passed
Dashboard › sidebar shows module navigation            passed
Dashboard › topbar shows provider selector             passed
Module Navigation › navigate to IdeaSpark module page  passed
─────────────────────────────────────────────
总计：4 passed（Playwright + Chromium）
```

### 3.4 总计

| 类型 | Phase 1 | Phase 2 新增 | 总计 | 通过 |
|------|---------|-------------|------|------|
| 单元测试 | 50 | +20 | 70 | 70 |
| 集成测试 | 9 | +4 | 13 | 13 |
| 端到端测试 | 4 | 0 | 4 | 4 |
| **合计** | **63** | **+24** | **87** | **87** |

---

## 四、新增/修改文件清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `backend/src/sololab/modules/ideaspark/agents/agent_runner.py` | 智能体执行引擎 |
| `tests/unit/backend/tools/test_arxiv.py` | arXiv 工具测试 |
| `tests/unit/backend/tools/test_scholar.py` | Scholar 工具测试 |
| `tests/unit/backend/modules/test_agent_runner.py` | AgentRunner 测试 |
| `tests/unit/backend/modules/test_orchestrator.py` | 编排器测试 |
| `tests/integration/api/test_ideaspark_flow.py` | IdeaSpark 集成测试 |

### 重写文件

| 文件 | 改动 |
|------|------|
| `tools/tavily_search.py` | 从 stub → 真实 Tavily API（aiohttp） |
| `tools/arxiv_search.py` | 从 stub → 真实 arXiv API（HTTPS + XML） |
| `tools/scholar_search.py` | 从 stub → 真实 S2 API（aiohttp） |
| `modules/ideaspark/orchestrator.py` | 从 stub → 完整编排器（7 个阶段） |
| `shared/ChatPanel.tsx` | 从占位 → SSE 集成 |
| `modules/ideaspark/AgentPanel.tsx` | 从占位 → 5 角色状态面板 |
| `modules/ideaspark/IdeaBoard.tsx` | 从占位 → 卡片网格 |
| `modules/ideaspark/VoteResult.tsx` | 从占位 → 锦标赛结果 |
| `shared/AgentTimeline.tsx` | 从占位 → 实时时间线 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `main.py` | lifespan 注册 4 个工具到 ToolRegistry |
| `types/stream.ts` | 新增 idea/vote/task_created 事件类型 |
| `lib/sse-client.ts` | dispatchEvent 支持新事件 |
| `stores/module-stores/ideaspark-store.ts` | 新增 agentEvents、costUsd |
| `shell/ModuleContainer.tsx` | 集成 AgentPanel/IdeaBoard/VoteResult |

---

## 五、已知限制

1. **arXiv API 国内直连不稳定** — 需要代理，工具已有超时容错
2. **Semantic Scholar 限速** — 无 API key 时 100 请求/5 分钟，测试中已做容错处理
3. **PDF 阅读工具未实现** — 延后至 Phase 3（MinerU 集成）
4. **最终报告 Markdown 渲染未实现** — 延后至 Phase 3
5. **单次完整运行费用** — 1 轮约 ¥1-2（qwen-plus-latest），多轮会累加

---

## 六、Phase 3 前瞻

Phase 3 的目标是增强功能，主要工作：

1. **记忆管理器** — pgvector 持久化 + 四级作用域
2. **文档管道** — MinerU PDF 解析 + 语义分块 + 向量存储
3. **会话管理** — 创建/历史/跨模块上下文
4. **上下文窗口管理** — 滑动窗口 + 每轮摘要压缩
5. **并发执行优化** — 信号量限速 + aiohttp 连接池
6. **错误处理与韧性** — LLM 重试降级 + Pydantic 输出校验
7. **费用控制** — 每次运行预算限制 + 实时费用追踪
