'use client';

/**
 * ChatEntry — single conversation row.
 *
 * Three shapes, picked by `entry.role`:
 *   - user      : right-aligned bubble in warm accent.
 *   - tool      : single-line status pill with running dots / ✓ / ✗,
 *                 expandable to show full result items or raw input JSON.
 *   - assistant : markdown rendering with prose styling.
 *
 * Tool icons + colours are encoded once at the top of the file (TOOL_META)
 * so adding a new writer tool is one map entry — no JSX changes needed.
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  WriterChatEntry,
  WriterSearchResultItem,
} from '@/stores/module-stores/writer-store';

/* ── Inline icons (14×14, Lucide-style) ── */
const icons = {
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  outline: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 12H3" />
      <path d="M16 6H3" />
      <path d="M10 18H3" />
    </svg>
  ),
  pen: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z" />
    </svg>
  ),
  bookmark: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  code: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  image: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  book: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19v20H6.5a2.5 2.5 0 0 1 0-5H19" />
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  ),
  tool: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  ),
  chevron: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

interface ToolMeta {
  icon: React.ReactNode;
  label: string;
  color: string;
}

const TOOL_META: Record<string, ToolMeta> = {
  search_literature: { icon: icons.search, label: '检索文献', color: 'text-blue-500 dark:text-blue-400' },
  create_outline: { icon: icons.outline, label: '生成大纲', color: 'text-emerald-500 dark:text-emerald-400' },
  write_section: { icon: icons.pen, label: '撰写章节', color: 'text-amber-600 dark:text-amber-400' },
  manage_reference: { icon: icons.bookmark, label: '管理引用', color: 'text-violet-500 dark:text-violet-400' },
  execute_code: { icon: icons.code, label: '运行代码', color: 'text-orange-500 dark:text-orange-400' },
  insert_figure: { icon: icons.image, label: '插入图表', color: 'text-teal-500 dark:text-teal-400' },
  search_knowledge: { icon: icons.book, label: '检索知识库', color: 'text-indigo-500 dark:text-indigo-400' },
  get_document: { icon: icons.file, label: '读取文档', color: 'text-gray-500 dark:text-gray-400' },
};

const DEFAULT_TOOL_META: ToolMeta = {
  icon: icons.tool,
  label: '工具',
  color: 'text-muted-foreground',
};

const SOURCE_BADGE: Record<string, string> = {
  arxiv: 'bg-red-500/10 text-red-600 dark:text-red-400',
  scholar: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  web: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

function SearchResultItem({ result }: { result: WriterSearchResultItem }) {
  const authorsStr =
    result.authors.slice(0, 3).join(', ') + (result.authors.length > 3 ? ' 等' : '');
  const badgeCls = SOURCE_BADGE[result.source] || SOURCE_BADGE.web;
  return (
    <div className="py-2 px-2 border-l-2 border-border/40 hover:border-warm/40 transition-colors">
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeCls}`}>
          {result.source}
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-foreground/90 hover:text-warm leading-snug line-clamp-2 block"
          >
            {result.title}
          </a>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/60">
            {authorsStr && <span className="truncate">{authorsStr}</span>}
            {result.year && <span className="shrink-0">· {result.year}</span>}
            {result.venue && result.venue !== result.source && (
              <span className="shrink-0 italic">· {result.venue}</span>
            )}
          </div>
          {result.abstract && (
            <p className="text-[10px] text-muted-foreground/50 mt-1 line-clamp-2 leading-relaxed">
              {result.abstract}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatEntry({ entry }: { entry: WriterChatEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[85%] bg-warm/10 dark:bg-warm/5 border border-warm/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
          {entry.content}
        </div>
      </div>
    );
  }

  if (entry.role === 'tool') {
    const meta =
      TOOL_META[entry.toolName || ''] || {
        ...DEFAULT_TOOL_META,
        label: entry.toolName || '工具',
      };
    const isError = entry.toolStatus === 'error';
    const isRunning = entry.toolStatus === 'running';
    const hasResults = entry.toolResults && entry.toolResults.length > 0;
    const canExpand = hasResults || !!entry.toolInput;

    return (
      <div
        className={`group px-2 py-1 rounded-md transition-colors ${canExpand ? 'cursor-pointer hover:bg-accent/20' : ''}`}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden min-w-0">
          <span className={`shrink-0 ${isError ? 'text-red-500' : meta.color}`}>{meta.icon}</span>
          <span className={`text-[11px] font-medium shrink-0 ${isError ? 'text-red-500' : meta.color}`}>
            {meta.label}
          </span>
          {isRunning && (
            <span className="flex gap-0.5 shrink-0">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1 h-1 rounded-full bg-current animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          )}
          {!isRunning && !isError && <span className="text-[10px] text-green-500/70 shrink-0">✓</span>}
          {isError && <span className="text-[10px] text-red-400 shrink-0">✗</span>}
          {entry.toolDetail && (
            <span className="text-[10px] text-muted-foreground/50 truncate ml-auto">
              {entry.toolDetail}
            </span>
          )}
          {canExpand && (
            <span
              className={`text-muted-foreground/40 shrink-0 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            >
              {icons.chevron}
            </span>
          )}
        </div>
        {expanded && hasResults && (
          <div className="mt-2 space-y-1 bg-muted/10 rounded-md py-1 animate-fade-in">
            {entry.toolResults!.map((r, i) => (
              <SearchResultItem key={`${r.url}-${i}`} result={r} />
            ))}
          </div>
        )}
        {expanded && !hasResults && entry.toolInput && (
          <pre className="text-[10px] text-muted-foreground/60 mt-1.5 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-28 overflow-y-auto">
            {JSON.stringify(entry.toolInput, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // assistant — markdown
  return (
    <div className="px-1 py-1.5 animate-fade-in">
      <div
        className="prose prose-sm max-w-none text-foreground/85
          prose-headings:font-display prose-headings:tracking-tight prose-headings:mt-3 prose-headings:mb-1.5
          prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-xs
          prose-p:text-[12.5px] prose-p:leading-relaxed prose-p:my-1.5
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:text-[12.5px]
          prose-table:text-[11px] prose-th:py-1 prose-td:py-1 prose-th:px-1.5 prose-td:px-1.5
          prose-code:text-[11px] prose-code:px-1 prose-code:rounded prose-code:bg-muted/40
          prose-a:text-warm prose-a:no-underline hover:prose-a:underline
          prose-hr:my-3
          prose-blockquote:border-l-warm prose-blockquote:text-muted-foreground prose-blockquote:italic"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
      </div>
    </div>
  );
}
