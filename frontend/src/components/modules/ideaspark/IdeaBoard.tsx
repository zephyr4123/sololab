'use client';

export function IdeaBoard() {
  // TODO: Display idea cards from IdeaSpark orchestrator output
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <p className="col-span-full text-sm text-muted-foreground">
        Ideas will appear here after running IdeaSpark.
      </p>
    </div>
  );
}
