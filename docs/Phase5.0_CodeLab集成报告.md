# Phase 5.0 CodeLab 环境搭建与引擎集成 — 实现与测试报告

> 版本：v0.4.0 | 日期：2026-03-30 | 作者：huangsuxiang

---

## 1. 概述

Phase 5.0 是 CodeLab 模块的第一个里程碑，目标是将开源项目 OpenCode 的核心引擎集成为 SoloLab 的 AI 编码助手模块基础设施。本阶段完成了从仓库清理、环境验证、配置联动到完整桥接层实现和 Docker 部署的全链路搭建。

| 子任务 | 内容 | 状态 |
|--------|------|------|
| 5.0.1 清理 OpenCode 仓库 | 确认仅保留 5 个核心包，workspace 配置正确 | 已完成 |
| 5.0.2 引擎独立可运行 | bun install + 1621 个测试全部通过 | 已完成 |
| 5.0.3 配置集成 | .env 联动、opencode.jsonc、Provider 连通 | 已完成 |
| 5.0.4 后端桥接层 | CodeLab 模块骨架 + OpenCodeBridge + 专属 API 路由 | 已完成 |
| 5.0.5 Docker Compose | opencode.Dockerfile + 服务编排 + 内部网络 | 已完成 |
| 5.0.6 测试全覆盖 | 单元 36 + API 单元 12 + 集成 10 + E2E 5 = 63 个测试 | 已完成 |

---

## 2. 架构设计

### 2.1 系统拓扑

```
┌──────────────┐     HTTP/SSE     ┌──────────────────┐
│   Frontend   │ ◄──────────────► │  SoloLab Backend  │
│  (Next.js)   │                  │   (FastAPI)       │
└──────────────┘                  └────────┬─────────┘
                                           │ HTTP (aiohttp)
                                           │ ?directory=xxx
                                           ▼
                                  ┌──────────────────┐
                                  │  OpenCode Server  │
                                  │   (Hono/Bun)     │
                                  │   Port: 3100      │
                                  └──────────────────┘
                                           │
                                    ┌──────┴──────┐
                                    │   SQLite    │  (会话/记忆/权限)
                                    └─────────────┘
```

### 2.2 桥接层设计

SoloLab 后端通过 `OpenCodeBridge` 类以 HTTP 客户端方式调用 OpenCode Server API，而非直接嵌入 TypeScript 运行时。这一设计选择基于以下考虑：

- **运行时隔离**：Python (FastAPI) 和 TypeScript (Bun) 各自独立部署，互不干扰
- **独立扩展**：OpenCode 引擎可独立升级而不影响后端
- **Docker 友好**：两个服务各自容器化，通过内部网络通信
- **故障隔离**：引擎崩溃不会拖垮整个后端

### 2.3 OpenCode Server Workspace 机制

OpenCode Server 的路由分为两层：
- **全局路由** (`/global/*`)：不需要 workspace 上下文
- **实例路由** (`/session/*`, `/permission/*` 等)：需要 `?directory=xxx` 查询参数或 `x-opencode-directory` header

桥接层通过 `_dir_params()` 方法在所有请求中自动注入 `directory` 参数，默认指向 SoloLab 项目根目录。

---

## 3. 新增文件清单

### 3.1 CodeLab 模块（后端）

| 文件 | 行数 | 职责 |
|------|------|------|
| `backend/src/sololab/modules/codelab/__init__.py` | 2 | 模块包标记 |
| `backend/src/sololab/modules/codelab/manifest.json` | 25 | 模块元数据（id/name/version/config_schema） |
| `backend/src/sololab/modules/codelab/module.py` | ~160 | `CodeLabModule` 类，继承 `ModuleBase`，支持 chat/health/sessions/abort/diff/permission 等 action |
| `backend/src/sololab/modules/codelab/bridge.py` | ~240 | `OpenCodeBridge` HTTP 桥接层，封装 OpenCode Server 全部 API |
| `backend/src/sololab/api/codelab.py` | ~190 | 14 个专属 API 路由端点，SSE 流式支持 |

### 3.2 配置文件

| 文件 | 变更 |
|------|------|
| `opencode/opencode.jsonc` | 新增：Server 端口、Google Provider、权限规则 |
| `.env` | 新增：OPENCODE_* + GOOGLE_API_KEY/BASE_URL |
| `.env.example` | 新增：完整的多 Provider 配置示例和注释 |
| `backend/src/sololab/config/settings.py` | 新增：opencode_url/password/username 三个配置项 |

### 3.3 Docker

