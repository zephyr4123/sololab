'use client';

/**
 * SuggestionGrid — 4 curated research topics for the empty-state hero.
 * Each card is a hairless surface — only spacing + faint hover wash. No
 * border by default; on hover a soft warm tint surfaces.
 */

interface Suggestion {
  topic: string;
  detail: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    topic: '3D 高斯泼溅 · 内存优化',
    detail: 'CVPR · LOD 与压缩 · NeRF 对照',
    prompt:
      '我要写一篇 CVPR 投稿，主题是 3D 高斯泼溅 (3DGS) 的内存优化。希望从 LOD 与压缩两条路径出发，得到与 NeRF 系列在显存占用 / 渲染速度上的清晰对比。',
  },
  {
    topic: 'AlphaFold 3 · 药物发现',
    detail: 'Nature 综述 · 案例 · 时间线',
    prompt:
      '为我设计一篇 Nature 综述：AlphaFold 3 在药物发现中的应用。要图文并茂，包括技术演进时间线、性能对比表、若干典型案例（kinase inhibitor / GPCR / antibody design）。',
  },
  {
    topic: '多智能体强化学习',
    detail: '《自动化学报》· 公式 · 中文 SOTA',
    prompt:
      '给《自动化学报》写一篇中文综述：多智能体强化学习在自动驾驶决策中的应用。需要数学公式推导、算法伪代码、SMAC/MetaDrive 等 benchmark 横向对比。',
  },
  {
    topic: '扩散模型 · 分子生成',
    detail: 'ICML · 损失曲线 · GraphRNN 对照',
    prompt:
      '撰写一篇 ICML 论文：扩散模型在分子生成 (de novo molecule design) 中的应用。包含模型结构图、训练损失曲线、与 GraphRNN / MolGAN 的定量对比。',
  },
];

interface SuggestionGridProps {
  onPick: (prompt: string) => void;
}

export function SuggestionGrid({ onPick }: SuggestionGridProps) {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        <span className="eyebrow-rule" aria-hidden />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/45">
          Spark from
        </span>
        <span className="eyebrow-rule" aria-hidden style={{ transform: 'scaleX(-1)' }} />
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.topic}
            onClick={() => onPick(s.prompt)}
            className="suggestion-card group text-left rounded-xl px-4 py-3.5 transition-all duration-200 animate-fade-in-up"
            style={{ animationDelay: `${320 + i * 70}ms` }}
          >
            <h3 className="text-[12.5px] font-medium text-foreground/80 group-hover:text-foreground transition-colors leading-snug tracking-tight">
              {s.topic}
            </h3>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground/55 leading-relaxed">
              {s.detail}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
