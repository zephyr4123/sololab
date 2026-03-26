<div align="center" style="padding: 40px 0 20px;">

<img src="../logo.png" width="80" alt="SoloLab" />

<h1 style="margin: 16px 0 4px; font-size: 28px; letter-spacing: 1px;">一人实验室（二）</h1>
<h2 style="margin: 0 0 12px; font-weight: 400; font-size: 20px; color: #555;">从零搭建多智能体科研平台 SoloLab</h2>

<p style="font-size: 14px; color: #888; line-height: 1.8;">
<b>作者：黄素翔</b> &nbsp;|&nbsp; 指导老师：王征<br/>
天津大学 · 记忆与推理实验室<br/>
huangsuxiang5@gmail.com
</p>

</div>

---

在上一篇推文中，我们盘点了当下最值得关注的 AI 科研工具，并在文末留下了一个悬念：**下一步，我们要开始搭建属于自己的一人实验室。**

这一篇，就是兑现承诺。

我们开源了 **SoloLab**——一个面向独立研究者的全栈 AI 辅助研究平台，并在其上实现了首个功能模块 **IdeaSpark**：一个经过 56 次受控实验验证的多智能体创意生成系统。本文将从三个维度展开：

<div align="center">
<table align="center" cellpadding="16" style="border: none;">
<tr>
<td align="center" width="33%" style="border: none;">
<b style="font-size: 18px;">🏗 架构设计</b><br/>
<span style="color: #666; font-size: 13px;">模块热插拔<br/>统一底座</span>
</td>
<td align="center" width="33%" style="border: none;">
<b style="font-size: 18px;">🤖 模块实现</b><br/>
<span style="color: #666; font-size: 13px;">多智能体协作<br/>Separate-Together</span>
</td>
<td align="center" width="33%" style="border: none;">
<b style="font-size: 18px;">📊 实验验证</b><br/>
<span style="color: #666; font-size: 13px;">56 次消融实验<br/>量化归因</span>
</td>
</tr>
</table>
</div>

---

## 一、为什么需要 SoloLab

独立研究者的日常工作横跨多个阶段：文献调研、创意发散、编码实验、数据分析、论文写作。这些环节彼此独立，却共享底层能力——大模型调用、文档解析、向量检索、会话记忆。

现有工具要么只覆盖单一环节（如 ChatGPT 之于对话），要么耦合过深难以定制。我们需要的是一个**统一底座 + 可插拔模块**的架构：核心服务层提供公共能力，功能模块按需加载，互不干扰。

这就是 SoloLab 的设计初衷。

<div align="center">
<img src="images/architecture-overview.png" width="680" alt="SoloLab 平台总览" />
<br/>
<sub style="color: #999;">图 1：SoloLab 平台总览——前端模块层 · 核心服务层 · 数据与记忆层</sub>
</div>

---

## 二、平台架构：模块热插拔的工程实现

### 2.1 整体架构

SoloLab 采用前后端分离的三层架构：

<div align="center">
<table align="center" cellpadding="14">
<tr>
<td align="center" width="33%"><b>前端层</b><br/><span style="color:#666; font-size:13px;">Next.js 14 (App Router)<br/>Zustand 状态管理<br/>SSE 实时推送</span></td>
<td align="center" width="33%"><b>服务层</b><br/><span style="color:#666; font-size:13px;">FastAPI 异步框架<br/>7 大核心服务<br/>模块热插拔引擎</span></td>
<td align="center" width="33%"><b>数据层</b><br/><span style="color:#666; font-size:13px;">PostgreSQL + pgvector<br/>Redis 缓存与状态<br/>文件存储</span></td>
</tr>
</table>
</div>

<div align="center">
<img src="images/architecture.png" width="680" alt="系统技术架构" />
<br/>
<sub style="color: #999;">图 2：系统技术架构——前端工作台 · FastAPI 核心服务 · PostgreSQL / Redis / 文件存储</sub>
</div>

