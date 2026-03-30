import Image from 'next/image';
import Link from 'next/link';
import { Lightbulb, Code, PenTool, BarChart3, BookOpen, Search, ArrowRight } from 'lucide-react';

const modules = [
  { id: 'ideaspark', name: 'IdeaSpark', description: '多智能体协作，激发创新性研究创意', icon: Lightbulb, status: 'ready' },
  { id: 'codelab', name: 'CodeLab', description: 'AI 辅助编码与实验原型开发', icon: Code, status: 'ready' },
  { id: 'writer', name: 'WriterAI', description: '学术论文写作与结构化表达', icon: PenTool, status: 'planned' },
  { id: 'datalens', name: 'DataLens', description: '数据分析与可视化洞察', icon: BarChart3, status: 'planned' },
  { id: 'litreview', name: 'LitReview', description: '系统性文献综述与知识图谱', icon: BookOpen, status: 'planned' },
  { id: 'reviewer', name: 'Reviewer', description: '模拟同行评审与论文改进建议', icon: Search, status: 'planned' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl py-6">
      {/* Hero section */}
      <div className="mb-14 animate-fade-in-up">
        <div className="flex items-center gap-5">
          <Image
            src="/logo.png"
            alt="SoloLab"
            width={64}
            height={64}
            className="h-16 w-auto object-contain"
          />
          <div>
            <h1 className="text-3xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              SoloLab
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground tracking-wide">
              面向独立研究者的 AI 辅助研究平台
            </p>
          </div>
        </div>
      </div>

      {/* Section divider */}
      <div className="mb-6 flex items-center gap-4 animate-fade-in-up delay-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
          Research Modules
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod, i) => {
          const Icon = mod.icon;
          const isReady = mod.status === 'ready';

          const card = (
            <div
              className={`animate-fade-in-up delay-${i + 1} group relative rounded-xl border border-border/60 bg-card/60 p-5 transition-all duration-300 ${
                isReady
                  ? 'card-hover cursor-pointer hover:border-[var(--color-warm)]/30'
                  : 'opacity-35 cursor-not-allowed'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300 ${
                  isReady
                    ? 'bg-[var(--color-warm)]/10 text-[var(--color-warm)] group-hover:bg-[var(--color-warm)]/15'
                    : 'bg-muted text-muted-foreground/40'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                {isReady ? (
                  <span className="rounded-full border border-[var(--color-warm)]/20 bg-[var(--color-warm)]/5 px-2.5 py-0.5 text-[10px] font-medium text-[var(--color-warm)] tracking-wide">
                    READY
                  </span>
                ) : (
                  <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/40 tracking-wide">
                    SOON
                  </span>
                )}
              </div>
              <h3 className="mb-1 text-base font-semibold tracking-tight">{mod.name}</h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{mod.description}</p>
              {isReady && (
                <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground/50 group-hover:text-[var(--color-warm)] transition-colors duration-300">
                  <span className="tracking-wide">进入模块</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              )}
            </div>
          );

          if (isReady) {
            return <Link key={mod.id} href={`/modules/${mod.id}`}>{card}</Link>;
          }
          return <div key={mod.id}>{card}</div>;
        })}
      </div>

      {/* Footer */}
      <div className="mt-16 text-center">
        <p className="text-[10px] text-muted-foreground/30 tracking-[0.15em] uppercase">
          Built by S.Huang
        </p>
      </div>
    </div>
  );
}
