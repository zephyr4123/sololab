<div align="center">

# 🧪 SoloLab — 一人实验室

**面向独立研究者的 AI 辅助研究平台**

*将多智能体协作引入科学创意生成*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js_14-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/>

<img src="https://img.shields.io/badge/Benchmark_Overall-8.53%2F10-brightgreen?style=for-the-badge" alt="benchmark score"/>
&nbsp;
<img src="https://img.shields.io/badge/vs_Single_LLM-+54%25-blue?style=for-the-badge" alt="vs single llm"/>
&nbsp;
<img src="https://img.shields.io/badge/56_Controlled_Runs-Validated-orange?style=for-the-badge" alt="validated"/>

</div>

<br/>

SoloLab 的首个模块 **IdeaSpark** 通过 5 个专业化智能体的分离-汇聚协作流程，将单一研究主题转化为经过多轮辩论、文献检索验证和锦标赛排序的高质量研究创意。

> 💡 **它真的比直接问 LLM 更好吗？** 我们用 56 次受控消融实验来回答这个问题。

---

## 📊 Benchmark：量化验证多智能体协作的价值

### 🎯 动机

"多智能体比单 LLM 好"是一个被广泛接受的直觉假设，但缺乏可量化的证据。我们设计了一套严格的消融实验，回答三个关键问题：

<table>
<tr>
<td width="33%" align="center">

**❓ 问题一**

多智能体框架是否真的<br/>优于单 LLM？<br/>还是只是多调用了几次 API？

</td>
<td width="33%" align="center">

**❓ 问题二**

系统中哪些组件<br/>贡献最大？<br/>工具 / 审辩 / 锦标赛 / 迭代

</td>
<td width="33%" align="center">

**❓ 问题三**

最佳的质量-成本<br/>平衡点在哪？<br/>花 16 倍的钱能换来多少提升？

</td>
</tr>
</table>

---

### 🔬 实验设计

#### 评测框架

我们构建了一套全自动的 Benchmark 框架，包含三个核心组件：

| 组件 | 方法 | 说明 |
|:---:|------|------|
| 🏛️ **LLM-as-Judge** | 独立评审模型 (qwen3.5-plus) | 5 维度打分，每创意评审 2 次取平均，消除随机性 |
| 📐 **自动化指标** | 语义多样性 / 信息接地率 / 工具调用统计 | 不依赖 LLM 的客观量化指标 |
| 🧫 **消融对照** | 7 种条件 × 4 主题 × 2 次重复 | 逐组件拆解，量化每个模块的贡献 |

#### 📏 评分维度

<table>
<tr>
<th>维度</th><th>权重</th><th>评判标准</th><th>标尺</th>
</tr>
<tr>
<td>🌟 <b>Novelty</b></td><td>25%</td><td>是否提出新视角或跨领域迁移</td><td>1-3 无新意 · 4-6 有先例 · 7-10 罕见组合</td>
</tr>
<tr>
<td>🔧 <b>Feasibility</b></td><td>25%</td><td>独立研究者能否启动，是否有 MVP</td><td>1-3 不可及 · 4-6 有障碍 · 7-8 路线清晰 · 9-10 有 MVP</td>
</tr>
<tr>
<td>💥 <b>Impact</b></td><td>20%</td><td>成功后对领域的推动程度</td><td>1-3 边际改进 · 4-6 子领域 · 7-10 范式变革</td>
</tr>
<tr>
<td>🎯 <b>Specificity</b></td><td>15%</td><td>方案是否具体到可执行</td><td>1-3 纯概念 · 4-6 缺细节 · 7-10 可指导行动</td>
</tr>
<tr>
<td>📚 <b>Evidence</b></td><td>15%</td><td>是否引用真实论文/数据</td><td>1-3 无证据 · 4-6 不够具体 · 7-10 引用充分</td>
</tr>
</table>

#### 🧫 7 种消融条件

