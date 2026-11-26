import { API_BASE_URL } from '../config';
import { clearAuth, getToken } from './auth';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  loading?: boolean;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();

  if (options.loading) {
    uni.showLoading({ title: '加载中', mask: true });
  }

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method ?? 'GET',
      data: options.data as Record<string, unknown> | undefined,
      timeout: 15000,
      header: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      success: (response) => {
        const status = response.statusCode;
        const body = response.data as ApiEnvelope<T> | T | undefined;

        if (status === 401) {
          clearAuth();
          const pages = getCurrentPages();
          const current = pages.length > 0 ? pages[pages.length - 1].route : '';
          if (current !== 'pages/login/index') {
            uni.reLaunch({ url: '/pages/login/index' });
          }
        }

        if (status >= 200 && status < 300) {
          if (body && typeof body === 'object' && 'success' in body) {
            const envelope = body as ApiEnvelope<T>;
            if (envelope.success === false) {
              reject(new ApiError(envelope.code ?? 'REQUEST_FAILED', envelope.message ?? '请求失败', status));
              return;
            }
            resolve(envelope.data as T);
            return;
          }
          resolve(body as T);
          return;
        }

        const errorBody = (body ?? {}) as { code?: string; message?: string };
        reject(new ApiError(errorBody.code ?? `HTTP_${status}`, errorBody.message ?? `请求失败（${status}）`, status));
      },
      fail: () => {
        reject(new ApiError('NETWORK_ERROR', '无法连接服务器，请检查 API 地址与网络', 0));
      },
      complete: () => {
        if (options.loading) uni.hideLoading();
      },
    });
  });
}

export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none'): void {
  uni.showToast({ title, icon, duration: 2200 });
}

export function toastError(error: unknown): void {
  const message = error instanceof Error ? error.message : '操作失败';
  uni.showToast({ title: message, icon: 'none', duration: 3000 });
}

export function confirm(content: string, confirmText = '确认'): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '请确认',
      content,
      confirmText,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

export function prompt(title: string, placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      success: (result) => {
        if (!result.confirm) {
          resolve(null);
          return;
        }
        resolve(result.content ?? '');
      },
      fail: () => resolve(null),
    });
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusText(value: string): string {
  const map: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    production: '生产中',
    completed: '已完成',
    settled: '已结算',
    archived: '已归档',
    active: '正常',
    disabled: '已停用',
    resolved: '已处理',
    terminated: '已终止',
    cash: '现金',
    wechat_transfer: '微信转账',
    other: '其他',
    employee: '员工报工',
    admin_proxy: '管理员代报',
    confirm_original: '确认原员工',
    confirm_challenger: '转给质疑员工',
    reject_original_report: '驳回原报工',
  };
  return map[value] ?? value;
}

export function toneClass(value: string): string {
  if (['pending', 'completed'].includes(value)) return 'orange';
  if (['approved', 'production', 'active', 'resolved'].includes(value)) return 'green';
  if (['settled'].includes(value)) return 'blue';
  if (['rejected', 'disabled', 'terminated'].includes(value)) return 'red';
  return '';
}
