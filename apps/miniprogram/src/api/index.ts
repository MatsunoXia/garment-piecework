import type {
  BundleOption,
  DisputeRow,
  LoginResult,
  MyReport,
  PageResult,
  ProcessOption,
  Profile,
  ReportableStyle,
  WageDetail,
  WageRow,
} from '../types';
import { request } from '../utils/request';

export const api = {
  // ---------- 认证 ----------
  wechatLogin: (code: string) =>
    request<LoginResult>('/auth/wechat/login', { method: 'POST', data: { code } }),
  wechatStatus: () => request<{ configured: boolean }>('/auth/wechat/status'),
  devLogin: (openid: string) =>
    request<LoginResult>('/auth/dev/login', { method: 'POST', data: { openid } }),
  selectIdentity: (selectionToken: string, role: 'admin' | 'employee', id: string) =>
    request<LoginResult>('/auth/select-identity', {
      method: 'POST',
      data: { selectionToken, role, id },
    }),
  refresh: () => request<LoginResult>('/auth/refresh', { method: 'POST' }),
  me: () =>
    request<{
      id: string;
      name: string;
      role: 'admin' | 'employee' | 'pending';
      companyId?: string;
      companyName?: string;
      employeeNo?: string;
      isFounder?: boolean;
      openid?: string;
      needsJoin?: boolean;
      identities?: Array<{
        role: 'admin' | 'employee';
        id: string;
        companyId: string;
        companyName: string;
        name: string;
        description: string;
      }>;
    }>('/auth/me'),

  // ---------- 加入 / 创建公司 ----------
  previewInvite: (inviteCode: string) =>
    request<{ companyName: string }>('/employees/join/preview', {
      method: 'POST',
      data: { inviteCode },
    }),
  joinCompany: (body: { inviteCode: string; name: string; workshopIds?: string[] }) =>
    request<{ id: string; employeeNo: string; companyName: string }>('/employees/join', {
      method: 'POST',
      data: body,
    }),
  createCompany: (body: { companyName: string; adminName: string; webPassword?: string }) =>
    request<{ companyId: string; companyNo: string; companyName: string; inviteCode: string }>(
      '/companies',
      { method: 'POST', data: body },
    ),
  setWebPassword: (password: string) =>
    request<{ message: string }>('/auth/web/password', { method: 'POST', data: { password } }),
  acceptAdminInvitation: (body: { token: string; name: string }) =>
    request<{ companyName: string }>('/admin-invitations/accept', { method: 'POST', data: body }),
  rebindWechat: (token: string) =>
    request<{ employee: { name: string; employeeNo: string }; message: string }>('/employees/rebind', {
      method: 'POST',
      data: { token },
    }),

  // ---------- 员工端 ----------
  myDashboard: () =>
    request<{
      employee: { id: string; name: string; employeeNo: string; companyName: string };
      pendingReports: number;
      month: { quantity: number; amount: string };
      unsettled: { amount: string; styles: number };
      settledCount: number;
      pendingDisputes: number;
    }>('/dashboard/my'),
  myProfile: () =>
    request<{
      id: string;
      name: string;
      employeeNo: string;
      companyName: string;
      workshops: Array<{ id: string; name: string }>;
    }>('/employees/me'),
  reportableStyles: () => request<ReportableStyle[]>('/styles/reportable'),
  reportOptions: (styleId: string, styleProcessId?: string) =>
    request<{
      style: { id: string; name: string; styleNo: string };
      processes?: ProcessOption[];
      process?: { id: string; name: string; unitPrice: string };
      bundles: BundleOption[];
    }>(
      `/styles/${styleId}/report-options${styleProcessId ? `?styleProcessId=${styleProcessId}` : ''}`,
    ),
  createReports: (items: Array<{ styleId: string; styleProcessId: string; bundleId: string }>) =>
    request<{
      successCount: number;
      failedCount: number;
      failures: Array<{ index: number; code: string; message: string }>;
    }>('/reports/batch', { method: 'POST', data: { items }, loading: true }),
  myReports: (query: { page: number; pageSize: number; status?: string; styleId?: string }) => {
    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return request<PageResult<MyReport>>(`/reports/my?${params}`);
  },
  deleteReport: (id: string) => request<{ message: string }>(`/reports/${id}`, { method: 'DELETE' }),
  createDispute: (body: { reportId: string; reason?: string }) =>
    request<{ id: string; message: string }>('/report-disputes', { method: 'POST', data: body }),
  myDisputes: (query: { page: number; pageSize: number; status?: string }) => {
    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return request<PageResult<DisputeRow>>(`/report-disputes/my?${params}`);
  },
  myWages: (query: { page: number; pageSize: number; settled?: string }) => {
    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return request<PageResult<WageRow>>(`/payroll/my?${params}`);
  },
  myWageDetail: (styleId: string) => request<WageDetail>(`/payroll/my/styles/${styleId}`),

  // ---------- 管理员端扩展 ---------- 
  createStyle: (body: { name: string; remark?: string; productionScope?: 'all' | 'workshops'; workshopIds?: string[]; processes?: Array<{ name: string; groupName?: string; unitPrice?: string }> }) =>
    request<{ id: string; styleNo: string; name: string; message: string }>('/styles', { method: 'POST', data: body, loading: true }),
  styleDetail: (id: string) => request<{
    id: string; styleNo: string; name: string; status: string; productionScope: string; remark: string | null;
    processes: Array<{ id: string; name: string; groupName: string | null; unitPrice: string; hasReported: boolean }>;
    workshops: Array<{ id: string; name: string }>;
    stats: { bundleCount: number; bundleQuantity: number; employeeCount: number; reports: Record<string, number> };
  }>(`/styles/${id}`),
  updateStyle: (id: string, body: { name?: string; remark?: string; productionScope?: 'all' | 'workshops'; workshopIds?: string[] }) =>
    request<{ message: string }>(`/styles/${id}`, { method: 'PATCH', data: body }),
  completeStyle: (id: string) => request<{ message: string }>(`/styles/${id}/complete`, { method: 'POST' }),
  archiveStyle: (id: string) => request<{ message: string }>(`/styles/${id}/archive`, { method: 'POST' }),
  createStyleProcess: (styleId: string, body: { name: string; groupName?: string; unitPrice?: string }) =>
    request<{ id: string }>(`/styles/${styleId}/processes`, { method: 'POST', data: body }),
  changeProcessPrice: (id: string, body: { unitPrice: string; reason?: string }) =>
    request<{ message: string }>(`/processes/${id}/change-price`, { method: 'POST', data: body, loading: true }),
  createBundle: (styleId: string, body: { size?: string; quantity: number; remark?: string }) =>
    request<{ id: string; bundleNo: number }>(`/styles/${styleId}/bundles`, { method: 'POST', data: body }),
  batchCreateBundles: (styleId: string, items: Array<{ size?: string; quantity: number; remark?: string }>) =>
    request<{ count: number; bundleNos: number[] }>(`/styles/${styleId}/bundles/batch`, { method: 'POST', data: { items }, loading: true }),
  adminBundleList: (styleId: string, query: { page: number; pageSize: number; keyword?: string; reported?: number }) => {
    const params = Object.entries(query).filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return request<PageResult<{ id: string; bundleNo: number; size: string | null; quantity: number; remark: string | null; hasReported: boolean; reportCount: number }>>(`/styles/${styleId}/bundles?${params}`);
  },
  adminEmployeesList: (query: { page: number; pageSize: number; keyword?: string; status?: string }) => {
    const params = Object.entries(query).filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return request<PageResult<{ id: string; employeeNo: string; name: string; status: string; bound?: boolean }>>(`/employees?${params}`);
  },
  createEmployee: (body: { name: string; remark?: string }) =>
    request<{ id: string; employeeNo: string; name: string }>('/employees', { method: 'POST', data: body }),
  setEmployeeStatus: (id: string, active: boolean) =>
    request<{ message: string }>(`/employees/${id}/${active ? 'enable' : 'disable'}`, { method: 'POST' }),

  // ---------- 管理员端 ----------
  adminDashboard: () =>
    request<{
      company: { id: string; name: string; isFounder: boolean; adminName: string };
      employees: { active: number; total: number };
      styles: { production: number; completed: number; settled: number; total: number };
      reports: { pending: number; approved: number; todayApproved: number };
      disputes: { pending: number };
      settlements: { pendingAmount: string; pendingPairs: number };
      recentLogs: Array<{ id: string; summary: string; created_at: string }>;
    }>('/dashboard/admin'),
  pendingReports: (query: { page: number; pageSize: number }) =>
    request<PageResult<{
      id: string;
      status: string;
      source: string;
      reportedAt: string;
      style: { name: string; styleNo: string };
      process: { name: string; unitPrice: string };
      bundle: { bundleNo: number; quantity: number; size: string | null };
      employee: { name: string; employeeNo: string };
    }>>(`/reports/pending?page=${query.page}&pageSize=${query.pageSize}`),
  batchReview: (ids: string[], action: 'approve' | 'reject', reason?: string) =>
    request<{ successCount: number; failedCount: number; failures: Array<{ id: string; message: string }> }>(
      '/reports/batch-review',
      { method: 'POST', data: { ids, action, reason }, loading: true },
    ),
  adminDisputes: (query: { page: number; pageSize: number; status?: string }) => {
    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return request<PageResult<DisputeRow>>(`/report-disputes?${params}`);
  },
  resolveDispute: (id: string, result: string, reason?: string) =>
    request<{ message: string }>(`/report-disputes/${id}/resolve`, {
      method: 'POST',
      data: { result, reason },
      loading: true,
    }),
  adminEmployees: () =>
    request<PageResult<{ id: string; employeeNo: string; name: string; status: string }>>(
      '/employees?page=1&pageSize=200&status=active',
    ),
  adminStyles: (status?: 'production' | 'completed' | 'settled') =>
    request<PageResult<{ id: string; styleNo: string; name: string; status: string }>>(
      `/styles?page=1&pageSize=100${status ? `&status=${status}` : ''}`,
    ),
  styleProcesses: (styleId: string) =>
    request<{ items: Array<{ id: string; name: string; unitPrice: string }> }>(
      `/styles/${styleId}/processes`,
    ),
  styleBundles: (styleId: string) =>
    request<PageResult<{ id: string; bundleNo: number; size: string | null; quantity: number; hasReported: boolean }>>(
      `/styles/${styleId}/bundles?page=1&pageSize=200`,
    ),
  bundleAvailability: (styleId: string, styleProcessId: string) =>
    request<{
      style: { id: string; name: string; status: string };
      process: { id: string; name: string; unitPrice: string };
      items: Array<{
        id: string;
        bundleNo: number;
        size: string | null;
        quantity: number;
        reported: boolean;
        reportedByName: string | null;
      }>;
    }>(`/styles/${styleId}/bundles/availability?styleProcessId=${styleProcessId}`),
  proxyReport: (body: {
    employeeId: string;
    styleId: string;
    styleProcessId: string;
    bundleId: string;
    remark?: string;
  }) => request<{ id: string; bundleNo: number; quantity: number }>('/reports/proxy', {
    method: 'POST',
    data: body,
    loading: true,
  }),
  payrollByStyle: (styleId: string) =>
    request<Array<{ employeeId: string; employeeNo: string; name: string; quantity: number; amount: string; settled: boolean; settledAmount: string | null; difference: string | null }>>(
      `/payroll/styles/${styleId}/employees`,
    ),
  payrollDetail: (employeeId: string, styleId: string) =>
    request<WageDetail>(`/payroll/employees/${employeeId}/styles/${styleId}`),
  pendingSettlements: (styleId: string) =>
    request<{
      style: { id: string; name: string; status: string };
      items: Array<{ employeeId: string; employeeNo: string; name: string; quantity: number; amount: string }>;
    }>(`/settlements/pending?styleId=${styleId}`),
  createSettlement: (body: { employeeId: string; styleId: string; paymentMethod: string; remark?: string }) =>
    request<{ id: string; totalAmount: string; styleSettled: boolean }>('/settlements', {
      method: 'POST',
      data: body,
      loading: true,
    }),
};

export type { Profile };
