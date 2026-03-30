# Phase 5.3 Compaction 质量改进报告

> **阶段**: 5.3 — Compaction Quality
> **完成日期**: 2026-03-30
> **目标**: 实现分级 Compaction，减少不必要的 LLM 调用

---

## 一、总览

Phase 5.3 原计划包含 4 个子系统（代码索引 RAG、管线 DAG、自适应工具描述、Compaction 改进）。经实施后评估，前三项 ROI 不足，已移除。最终保留了 **Compaction 质量改进**。

| 子任务 | 状态 | 说明 |
|--------|------|------|
| Compaction L2 压缩 | 已完成 | 无 LLM 的启发式输出压缩 |
| 预防性触发 | 已完成 | 70-85% → L1+L2，≥85% → L3 |
| 失败恢复 | 已完成 | 重试→L2 降级→新会话 |
| ~~代码索引 RAG~~ | 已移除 | FTS 搜索与 ripgrep 差异不大 |
| ~~管线 DAG~~ | 已移除 | YAGNI，task 工具已够用 |
| ~~自适应工具描述~~ | 已移除 | 1M context 时代省 1500 token 不值得 |

---

## 二、Compaction L2 压缩

### 2.1 设计

在原有 L1（裁剪旧 tool 输出）和 L3（LLM 全量压缩）之间插入 **L2 层**：基于工具类型的启发式压缩，无需 LLM 调用。

### 2.2 实现 (`session/compaction-levels.ts`)

**工具感知压缩策略**：

| 工具 | 策略 | 效果 |
|------|------|------|
| `read` | 保留前 10 行 + 后 5 行，中间省略 | 大文件 >80% 压缩率 |
| `grep` | 每个文件保留前 3 条匹配，其余计数 | 多匹配时 >50% |
| `glob` | 保留前 20 个文件，其余计数 | 50+ 文件时 >60% |
| `bash` | 保留前 20 行 + 后 10 行 | 长输出 >70% |
| 其他 | 保留首 60% + 尾 40%，中间省略 | 通用 ~50% |

**短输出保护**：< 50 token 的输出不压缩，避免信息丢失。

### 2.3 预防性触发

```
context 使用率 < 70%  → 不处理
70% ≤ usage < 85%     → 触发 L1(prune) + L2(compress)，无 LLM 开销
usage ≥ 85%           → 触发 L3(LLM 全量 compaction)
```

集成点：`session/prompt.ts` 的 loop 中，在 overflow 检查前自动执行预防性压缩。

### 2.4 失败恢复

```
首次失败  → 重试 L3
二次失败  → 降级到 L2（如果可用）
三次失败  → 建议开启新会话
```

---

## 三、已评估后不实施的项目

### 代码索引 RAG（已移除）

**原因**：
- ripgrep 搜索万级文件只需毫秒，FTS5 的增量优势有限
- 正则提取符号（函数名/类名）的质量不如 LSP/Tree-sitter
- 新增 migration + FTS trigger + FileWatcher 集成 = 维护成本高

### 管线 DAG（已移除）

**原因**：
- 现有 `task` 工具的子任务嵌套已满足绝大多数场景
- DAG 需要 LLM 理解如何构造阶段定义，学习成本高于直接用 task
- 典型 YAGNI — 没有明确的使用场景

### 自适应工具描述（已移除）

**原因**：
- 20 个工具的描述总共 3000-5000 token，在 128K-1M context 时代不是瓶颈
- 阶段检测基于最近工具调用，在混合工作流中频繁误判
- 如果压缩了某阶段工具描述但 LLM 需要用它，反而降低成功率

---

## 四、测试

| 类别 | 数量 | 状态 |
|------|------|------|
| L2 压缩策略 | 7 | 通过 |
| 触发决策 | 4 | 通过 |
| 失败恢复 | 3 | 通过 |
| applyL2 | 2 | 通过 |
| 集成测试 | 4 | 通过 |
| **总计** | **20** | **全部通过** |

回归测试：Phase 5.1（53 pass）+ Phase 5.2（113 pass）= **189 pass, 0 fail**

---

## 五、文件清单

### 新增
- `src/session/compaction-levels.ts` — 223 行

### 修改
- `src/session/compaction.ts` — +30 行（compressL2、preemptive 方法）
- `src/session/prompt.ts` — +8 行（预防性触发集成）

### 测试
- `test/session/compaction-levels.test.ts` — 16 个单元测试
- `test/integration/phase53.test.ts` — 4 个集成测试