| # | 条件 | 配置 | 验证目标 |
|:---:|------|------|:---:|
| 1 | 🏆 **Full** | 5 智能体 + 工具 + 3 轮迭代 + Elo 锦标赛 | 基准线 |
| 2 | 💬 Baseline-Single | 单 LLM 直接生成 5 个创意 | 多智能体的价值 |
| 3 | 🧠 Baseline-CoT | 单 LLM + Chain-of-Thought 推理 | 排除"想得更深"的混淆 |
| 4 | 🚫🔍 NoTools | 多智能体但禁用所有搜索工具 | 工具调用的价值 |
| 5 | 🚫👨‍⚖️ NoCritic | 移除审辩者智能体 | 批判环节的价值 |
| 6 | 🚫🏅 NoTournament | 移除 Elo 锦标赛，随机排序 | 评估机制的价值 |
| 7 | 1️⃣ SingleRound | 只运行 1 轮（不迭代） | 多轮迭代的价值 |

#### 📋 实验规模

<table>
<tr>
<td>📝 <b>测试主题</b></td><td>4 个跨学科主题（CS/AI · 生物医学 · 材料科学 · 社会科学）</td>
</tr>
<tr>
<td>🔁 <b>重复次数</b></td><td>每条件 × 每主题 × 2 次</td>
</tr>
<tr>
<td>🧮 <b>总运行数</b></td><td><b>7 × 4 × 2 = 56 次有效运行</b></td>
</tr>
<tr>
<td>📊 <b>总评审数</b></td><td>56 × 5 创意 × 2 次 = <b>560 次 LLM-as-Judge 评分</b></td>
</tr>
<tr>
<td>💰 <b>总费用</b></td><td>$2.40</td>
</tr>
<tr>
<td>🤖 <b>LLM 后端</b></td><td>Gemini 3 Flash Preview（生成） + qwen3.5-plus（评审）</td>
</tr>
</table>

---

### 📈 核心结果

#### 消融对比总表

| 条件 | Overall | Novelty | Feasibility | Impact | Specificity | Evidence | Grounding | Cost | Latency |
|:-----|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🏆 **Full** | **8.53 ± 0.07** | 8.12 | 8.47 | 8.25 | 9.21 | 8.97 | ✅ 100% | $0.080 | 493s |
| 🚫👨‍⚖️ NoCritic | 8.52 ± 0.09 | 8.24 | 8.43 | 8.25 | 9.05 | 8.95 | ✅ 100% | $0.067 | 383s |
| 1️⃣ SingleRound | 8.45 ± 0.11 | 7.94 | 8.53 | 8.10 | 9.14 | 8.95 | ✅ 100% | **$0.028** | **110s** |
| 🚫🏅 NoTournament | 8.41 ± 0.09 | 7.99 | 8.31 | 8.16 | 9.05 | 9.00 | ✅ 100% | $0.083 | 342s |
| 🚫🔍 NoTools | 6.21 ± 3.83 | 7.14 | 7.92 | 7.31 | 8.59 | 8.31 | ❌ 0% | $0.032 | 597s |
| 💬 Baseline-Single | 5.53 ± 0.43 | 5.74 | 5.16 | 7.31 | 5.26 | 3.71 | ❌ 0% | $0.005 | 18s |
| 🧠 Baseline-CoT | 5.45 ± 1.42 | 6.00 | 4.80 | 7.55 | 5.01 | 3.25 | ❌ 0% | $0.005 | 16s |

> 📌 每条件 n = 8（4 主题 × 2 次重复）。Overall = 加权平均。± 为标准差。

---

### 🔍 逐层分析

<br/>

<h4>🔴 第一层：多智能体 vs 单 LLM — 质量提升 55%</h4>

<table>
<tr>
<td width="60%">

```
Full (8.53) vs Baseline-Single (5.53) = +54.2%
Full (8.53) vs Baseline-CoT   (5.45) = +56.5%
```

这是最核心的发现：**完整的多智能体系统在质量上碾压单 LLM**。

