interface ToolCallCardProps {
  tool: string;
  result: unknown;
  isLoading?: boolean;
}

export function ToolCallCard({ tool, result, isLoading }: ToolCallCardProps) {
  return (
    <div className="rounded-md border bg-muted/50 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        <span className="rounded bg-secondary px-1.5 py-0.5">{tool}</span>
        {isLoading && <span className="animate-pulse text-muted-foreground">running...</span>}
      </div>
      {result != null ? (
        <pre className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
