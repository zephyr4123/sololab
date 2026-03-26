<div align="center">

<img src="logo.png" width="120" alt="SoloLab Logo" />

# SoloLab

### One-Person Lab, Infinite Minds

**面向独立研究者的全栈 AI 辅助研究平台**

*用多智能体协作，重新定义一个人的科研可能性*

<p>
<a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"/></a>
<a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/></a>
<a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_14-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"/></a>
<a href="https://postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/></a>
<a href="https://redis.io"><img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"/></a>
<a href="https://docker.com"><img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/></a>
<img src="https://img.shields.io/badge/License-Apache%202.0-F57C00?style=flat-square" alt="Apache 2.0"/>
</p>

<p>
<img src="https://img.shields.io/badge/Benchmark-8.53%2F10-00C853?style=for-the-badge&labelColor=1a1a2e" alt="benchmark"/>
<img src="https://img.shields.io/badge/vs_Single_LLM-+54%25-448AFF?style=for-the-badge&labelColor=1a1a2e" alt="improvement"/>
<img src="https://img.shields.io/badge/56_Runs-Validated-FF6D00?style=for-the-badge&labelColor=1a1a2e" alt="validated"/>
<img src="https://img.shields.io/badge/Cost-%240.028%2Frun-AB47BC?style=for-the-badge&labelColor=1a1a2e" alt="cost"/>
</p>

<p>
<a href="#problem">问题背景</a> ·
<a href="#overview">平台概览</a> ·
<a href="#ideaspark">IdeaSpark</a> ·
<a href="#benchmark">Benchmark</a> ·
<a href="#architecture">系统架构</a> ·
<a href="#showcase">能力展示</a> ·
<a href="#quickstart">快速开始</a> ·
<a href="#roadmap">路线图</a>
</p>

</div>

<div align="center">
<img src="docs/images/dashboard.png" width="720" alt="SoloLab Dashboard" />
<br/>
<sub>统一工作台：模块切换 · 对话流 · Agent 活动时间线 · 研究结果沉淀</sub>
</div>

<center>
<table align="center" width="960" cellpadding="12">
<tr>
<td align="center" width="25%">
<b>5 个角色智能体</b><br/>
<sub>差异化分工，独立发散后再协同收敛</sub>
</td>
<td align="center" width="25%">
<b>28 次工具调用 / run</b><br/>
<sub>实时搜索与文献验证，保证创意可追溯</sub>
</td>
<td align="center" width="25%">
<b>56 次受控实验</b><br/>
<sub>逐组件量化多智能体系统的真实收益</sub>
</td>
<td align="center" width="25%">
<b>模块化研究平台</b><br/>
<sub>统一架构承载从灵感到写作的完整工作流</sub>
</td>
</tr>
</table>
</center>

---

<a id="problem"></a>

## 🧬 The Problem

<center>
<table align="center" width="960" cellpadding="0" cellspacing="0">
<tr>
<td width="50%" valign="top">
科研工作中，<b>idea 的产生</b> 是最具挑战性的环节。<br/><br/>

传统头脑风暴依赖多人协作，但独立研究者缺乏多样化的认知碰撞环境。大语言模型（LLM）虽然强大，但单一模型的输出容易陷入 <b>单一视角</b> 和 <b>知识截止日期</b> 的限制。<br/><br/>

<em>"我一个人做科研，最缺的不是写代码的能力，而是一个能跟我争论、质疑、补充的'虚拟同事'。"</em><br/>
<em>— 一位独立研究者</em>
</td>
<td width="50%" valign="top">

<!-- 📌 图片占位符 ⓪ — Problem 对比图
     内容：左右对比或上下对比，传统方式 vs SoloLab 方式
     左/上：研究者 → 单 LLM → 泛泛之谈（没有文献、没有审辩、没有验证、没有迭代）
     右/下：研究者 → 5 个智能体 → 并行发散 × 工具搜索 × 分组讨论 × 锦标赛 → 高质量方案
-->
<img src="docs/images/problem-comparison.png" alt="传统方式 vs SoloLab 方式" />

</td>
</tr>
</table>
</center>

---

<a id="overview"></a>

## 🔭 What is SoloLab?

SoloLab（一人实验室）是一个**模块化的 AI 研究平台**，将独立研究者的完整工作流，从灵感涌现到论文写作，封装为可热插拔的功能模块，通过统一架构编排。

