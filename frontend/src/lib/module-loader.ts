/**
 * 前端模块动态加载器。
 */

export interface ModuleDefinition {
  id: string;
  name: string;
  icon: string;
  status: 'ready' | 'planned' | 'disabled';
}

const MODULE_REGISTRY: ModuleDefinition[] = [
  { id: 'ideaspark', name: 'IdeaSpark', icon: 'Lightbulb', status: 'ready' },
  { id: 'codelab', name: 'CodeLab', icon: 'Code', status: 'planned' },
  { id: 'writer', name: 'WriterAI', icon: 'PenTool', status: 'planned' },
  { id: 'datalens', name: 'DataLens', icon: 'BarChart3', status: 'planned' },
  { id: 'litreview', name: 'LitReview', icon: 'BookOpen', status: 'planned' },
  { id: 'reviewer', name: 'Reviewer', icon: 'Search', status: 'planned' },
];

export function getAvailableModules(): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.status === 'ready');
}

export function getAllModules(): ModuleDefinition[] {
  return MODULE_REGISTRY;
}

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}
