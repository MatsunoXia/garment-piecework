import { reactive } from 'vue';

import { ApiError } from './api/client';

export type ToastKind = 'info' | 'success' | 'error' | 'warn';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let nextId = 1;

export const toasts = reactive<Toast[]>([]);

export function toast(message: string, kind: ToastKind = 'info'): void {
  const item: Toast = { id: nextId, kind, message };
  nextId += 1;
  toasts.push(item);
  window.setTimeout(() => {
    const index = toasts.findIndex((entry) => entry.id === item.id);
    if (index >= 0) toasts.splice(index, 1);
  }, kind === 'error' || kind === 'warn' ? 6000 : 3200);
}

export function toastError(error: unknown): void {
  if (error instanceof ApiError) {
    toast(error.message, 'error');
    return;
  }
  toast(error instanceof Error ? error.message : '操作失败', 'error');
}

export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN');
}

export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return `¥${value}`;
}

export const STATUS_TEXT: Record<string, string> = {
  production: '生产中',
  completed: '已完成',
  settled: '已结算',
  archived: '已归档',
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
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

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

export function statusTone(status: string): string {
  switch (status) {
    case 'production':
    case 'approved':
    case 'active':
    case 'resolved':
      return 'tag-green';
    case 'completed':
    case 'pending':
      return 'tag-orange';
    case 'settled':
      return 'tag-blue';
    case 'rejected':
    case 'disabled':
    case 'terminated':
      return 'tag-red';
    default:
      return 'tag-gray';
  }
}