### 2.2 模块注册表：零耦合的插件机制

我们借鉴了操作系统中驱动程序的加载模式，设计了基于 `manifest.json + ABC 抽象类` 的模块系统。其核心可形式化描述为：

---

**模块定义。** 每个模块 $M$ 是一个三元组：

$$M = (manifest, \; execute, \; hooks)$$

其中 $manifest$ 声明模块的元数据与依赖，$execute$ 是核心执行逻辑（异步生成器），$hooks = \{on\_load, \; on\_unload\}$ 提供生命周期钩子。

**服务注入。** 模块执行时，平台通过 `ModuleContext` 自动注入所有核心服务：

$$ctx = (LLM, \; Tools, \; Memory, \; Tasks, \; Documents, \; ...)$$

模块无需关心服务的创建和销毁，只需通过 $ctx$ 访问即可。这种依赖注入模式使模块之间完全解耦。

**动态发现与加载。** 系统启动时，`ModuleRegistry` 自动扫描 `modules/*/manifest.json`：

$$discover() \rightarrow \{id: manifest\} \xrightarrow{validate} on\_load() \xrightarrow{register} \text{Ready}$$

---

这意味着：新增模块只需在 `modules/` 目录下放入一个文件夹，无需修改任何核心代码。加载和卸载均在运行时完成，零停机。

### 2.3 六大功能模块

<div align="center">
<table align="center" cellpadding="10">
<tr>
<th align="center">模块</th>
<th align="center">定位</th>
<th align="center">状态</th>
</tr>
<tr>
<td align="center"><b>💡 IdeaSpark</b></td>
<td>多智能体创意生成</td>
<td align="center"><b style="color: #00C853;">已完成</b></td>
</tr>
<tr><td align="center">🔧 CodeLab</td><td>AI 辅助编码</td><td align="center" style="color:#999;">规划中</td></tr>
<tr><td align="center">✍️ WriterAI</td><td>学术论文写作</td><td align="center" style="color:#999;">规划中</td></tr>
<tr><td align="center">📊 DataLens</td><td>数据分析与可视化</td><td align="center" style="color:#999;">规划中</td></tr>
<tr><td align="center">📚 LitReview</td><td>系统性文献综述</td><td align="center" style="color:#999;">规划中</td></tr>
<tr><td align="center">🔍 Reviewer</td><td>论文评审模拟</td><td align="center" style="color:#999;">规划中</td></tr>
</table>
</div>

所有模块共享同一套 LLM 网关、工具注册表、向量记忆和会话管理，真正实现"搭建一次，复用无限"。

---

## 三、IdeaSpark：多智能体创意生成系统

### 3.1 问题定义

科研创意的产生是研究过程中最具挑战性的环节。传统头脑风暴依赖多人协作，而独立研究者恰恰缺乏多样化的认知碰撞环境。单一大语言模型虽然能力强大，但其输出受限于单一视角和知识截止日期。

我们的核心问题是：**能否用多个差异化的 AI 智能体模拟研究团队的协作过程，产生高于单一模型的创意质量？**

<div align="center">
<img src="images/problem-comparison.png" width="680" alt="传统方式 vs SoloLab" />
<br/>
<sub style="color: #999;">图 3：传统单模型方式 vs. SoloLab 多智能体方式</sub>
</div>

### 3.2 Separate-Together 协作框架

IdeaSpark 的核心是一个受认知科学启发的 **Separate-Together** 协作流程：先独立发散，再分组碰撞，最后全局整合。形式化地，对于用户输入的研究主题 $q$，系统执行以下流程：

---

**Phase 1 — Separate。** $n$ 个智能体独立生成创意集合：

$$I_i = A_i(q, \; tools_i, \; prompt_i), \quad i \in \{1, \dots, n\}$$

其中每个智能体具有差异化的角色设定（temperature、工具权限、系统提示词）。

