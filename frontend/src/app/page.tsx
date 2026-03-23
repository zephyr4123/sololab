import Image from 'next/image';
import Link from 'next/link';
import { Lightbulb, Code, PenTool, BarChart3, BookOpen, Search, ArrowRight } from 'lucide-react';

const modules = [
  { id: 'ideaspark', name: 'IdeaSpark', description: '多智能体协作，激发创新性研究创意', icon: Lightbulb, status: 'ready', color: 'from-purple-500/10 to-purple-500/5 border-purple-200/60' },
  { id: 'codelab', name: 'CodeLab', description: 'AI 辅助编码与实验原型开发', icon: Code, status: 'planned', color: 'from-blue-500/10 to-blue-500/5 border-blue-200/60' },
  { id: 'writer', name: 'WriterAI', description: '学术论文写作与结构化表达', icon: PenTool, status: 'planned', color: 'from-green-500/10 to-green-500/5 border-green-200/60' },
  { id: 'datalens', name: 'DataLens', description: '数据分析与可视化洞察', icon: BarChart3, status: 'planned', color: 'from-orange-500/10 to-orange-500/5 border-orange-200/60' },
  { id: 'litreview', name: 'LitReview', description: '系统性文献综述与知识图谱', icon: BookOpen, status: 'planned', color: 'from-cyan-500/10 to-cyan-500/5 border-cyan-200/60' },
  { id: 'reviewer', name: 'Reviewer', description: '模拟同行评审与论文改进建议', icon: Search, status: 'planned', color: 'from-rose-500/10 to-rose-500/5 border-rose-200/60' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl py-4">
      {/* Hero section */}
      <div className="mb-10 flex items-center gap-5">
        <Image
          src="/logo.png"
          alt="SoloLab"
          width={72}
          height={72}
          className="h-[72px] w-auto object-contain drop-shadow-sm"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SoloLab</h1>
          <p className="mt-1 text-base text-muted-foreground">
            面向独立研究者的 AI 辅助研究平台
          </p>
        </div>
      </div>

      {/* Section label */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Research Modules
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isReady = mod.status === 'ready';

          const card = (
            <div
              className={`group relative rounded-xl border bg-gradient-to-br p-5 transition-all ${mod.color} ${
                isReady
                  ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                  : 'opacity-45 cursor-not-allowed'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/80 shadow-sm">
                  <Icon className="h-4.5 w-4.5 text-foreground/80" />
                </div>
                {isReady ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    可用
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    开发中
                  </span>
                )}
              </div>
              <h3 className="mb-1 text-base font-semibold">{mod.name}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{mod.description}</p>
              {isReady && (
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-foreground/60 group-hover:text-foreground transition-colors">
                  进入模块 <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </div>
          );

          if (isReady) {
            return (
              <Link key={mod.id} href={`/modules/${mod.id}`}>
                {card}
              </Link>
            );
          }
          return <div key={mod.id}>{card}</div>;
        })}
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-xs text-muted-foreground/50">
        Powered By Suxiang.Huang
      </div>
    </div>
  );
}