<!-- 📌 图片占位符 ① — 平台总览概念图
     建议内容：展示 SoloLab 三层架构（前端模块 → 核心服务层 → 数据层）和六大模块的关系
     推荐工具：Excalidraw / draw.io / Figma
     尺寸建议：1200×600px，浅色背景，导出 PNG
-->
<div align="center">
<img src="docs/images/architecture-overview.png" width="720" alt="SoloLab 平台总览" />
<br/>
<sub>平台总览：前端模块层 · 核心服务层 · 数据与记忆层</sub>
</div>

### 🎯 设计哲学

<center>
<table align="center" width="960" cellpadding="12">
<tr>
<td align="center" width="20%" valign="top">
<h4>🔌</h4>
<b>模块热插拔</b><br/>
<sub>每个模块独立运行<br/>零耦合、即插即用</sub>
</td>
<td align="center" width="20%" valign="top">
<h4>🌐</h4>
<b>模型无关</b><br/>
<sub>OpenAI 兼容网关<br/>支持 100+ 模型</sub>
</td>
<td align="center" width="20%" valign="top">
<h4>🔍</h4>
<b>透明可控</b><br/>
<sub>每步 Prompt 可见<br/>Token 费用追踪</sub>
</td>
<td align="center" width="20%" valign="top">
<h4>🐳</h4>
<b>一键部署</b><br/>
<sub>Docker Compose<br/>单人可运维</sub>
</td>
<td align="center" width="20%" valign="top">
<h4>🔄</h4>
<b>断点恢复</b><br/>
<sub>长任务可恢复<br/>不丢失状态</sub>
</td>
</tr>
</table>
</center>

---

<a id="ideaspark"></a>

## 💡 IdeaSpark — 首个模块

> **多智能体创意涌现系统**：5 个差异化智能体 × Separate-Together 协作 × 实时文献检索 × Elo 锦标赛排序

IdeaSpark 将一个研究主题转化为经过 **多轮辩论、文献检索验证和锦标赛排序** 的高质量研究创意。

### 🤖 五大角色智能体

<center>
<table align="center" width="960" cellpadding="12">
<tr>
<td align="center" width="20%" valign="top">
<h3>🌀</h3>
<b>发散者</b><br/>
<sub>Divergent Thinker</sub><br/><br/>
<code>temp: 1.0</code><br/>
<sub>跨领域类比<br/>大胆联想</sub><br/><br/>
<sub>🔧 web_search<br/>🔧 arxiv_search</sub>
</td>
<td align="center" width="20%" valign="top">
<h3>🎓</h3>
<b>领域专家</b><br/>
<sub>Domain Expert</sub><br/><br/>
<code>temp: 0.5</code><br/>
<sub>深度专业知识<br/>方法论审查</sub><br/><br/>
<sub>🔧 arxiv_search<br/>🔧 scholar_search<br/>🔧 doc_parse</sub>
</td>
<td align="center" width="20%" valign="top">
<h3>⚔️</h3>
<b>审辩者</b><br/>
<sub>Critic</sub><br/><br/>
<code>temp: 0.3</code><br/>
<sub>挑战假设<br/>寻找漏洞</sub><br/><br/>
<sub>🔧 arxiv_search</sub>
</td>
<td align="center" width="20%" valign="top">
<h3>🔗</h3>
<b>连接者</b><br/>
<sub>Connector</sub><br/><br/>
<code>temp: 0.7</code><br/>
<sub>发现关联<br/>组合融合</sub><br/><br/>
<sub>—</sub>
</td>
<td align="center" width="20%" valign="top">
<h3>⚖️</h3>
<b>评估者</b><br/>
<sub>Evaluator</sub><br/><br/>
<code>temp: 0.3</code><br/>
<sub>锦标赛投票<br/>Elo 排序</sub><br/><br/>
<sub>—</sub>
</td>
</tr>
</table>
</center>

### 🔄 Separate → Together 协作流程

<!-- 📌 图片占位符 ② — Separate-Together 流程图
     建议内容：纵向流程图，展示 7 个阶段：
       用户输入 → Separate(发散者+专家并行) → 语义聚类 → Together(分组碰撞) → 全局整合 → Elo锦标赛 → 收敛检查(循环/输出)
     重点标注：每个阶段的角色、工具调用、信息流向
     推荐工具：Excalidraw / Figma / draw.io
     尺寸建议：800×1200px 或 1200×800px（横/竖均可），浅色背景
