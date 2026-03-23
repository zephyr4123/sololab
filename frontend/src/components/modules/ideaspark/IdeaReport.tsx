'use client';

import { useState } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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

      md += `## 方法说明\n\n`;
      md += `本报告由 SoloLab IdeaSpark 模块生成，采用多智能体协作的分离-汇聚流程：\n\n`;
      md += `1. **分离阶段** — 发散者和领域专家并行独立生成创意\n`;
      md += `2. **语义聚类** — 使用 K-Means + 嵌入向量按语义相似度分组\n`;
      md += `3. **汇聚阶段** — 批评者和连接者分组讨论，扩展/组合/优化\n`;
      md += `4. **全局综合** — 连接者跨组融合最佳创意\n`;
      md += `5. **锦标赛评估** — 基于 Elo 评分的成对比较排名\n`;

      setReport(md);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report generation failed');
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
          ? '提交研究主题并等待生成完成后，可在此导出报告'
          : '等待创意生成完成...'}
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
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '生成中...' : '生成 Markdown 报告'}
          </button>
        ) : (
          <>
            <button
              onClick={downloadReport}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              下载报告
            </button>
            <button
              onClick={() => setReport(null)}
              className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              返回
            </button>
          </>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
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
