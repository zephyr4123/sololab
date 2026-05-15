'use client';

/**
 * PermissionDialog — inline permission gate for tools that need a
 * one-time approval (e.g. shell commands outside the sandbox).
 *
 * Style aligned to the workshop vocabulary: atelier eyebrow header,
 * warm rim, paper-card surface. Two buttons follow the brand's
 * "warm primary / quiet secondary" pattern.
 *
 * Currently dormant — no OpenCode stream handler sets `pendingPermission`
 * in the store today. Kept around so a future permission flow has a
 * place to render without inventing one.
 */

import { Check, ShieldAlert, X } from 'lucide-react';
import type { CodeLabPermission } from '@/stores/module-stores/codelab-store';

interface PermissionDialogProps {
  permission: CodeLabPermission;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ permission, onAllow, onDeny }: PermissionDialogProps) {
  return (
    <div className="mx-auto my-4 max-w-md animate-fade-in-up rounded-2xl bg-card/85 backdrop-blur-md p-4 shadow-[0_22px_56px_-24px_rgba(0,0,0,0.18)]"
         style={{ boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-warm) 24%, transparent), 0 22px 56px -24px rgba(0,0,0,0.18)' }}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warm/12">
          <ShieldAlert className="h-4 w-4 text-warm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="atelier-eyebrow-sm">permission</span>
            <span
              className="text-[10px] tracking-tight text-foreground/70"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {permission.tool}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/80 mb-3">
            {permission.description || '此工具需要你的授权才能执行。'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onAllow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-warm px-3 py-1.5 text-[11.5px] font-medium text-warm-foreground transition-opacity hover:opacity-90"
            >
              <Check className="h-3 w-3" /> 允许
            </button>
            <button
              onClick={onDeny}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <X className="h-3 w-3" /> 拒绝
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