-->
<div align="center">
<img src="docs/images/separate-together-flow.png" width="720" alt="Separate-Together 协作流程" />
<br/>
<sub>从并行发散到分组碰撞，再到全局整合与 Elo 排序</sub>
</div>

### 🖥️ 运行实况

输入一个研究主题后，5 个智能体开始并行工作，实时展示每个 Agent 的思考过程、工具调用和创意产出：

<!-- 📌 图片占位符 ③ — IdeaSpark 运行中截图
     截图内容：IdeaSpark 模块运行时的界面
     重点展示：左侧对话区 + 右侧 Agent 活动时间线（显示发散者/专家正在工作、工具调用滚动、阶段进度）
     截图时机：运行过程中（Separate 或 Together 阶段）
-->
<div align="center">
<img src="docs/images/ideaspark-running.png" width="720" alt="IdeaSpark 运行中 — 智能体实时协作" />
<br/>
<sub>智能体并行工作中：左侧对话流 · 右侧 Agent 活动时间线 · 实时工具调用</sub>
</div>

经过多轮协作和 Elo 锦标赛排序后，系统输出 Top-5 创意卡片，每张包含完整的方案描述、文献引用和可行性分析：

<!-- 📌 图片占位符 ④ — 创意看板截图
     截图内容：IdeaSpark 运行完成后的创意卡片列表
     重点展示：Top-5 创意排名、Elo 分数、Agent 来源标签、Markdown 渲染的创意内容
     截图时机：一次完整运行结束后
-->
<div align="center">
<img src="docs/images/ideaspark-ideas.png" width="720" alt="IdeaSpark 创意看板 — Top-5 研究方案" />
<br/>
<sub>Top-5 创意看板：Elo 评分排序 · Agent 来源标注 · 完整文献引用</sub>
</div>

运行完成后，可一键生成结构化的 Markdown 研究报告，包含所有创意的详细描述和方法论分析：

<!-- 📌 图片占位符 ⑤ — 最终报告截图
     截图内容：导出的 Markdown 报告渲染页面 或 报告下载界面
     重点展示：结构化的研究创意报告（标题、摘要、方法论、参考文献）
     截图时机：点击"生成报告"按钮后
-->
<div align="center">
<img src="docs/images/ideaspark-report.png" width="720" alt="IdeaSpark 研究报告" />
<br/>
<sub>一键生成 Markdown 研究报告：方法论描述 · 参考文献 · 可直接导出</sub>
</div>

### 🔧 实时工具调用

系统运行时，智能体自主调用外部 API 获取前沿信息，确保每个创意都有据可查：

<center>
<table align="center" width="960" cellpadding="12">
<tr>
<td align="center" width="25%" valign="top">
<h4>📄 arXiv</h4>
<sub>预印本论文搜索<br/>获取最新学术成果<br/><b>~19 次/run</b></sub>
</td>
<td align="center" width="25%" valign="top">
<h4>🔗 Semantic Scholar</h4>
<sub>引用图谱 + 论文元数据<br/>验证研究脉络<br/><b>~4 次/run</b></sub>
</td>
<td align="center" width="25%" valign="top">
<h4>🌐 Tavily Search</h4>
<sub>实时网络搜索<br/>行业趋势与应用<br/><b>~5 次/run</b></sub>
</td>
<td align="center" width="25%" valign="top">
<h4>📑 PDF Parser</h4>
<sub>学术 PDF 全文解析<br/>提取实验细节<br/><b>按需调用</b></sub>
</td>
</tr>
</table>
</center>

> 每次运行平均 **28 次工具调用**，确保 100% 的创意具有真实文献支撑（Grounding Rate = 100%）。

---

<a id="benchmark"></a>

## 📊 Benchmark：56 次消融实验的量化验证

> 💡 *"多智能体比单 LLM 好"是被广泛接受的直觉，但真的如此吗？我们用 56 次受控实验来回答。*

我们设计了 **7 种消融条件 × 4 个跨学科主题 × 2 次重复 = 56 次受控运行**，配合 LLM-as-Judge 五维度评审（560 次评分），逐组件拆解了系统中每个部分的真实贡献。

### 核心发现