| 文件 | 说明 |
|------|------|
| `infra/docker/opencode.Dockerfile` | 基于 oven/bun:1.3-alpine，含 ripgrep + git |
| `docker-compose.yml` | 新增 opencode 服务 + 健康检查 + backend 依赖关系 |

### 3.4 测试

| 文件 | 测试数 | 类型 |
|------|--------|------|
| `tests/unit/backend/modules/test_codelab.py` | 24 | 单元（Bridge + Module 生命周期） |
| `tests/unit/backend/api/test_codelab_api.py` | 12 | 单元（API 路由 + Mock Bridge） |
| `tests/integration/api/test_codelab_bridge.py` | 10 | 集成（SoloLab ↔ OpenCode 端到端） |
| `tests/e2e/specs/codelab-flow.spec.ts` | 5 | E2E（Playwright 用户旅程） |

---

## 4. 修改文件清单

### 4.1 新功能接入

| 文件 | 变更内容 |
|------|---------|
| `backend/src/sololab/main.py` | 导入并注册 `codelab` 路由（2 行变更） |

### 4.2 Bug 修复（顺带发现并修复的已有问题）

| 文件 | 问题 | 修复 |
|------|------|------|
| `backend/src/sololab/core/llm_gateway.py` | Gemini 3 Flash thinking mode 下 tool call 多轮对话丢失 `thought_signature` 导致 400 错误 | 新增 `raw_assistant_message` 字段保留完整 assistant 消息结构 |
| `backend/src/sololab/core/llm_gateway.py` | `gemini-3-flash-preview` 不在定价表中，费用始终为 0 | 添加定价条目 `(0.332, 3.0)` |
| `backend/src/sololab/modules/ideaspark/agents/agent_runner.py` | 构建工具调用后续消息时手动拼装，丢失 thinking 签名 | 优先使用 `raw_assistant_message` 原样传回 |
| `backend/src/sololab/core/memory_manager.py` | asyncpg 将 `:embedding::vector` 中的 `:` 误解析为参数占位符 | 改用 `CAST(:embedding AS vector)` 语法 |

---

## 5. API 端点

Phase 5.0 新增的 CodeLab 专属路由（前缀 `/api/modules/codelab`）：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/health` | OpenCode Server 连通性检查 |
| POST | `/session` | 创建编码会话 |
| GET | `/session` | 列出会话（支持 directory/limit 过滤） |
| GET | `/session/{id}` | 获取会话详情 |
| DELETE | `/session/{id}` | 删除会话 |
| GET | `/session/{id}/messages` | 获取会话消息 |
| POST | `/session/{id}/msg` | 发送消息（SSE 流式响应） |
| GET | `/session/{id}/stream` | SSE 监听会话事件 |
| POST | `/session/{id}/abort` | 中止当前执行 |
| GET | `/session/{id}/diff` | 获取会话代码差异 |
| GET | `/session/{id}/files` | 列出会话相关文件 |
| POST | `/permission/{id}` | 回复权限请求 |
| GET | `/permission` | 列出待处理权限 |

所有端点均包含错误处理，OpenCode Server 不可用时返回 `502 Bad Gateway`。

---

## 6. 测试报告

### 6.1 单元测试（239 passed）

```
tests/unit/backend/modules/test_codelab.py      24 passed    0.14s
tests/unit/backend/api/test_codelab_api.py       12 passed    2.04s
tests/unit/backend/core/test_llm_gateway.py       6 passed   71.49s  (真实 LLM 调用)
tests/unit/backend/modules/test_agent_runner.py    4 passed   71.49s  (真实 LLM 调用)
其他已有单元测试                                   193 passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计                                              239 passed, 0 failed
```

**CodeLab 单元测试覆盖：**
- Manifest 校验（4 个）：ID、字段完整性、config schema、JSON 一致性
- Bridge 初始化与 SSE 解析（7 个）：默认参数、自定义参数、4 种 SSE 格式、health check
- Bridge HTTP 操作（5 个）：create/list/abort/permission/close（均 Mock）
- Module 生命周期（7 个）：on_load/on_unload/execute 各 action
- API 路由（12 个）：自动加载、配置获取、Mock Bridge 10 个 CRUD 端点

### 6.2 集成测试（44 passed, 1 skipped）

```
tests/integration/api/test_codelab_bridge.py      10 passed    4.24s
tests/integration/api/test_ideaspark_flow.py        4 passed  265.78s  (含真实 LLM 多轮调用)
tests/integration/api/test_module_flow.py           3 passed
tests/integration/api/test_phase4_flow.py           7 passed
tests/integration/api/test_session_flow.py          2 passed
tests/integration/api/test_document_flow.py         5 passed
tests/integration/api/test_doc_parse_report.py      4 passed
tests/integration/database/test_memory_store.py     3 passed
tests/integration/llm/test_litellm_gateway.py       4 passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计                                               44 passed, 0 failed, 1 skipped
```

**CodeLab 集成测试覆盖：**
- SoloLab → OpenCode 健康检查（1 个）
- 会话 CRUD 全链路（4 个）：list/create+get/create+delete/messages
- 权限列表（1 个）
- 模块 stream 端点（1 个）
- Bridge 直连测试（3 个）：health/create/list

### 6.3 端到端测试（5 个，需启动前端+后端）

```
tests/e2e/specs/codelab-flow.spec.ts
  - CodeLab card visible on dashboard
  - Navigate to CodeLab module page
  - CodeLab module loaded via API
  - CodeLab health API returns response
  - CodeLab config API returns schema
