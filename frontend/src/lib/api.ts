/** Typed fetch wrapper: JSON in/out, CSRF header, timeout, retry with backoff. */
export class ApiError extends Error {
  status: number;
  code?: string;
  body: Record<string, any>;
  constructor(status: number, body: Record<string, any> | null) {
    super((body && body.message) || `Request failed (${status})`);
    this.status = status;
    this.body = body || {};
    this.code = this.body.error;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Retries on network errors / 5xx. Only use for idempotent-safe calls. */
  retries?: number;
  timeout?: number;
}

export async function api<T = any>(path: string, { method = 'GET', body, form, retries = 0, timeout = 10000 }: ApiOptions = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const headers: Record<string, string> = { 'x-requested-with': 'mc2026' };
      if (body !== undefined && !form) headers['content-type'] = 'application/json';
      const res = await fetch(path, {
        method, headers, credentials: 'same-origin', signal: ctrl.signal,
        body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      });
      clearTimeout(t);
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('json') ? await res.json() : await res.text();
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) throw Object.assign(new Error('retry'), { retryable: true });
        throw new ApiError(res.status, typeof data === 'object' ? data : null);
      }
      return data as T;
    } catch (e) {
      clearTimeout(t);
      if (e instanceof ApiError) throw e;
      if (attempt >= retries) {
        throw new ApiError(0, {
          error: 'network',
          message: navigator.onLine === false ? 'You appear to be offline. Check your connection and try again.' : 'Connection problem. Please try again.',
        });
      }
      attempt += 1;
      await sleep(600 * 2 ** (attempt - 1) + Math.random() * 300);
    }
  }
}
