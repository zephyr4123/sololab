/**
 * Module metadata registry — safe for server & client.
 *
 * Static metadata (id, name, icon, status) is defined here.
 * Runtime plugin data (tabs, sidebar, handlers) is registered
 * separately via registerPlugin() and only used on the client.
 */

import type { ComponentType } from 'react';
import type { StreamHandlers } from '@/types/stream';

/* ── Static metadata (server-safe) ── */

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'ready' | 'planned' | 'disabled';
}

const MODULE_REGISTRY: ModuleDefinition[] = [
  { id: 'ideaspark', name: 'IdeaSpark', description: '多智能体创意生成', icon: 'Lightbulb', status: 'ready' },
  { id: 'codelab', name: 'CodeLab', description: 'AI 编码助手', icon: 'Code', status: 'ready' },
  { id: 'writer', name: 'WriterAI', description: '学术论文写作', icon: 'PenTool', status: 'ready' },
  { id: 'datalens', name: 'DataLens', description: '数据分析', icon: 'BarChart3', status: 'planned' },
  { id: 'litreview', name: 'LitReview', description: '文献综述', icon: 'BookOpen', status: 'planned' },
  { id: 'reviewer', name: 'Reviewer', description: '论文评审模拟', icon: 'Search', status: 'planned' },
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

/* ── Runtime plugin registry (client-only) ── */

export interface ModuleTab {
  id: string;
  label: string;
  icon: string;
  component: ComponentType<{ moduleId: string }>;
}

export interface ModulePlugin {
  tabs: ModuleTab[];
  sidebar?: { component: ComponentType<{ moduleId: string }> };
  createStreamHandlers?: () => Partial<StreamHandlers>;
  reset?: () => void;
  /** Optional: bind active tab to a module-specific store (e.g. ideaspark-store) */
  useTabController?: () => { activeTab: string; setActiveTab: (id: string) => void };
}

const plugins = new Map<string, ModulePlugin>();

export function registerPlugin(moduleId: string, plugin: ModulePlugin) {
  plugins.set(moduleId, plugin);
}

export function getModulePlugin(moduleId: string): ModulePlugin | undefined {
  return plugins.get(moduleId);
}
