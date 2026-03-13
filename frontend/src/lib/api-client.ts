/**
 * 带类型的后端 API 客户端。
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  modules: {
    list: () => fetchAPI<{ id: string; name: string }[]>('/api/modules'),
    load: (id: string) => fetchAPI(`/api/modules/${id}/load`, { method: 'POST' }),
    unload: (id: string) => fetchAPI(`/api/modules/${id}/unload`, { method: 'DELETE' }),
    config: (id: string) => fetchAPI(`/api/modules/${id}/config`),
    run: (id: string, input: string, params = {}) =>
      fetchAPI(`/api/modules/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input, params }),
      }),
  },
  tasks: {
    state: (taskId: string) => fetchAPI(`/api/tasks/${taskId}/state`),
    events: (taskId: string, after = 0) => fetchAPI(`/api/tasks/${taskId}/events?after=${after}`),
    cancel: (taskId: string) => fetchAPI(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  },
  documents: {
    search: (query: string) =>
      fetchAPI('/api/documents/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  },
  providers: {
    list: () => fetchAPI('/api/providers'),
    cost: () => fetchAPI('/api/providers/cost'),
  },
};
