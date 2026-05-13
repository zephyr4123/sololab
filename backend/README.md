# SoloLab Backend

FastAPI 后端服务。**容器是权威运行时**，详见根目录 [CLAUDE.md](../CLAUDE.md) 和 [README.md](../README.md)。

## 目录速览

```
src/sololab/
├── main.py                # lifespan 拆成 7 个 _init_* helper；DB 必须
├── config/settings.py     # Pydantic Settings；API key fail-fast 校验
├── core/                  # 核心服务
│   ├── auth.py            # APIKeyAuth + verify_api_key
│   ├── cost_tracker.py    # 预算 + 持久化
│   ├── llm/cost.py        # CostTrackingProvider — budget/tracer/cost record 单一 hook 点
│   ├── llm/providers/     # openai / deepseek / anthropic / qwen / openai_compat
│   ├── llm_gateway.py     # 调度层；构造时接 cost_tracker/tracer/budget_alert
│   ├── observability.py   # structlog + RequestContextMiddleware + LLMCallTracer + task_context()
│   ├── rate_limiter.py    # Redis 滑动窗口；fail_open 可配
│   └── ...                # memory/session/message/document_pipeline/module_registry/tool_registry
├── api/                   # FastAPI 路由；_deps.py 暴露 AuthDep + build_module_context
├── db/                    # 持久层
│   ├── base.py            # SQLAlchemy Base + async engine/session factory
│   └── models/            # 一聚合根一文件（auth/blackboard/cost/document/memory/session/writer）
├── schemas/               # Pydantic transport models
├── modules/               # 可插拔功能模块（ideaspark / writer）
└── tools/                 # 外部 API 工具（tavily / arxiv / scholar / doc_parse）
```

## 开发循环

后端代码 bind-mount + `--reload`，改 .py 自动重载：

```bash
docker compose logs -f backend
docker compose exec backend pytest tests/unit/backend/ -m unit -q
docker compose exec backend alembic upgrade head
```

只有改了 `pyproject.toml` 依赖或 `Dockerfile` 才需 `docker compose build backend`。

## 关键约定

- **所有 LLM 调用走 `ctx.llm_gateway`** — 它自动接 budget enforcement + LLMCallTracer + cost record + budget alert
- **新工具继承 `ToolBase`** — 必须声明 `parameters_schema: ClassVar[dict]`
- **新模块继承 `ModuleBase`** — 在 `on_load(ctx)` 接受依赖，不要读 `app.state`
- **新写入路由加 `AuthDep`** — `dependencies=[AuthDep]` 在 router 或 endpoint 级别
- **日志用 structlog** — `from sololab.core.observability import get_logger; logger = get_logger(__name__)`
