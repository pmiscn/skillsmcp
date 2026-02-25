const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = {
    ...(options.headers as Record<string, string>),
    Authorization: token ? `Bearer ${token}` : '',
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    console.error('Unauthorized');
    // Clear token and redirect if in browser
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      if (!window.location.pathname.startsWith('/auth/login')) {
        window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
      }
    }
  }

  return response;
}

export interface Rule {
  id: string;
  name: string;
  type: 'regex' | 'replace';
  config: {
    pattern?: string;
    replacement: string;
    flags?: string[];
  };
  enabled: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface UserInfo {
  id: string;
  username: string;
  role: string;
  search_engine?: 'auto' | 'tfidf' | 'sbert' | 'hybrid' | null;
}

export interface SettingsResponse {
  storage: {
    provider: 'local' | 's3';
    bucket: string;
    baseUrl: string;
  };
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
  };
  roles: {
    defaultRole: string;
  };
}

export interface SkillFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface TranslationJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  target_lang: string;
  module: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface QualityData {
  score: number;
  dimensions: {
    architecture: number;
    maintainability: number;
    content: number;
    community: number;
    security: number;
  };
  checklist: Array<{
    label: string;
    pass: boolean;
  }>;
}

export interface I18nItem {
  title: string;
  description?: string;
  prompt?: string;
  body?: string;
}

export interface I18nField {
  en?: I18nItem[] | null;
  zh?: I18nItem[] | null;
  [key: string]: I18nItem[] | null | undefined;
}

export interface Skill {
  id: string;
  name: string;
  name_zh?: string | null;
  description: string;
  description_zh?: string | null;
  score?: number;
  matched_fields?: string[];
  top_field?: string;
  snippet?: string;
  tags?: string[];
  owner?: string;
  contact?: string;
  weight?: number | null;
  installs?: number;
  stars?: number;
  updated_at?: string | null;
  source?: string;
  skill_path?: string | null;
  content?: string | null;
  content_zh?: string | null;
  args?: Record<string, unknown>;
  url?: string;
  file_exists?: boolean;
  permissions?: string[];
  security_score?: number;
  security_data?: {
    runtime?: number;
    [key: string]: unknown;
  };
  requires_internet?: boolean;
  quality_score?: number | null;
  quality_data?: QualityData | Record<string, unknown> | string | null;
  risk_data?: Record<string, unknown> | null;
  install_guide?: I18nField | null;
  prompt_templates?: I18nField | null;
  use_cases?: I18nField | null;
  best_practices?: I18nField | null;
  avoid?: I18nField | null;
  faq?: I18nField | null;
  test_it?: Record<string, unknown> | null;
  content_i18n?: Record<string, string> | null;
  module_overrides?: Record<string, unknown> | null;
  has_prompts?: boolean;
  has_install_guide?: boolean;
}

export interface SkillIndexStatus {
  index_loaded?: boolean;
  meta?: Record<string, unknown>;
}

export interface UserPreferences {
  search_engine: 'auto' | 'tfidf' | 'sbert' | 'hybrid';
}

export interface AuditReport {
  id: string;
  skill_id: string;
  provider: string;
  model: string;
  score: number;
  report: string;
  status: string;
  createdAt: string;
}

export interface ProcessStatus {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  command: string;
}

export interface DashboardStats {
  translation: {
    total: number;
    completed: number;
    queued: number;
    processing: number;
    retry: number;
    failed: number;
    lastActiveAt?: string | null;
  };
  security: {
    total: number;
    completed: number;
    pending: number;
    lastActiveAt?: string | null;
  };
  processes: ProcessStatus[];
  updatedAt: string;
}

