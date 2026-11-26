const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'gp_admin_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get(): string {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  },
  set(token: string): void {
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    sessionStorage.removeItem(TOKEN_KEY);
  },
};

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  formData?: FormData;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};

  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接服务器，请确认 API 已启动且地址正确', 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.status === 401) {
    tokenStore.clear();
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const record = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      record.code ?? `HTTP_${response.status}`,
      record.message ?? `请求失败（HTTP ${response.status}）`,
      response.status,
      record.details,
    );
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const wrapped = payload as { success: boolean; data?: unknown; message?: string };
    if (!wrapped.success) {
      throw new ApiError('REQUEST_FAILED', wrapped.message ?? '请求失败', response.status);
    }
    return wrapped.data as T;
  }

  return payload as T;
}

export async function download(path: string, filename: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(BASE_URL + path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ApiError('DOWNLOAD_FAILED', '文件下载失败', response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { BASE_URL };
