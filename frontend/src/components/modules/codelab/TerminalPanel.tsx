'use client';

import { Terminal } from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';

export function TerminalPanel({ moduleId }: { moduleId: string }) {
  const toolCalls = useCodeLabStore((s) => s.activeToolCalls);
  const messages = useCodeLabStore((s) => s.messages);

  // Collect all bash tool calls from messages + active
  const bashCalls = [
    ...messages.flatMap((m) => m.toolCalls ?? []).filter((tc) => tc.tool === 'bash'),
    ...toolCalls.filter((tc) => tc.tool === 'bash'),
  ];

  if (bashCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 opacity-50">
        <Terminal className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No terminal output yet. Bash commands will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-center gap-2 p-3 border-b border-border/30">
        <Terminal className="h-4 w-4 text-[var(--color-warm)]" />
        <h3 className="text-sm font-semibold">Terminal</h3>
        <span className="text-[11px] text-muted-foreground">{bashCalls.length} commands</span>
      </div>

      <div className="flex-1 bg-[var(--color-card)] p-3 space-y-3">
        {bashCalls.map((tc) => {
          const cmd = (tc.input as any)?.command ?? '(unknown command)';
          return (
            <div key={tc.id} className="rounded-lg border border-border/30 overflow-hidden">
              {/* Command header */}
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 border-b border-border/20">
                <span className="text-[var(--color-warm)] font-mono text-[11px]">$</span>
                <span className="font-mono text-[11px] text-foreground/80 truncate">{cmd}</span>
              </div>
              {/* Output */}
              {tc.output && (
                <pre className="p-3 font-mono text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto bg-background/50">
                  {tc.output.slice(0, 3000)}
                  {tc.output.length > 3000 && '\n... (truncated)'}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