**Phase 2 — 语义聚类。** 对所有创意进行嵌入并聚类：

$$\{C_1, \dots, C_k\} = \text{KMeans}\big(\text{Embed}(\bigcup_i I_i),\; k\big)$$

**Phase 3 — Together。** 每个聚类组内进行多轮讨论：

$$C_j' = \text{Discuss}(C_j, \; \{A_{critic}, \; A_{connector}\})$$

**Phase 4 — 锦标赛评估。** 跨组融合后，通过 Elo 锦标赛排序：

$$\text{Elo}(idea_a, \; idea_b) = \text{Judge}(idea_a, \; idea_b) \rightarrow \Delta R$$

---

<div align="center">
<img src="images/separate-together-flow.png" width="680" alt="Separate-Together 流程" />
<br/>
<sub style="color: #999;">图 4：Separate-Together 协作流程——从并行发散到分组碰撞，再到全局整合与 Elo 排序</sub>
</div>

### 3.3 五大角色智能体

<div align="center">
<table align="center" cellpadding="12">
<tr>
<th align="center">角色</th>
<th align="center">温度</th>
<th align="center">工具</th>
<th>职责</th>
</tr>
<tr>
<td align="center"><b>🌀 发散者</b><br/><sub>Divergent Thinker</sub></td>
<td align="center"><code>1.0</code></td>
<td align="center">web_search, arxiv</td>
<td>跨领域类比，大胆联想</td>
</tr>
<tr>
<td align="center"><b>🎓 领域专家</b><br/><sub>Domain Expert</sub></td>
<td align="center"><code>0.5</code></td>
<td align="center">arxiv, scholar, pdf</td>
<td>深度专业知识，方法论审查</td>
</tr>
<tr>
<td align="center"><b>⚔️ 审辩者</b><br/><sub>Critic</sub></td>
<td align="center"><code>0.3</code></td>
<td align="center">arxiv</td>
<td>挑战假设，寻找逻辑漏洞</td>
</tr>
<tr>
<td align="center"><b>🔗 连接者</b><br/><sub>Connector</sub></td>
<td align="center"><code>0.7</code></td>
<td align="center">—</td>
<td>发现创意间的关联，组合融合</td>
</tr>
<tr>
<td align="center"><b>⚖️ 评估者</b><br/><sub>Evaluator</sub></td>
<td align="center"><code>0.3</code></td>
<td align="center">—</td>
<td>锦标赛投票，Elo 排序</td>
</tr>
</table>
</div>

温度参数的差异化设定是刻意为之：发散者需要高随机性以探索更大的创意空间，而审辩者和评估者则需要低温度以确保判断的稳定性。

### 3.4 实时工具调用

智能体在运行过程中自主调用外部 API 获取前沿信息，确保每个创意都有据可查：

<div align="center">
<table align="center" cellpadding="12">
<tr>
<td align="center" width="25%"><b>📄 arXiv</b><br/><span style="color:#666; font-size:13px;">预印本论文搜索<br/>获取最新学术成果</span><br/><b>~19 次/run</b></td>
<td align="center" width="25%"><b>🔗 Semantic Scholar</b><br/><span style="color:#666; font-size:13px;">引用图谱 + 元数据<br/>验证研究脉络</span><br/><b>~4 次/run</b></td>
<td align="center" width="25%"><b>🌐 Tavily Search</b><br/><span style="color:#666; font-size:13px;">实时网络搜索<br/>行业趋势与应用</span><br/><b>~5 次/run</b></td>
<td align="center" width="25%"><b>📑 PDF Parser</b><br/><span style="color:#666; font-size:13px;">学术 PDF 全文解析<br/>提取实验细节</span><br/><b>按需调用</b></td>
</tr>
</table>
</div>

> 每次运行平均 **28 次工具调用**，确保 100% 的创意具有真实文献支撑（Grounding Rate = 100%）。

### 3.5 运行展示

输入一个研究主题后，5 个智能体开始并行工作：

