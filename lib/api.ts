'use client';

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let csrfToken: string | null = null;
let activeWorkspaceId: string | null = null;
let previewSessionToken: string | null = null;
const PREVIEW_SESSION_KEY = 'srcpro.preview-session';
const WORKSPACE_ALIASES: Record<string, string> = {
  'org-accra-academy-src': 'org-tema-secondary-src',
  'org-greater-accra-zone': 'org-tema-secondary-zone',
};

function normalizeWorkspaceId(id: string | null): string | null {
  if (!id) return id;
  return WORKSPACE_ALIASES[id] || id;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

function readStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = window.sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (fromSession) return fromSession;
  } catch {
    // Continue to the secondary store.
  }
  try {
    return window.localStorage.getItem(PREVIEW_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.sessionStorage.setItem(PREVIEW_SESSION_KEY, token);
    else window.sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  } catch {
    // Some privacy modes block one storage area; the other may still work.
  }
  try {
    if (token) window.localStorage.setItem(PREVIEW_SESSION_KEY, token);
    else window.localStorage.removeItem(PREVIEW_SESSION_KEY);
  } catch {
    // The in-memory token still works for the current page.
  }
}

export function setSessionToken(token: string | null): void {
  previewSessionToken = token;
  writeStoredSessionToken(token);
}

export function getSessionToken(): string | null {
  if (previewSessionToken) return previewSessionToken;
  previewSessionToken = readStoredSessionToken();
  return previewSessionToken;
}

export function setActiveWorkspaceId(id: string | null): void {
  const normalized = normalizeWorkspaceId(id);
  activeWorkspaceId = normalized;
  if (typeof window !== 'undefined') {
    if (normalized) window.localStorage.setItem('srcpro.workspace', normalized);
    else window.localStorage.removeItem('srcpro.workspace');
  }
}

export function getActiveWorkspaceId(): string | null {
  if (activeWorkspaceId) return activeWorkspaceId;
  if (typeof window !== 'undefined') {
    activeWorkspaceId = normalizeWorkspaceId(window.localStorage.getItem('srcpro.workspace'));
  }
  return activeWorkspaceId;
}

function withWorkspace(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  csrfTokenForQuery?: string | null,
): string {
  const url = new URL(path.startsWith('/api') ? path : `/api${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId && !url.searchParams.has('organizationId') && !path.startsWith('/auth') && !path.startsWith('/admin')) {
    url.searchParams.set('organizationId', workspaceId);
  }
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  const publicAuth = /^\/api\/auth\/(login|forgot-password|reset-password)$/.test(url.pathname);
  const sessionToken = getSessionToken();
  if (sessionToken && !publicAuth && !url.searchParams.has('session_token')) {
    url.searchParams.set('session_token', sessionToken);
  }
  if (csrfTokenForQuery && !url.searchParams.has('csrf_token')) {
    url.searchParams.set('csrf_token', csrfTokenForQuery);
  }
  return url.pathname + url.search;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  raw?: boolean;
}

export async function apiFetch<T = any>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, params, raw, headers: customHeaders, method = 'GET', ...rest } = options;
  const headers = new Headers(customHeaders || {});
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const upperMethod = method.toUpperCase();
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(upperMethod);
  if (!safeMethod && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const sessionToken = getSessionToken();
  if (sessionToken) {
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${sessionToken}`);
    if (!headers.has('X-Session-Token')) headers.set('X-Session-Token', sessionToken);
  }

  const response = await fetch(withWorkspace(path, params, safeMethod ? null : csrfToken), {
    ...rest,
    method: upperMethod,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let details: unknown = null;
    try {
      const data = await response.json();
      message = data.error || message;
      details = data.details ?? null;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status, details);
  }
  if (raw) return response as unknown as T;
  if (response.status === 204) return null as T;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return (await response.json()) as T;
  return (await response.text()) as unknown as T;
}

export function apiGet<T = any>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  return apiFetch<T>(path, { method: 'GET', params });
}

export function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body ?? {} });
}

export function apiPatch<T = any>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: body ?? {} });
}

export function apiDelete<T = any>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE', body });
}

export async function apiUpload<T = any>(
  path: string,
  form: FormData,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: form, params });
}

export async function downloadApiFile(path: string, fallbackName: string): Promise<void> {
  const response = await apiFetch<Response>(path, { method: 'GET', raw: true });
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function apiFileUrl(path: string): string {
  return withWorkspace(path);
}

interface EventStreamHandlers {
  onOpen?: () => void;
  onEvent: (event: string, data: string) => void;
  onError?: () => void;
}

function consumeSseFrames(buffer: string, onEvent: (event: string, data: string) => void): string {
  let separator = buffer.indexOf('\n\n');
  while (separator !== -1) {
    const frame = buffer.slice(0, separator);
    buffer = buffer.slice(separator + 2);
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length) onEvent(event, data.join('\n'));
    separator = buffer.indexOf('\n\n');
  }
  return buffer;
}

export function openEventStream(path: string, handlers: EventStreamHandlers): () => void {
  const url = new URL(
    path.startsWith('/api') ? path : `/api${path}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  );
  let stopped = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryResolve: (() => void) | null = null;

  const waitForRetry = () => new Promise<void>((resolve) => {
    retryResolve = () => {
      retryResolve = null;
      resolve();
    };
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const done = retryResolve;
      retryResolve = null;
      done?.();
    }, 3000);
  });

  const connect = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const headers = new Headers();
        const sessionToken = getSessionToken();
        if (sessionToken) {
          headers.set('Authorization', `Bearer ${sessionToken}`);
          headers.set('X-Session-Token', sessionToken);
          url.searchParams.set('session_token', sessionToken);
        } else {
          url.searchParams.delete('session_token');
        }
        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status}).`);
        handlers.onOpen?.();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          buffer = consumeSseFrames(buffer, handlers.onEvent);
        }
        if (!stopped) handlers.onError?.();
      } catch {
        if (!stopped) handlers.onError?.();
      }
      if (stopped) break;
      await waitForRetry();
    }
  };

  void connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryResolve?.();
    retryResolve = null;
    controller?.abort();
  };
}
