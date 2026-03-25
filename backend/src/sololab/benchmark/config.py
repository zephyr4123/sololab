"""Benchmark 配置：标准测试题集与评测参数。"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List


# ---------------------------------------------------------------------------
# 难度等级
# ---------------------------------------------------------------------------
class Difficulty(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# ---------------------------------------------------------------------------
# 单个测试主题
# ---------------------------------------------------------------------------
@dataclass
class BenchmarkTopic:
    id: str
    category: str
    title: str  # 作为 user_input 传给 IdeaSpark
    difficulty: Difficulty
    tags: List[str] = field(default_factory=list)
    description: str = ""  # 可选的补充说明


# ---------------------------------------------------------------------------
# 标准测试题集（15 题，覆盖 7 大学科类别）
# ---------------------------------------------------------------------------
BENCHMARK_TOPICS: List[BenchmarkTopic] = [
    # ── CS / AI ──────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="cs-01",
        category="CS/AI",
        title="如何利用大语言模型自动生成可验证的科学假设",
        difficulty=Difficulty.MEDIUM,
        tags=["LLM", "科学发现", "假设生成"],
        description="探索 LLM 在科学假设生成中的应用，包括假设的可验证性保证机制",
    ),
    BenchmarkTopic(
        id="cs-02",
        category="CS/AI",
        title="设计一种能够持续学习的多智能体协作框架，用于开放域知识发现",
        difficulty=Difficulty.HIGH,
        tags=["多智能体", "持续学习", "知识发现"],
        description="结合多智能体通信与终身学习，实现动态知识图谱扩展",
    ),
    # ── 生物医学 ─────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="bio-01",
        category="生物医学",
        title="利用 AI 加速罕见病药物研发的新方法",
        difficulty=Difficulty.HIGH,
        tags=["药物发现", "罕见病", "AI4Science"],
        description="针对患者少、数据稀缺的罕见病场景，设计 AI 辅助的药物筛选策略",
    ),
    BenchmarkTopic(
        id="bio-02",
        category="生物医学",
        title="基于单细胞组学数据的疾病早期预警模型设计",
        difficulty=Difficulty.HIGH,
        tags=["单细胞", "早期诊断", "组学"],
        description="利用单细胞转录组/蛋白质组数据构建疾病风险预测模型",
    ),
    # ── 材料科学 ─────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="mat-01",
        category="材料科学",
        title="机器学习辅助新型固态电池电解质材料发现",
        difficulty=Difficulty.HIGH,
        tags=["固态电池", "材料发现", "ML"],
        description="利用机器学习加速筛选高离子电导率、高稳定性的固态电解质候选材料",
    ),
    BenchmarkTopic(
        id="mat-02",
        category="材料科学",
        title="利用生成式 AI 设计具有目标力学性能的超材料结构",
        difficulty=Difficulty.MEDIUM,
        tags=["超材料", "生成式设计", "力学"],
        description="探索扩散模型或 GAN 在逆向设计超材料微结构中的应用",
    ),
    # ── 社会科学 ─────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="soc-01",
        category="社会科学",
        title="社交媒体对青少年心理健康影响的因果推断方法",
        difficulty=Difficulty.MEDIUM,
        tags=["因果推断", "心理健康", "社交媒体"],
        description="设计可以从观察数据中识别因果效应的统计/ML 方法",
    ),
    BenchmarkTopic(
        id="soc-02",
        category="社会科学",
        title="利用大语言模型辅助大规模定性研究的编码与主题分析",
        difficulty=Difficulty.LOW,
        tags=["NLP", "定性研究", "主题分析"],
        description="探索 LLM 在定性研究中替代人工编码的可行性和局限性",
    ),
    # ── 交叉学科 ─────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="cross-01",
        category="交叉学科",
        title="将量子计算优势应用于大规模蛋白质折叠模拟",
        difficulty=Difficulty.HIGH,
        tags=["量子计算", "蛋白质折叠", "模拟"],
        description="探索量子算法（如 VQE、QAOA）在生物分子模拟中的具体应用路径",
    ),
    BenchmarkTopic(
        id="cross-02",
        category="交叉学科",
        title="结合脑机接口与深度学习实现高精度运动意图解码",
        difficulty=Difficulty.HIGH,
        tags=["BCI", "深度学习", "神经解码"],
        description="设计端到端的神经信号→运动指令解码框架",
    ),
    # ── 方法论 ───────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="method-01",
        category="方法论",
        title="如何提高系统综述的自动化程度并保证质量",
        difficulty=Difficulty.LOW,
        tags=["系统综述", "自动化", "元分析"],
        description="设计 AI 辅助的文献筛选、数据提取和质量评估流程",
    ),
    BenchmarkTopic(
        id="method-02",
        category="方法论",
        title="设计一种通用的科学实验可重复性验证框架",
        difficulty=Difficulty.MEDIUM,
        tags=["可重复性", "实验设计", "验证"],
        description="利用自动化工具链实现实验结果的独立验证",
    ),
    # ── 开放问题 ─────────────────────────────────────────────────────────
    BenchmarkTopic(
        id="open-01",
        category="开放问题",
        title="设计一种全新的蛋白质功能预测框架，突破现有序列-结构-功能范式",
        difficulty=Difficulty.HIGH,
        tags=["蛋白质", "功能预测", "新范式"],
        description="超越 AlphaFold 范式，探索功能预测的新方向",
    ),
    BenchmarkTopic(
        id="open-02",
        category="开放问题",
        title="如何构建一个能够自主提出研究问题的 AI 科学家系统",
        difficulty=Difficulty.HIGH,
        tags=["AI科学家", "自主研究", "问题发现"],
        description="设计能从文献中识别研究空白并提出原创问题的系统",
    ),
    BenchmarkTopic(
        id="open-03",
        category="开放问题",
        title="探索大语言模型在数学定理自动发现与证明中的可能路径",
        difficulty=Difficulty.HIGH,
        tags=["数学", "自动定理证明", "LLM"],
        description="结合形式化验证与 LLM 推理能力，探索自动数学发现",
    ),
]


def get_topics_by_category(category: str) -> List[BenchmarkTopic]:
    return [t for t in BENCHMARK_TOPICS if t.category == category]


def get_topics_by_difficulty(difficulty: Difficulty) -> List[BenchmarkTopic]:
    return [t for t in BENCHMARK_TOPICS if t.difficulty == difficulty]


def get_topic_by_id(topic_id: str) -> BenchmarkTopic | None:
    for t in BENCHMARK_TOPICS:
        if t.id == topic_id:
            return t
    return None


# ---------------------------------------------------------------------------
# Benchmark 运行参数默认值
# ---------------------------------------------------------------------------
@dataclass
class BenchmarkParams:
    """一次 benchmark 运行的参数。"""

    topics: List[str] = field(default_factory=lambda: [t.id for t in BENCHMARK_TOPICS])
    runs_per_topic: int = 3
    top_k: int = 5
    max_rounds: int = 3
    judge_repeat: int = 2  # 每个创意评审次数
    output_dir: str = "benchmark_results"