Baseline-CoT（加了 Chain-of-Thought）**没有比 Baseline-Single 表现更好**（5.45 vs 5.53）。这说明质量差距**不是因为"多想了一会儿"**，而是来自架构层面的根本优势。

</td>
<td width="40%">

| 维度 | Single | Full | 提升 |
|:---:|:---:|:---:|:---:|
| 🌟 Novelty | 5.74 | 8.12 | **+41%** |
| 🔧 Feasibility | 5.16 | 8.47 | **+64%** |
| 💥 Impact | 7.31 | 8.25 | +13% |
| 🎯 Specificity | 5.26 | 9.21 | **+75%** |
| 📚 Evidence | 3.71 | 8.97 | **+142%** |

</td>
</tr>
</table>

> 📌 **Evidence（+142%）和 Specificity（+75%）是差距最大的维度。** 单 LLM 生成的创意往往是"听起来不错但没有依据的泛泛之谈"，而多智能体系统通过工具调用获取真实论文引用，通过多角色审辩迫使方案具体化。

<br/>

<h4>🟡 第二层：工具调用是质量的分水岭</h4>

<table>
<tr>
<td width="60%">

```
Full (8.53) vs NoTools (6.21) = +37.4%
```

禁用搜索工具后，系统质量从 8.53 **骤降至 6.21**，且方差急剧增大（标准差 0.07 → 3.83）。

没有工具调用时，系统表现极不稳定 —— 有时凭 LLM 记忆碰巧写出好方案，有时完全失败。

</td>
<td width="40%">

| 指标 | Full | NoTools |
|:---|:---:|:---:|
| 🔍 Grounding Rate | **100%** | 0% |
| 📞 Avg Tool Calls | 28 次/run | 0 |
| 📚 Evidence Score | **8.97** | 8.31 |
| 📊 标准差 | **0.07** | 3.83 |

</td>
</tr>
</table>

> 📌 Full 系统平均每次运行调用 **28 次搜索工具**（arXiv 19 次 · Web 5 次 · Scholar 4 次），确保每个创意都基于真实的前沿文献。NoTools 的 Evidence 高分则来自 LLM 记忆中的"幻觉引用"。

<br/>

<h4>🟢 第三层：迭代与评估 — 意料之外的发现</h4>

<table>
<tr>
<td width="60%">

```
Full (8.53) vs NoCritic    (8.52) = +0.1%  ← 几乎无差异
Full (8.53) vs NoTournament(8.41) = +1.4%
Full (8.53) vs SingleRound (8.45) = +0.9%
```

**这是最意外、也最有价值的发现**：Critic 审辩、Elo 锦标赛和多轮迭代的边际贡献都很小。

三个可能的解释 👇

</td>
<td width="40%">

| 组件 | 贡献 | 显著性 |
|:---|:---:|:---:|
| 👨‍⚖️ Critic 审辩 | +0.1% | 🔴 不显著 |
| 🔄 多轮迭代 | +0.9% | 🔴 不显著 |
| 🏅 Elo 锦标赛 | +1.4% | 🟡 微弱 |

</td>
</tr>
</table>

<details>
<summary><b>💭 为什么这些组件贡献小？三种假说（点击展开）</b></summary>

<br/>

1. **"一次搜索，足够好"假说** — 当 Divergent 和 Expert 智能体在第一轮通过工具调用获取了足够的前沿信息后，后续迭代只是在同一信息基础上微调，而非引入新的知识增量。

2. **Connector 的信息压缩效应** — Connector（整合者）在综合阶段已完成质量筛选，把最好的创意融合到一起，使得后续的 Elo 锦标赛变成了"在已经很好的候选中挑选"，区分度有限。

3. **Critic 的"礼貌性共识"** — 在当前温度设置（0.3）下，Critic 的审辩往往是"建设性批评"而非"颠覆性质疑"，更多是润色而非重构。

</details>

---

### ⚖️ 成本-质量帕累托分析

