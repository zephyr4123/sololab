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
    stop: (id: string, taskId: string) =>
      fetchAPI(`/api/modules/${id}/stop`, {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
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

// === Document API ===
export const documentApi = {
  list: async (limit = 50) => {
    const res = await fetch(`${API_BASE}/api/documents?limit=${limit}`);
    if (!res.ok) throw new Error(`Documents fetch failed: ${res.statusText}`);
    return res.json() as Promise<Array<{ doc_id: string; filename: string; title: string | null; status: string; total_chunks: number; total_pages: number; created_at: string | null }>>;
  },

  upload: async (file: File, projectId = "default") => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/documents/upload?project_id=${projectId}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    return res.json() as Promise<{ doc_id: string; filename: string; status: string }>;
  },

  getStatus: async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/status`);
    if (!res.ok) throw new Error(`Status fetch failed: ${res.statusText}`);
    return res.json();
  },

  getChunks: async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/chunks`);
    if (!res.ok) throw new Error(`Chunks fetch failed: ${res.statusText}`);
    return res.json();
  },

  search: async (query: string, topK = 5) => {
    const res = await fetch(`${API_BASE}/api/documents/search?query=${encodeURIComponent(query)}&top_k=${topK}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
    return res.json();
  },

  delete: async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
    return res.json();
  },
};

// === Session API ===
export const sessionApi = {
  list: async (limit = 20, moduleId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (moduleId) params.append("module_id", moduleId);
    const res = await fetch(`${API_BASE}/api/sessions?${params}`);
    if (!res.ok) throw new Error(`Sessions fetch failed: ${res.statusText}`);
    return res.json();
  },

  create: async (title?: string, moduleId?: string) => {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, module_id: moduleId }),
    });
    if (!res.ok) throw new Error(`Session create failed: ${res.statusText}`);
    return res.json() as Promise<{ session_id: string; status: string }>;
  },

  getHistory: async (sessionId: string, limit = 100) => {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/history?limit=${limit}`);
    if (!res.ok) throw new Error(`History fetch failed: ${res.statusText}`);
    return res.json();
  },

  delete: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Session delete failed: ${res.statusText}`);
    return res.json();
  },
};

// === Cost API ===
export const costApi = {
  getTotal: async (days = 30) => {
    const res = await fetch(`${API_BASE}/api/providers/cost?days=${days}`);
    if (!res.ok) throw new Error(`Cost fetch failed: ${res.statusText}`);
    return res.json();
  },

  getModuleCost: async (moduleId: string, days = 30) => {
    const res = await fetch(`${API_BASE}/api/providers/cost/module/${moduleId}?days=${days}`);
    if (!res.ok) throw new Error(`Module cost fetch failed: ${res.statusText}`);
    return res.json();
  },

  getTaskCost: async (taskId: string) => {
    const res = await fetch(`${API_BASE}/api/providers/cost/task/${taskId}`);
    if (!res.ok) throw new Error(`Task cost fetch failed: ${res.statusText}`);
    return res.json();
  },
};

// === Traces API ===
export const tracesApi = {
  getTraces: async (taskId?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (taskId) params.append("task_id", taskId);
    const res = await fetch(`${API_BASE}/api/providers/traces?${params}`);
    if (!res.ok) throw new Error(`Traces fetch failed: ${res.statusText}`);
    return res.json();
  },
};

// === Run History API ===
export const runHistoryApi = {
  list: async (moduleId?: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (moduleId) params.append("module_id", moduleId);
    const res = await fetch(`${API_BASE}/api/providers/runs?${params}`);
    if (!res.ok) throw new Error(`Runs fetch failed: ${res.statusText}`);
    return res.json();
  },

  getMessages: async (taskId: string, msgType?: string) => {
    const params = new URLSearchParams();
    if (msgType) params.append("msg_type", msgType);
    const res = await fetch(`${API_BASE}/api/providers/runs/${taskId}/messages?${params}`);
    if (!res.ok) throw new Error(`Messages fetch failed: ${res.statusText}`);
    return res.json();
  },

  exportMarkdown: async (taskId: string) => {
    const res = await fetch(`${API_BASE}/api/providers/runs/${taskId}/export`);
    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
    return res.json();
  },
};

// === CodeLab API (browse 走后端，其余走 opencode-client 直连) ===
export const codelabApi = {
  browse: async (path?: string) => {
    return fetchAPI<{
      type: string;
      path: string;
      parent: string | null;
      entries: Array<{ name: string; path: string; type: string; isProject: boolean }>;
      error?: string;
    }>('/api/modules/codelab/browse', {
      method: 'POST',
      body: JSON.stringify({ path: path ?? '~' }),
    });
  },
};

export const memoryApi = {
  search: async (query: string, scope = "project", topK = 5) => {
    const params = new URLSearchParams({
      query,
      scope,
      top_k: String(topK),
    });
    const res = await fetch(`${API_BASE}/api/memory/search?${params}`, { method: "POST" });
    if (!res.ok) throw new Error(`Memory search failed: ${res.statusText}`);
    return res.json();
  },
};