```

### 6.4 OpenCode 引擎测试（1621 passed）

```
bun test --cwd packages/opencode --timeout 30000
  1621 pass, 8 skip, 0 fail
  3636 expect() calls across 135 files [150.06s]
```

---

## 7. 配置说明

### 7.1 环境变量一览

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `OPENCODE_PORT` | 3100 | OpenCode Server 端口 |
| `OPENCODE_HOST` | 127.0.0.1 | OpenCode Server 绑定地址 |
| `OPENCODE_URL` | http://localhost:3100 | SoloLab 后端访问 OpenCode 的 URL |
| `OPENCODE_SERVER_PASSWORD` | (空) | Basic Auth 密码，生产环境必设 |
| `OPENCODE_SERVER_USERNAME` | opencode | Basic Auth 用户名 |
| `GOOGLE_API_KEY` | - | Google Gemini API Key（OpenCode 直连） |
| `GOOGLE_BASE_URL` | https://generativelanguage.googleapis.com/v1beta | Gemini API 基础 URL |

### 7.2 Docker Compose 新增服务

```yaml
opencode:
  build: infra/docker/opencode.Dockerfile
  ports: ["${OPENCODE_PORT:-3100}:3100"]
  depends_on: []  # 独立服务
  healthcheck: bun --eval fetch('http://localhost:3100/session')...

backend:
  depends_on: [postgres, redis, opencode]  # 新增 opencode 依赖
  environment:
    OPENCODE_URL: "http://opencode:3100"   # Docker 内部服务名
```

### 7.3 OpenCode 配置（opencode/opencode.jsonc）

```jsonc
{
  "server": { "port": 3100, "hostname": "127.0.0.1" },
  "provider": {
    "google": {
      "options": {
        "apiKey": "{env:GOOGLE_API_KEY}",     // 从 .env 读取
        "baseURL": "{env:GOOGLE_BASE_URL}"
      }
    }
  },
  "model": "google/gemini-3-flash-preview"
}
```

---

## 8. 已知限制与后续计划

### 8.1 当前限制

1. **端口冲突**：本地开发时 3100 端口可能被 OrbStack 等工具占用，需手动指定 `--port 3101`
2. **Gemini thinking mode**：需要完整保留 `raw_assistant_message` 才能正常进行多轮工具调用
3. **E2E 测试**：需要前端和后端同时运行，当前未纳入 CI 自动化

### 8.2 Phase 5.1 预览

下一阶段将基于 `opencode/OPTIMIZATION_PLAN.md` 开始核心性能优化：
- Token 估算精度（当前 ~30-50% 误差 → 目标 <10%）
- 原子文件操作（防止崩溃导致文件损坏）
- 工具初始化缓存（减少 ~200ms/次的重复初始化）
- 指令加载缓存（FileWatcher 实时失效）

---

## 9. 快速验证步骤

```bash
# 1. 启动 OpenCode Server
conda activate sololab
cd opencode && bun run serve --port 3101

# 2. 运行单元测试（不需要 OpenCode Server）
python -m pytest tests/unit/backend/modules/test_codelab.py tests/unit/backend/api/test_codelab_api.py -v

# 3. 运行集成测试（需要 OpenCode Server + PostgreSQL + Redis）
OPENCODE_PORT=3101 OPENCODE_URL=http://localhost:3101 python -m pytest tests/integration/api/test_codelab_bridge.py -v

# 4. 运行全部测试
python -m pytest tests/unit/ -v           # 239 passed
OPENCODE_PORT=3101 OPENCODE_URL=http://localhost:3101 python -m pytest tests/integration/ -v  # 44 passed
```
