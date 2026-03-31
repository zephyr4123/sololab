# CodeLab 权限系统分析

> 分析日期：2026-03-31
> 状态：当前使用默认全放行模式，权限系统代码完备但未启用拦截

---

## 1. 权限系统架构

OpenCode 的权限系统由三层组成：

```
配置层（opencode.jsonc → permission 字段）
     ↓
评估层（permission/evaluate.ts → 规则匹配）
     ↓
执行层（permission/index.ts → ask/reply 状态机）
```

### 1.1 规则评估

```typescript
// permission/evaluate.ts
export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {
  const rules = rulesets.flat()
  const match = rules.findLast(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  return match ?? { action: "ask", permission, pattern: "*" }  // 无匹配规则时默认 "ask"
}
```

- **通配符匹配**：`*` 匹配任意字符串，支持路径模式
- **最后匹配优先**：规则数组中后出现的规则覆盖前面的
- **三种动作**：`allow`（直接放行）、`deny`（拒绝并报错）、`ask`（阻塞等待用户确认）

### 1.2 权限请求生命周期

```
工具调用 ctx.ask({ permission: "bash", patterns: ["npm test"] })
     ↓
Permission.ask() — 遍历 patterns，逐条评估
  ├─ 全部 allow → 直接返回，不阻塞
  ├─ 有 deny → 抛 DeniedError，工具调用失败
  └─ 有 ask  → 创建 Deferred，发布 permission.asked 事件，阻塞等待
                    ↓
              用户回复（通过 API 或 TUI）
              Permission.reply({ requestID, reply: "once" | "always" | "reject" })
                ├─ "once"   → resolve deferred，本次放行
                ├─ "always" → resolve + 写入 approved 规则集（同类命令后续自动放行）
                └─ "reject" → reject deferred，工具调用失败
```

### 1.3 Bash 工具的权限检查

Bash 工具使用 **tree-sitter WASM 解析器** 将命令解析为 AST，提取命令 token 和文件路径：

```
"cd /tmp && npm test" → tree-sitter → ["cd /tmp", "npm test"]
                                        ↓
                               BashArity.prefix() 提取前缀
                               "cd"       → arity=1 → pattern: "cd /tmp"
                               "npm test" → arity=3 → always: "npm test *"
```

两类权限检查：
1. **`external_directory`** — 命令涉及项目外目录时触发
2. **`bash`** — 所有非 cd 命令都会检查

---

## 2. 当前为什么不拦截

### 2.1 默认权限策略

```typescript
// agent/agent.ts:86-103
const defaults = Permission.fromConfig({
  "*": "allow",              // ← 全通规则！所有工具默认放行
  doom_loop: "ask",          // 死循环检测需确认
  external_directory: {
    "*": "ask",              // 访问项目外目录需确认
  },
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
  read: {
    "*": "allow",
    "*.env": "ask",          // 读 .env 文件需确认
    "*.env.*": "ask",
    "*.env.example": "allow",
  },
})
```

**`"*": "allow"` 是第一条规则**，它让 bash、edit、write、glob、grep 等所有工具默认放行。只有少数特例（external_directory、doom_loop、.env 读取）会触发 `"ask"`。

### 2.2 各 Agent 的权限继承

| Agent | 基础规则 | 额外规则 | 实际效果 |
|-------|---------|---------|---------|
| **build**（主 Agent） | `defaults` + `user` config | question=allow, plan_enter=allow | 几乎全通 |
| **general**（子 Agent） | `defaults` + `user` config | todowrite=deny | 几乎全通，不能写 todo |
| **explore**（只读 Agent） | `"*": "deny"` 覆盖 | 只允许 grep/glob/read/bash/webfetch/websearch/codesearch | 严格只读 |
| **plan**（规划 Agent） | `defaults` + `user` config | edit=deny（仅允许 plans 目录） | 不能编辑代码 |

### 2.3 用户配置覆盖

`opencode.jsonc` 中的 `permission` 字段可以覆盖默认规则：

```jsonc
// 当前配置（opencode/opencode.jsonc）
"permission": {
  "edit": {
    "packages/opencode/migration/*": "deny"  // 仅保护 migration 文件
  }
}
```

