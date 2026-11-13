/**
 * SyncTone — Reusable Cookie-Authenticated API Client
 *
 * Adheres to The Cookie Rule: Auth tokens are managed strictly via
 * httpOnly, Secure, SameSite=Lax cookies. Never touches localStorage/sessionStorage.
 * All requests explicitly supply `credentials: 'include'`.
 */

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const API_BASE = '/api';

function getFriendlyError(status, data) {
  const serverMsg = data && typeof data === 'object' && (data.error || data.detail || data.message);
  if (data?.code === 'PERMANENT_DELETION_DISABLED' && serverMsg) {
    return serverMsg;
  }
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 429) return 'Too many requests — please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again shortly.';
  // Use server message only if it doesn't contain technical terms
  if (serverMsg && !/(status|error|exception|stack|sql|db|mongo|postgres|prisma)/i.test(serverMsg)) {
    return serverMsg;
  }
  return 'Something went wrong. Please try again.';
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData) {
    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    } else if (typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const config = {
    method: 'GET',
    credentials: 'include', // Non-negotiable Cookie Rule
    ...options,
    headers,
  };

  const isGet = !options.method || options.method === 'GET';
  const maxRetries = isGet ? 2 : 0;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, attempt * 1000));
    }

    try {
      const response = await fetch(url, config);

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (_) {
          data = null;
        }
      } else {
        try {
          data = await response.text();
        } catch (_) {
          data = null;
        }
      }

      // If 503 and retries remain, keep trying
      if (response.status === 503 && attempt < maxRetries) {
        lastError = new ApiError(getFriendlyError(503, null), 503, null);
        continue;
      }

      if (!response.ok) {
        const errorMsg = getFriendlyError(response.status, data);
        throw new ApiError(errorMsg, response.status, data);
      }

      return data;
    } catch (networkError) {
      if (networkError instanceof ApiError) throw networkError;
      if (networkError.name === 'AbortError' || config.signal?.aborted) {
        throw networkError;
      }
      lastError = new ApiError('Check your connection and try again.', 0, null);
      if (attempt < maxRetries) continue;
    }
  }

  throw lastError;
}

export const api = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body, ...options }),
  put: (endpoint, body, options) => request(endpoint, { method: 'PUT', body, ...options }),
  patch: (endpoint, body, options) => request(endpoint, { method: 'PATCH', body, ...options }),
  delete: (endpoint, options) => {
    if (typeof endpoint === 'string' && /^\/?(api\/)?novels(\/|$)/i.test(endpoint.trim())) {
      return Promise.reject(
        new ApiError(
          'Permanent deletion of novels is prohibited. SyncTone preserves all literary works.',
          403,
          { code: 'PERMANENT_DELETION_DISABLED' }
        )
      );
    }
    return request(endpoint, { method: 'DELETE', ...options });
  },

  // Auth Endpoints
  auth: {
    register: (username, email, password, role = 'reader') =>
      api.post('/auth/register', { username, email, password, role }),
    login: (email, password) =>
      api.post('/auth/login', { email, password }),
    logout: () =>
      api.post('/auth/logout'),
    me: () =>
      api.get('/auth/me'),
  },

  // Novels Endpoints
  novels: {
    list: (channel, opts = {}) => api.get(`/novels${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`, opts),
    get: (id) => api.get(`/novels/${id}`),
    create: (novelData) => api.post('/novels', novelData),
    patch: (id, data) => api.patch(`/novels/${id}`, data),
    delete: (_id) =>
      Promise.reject(
        new ApiError(
          'Permanent deletion of novels is prohibited. SyncTone preserves all literary works.',
          403,
          { code: 'PERMANENT_DELETION_DISABLED' }
        )
      ),
    uploadChapter: (novelId, chapterData) => api.post(`/novels/${novelId}/chapters`, chapterData),
    parseFile: (payload, parserEngine = 'heuristic', parserConfig = null) => {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        if (parserEngine && !payload.has('parser_engine')) {
          payload.append('parser_engine', parserEngine);
        }
        if (parserConfig && !payload.has('parser_config')) {
          payload.append('parser_config', JSON.stringify(parserConfig));
        }
        const resolvedEngine = payload.get('parser_engine') || parserEngine || 'heuristic';
        return request(
          `/novels/parse-file?parser_engine=${encodeURIComponent(resolvedEngine)}`,
          { method: 'POST', body: payload }
        );
      }
      const bodyPayload =
        payload && typeof payload === 'object'
          ? {
              parser_engine: parserEngine,
              ...(parserConfig ? { parser_config: parserConfig } : {}),
              ...payload,
            }
          : payload;
      return api.post('/novels/parse-file', bodyPayload);
    },
    uploadAsset: (payload) => {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        return request('/novels/upload-asset', { method: 'POST', body: payload });
      }
      return api.post('/novels/upload-asset', payload);
    },
  },

  // Chapters & Synthesis Endpoints
  chapters: {
    list: () => api.get('/chapters'),
    get: (id) => api.get(`/chapters/${id}`),
    getSegments: (id) => api.get(`/chapters/${id}/segments`),
    getManifest: (id) => api.get(`/manifest/${id}`),
    uploadDirect: (text, title) => api.post('/upload', { text, title }),
    parse: (chapterId, parserEngine, parserConfig) => {
      const body = {};
      if (parserEngine) body.parser_engine = parserEngine;
      if (parserConfig && typeof parserConfig === 'object') body.parser_config = parserConfig;
      return api.post(`/parse/${chapterId}`, Object.keys(body).length > 0 ? body : undefined);
    },
    synthesize: (chapterId, engine) =>
      api.post(`/synthesize/${chapterId}`, engine ? { engine } : undefined),
  },

  // Voices Endpoints
  voices: {
    list: () => api.get('/voices'),
    assign: ({ character_id, new_voice_id, chapter_id, novel_id }) => {
      const payload = { character_id, new_voice_id, chapter_id };
      if (novel_id) payload.novel_id = novel_id;
      return api.post('/voices/assign', payload);
    },
  },

  // Playback Endpoints
  playback: {
    getProgress: (novelId, userId) => {
      const params = new URLSearchParams({ novel_id: novelId });
      if (userId) params.append('user_id', userId);
      return api.get(`/playback/progress?${params.toString()}`);
    },
    saveProgress: ({ novel_id, chapter_id, segment_order = 0, position_ms = 0, user_id }) =>
      api.post('/playback/progress', { novel_id, chapter_id, segment_order, position_ms, user_id }),
  },

  // Status & Health
  status: {
    models: (opts = {}) => api.get(`/status/models${opts && opts.probe ? '?probe=true' : ''}`),
    getParserConfig: () => api.get('/status/parser-config'),
    updateParserConfig: (config) => api.post('/status/parser-config', config),
    testParserConnection: (payload) => api.post('/status/parser-test', payload),
    health: () => request('/health'),
  },
};

export default api;