<div align="center">
<img src="images/ideaspark-running.png" width="680" alt="IdeaSpark 运行中" />
<br/>
<sub style="color: #999;">图 5：IdeaSpark 运行中——左侧对话流 · 右侧 Agent 活动时间线 · 实时工具调用</sub>
</div>

<br/>

经过多轮协作和 Elo 锦标赛排序后，系统输出 Top-5 创意卡片：

<div align="center">
<img src="images/ideaspark-ideas.png" width="680" alt="创意看板" />
<br/>
<sub style="color: #999;">图 6：Top-5 创意看板——Elo 评分排序 · Agent 来源标注 · 完整文献引用</sub>
</div>

<br/>

一键生成结构化的 Markdown 研究报告：

<div align="center">
<img src="images/ideaspark-report.png" width="680" alt="研究报告" />
<br/>
<sub style="color: #999;">图 7：一键生成 Markdown 研究报告——方法论描述 · 参考文献 · 可直接导出</sub>
</div>

---

## 四、消融实验：56 次受控运行的量化验证

"多智能体比单 LLM 好"是一个被广泛接受的直觉，但直觉不能替代证据。我们设计了一套严格的消融实验来回答三个关键问题：

<div align="center">
<table align="center" cellpadding="16" style="border: none;">
<tr>
<td align="center" width="33%" style="border: none;">
<b>问题一</b><br/>
<span style="color: #666; font-size: 13px;">多智能体框架是否<br/>真的优于单 LLM？</span>
</td>
<td align="center" width="33%" style="border: none;">
<b>问题二</b><br/>
<span style="color: #666; font-size: 13px;">系统中哪些组件<br/>贡献最大？</span>
</td>
<td align="center" width="33%" style="border: none;">
<b>问题三</b><br/>
<span style="color: #666; font-size: 13px;">最佳的质量-成本<br/>平衡点在哪里？</span>
</td>
</tr>
</table>
</div>

### 4.1 实验设计

**消融矩阵**：7 种条件 × 4 个跨学科主题 × 2 次重复 = **56 次受控运行**

**评测方法**：采用 LLM-as-Judge 范式，使用独立评审模型（qwen3.5-plus）进行五维度评审。每个创意评审 2 次取平均，共计 **560 次评分**。

**评分维度**（加权总分 $S$ ）：

$$S = 0.25 \cdot \text{Novelty} + 0.25 \cdot \text{Feasibility} + 0.20 \cdot \text{Impact} + 0.15 \cdot \text{Specificity} + 0.15 \cdot \text{Evidence}$$

### 4.2 核心结果

<div align="center">
<table align="center" cellpadding="10">
<tr>
<th align="center">消融条件</th>
<th align="center">Overall</th>
<th align="center">Grounding</th>
<th align="center">Cost</th>
<th align="center">Latency</th>
</tr>
<tr style="background: #f0faf0;">
<td align="center">🏆 <b>Full System</b></td>
<td align="center"><b>8.53 ± 0.07</b></td>
<td align="center">✅ 100%</td>
<td align="center">$0.080</td>
<td align="center">493s</td>
</tr>
<tr style="background: #f0f4ff;">
<td align="center">🥇 <b>SingleRound</b> ← 帕累托最优</td>
<td align="center"><b>8.45 ± 0.11</b></td>
<td align="center">✅ 100%</td>
<td align="center"><b>$0.028</b></td>
<td align="center"><b>110s</b></td>
</tr>
<tr>
<td align="center">🚫 NoTools</td>
<td align="center">6.21 ± 3.83</td>
<td align="center">❌ 0%</td>
<td align="center">$0.032</td>
<td align="center">597s</td>
</tr>
<tr>
<td align="center">💬 Baseline（单 LLM）</td>
<td align="center">5.53 ± 0.43</td>
<td align="center">❌ 0%</td>
<td align="center">$0.005</td>
<td align="center">18s</td>
</tr>
</table>
</div>