没有对 bash/write 做任何限制。

---

## 3. SoloLab Bridge 的权限事件处理

### 3.1 当前状态

SoloLab 的 Bridge（`module.py`）通过 SSE 接收 OpenCode 事件，但 `_translate_event()` **不处理 `permission.asked` 事件类型**。

```python
# module.py _translate_event() 中处理的事件类型：
# - message.part.delta      → text streaming
# - message.updated         → agent info
# - message.part.updated    → tool calls
# - session.status          → idle/done
# - session.updated         → title
# - error / session.error   → errors
#
# ❌ 缺失：permission.asked → 被丢弃
```

### 3.2 影响

如果将来启用权限拦截（`bash: "ask"`），当前 Bridge 会导致：
1. OpenCode 发出 `permission.asked` 事件
2. Bridge 的 `_translate_event()` 返回 `None`，事件被丢弃
3. 前端不知道有权限请求
4. Agent 的 `Deferred.await()` 永远挂起
5. 最终触发子任务超时（5 分钟）

### 3.3 未来启用权限需要的改动

```
需要改的文件：
├─ opencode/opencode.jsonc          → 添加 permission: { bash: "ask", edit: "ask", write: "ask" }
├─ module.py _translate_event()     → 添加 permission.asked 事件处理
├─ module.py _handle_chat()         → 转发权限事件到前端
├─ bridge.py                        → reply_permission() 已实现（可用）
├─ frontend PermissionDialog        → 权限确认弹窗（已有骨架组件）
└─ frontend CodeLabChat             → 监听权限事件，弹出确认对话框
```

---

## 4. 权限配置参考

### 4.1 收紧到"关键操作确认"模式

```jsonc
{
  "permission": {
    "bash": "ask",                    // 所有命令需确认
    "edit": "ask",                    // 文件编辑需确认
    "write": "ask",                   // 文件写入需确认
    "read": {
      "*.env": "deny",               // 禁止读 .env
      "*.env.example": "allow"
    }
  }
}
```

### 4.2 收紧到"只读 + 安全命令"模式

```jsonc
{
  "permission": {
    "edit": "deny",
    "write": "deny",
    "bash": {
      "*": "deny",
      "ls *": "allow",
      "cat *": "allow",
      "git status": "allow",
      "git log *": "allow",
      "npm test *": "allow",
      "bun test *": "allow"
    }
  }
}
```

### 4.3 BashArity 命令前缀表（"Always allow" 记住的粒度）

| 命令 | Arity | Always 匹配 | 含义 |
|------|-------|-------------|------|
| `ls -la` | 1 | `ls *` | 所有 ls 变体 |
| `npm test` | 3 | `npm test *` | 所有 npm test 变体 |
| `npm run dev` | 3 | `npm run dev` | 精确匹配 |
| `git checkout main` | 2 | `git checkout *` | 所有 git checkout |
| `kubectl get pods` | 2 | `kubectl get *` | 所有 kubectl get |
| `docker compose up` | 2 | `docker compose *` | 所有 docker compose |

---

## 5. 关键源码位置

| 组件 | 文件 | 关键行 |
|------|------|--------|
| 规则评估 | `opencode/src/permission/evaluate.ts` | L9-15 |
| 权限状态机 | `opencode/src/permission/index.ts` | L166-201（ask）, L203-259（reply） |
| Bash 命令解析 | `opencode/src/tool/bash.ts` | L85-161 |
| BashArity 前缀 | `opencode/src/permission/arity.ts` | L2-162 |
| Agent 默认权限 | `opencode/src/agent/agent.ts` | L86-103 |
| SSE 事件广播 | `opencode/src/server/routes/event.ts` | L63 |
| Bridge 事件翻译 | `backend/modules/codelab/module.py` | `_translate_event()` |
| Bridge 权限回复 | `backend/modules/codelab/bridge.py` | `reply_permission()` |
| 权限请求 API | `opencode/src/server/routes/permission.ts` | 全文 |
| 权限持久化 | SQLite `permission` 表 | project_id → JSON rules |
