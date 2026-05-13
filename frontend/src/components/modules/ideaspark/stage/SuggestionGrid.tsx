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
    topic: '3D 高斯泼溅 · 找新突破口',
    detail: '内存似乎已经走到头 · 求被忽略的角度',
    prompt:
      '3D 高斯泼溅 (3DGS) 最近被研究得很透，我感觉"内存优化"这条路径已经被吃干净。还有哪些被低估或被忽略的方向值得继续做？给我几个互相不重叠的角度，并指出每个角度最大的风险。',
  },
  {
    topic: '扩散模型 × 蛋白设计',
    detail: '采样 / condition / representation',
    prompt:
      '扩散模型用在蛋白质 backbone 生成上已经能 work，但下一步是什么？是改采样策略、改 condition 信号，还是干脆换 representation？我希望看到至少 3 条完全不同的研究路线，每条都说说凭什么会赢。',
  },
  {
    topic: 'AlphaFold 之后 · 下一个真问题',
    detail: '结构 → 功能 → 动力学',
    prompt:
      '蛋白质结构预测已经接近上限。我直觉下一个值得做的是"动力学 / 构象采样"，但我不确定。请反驳这个判断，或者指出其他被低估、但更有 leverage 的方向。',
  },
  {
    topic: 'LLM 做科学发现 · 真路径',
    detail: '反 demo · 要可衡量的里程碑',
    prompt:
      '目前 LLM-as-scientist 的工作多停留在 demo 层面。如果要让"自动科学发现"成为一个真正可衡量、可比较的研究问题，应该如何定义里程碑？给我几个互不相同的 framing。',
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
