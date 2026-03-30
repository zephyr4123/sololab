'use client';

import { ShieldAlert, Check, X } from 'lucide-react';
import type { CodeLabPermission } from '@/stores/module-stores/codelab-store';

interface Props {
  permission: CodeLabPermission;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ permission, onAllow, onDeny }: Props) {
  return (
    <div className="mx-auto mb-4 max-w-md animate-fade-in-up rounded-xl border border-[var(--color-warm)]/30 bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/10">
          <ShieldAlert className="h-4 w-4 text-[var(--color-warm)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold mb-0.5">Permission Required</h4>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Tool <span className="font-mono text-foreground/80">{permission.tool}</span> requests permission:
            {permission.description && ` ${permission.description}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onAllow}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-warm)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-warm)] transition-colors hover:bg-[var(--color-warm)]/20"
            >
              <Check className="h-3 w-3" /> Allow
            </button>
            <button
              onClick={onDeny}
              className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <X className="h-3 w-3" /> Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
