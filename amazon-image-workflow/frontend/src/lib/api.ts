const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/imgflow-api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Layer 0: Settings
export const api = {
  settings: {
    list: () => request('/settings'),
    save: (name: string, value: string) => request('/settings', { method: 'POST', body: JSON.stringify({ name, value }) }),
    delete: (id: string) => request(`/settings/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: () => request('/projects'),
    get: (id: string) => request(`/projects/${id}`),
    create: (data: { asin?: string; marketplace?: string; link1688?: string }) =>
      request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    upload: (id: string, files: FormData) =>
      fetch(`${API_BASE}/projects/${id}/upload`, { method: 'POST', body: files }).then(r => r.json()),
  },
  scrape: {
    run: (projectId: string) => request(`/scrape/${projectId}`, { method: 'POST' }),
  },
  analysis: {
    run: (projectId: string) => request(`/analysis/${projectId}`, { method: 'POST' }),
  },
  prompts: {
    generate: (projectId: string) => request(`/prompts/${projectId}/generate`, { method: 'POST' }),
    list: (projectId: string) => request(`/prompts/${projectId}`),
    update: (id: string, content: string) => request(`/prompts/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  },
  images: {
    generate: (projectId: string, promptId: string, imageType: string) =>
      request(`/images/${projectId}/single`, { method: 'POST', body: JSON.stringify({ promptId, imageType }) }),
    generateAll: (projectId: string) => request(`/images/${projectId}/all`, { method: 'POST' }),
    list: (projectId: string) => request(`/images/${projectId}`),
  },
  output: {
    downloadUrl: (projectId: string) => `${API_BASE}/output/${projectId}/download`,
    saveTemplate: (projectId: string, name: string, category: string) =>
      request(`/output/${projectId}/save-template`, { method: 'POST', body: JSON.stringify({ name, category }) }),
    templates: () => request('/output/templates/list'),
    applyTemplate: (projectId: string, templateId: string) =>
      request(`/output/${projectId}/apply-template`, { method: 'POST', body: JSON.stringify({ templateId }) }),
  },
};