### 4.3 组件贡献归因

通过逐层消融，精确量化每个组件的边际贡献：

$$\Delta_{\text{multi-agent}} = S_{full} - S_{baseline} = 8.53 - 5.53 = +3.00 \;\; (+54\%)$$

$$\Delta_{\text{tools}} = S_{\text{with\_tools}} - S_{\text{no\_tools}} = 8.53 - 6.21 = +2.32 \;\; (+37\%)$$

$$\Delta_{\text{tournament}} = S_{\text{with\_elo}} - S_{\text{no\_elo}} \approx +0.12 \;\; (+1.4\%)$$

$$\Delta_{\text{iteration}} = S_{\text{multi\_round}} - S_{\text{single\_round}} = 8.53 - 8.45 = +0.08 \;\; (+0.9\%)$$

<div align="center">
<pre style="text-align: left; display: inline-block; background: #fafafa; padding: 16px 24px; border-radius: 8px; font-size: 14px;">
📊 组件贡献归因

🤖 多智能体框架    ████████████████████████████  +54%
🔍 工具调用(搜索)  ██████████████████           +37%
🏅 Elo 锦标赛      █                            +1.4%
🔄 多轮迭代        █                            +0.9%
</pre>
</div>

> **核心发现：90% 以上的质量提升来自"多智能体框架 + 工具调用"两个组件。** 多轮迭代和 Elo 锦标赛的边际收益有限。

### 4.4 帕累托最优

实验揭示了一个具有实践意义的结论：

<div align="center" style="padding: 16px;">
<b>SingleRound 配置用 1/4 的时间、1/3 的成本达到了 Full System 99% 的质量。</b>
</div>

这一发现对于多智能体系统的工程实践具有参考价值——并非组件越多越好，找到性能-成本的最优权衡点同样重要。

---

## 五、工程实践：一键部署与开源

### 5.1 一键拉起

SoloLab 采用 Docker Compose 编排全部 5 个服务（PostgreSQL + Redis + Backend + Frontend + Caddy），支持一键部署：

```bash
git clone https://github.com/zephyr4123/sololab.git && cd sololab
cp .env.example .env   # 填入 LLM API Key
docker compose up -d   # 自动建库、迁移、启动
```

启动后系统自动完成数据库初始化、表结构迁移、服务注册，无需任何手动干预。

### 5.2 开发新模块

得益于热插拔架构，扩展 SoloLab 的能力只需两步：

1. 在 `modules/` 目录下创建新文件夹，编写 `manifest.json` 声明元数据
2. 继承 `ModuleBase`，实现 `execute()` 方法

无需修改核心代码，无需注册路由，放入目录即刻生效。

<div align="center">
<img src="images/dashboard.png" width="680" alt="SoloLab 统一工作台" />
<br/>
<sub style="color: #999;">图 8：SoloLab 统一工作台——模块切换 · 对话流 · Agent 活动时间线</sub>
</div>

---

## 六、总结与展望

SoloLab 是我们对"独立研究者如何借助 AI 提升科研效率"这一问题的系统性回答。在首个模块 IdeaSpark 中，我们验证了多智能体协作相比单一 LLM 带来 **54% 的质量提升**，并通过 56 次消融实验精确量化了每个组件的贡献。

接下来，我们将继续开发 CodeLab（AI 编码）、WriterAI（论文写作）等模块，逐步覆盖独立研究者从灵感到成稿的完整工作流。

**如果你也是一个人在做科研，欢迎试用和参与贡献。**

---

<div align="center" style="padding: 20px 0; line-height: 2;">

**开源地址**：https://github.com/zephyr4123/sololab<br/>
**许可协议**：Apache License 2.0<br/>
**作者**：黄素翔（huangsuxiang5@gmail.com）<br/>
**指导老师**：王征<br/>
**实验室**：天津大学 记忆与推理实验室（Memory and Reasoning Lab）

</div>