<center>
<table align="center" width="960" cellpadding="10">
<tr>
<th align="center">条件</th>
<th align="center">Overall</th>
<th align="center">Grounding</th>
<th align="center">Cost</th>
<th align="center">Latency</th>
</tr>
<tr>
<td align="center">🏆 <b>Full System</b></td>
<td align="center"><b>8.53 ± 0.07</b></td>
<td align="center">✅ 100%</td>
<td align="center">$0.080</td>
<td align="center">493s</td>
</tr>
<tr>
<td align="center">1️⃣ <b>SingleRound</b> ⬅ 帕累托最优</td>
<td align="center"><b>8.45 ± 0.11</b></td>
<td align="center">✅ 100%</td>
<td align="center"><b>$0.028</b></td>
<td align="center"><b>110s</b></td>
</tr>
<tr>
<td align="center">🚫🔍 NoTools</td>
<td align="center">6.21 ± 3.83</td>
<td align="center">❌ 0%</td>
<td align="center">$0.032</td>
<td align="center">597s</td>
</tr>
<tr>
<td align="center">💬 Baseline (单 LLM)</td>
<td align="center">5.53 ± 0.43</td>
<td align="center">❌ 0%</td>
<td align="center">$0.005</td>
<td align="center">18s</td>
</tr>
</table>
</center>

<div align="center">
<pre>
📊 组件贡献归因

🤖 多智能体框架    ████████████████████████████  +54%
🔍 工具调用(搜索)  ██████████████████           +37%
🏅 Elo 锦标赛      █                            +1.4%
🔄 多轮迭代        █                            +0.9%
👨‍⚖️ Critic 审辩     ▏                            +0.1%
</pre>
</div>

> **90% 以上的质量提升来自“多智能体框架 + 工具调用”。** SingleRound 配置用 1/4 时间、1/3 成本达到 99% 质量，是当前最优的效率-质量平衡点。

<p align="center">
📖 <b><a href="docs/benchmark/ideaspark-ablation.md">查看完整消融实验报告 →</a></b><br/>
<sub>含实验设计、逐层分析、三种假说与复现指南</sub>
</p>

---

<a id="architecture"></a>

## 🏗️ 系统架构

<!-- 📌 图片占位符 ⑥ — 系统技术架构图
     建议内容：三层架构图
       顶层：Frontend (Next.js 14) — Module Shell / SSE Renderer / Zustand
       中层：API Gateway (FastAPI) — 9 个核心服务模块（LLM Gateway, Module Registry, Tool Registry, Memory Manager, Session Manager, Task State Manager, Prompt Manager, Document Pipeline, Cost Tracker）
       底层：Data Layer — PostgreSQL+pgvector / Redis / File Storage
       连接线标注：REST + SSE (Last-Event-ID)
     推荐工具：Excalidraw / draw.io / Figma
     尺寸建议：1200×700px，浅色背景
-->
<div align="center">
<img src="docs/images/architecture.png" width="720" alt="SoloLab 系统架构" />
<br/>
<sub>前端工作台 · FastAPI 核心服务 · PostgreSQL / Redis / 文件存储</sub>
</div>

### 核心服务

<center>
<table align="center" width="960" cellpadding="16">
<tr>
<td width="50%" valign="top">
<b>🧠 LLM Gateway</b><br/>
<sub>OpenAI 兼容格式，支持 100+ 模型</sub><br/>
<sub>内置降级链与模型 Fallback</sub><br/>
<sub>实时费用追踪与预算控制</sub>
<br/><br/>
<b>📦 Module Registry</b><br/>
<sub>基于 <code>manifest.json</code> 的热插拔</sub><br/>
<sub><code>ModuleBase</code> 抽象类 + 标准生命周期</sub><br/>
<sub>动态加载/卸载，零停机</sub>
<br/><br/>
<b>🔧 Tool Registry</b><br/>
<sub>统一 <code>ToolBase</code> 接口封装</sub><br/>
<sub>arXiv / Semantic Scholar / Tavily / PDF</sub><br/>
<sub>自动限速与结果缓存</sub>
</td>
<td width="50%" valign="top">
<b>💾 Memory Manager</b><br/>
<sub>pgvector 向量检索 + 4 级作用域</sub><br/>
<sub>Module → Session → Project → Global</sub><br/>
<sub>跨模块知识传递</sub>
<br/><br/>
<b>⏱️ Task State Manager</b><br/>
<sub>Redis Stream 持久化每个 SSE 事件</sub><br/>
<sub>递增 <code>event_id</code> 支持断线恢复</sub><br/>
<sub>24h 任务状态保留</sub>
<br/><br/>
<b>📄 Document Pipeline</b><br/>
<sub>PyMuPDF 学术 PDF 高精度解析</sub><br/>
<sub>语义分块（500~1500 tokens）</sub><br/>
<sub>自动元数据提取与向量存储</sub>
</td>
</tr>
</table>
</center>

