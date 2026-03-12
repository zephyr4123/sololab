import { Lightbulb, Code, PenTool, BarChart3, BookOpen, Search } from 'lucide-react';

const modules = [
  { id: 'ideaspark', name: 'IdeaSpark', description: 'Multi-agent idea generation', icon: Lightbulb, status: 'ready' },
  { id: 'codelab', name: 'CodeLab', description: 'AI-assisted coding', icon: Code, status: 'planned' },
  { id: 'writer', name: 'WriterAI', description: 'Academic paper writing', icon: PenTool, status: 'planned' },
  { id: 'datalens', name: 'DataLens', description: 'Data analysis & visualization', icon: BarChart3, status: 'planned' },
  { id: 'litreview', name: 'LitReview', description: 'Literature review', icon: BookOpen, status: 'planned' },
  { id: 'reviewer', name: 'Reviewer', description: 'Paper review simulation', icon: Search, status: 'planned' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-3xl font-bold">SoloLab</h1>
      <p className="mb-8 text-muted-foreground">AI-assisted research platform for independent researchers</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <a
              key={mod.id}
              href={mod.status === 'ready' ? `/modules/${mod.id}` : '#'}
              className={`rounded-lg border p-6 transition-colors ${
                mod.status === 'ready'
                  ? 'hover:border-primary hover:bg-accent cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <Icon className="h-6 w-6" />
                <h2 className="text-lg font-semibold">{mod.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{mod.description}</p>
              <span className={`mt-3 inline-block text-xs px-2 py-1 rounded ${
                mod.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {mod.status === 'ready' ? 'Available' : 'Coming Soon'}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
