'use client';

import { useState } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function IdeaReport() {
  const { topIdeas, phase, costUsd } = useIdeaSparkStore();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = phase === 'done' || phase === 'converged';

  const generateReport = async () => {
    if (!topIdeas.length) return;
    setLoading(true);
    setError(null);

    try {
      // 从 topIdeas 构建本地 Markdown 报告（无需再跑一遍模块）
      const now = new Date().toLocaleString('zh-CN');
      let md = `# IdeaSpark 研究创意报告\n\n`;
      md += `> 生成时间：${now}  \n`;
      md += `> 总费用：$${costUsd.toFixed(4)}\n\n`;
      md += `---\n\n`;
      md += `## Top ${topIdeas.length} 研究创意\n\n`;

      for (const idea of topIdeas) {
        md += `### #${idea.rank ?? '?'} — Elo ${Math.round(idea.eloScore)}\n\n`;
        md += `**来源智能体：** ${idea.author}\n\n`;
        md += `${idea.content}\n\n`;
        md += `---\n\n`;
      }

      md += `## 生成流程\n\n`;
      md += `本报告由 SoloLab IdeaSpark 生成，5 个智能体按以下流程协作：\n\n`;
      md += `1. **生成创意** — 发散者和领域专家各自独立提出创意\n`;
      md += `2. **创意分组** — 按相似度把创意归类到不同小组\n`;
      md += `3. **小组评议** — 审辩者指出问题，整合者给出改进\n`;
      md += `4. **整合最佳** — 整合者汇总各组优秀创意，去重补强\n`;
      md += `5. **Elo 排序** — 评审者成对比较，按 Elo 分排出最终顺序\n`;

      setReport(md);
    } catch (e) {
      setError(e instanceof Error ? e.message : '报告生成失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ideaspark-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canGenerate && !report) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {phase === 'idle'
          ? '生成 Top 创意后，可在这里导出 Markdown 报告'
          : '正在生成创意，完成后即可导出...'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-2">
      {/* 操作栏 */}
      <div className="flex items-center gap-3">
        {!report ? (
          <button
            onClick={generateReport}
            disabled={loading || !topIdeas.length}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '生成中...' : '生成 Markdown 报告'}
          </button>
        ) : (
          <>
            <button
              onClick={downloadReport}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            >
              下载报告
            </button>
            <button
              onClick={() => setReport(null)}
              className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-accent"
            >
              返回
            </button>
          </>
        )}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {/* 报告预览 */}
      {report && (
        <div className="overflow-auto rounded-lg border p-6">
          <MarkdownViewer content={report} />
        </div>
      )}
    </div>
  );
}