```
                Quality
    9.0 ┤ ● Full ($0.080)        ● NoCritic ($0.067)
        │            ● SingleRound ($0.028)  ⬅ 帕累托最优
    8.0 ┤                   ● NoTournament ($0.083)
        │
    7.0 ┤
        │  ● NoTools ($0.032)
    6.0 ┤
        │ ● Baseline-Single ($0.005)
    5.0 ┤ ● Baseline-CoT ($0.005)
        └──────────────────────────────────────── Cost/Run
         $0.00    $0.02    $0.04    $0.06    $0.08
```

<table>
<tr>
<td>

#### ⭐ SingleRound 是帕累托最优点

</td>
</tr>
<tr>
<td>

| 指标 | Full | SingleRound | 比值 |
|------|:---:|:---:|:---:|
| 质量 | 8.53 | **8.45** | 99% |
| 成本 | $0.080 | **$0.028** | 35% |
| 耗时 | 493s | **110s** | 22% |
| Grounding | 100% | **100%** | = |

> 🚀 **用不到 ¼ 的时间和 ⅓ 的成本，达到 99% 的质量。**

</td>
</tr>
</table>

---

### 🏁 结论

消融实验揭示了 IdeaSpark 系统中各组件的真实贡献分布：

```
┌──────────────────────────────────────────────────────────┐
│              📊 组件贡献分布（质量提升归因）                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🤖 多智能体框架    ████████████████████████████  +54%   │
│     (vs 单 LLM)                                          │
│                                                          │
│  🔍 工具调用(搜索)  ██████████████████           +37%   │
│     (vs 无工具)                                           │
│                                                          │
│  🏅 Elo 锦标赛      █                            +1.4%  │
│                                                          │
│  🔄 多轮迭代        █                            +0.9%  │
│                                                          │
│  👨‍⚖️ Critic 审辩     ▏                            +0.1%  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

<div align="center">

**90% 以上的质量提升来自"多智能体框架 + 工具调用"两个核心组件。**

迭代、审辩和锦标赛在当前配置下的边际贡献极小。

*如果资源有限，优先保证多角色分工和搜索工具接入，而非追求复杂的迭代流程。*

</div>

---

### 🔁 复现指南

```bash
# 环境准备
conda activate sololab

# ⚡ 快速验证（~6 分钟，$0.08）
python -m sololab.benchmark.cli quick --n 1 --topics cs-01

# 🧫 完整消融实验（~8 小时，$2.5）
python -m sololab.benchmark.cli ablation \
  --topics cs-01 bio-01 mat-01 soc-01 \
  --runs 2

# 📄 从已有结果生成报告
python -m sololab.benchmark.cli report --input benchmark_results/
```

> 📂 所有 56 次运行的完整 JSON 数据保存在 `benchmark_results/` 目录下，每个文件包含 Top-5 创意全文、5 维度评分详情（含评审理由）、系统指标和工具调用记录。

---

## 🛠️ 技术栈

<table>
<tr><td>⚙️ <b>后端</b></td><td>FastAPI · Python 3.11+</td></tr>
<tr><td>🧠 <b>LLM 网关</b></td><td>OpenAI-compatible API — 支持 100+ 模型</td></tr>
<tr><td>🔍 <b>搜索工具</b></td><td>arXiv API · Semantic Scholar · Tavily Web Search</td></tr>
<tr><td>📊 <b>评测</b></td><td>LLM-as-Judge (qwen3.5-plus) · 自动化指标计算</td></tr>
<tr><td>🖥️ <b>前端</b></td><td>Next.js 14 · Zustand · shadcn/ui · Tailwind CSS</td></tr>
<tr><td>🗄️ <b>数据库</b></td><td>PostgreSQL + pgvector · Redis</td></tr>
<tr><td>🚀 <b>部署</b></td><td>Docker Compose · Caddy</td></tr>
</table>

---

<div align="center">

**MIT License**

</div>