---

<a id="showcase"></a>

## 📂 平台能力展示

### 文档上传与解析

支持上传学术 PDF，通过 PyMuPDF 引擎高精度解析双栏排版、LaTeX 公式和表格，自动语义分块后存入向量数据库，供智能体深度检索：

<!-- 📌 图片占位符 ⑦ — 文档上传截图
     截图内容：文档上传界面 + 上传后的解析状态/已上传文档列表
     重点展示：上传区域、解析进度条/状态标签、已解析文档列表、分块数量等
     截图时机：上传一篇 PDF 后，显示解析完成状态
-->
<div align="center">
<img src="docs/images/doc-upload.png" width="720" alt="文档上传与解析" />
<br/>
<sub>上传学术 PDF → PyMuPDF 高精度解析 → 语义分块 → 向量化存储 → 供智能体检索</sub>
</div>

### 会话与历史管理

所有对话和运行结果持久化存储，支持会话切换、历史回溯和跨模块上下文传递：

<!-- 📌 图片占位符 ⑧ — 会话历史管理截图
     截图内容：侧边栏的会话列表 或 历史记录管理页面
     重点展示：多个会话条目、时间戳、模块标签、会话切换交互
     截图时机：有多个历史会话时的侧边栏/管理界面
-->
<div align="center">
<img src="docs/images/session-history.png" width="720" alt="会话与历史管理" />
<br/>
<sub>会话持久化 · 历史回溯 · 跨模块上下文传递</sub>
</div>

---

## 🛠️ 技术栈

<p align="center">
<b>Backend</b>&nbsp;&nbsp;
<img src="https://img.shields.io/badge/Python_3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"/>
<img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/>
<img src="https://img.shields.io/badge/PostgreSQL+pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
<img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"/>
<br/>
<b>Frontend</b>&nbsp;&nbsp;
<img src="https://img.shields.io/badge/Next.js_14-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"/>
<img src="https://img.shields.io/badge/Zustand-433E38?style=flat-square&logo=react&logoColor=white" alt="Zustand"/>
<img src="https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square&logo=shadcnui&logoColor=white" alt="shadcn/ui"/>
<img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind"/>
<br/>
<b>AI / Search</b>&nbsp;&nbsp;
<img src="https://img.shields.io/badge/100+_LLMs-412991?style=flat-square&logo=openai&logoColor=white" alt="LLMs"/>
<img src="https://img.shields.io/badge/arXiv-B31B1B?style=flat-square&logo=arxiv&logoColor=white" alt="arXiv"/>
<img src="https://img.shields.io/badge/Semantic_Scholar-1857B6?style=flat-square" alt="S2"/>
<img src="https://img.shields.io/badge/Tavily-4A90D9?style=flat-square" alt="Tavily"/>
<img src="https://img.shields.io/badge/PyMuPDF-FF6B35?style=flat-square" alt="PyMuPDF"/>
<br/>
<b>Infra</b>&nbsp;&nbsp;
<img src="https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
<img src="https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white" alt="Caddy"/>
</p>

---

<a id="quickstart"></a>

## 🚀 快速开始

### 一键部署

```bash
# 1. 克隆仓库
git clone https://github.com/huangsuxiang/sololab.git && cd sololab

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Keys

# 3. Docker 一键启动
docker compose up -d

# 4. 访问
open http://localhost:3000
```

### 本地开发

```bash
# 激活 conda 环境
conda activate sololab

# 后端
cd backend && pip install -e ".[dev]"
uvicorn sololab.main:app --reload --port 8000

# 前端（新终端）
cd frontend && pnpm install && pnpm dev

# 运行测试
pytest tests/unit/ -v          # 单元测试
pytest tests/integration/ -v   # 集成测试
```