export interface SyncJobSummary {
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: {
    translationQueuedAdded: number;
    auditPendingAdded: number;
    vectorizationPendingAdded: number;
    capturedAt: string;
  };
  message?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  role: string;
  lastUsed?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export const api = {
  getBaseUrl: () => API_BASE_URL,
  searchSkills: async (
    query: string,
    options?: {
      engine?: 'auto' | 'tfidf' | 'sbert' | 'hybrid';
      k?: number;
      hybrid_weight?: number;
      sort?: 'heat' | 'relevance' | 'security';
    },
  ) => {
    const params = new URLSearchParams({ q: query });
    if (options?.engine) params.append('engine', options.engine);
    if (options?.sort) params.append('sort', options.sort);
    if (typeof options?.k === 'number') params.append('k', String(options.k));
    if (typeof options?.hybrid_weight === 'number') {
      params.append('hybrid_weight', String(options.hybrid_weight));
    }
    const response = await fetchWithAuth(`/api/skills/search?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to search skills');
    return response.json();
  },

  listSkills: async (page = 1, limit = 50, sort?: 'heat' | 'security') => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (sort) params.append('sort', sort);
    const response = await fetchWithAuth(`/api/skills?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch skills');
    return response.json();
  },

  getSkill: async (skillId: string) => {
    const response = await fetchWithAuth(`/api/skills/${encodeURIComponent(skillId)}`);
    if (!response.ok) throw new Error('Failed to fetch skill details');
    return response.json();
  },

  downloadSkill: async (skillId: string, skillName: string) => {
    const response = await fetchWithAuth(`/api/skills/${encodeURIComponent(skillId)}/download`);
    if (!response.ok) throw new Error('Failed to download skill');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${skillName.replace(/\s+/g, '_')}.zip`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  getSkillIndexStatus: async () => {
    const response = await fetchWithAuth('/api/skills/index');
    if (!response.ok) throw new Error('Failed to fetch index status');
    return response.json();
  },

  getSkillStats: async () => {
    const response = await fetchWithAuth('/api/skills/stats');
    if (!response.ok) throw new Error('Failed to fetch skill stats');
    return response.json();
  },

  rebuildSkillIndex: async () => {
    const response = await fetchWithAuth('/api/skills/index/rebuild', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to rebuild index');
    return response.json();
  },

  updateSkillIndex: async () => {
    const response = await fetchWithAuth('/api/skills/index/update', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to update index');
    return response.json();
  },

  syncSkills: async (
    payload:
      | {
          source: 'skills.sh' | 'github';
          url?: string;
          owner?: string;
          repo?: string;
          ref?: string;
          rebuildIndex?: boolean;
        }
      | Array<{
          source: 'skills.sh' | 'github';
          url?: string;
          owner?: string;
          repo?: string;
          ref?: string;
          rebuildIndex?: boolean;
        }>,
  ) => {
    const response = await fetchWithAuth('/api/skills/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to sync skills');
    return response.json();
  },

  syncAllSkillsSh: async () => {
    const response = await fetchWithAuth('/api/skills/sync/all-skills-sh', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to trigger full sync from skills.sh');
    return response.json();
  },

  getSyncFailures: async () => {
    const response = await fetchWithAuth('/api/skills/sync/failures');
    if (!response.ok) throw new Error('Failed to fetch sync failures');
    return response.json();
  },

  getSyncSummary: async (jobId: string): Promise<SyncJobSummary> => {
    const response = await fetchWithAuth(`/api/skills/sync/summary/${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error('Failed to fetch sync summary');
    return response.json();
  },

  manualImportSkill: async (payload: {
    manifest: Record<string, unknown>;
    owner: string;
    repo: string;
    skill_path?: string;
    source?: string;
    rebuildIndex?: boolean;
    file?: File;
  }) => {
    let body: BodyInit;
    const headers: Record<string, string> = {};

    if (payload.file) {
      const formData = new FormData();
      formData.append('file', payload.file);
      formData.append('manifest', JSON.stringify(payload.manifest));
      formData.append('owner', payload.owner);
      formData.append('repo', payload.repo);
      if (payload.skill_path) formData.append('skill_path', payload.skill_path);
      if (payload.source) formData.append('source', payload.source);
      if (payload.rebuildIndex !== undefined)
        formData.append('rebuildIndex', String(payload.rebuildIndex));
      body = formData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }

    const response = await fetchWithAuth('/api/skills/manual-import', {
      method: 'POST',
      headers,
      body,
    });
    if (!response.ok) throw new Error('Failed to manually import skill');
    return response.json();
  },

  updateSkill: async (skillId: string, payload: Record<string, unknown>) => {
    const response = await fetchWithAuth(`/api/skills/${encodeURIComponent(skillId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update skill');
    return response.json();
  },

  enqueueTranslation: async (
    skillId: string,
    payload: { target_langs: string[]; modules: string[] },
  ) => {
    const response = await fetchWithAuth(`/api/skills/${encodeURIComponent(skillId)}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to enqueue translation jobs');
    return response.json();
  },

  listTranslationJobs: async (skillId: string) => {
    const response = await fetchWithAuth(
      `/api/skills/${encodeURIComponent(skillId)}/translation-jobs`,
    );
    if (!response.ok) throw new Error('Failed to fetch translation jobs');
    return response.json();
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithAuth('/api/uploads', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
  },

  getUploadStatus: async (uploadId: string) => {
    const response = await fetchWithAuth(`/api/uploads/${uploadId}/status`);

    if (!response.ok) {
      throw new Error('Failed to get upload status');
    }

    return response.json();
  },

  login: async (credentials: { username: string; password: string }): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    return response.json();
  },

  getCurrentUser: async (): Promise<UserInfo> => {
    const response = await fetchWithAuth('/api/auth/me');

    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }

    return response.json();
  },

  getUserPreferences: async (): Promise<UserPreferences> => {
    const response = await fetchWithAuth('/api/users/preferences');
    if (!response.ok) throw new Error('Failed to fetch user preferences');
    return response.json();
  },

  updateUserPreferences: async (payload: UserPreferences): Promise<UserPreferences> => {
    const response = await fetchWithAuth('/api/users/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update user preferences');
    return response.json();
  },

  getAuditLogs: async () => {
    const response = await fetchWithAuth('/api/audit');
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return response.json();
  },

  get: async (endpoint: string) => {
    const response = await fetchWithAuth(endpoint);
    if (!response.ok) throw new Error(`Failed to GET ${endpoint}`);
    const data = await response.json();
    return { data };
  },

  put: async <T>(endpoint: string, body: T): Promise<{ data: SettingsResponse }> => {
    const response = await fetchWithAuth(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to PUT ${endpoint}`);
    const data = await response.json();
    return { data };
  },

  listSkillFiles: async (skillId: string, path?: string) => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await fetchWithAuth(
      `/api/skills/${encodeURIComponent(skillId)}/files${params}`,
    );
    if (!response.ok) throw new Error('Failed to fetch skill files');
    return response.json();
  },

  getSkillFile: async (skillId: string, path: string) => {
    const params = `?path=${encodeURIComponent(path)}`;
    const response = await fetchWithAuth(
      `/api/skills/${encodeURIComponent(skillId)}/file${params}`,
    );
    if (!response.ok) throw new Error('Failed to fetch skill file');
    return response.json();
  },
  getTranslationConfig: async () => {
    const response = await fetchWithAuth('/api/settings/translation');
    if (!response.ok) throw new Error('Failed to fetch translation config');
    return response.json();
  },
  updateTranslationConfig: async (config: Record<string, unknown>) => {
    const response = await fetchWithAuth('/api/settings/translation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to update translation config');
    return response.json();
  },
  getSecurityConfig: async () => {
    const response = await fetchWithAuth('/api/settings/security');
    if (!response.ok) throw new Error('Failed to fetch security config');
    return response.json();
  },
  updateSecurityConfig: async (config: Record<string, unknown>) => {
    const response = await fetchWithAuth('/api/settings/security', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to update security config');
    return response.json();
  },
  getSearchEngineConfig: async () => {
    const response = await fetchWithAuth('/api/settings/search-engine');
    if (!response.ok) throw new Error('Failed to fetch search engine config');
    return response.json();
  },
  updateSearchEngineConfig: async (config: { engine: string; use_gpu?: boolean }) => {
    const response = await fetchWithAuth('/api/settings/search-engine', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to update search engine config');
    return response.json();
  },

  listApiKeys: async () => {
    const response = await fetchWithAuth('/api/settings/api-keys');
    if (!response.ok) throw new Error('Failed to fetch API keys');
    return response.json() as Promise<ApiKey[]>;
  },

  createApiKey: async (name: string, expiresAt?: string) => {
    const response = await fetchWithAuth('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, expiresAt }),
    });
    if (!response.ok) throw new Error('Failed to create API key');
    return response.json() as Promise<ApiKey>;
  },

  deleteApiKey: async (id: string) => {
    const response = await fetchWithAuth(`/api/settings/api-keys/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete API key');
    return response.json();
  },

  getAuditReports: async (skillId: string): Promise<AuditReport[]> => {
    const response = await fetchWithAuth(
      `/api/settings/audit-reports/${encodeURIComponent(skillId)}`,
    );
    if (!response.ok) throw new Error('Failed to fetch audit reports');
    return response.json();
  },
  triggerSecurityAudit: async (skillId: string) => {
    const response = await fetchWithAuth(
      `/api/settings/security/audit/${encodeURIComponent(skillId)}`,
      { method: 'POST' },
    );
    if (!response.ok) throw new Error('Failed to trigger security audit');
    return response.json();
  },
  auditAllSkills: async () => {
    const response = await fetchWithAuth('/api/settings/security/audit-all', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to trigger full security audit');
    return response.json();
  },
  testTranslationEngine: async (engine: Record<string, unknown> | string) => {
    const response = await fetchWithAuth('/api/settings/translation/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine }),
    });
    if (!response.ok) throw new Error('Failed to test translation engine');
    return response.json();
  },
  testSecurityConfig: async (config: Record<string, unknown>) => {
    const response = await fetchWithAuth('/api/settings/security/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    if (!response.ok) throw new Error('Failed to test security connection');
    return response.json();
  },
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await fetchWithAuth('/api/settings/dashboard/stats');
    if (!response.ok) throw new Error('Failed to fetch dashboard stats');
    return response.json();
  },
  startProcess: async (name: string) => {
    const response = await fetchWithAuth('/api/settings/dashboard/processes/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(`Failed to start ${name}`);
    return response.json();
  },
  stopProcess: async (name: string) => {
    const response = await fetchWithAuth('/api/settings/dashboard/processes/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(`Failed to stop ${name}`);
    return response.json();
  },
  getProcessLogs: async (name: string) => {
    const response = await fetchWithAuth(
      `/api/settings/dashboard/logs/${encodeURIComponent(name)}`,
    );
    if (!response.ok) throw new Error(`Failed to fetch logs for ${name}`);
    return response.json();
  },
  clearProcessLogs: async (name: string) => {
    const response = await fetchWithAuth(
      `/api/settings/dashboard/logs/clear/${encodeURIComponent(name)}`,
      { method: 'POST' },
    );
    if (!response.ok) throw new Error(`Failed to clear logs for ${name}`);
    return response.json();
  },
  detectTranslations: async () => {
    const response = await fetchWithAuth('/api/skills/translate/detect', {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to detect translations');
    return response.json();
  },
};
