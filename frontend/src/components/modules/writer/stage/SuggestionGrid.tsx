'use client';

/**
 * SuggestionGrid — 4 curated examples shown beneath the compose card on
 * the empty-state stage. Each card shows a short topic + descriptor; clicking
 * fills the compose input with the long-form prompt so the user can edit + send.
 *
 * 4×1 on desktop, 2×2 on tablet, 1×4 on phone (responsive grid).
 */

interface Suggestion {
  topic: string;
  detail: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    topic: '3D 高斯泼溅 · 内存优化',
    detail: 'CVPR · 架构对比图 · 消融实验',
    prompt:
      '我在准备一篇 CVPR 投稿，主题是 3D 高斯泼溅的内存优化。需要架构对比图、消融实验表，以及与 NeRF 系列的渲染速度 benchmark',
  },
  {
    topic: 'AlphaFold 3 · 药物发现',
    detail: 'Nature 综述 · 图文并茂 · 案例分析',
    prompt:
      '帮我写一篇 Nature 综述：AlphaFold 3 在药物发现中的应用。要图文并茂，包含技术演进时间线、性能对比表和典型案例分析',
  },
  {
    topic: '多智能体强化学习',
    detail: '《自动化学报》· 公式推导 · 算法伪代码',
    prompt:
      '目标《自动化学报》，多智能体强化学习用于自动驾驶决策的中文综述。需要数学公式推导、算法伪代码框图、主流 benchmark 对比',
  },
  {
    topic: '扩散模型 · 分子生成',
    detail: 'ICML · 损失曲线 · 定量对比',
    prompt:
      '撰写一篇关于扩散模型在分子生成中应用的 ICML 论文。包含模型架构图、训练损失曲线、与 GraphRNN/MolGAN 的定量对比表',
  },
];

interface SuggestionGridProps {
  onPick: (prompt: string) => void;
}

export default function SuggestionGrid({ onPick }: SuggestionGridProps) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/45">
          Examples
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.topic}
            onClick={() => onPick(s.prompt)}
            className="group text-left rounded-xl border border-border/40 bg-card/40 hover:bg-card/70 hover:border-warm/40 px-3.5 py-3 transition-all duration-200 card-hover animate-fade-in-up"
            style={{ animationDelay: `${320 + i * 60}ms` }}
          >
            <h3 className="text-[12.5px] font-semibold mb-1 tracking-tight text-foreground/90 group-hover:text-foreground transition-colors leading-snug">
              {s.topic}
            </h3>
            <p className="text-[10.5px] text-muted-foreground/60 leading-relaxed">
              {s.detail}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