> 📂 Benchmark 复现指南见 [消融实验报告](docs/benchmark/ideaspark-ablation.md#-复现指南)。

---

<a id="roadmap"></a>

## 🗺️ 模块路线图

<center>
<table align="center" width="960" cellpadding="10">
<tr>
<th align="center">模块</th>
<th align="center">功能</th>
<th align="center">状态</th>
</tr>
<tr>
<td align="center">💡 <b>IdeaSpark</b></td>
<td>多智能体创意涌现 · Separate-Together · Elo 锦标赛</td>
<td align="center"><img src="https://img.shields.io/badge/-Ready-00C853?style=flat-square" alt="Ready"/></td>
</tr>
<tr>
<td align="center">🔧 <b>CodeLab</b></td>
<td>AI 辅助编码 · 代码审查 · 调试重构</td>
<td align="center"><img src="https://img.shields.io/badge/-Planned-9E9E9E?style=flat-square" alt="Planned"/></td>
</tr>
<tr>
<td align="center">✍️ <b>WriterAI</b></td>
<td>学术论文写作 · 大纲生成 · 段落润色</td>
<td align="center"><img src="https://img.shields.io/badge/-Planned-9E9E9E?style=flat-square" alt="Planned"/></td>
</tr>
<tr>
<td align="center">📊 <b>DataLens</b></td>
<td>数据分析 · 可视化生成 · 统计检验</td>
<td align="center"><img src="https://img.shields.io/badge/-Planned-9E9E9E?style=flat-square" alt="Planned"/></td>
</tr>
<tr>
<td align="center">📚 <b>LitReview</b></td>
<td>系统性文献综述 · 引用图谱 · 研究趋势</td>
<td align="center"><img src="https://img.shields.io/badge/-Planned-9E9E9E?style=flat-square" alt="Planned"/></td>
</tr>
<tr>
<td align="center">🔍 <b>Reviewer</b></td>
<td>模拟审稿人 · 批判性审查 · 改进建议</td>
<td align="center"><img src="https://img.shields.io/badge/-Planned-9E9E9E?style=flat-square" alt="Planned"/></td>
</tr>
</table>
</center>

---

## 📁 项目结构

```text
soloLab/
├── backend/                       # FastAPI 后端
│   └── src/sololab/
│       ├── main.py                # 应用入口
│       ├── config/                # 配置 & LLM 配置
│       ├── core/                  # 核心服务层 (7 个服务)
│       ├── api/                   # REST API 路由
│       ├── models/                # Pydantic 数据模型
│       ├── modules/               # 可插拔功能模块
│       │   └── ideaspark/         # IdeaSpark 模块
│       ├── tools/                 # 外部工具 (arXiv/Scholar/Tavily)
│       └── benchmark/             # Benchmark 评测框架
│
├── frontend/                      # Next.js 14 前端
│   └── src/
│       ├── app/                   # App Router 页面
│       ├── components/            # UI 组件库
│       ├── lib/                   # API Client & SSE Client
│       ├── stores/                # Zustand 状态管理
│       └── types/                 # TypeScript 类型定义
│
├── tests/                         # 测试 (unit/integration/e2e)
├── docs/                          # 架构文档 & PRD
├── infra/                         # Dockerfiles & Caddyfile
└── docker-compose.yml             # 一键部署
```

---

## 🧑‍💻 开发新模块

只需三步，即可扩展 SoloLab 的能力：

**1. 创建 `manifest.json`**

```json
{
  "id": "your-module",
  "name": "YourModule",
  "version": "0.1.0",
  "description": "Module description",
  "required_tools": ["web_search", "arxiv_search"],
  "config_schema": { "param": { "type": "string", "default": "value" } }
}
```

**2. 实现 `ModuleBase`**

```python
class YourModule(ModuleBase):
    def manifest(self) -> ModuleManifest:
        return load_from_json("modules/your-module/manifest.json")

    async def execute(self, request, ctx) -> AsyncGenerator:
        # Your multi-agent logic here
        yield TextChunk(content="Hello from YourModule!")
```

**3. 放入 `modules/` 目录** — 自动发现、热加载、即刻可用。

---

<div align="center">

## 📜 License & Author

<p>
<b>License:</b> Apache License 2.0
<br/>
<b>Author:</b> Suxiang Huang
<br/>
📧 huangsuxiang5@gmail.com
<br/>
💬 WeChat: 13976457218
<br/>
🏛️ Memory and Reasoning Lab, Tianjin University
</p>

<hr/>

<sub>
<b>SoloLab</b> · <i>One-Person Lab, Infinite Minds</i><br/>
Built for independent researchers who refuse to let team size limit their ambitions.
</sub>

</div>
