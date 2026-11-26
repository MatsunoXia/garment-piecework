import { request } from './client';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  role: 'admin' | 'employee' | 'pending';
  user: { id: string; name: string | null; companyId: string | null; companyName?: string | null };
}

export interface CompanyInfo {
  id: string;
  companyNo: string;
  name: string;
  status: string;
  createdAt: string;
  webPasswordConfigured: boolean;
  isFounder: boolean;
  adminName: string;
}

export interface Workshop {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  employeeCount: number;
  styleCount: number;
  createdAt: string;
}

export interface EmployeeRow {
  id: string;
  employeeNo: string;
  name: string;
  status: 'active' | 'disabled';
  remark: string | null;
  isBound: boolean;
  wechat: string | null;
  boundAt: string | null;
  workshops: Array<{ id: string; name: string }>;
  reportCount: number;
  createdAt: string;
}

export interface StyleRow {
  id: string;
  styleNo: string;
  name: string;
  status: 'production' | 'completed' | 'settled' | 'archived';
  productionScope: 'all' | 'workshops';
  createdAt: string;
  completedAt: string | null;
  settledAt: string | null;
  bundleCount: number;
  processCount: number;
  workshopCount: number;
  settlementCount: number;
  pendingReportCount: number;
  hasZeroPrice: boolean;
}

export interface StyleDetail {
  id: string;
  styleNo: string;
  name: string;
  status: 'production' | 'completed' | 'settled' | 'archived';
  productionScope: 'all' | 'workshops';
  remark: string | null;
  createdAt: string;
  completedAt: string | null;
  settledAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  processes: Array<{
    id: string;
    name: string;
    groupName: string | null;
    unitPrice: string;
    sortOrder: number;
    hasReported: boolean;
  }>;
  workshops: Array<{ id: string; name: string }>;
  stats: {
    bundleCount: number;
    bundleQuantity: number;
    settlementCount: number;
    employeeCount: number;
    reports: Record<string, number>;
  };
}

export interface BundleRow {
  id: string;
  bundleNo: number;
  size: string | null;
  quantity: number;
  remark: string | null;
  hasReported: boolean;
  reportCount: number;
  createdAt: string;
}

export interface ReportRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  source: 'employee' | 'admin_proxy';
  reportedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  operatorRemark: string | null;
  style: { id: string; styleNo: string; name: string; status: string };
  process: { id: string; name: string; unitPrice: string };
  bundle: { id: string; bundleNo: number; size: string | null; quantity: number };
  employee: { id: string; name: string; employeeNo: string };
  operator: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
}

export interface DisputeRow {
  id: string;
  status: 'pending' | 'resolved' | 'terminated';
  result: string | null;
  resultText: string | null;
  reason: string | null;
  rejectReason: string | null;
  terminationReason: string | null;
  createdAt: string;
  handledAt: string | null;
  handler: { id: string; name: string } | null;
  challenger: { id: string; name: string; employeeNo: string };
  originalEmployee: { id: string; name: string; employeeNo: string };
  report: {
    id: string;
    status: string;
    style: { name: string; styleNo: string };
    process: { name: string };
    bundle: { bundleNo: number; quantity: number };
  } | null;
}

export interface PayrollSummary {
  employeeId: string;
  employeeNo: string;
  name: string;
  quantity: number;
  amount: string;
  settled: boolean;
  settlementId: string | null;
  settledAmount: string | null;
  settledAt: string | null;
  difference: string | null;
}

export interface PayrollDetail {
  style: { id: string; styleNo: string; name: string; status: string };
  employee: { id: string; name: string; employeeNo: string };
  processes: Array<{
    styleProcessId: string;
    processName: string;
    groupName: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  reports: Array<{
    reportId: string;
    processName: string;
    bundleNo: number;
    size: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
    reportedAt: string;
    source: string;
  }>;
  totalQuantity: number;
  totalAmount: string;
  settlement: {
    id: string;
    totalAmount: string;
    paymentMethod: string;
    settledAt: string;
    remark: string | null;
    operator: string | null;
    difference: string;
  } | null;
}

export interface SettlementRow {
  id: string;
  totalAmount: string;
  paymentMethod: string;
  settledAt: string;
  remark: string | null;
  employee: { id: string; name: string; employeeNo: string };
  style: { id: string; name: string; styleNo: string; status: string };
  operator: string | null;
  reportCount: number;
}

export interface SettlementDetail {
  id: string;
  totalAmount: string;
  paymentMethod: string;
  settledAt: string;
  remark: string | null;
  createdAt: string;
  employee: { id: string; name: string; employeeNo: string; status: string };
  style: { id: string; name: string; styleNo: string; status: string };
  operator: string | null;
  processItems: Array<{
    id: string;
    processName: string;
    groupName: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  reportItems: Array<{
    id: string;
    reportId: string;
    processName: string;
    bundleNo: number;
    size: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  currentAmount: string;
  difference: string;
  adjustments: Array<{
    id: string;
    actionType: string;
    summary: string;
    detail: unknown;
    createdAt: string;
  }>;
}

export interface DashboardData {
  company: { id: string; name: string; isFounder: boolean; adminName: string };
  employees: { active: number; disabled: number; total: number };
  workshops: number;
  styles: { production: number; completed: number; settled: number; archived: number; total: number };
  bundles: { count: number; quantity: number };
  reports: { pending: number; approved: number; rejected: number; todayApproved: number; weekApproved: number };
  disputes: { pending: number };
  settlements: { pendingAmount: string; pendingPairs: number };
  recentLogs: Array<{ id: string; action_type: string; summary: string; created_at: string; operator_type: string }>;
}

export const api = {
  login: (company: string, password: string, adminName?: string) =>
    request<LoginResult>('/auth/web/login', { method: 'POST', body: { company, password, adminName } }),
  me: () => request<Record<string, unknown>>('/auth/me'),
  setWebPassword: (password: string) =>
    request<{ message: string }>('/auth/web/password', { method: 'POST', body: { password } }),

  company: () => request<CompanyInfo>('/companies/current'),
  renameCompany: (name: string) =>
    request<{ message: string }>('/companies/current', { method: 'PATCH', body: { name } }),
  disableCompany: () =>
    request<{ message: string }>('/companies/current/disable', { method: 'POST' }),
  dashboard: () => request<DashboardData>('/dashboard/admin'),

  workshops: (includeDisabled = false) =>
    request<Workshop[]>('/workshops', { query: { includeDisabled: includeDisabled ? 1 : 0 } }),
  createWorkshop: (name: string) => request<Workshop>('/workshops', { method: 'POST', body: { name } }),
  updateWorkshop: (id: string, body: { name?: string; status?: string }) =>
    request<{ message: string }>(`/workshops/${id}`, { method: 'PATCH', body }),
  deleteWorkshop: (id: string) =>
    request<{ message: string }>(`/workshops/${id}`, { method: 'DELETE' }),

  employees: (query: Record<string, string | number | undefined>) =>
    request<PageResult<EmployeeRow>>('/employees', { query }),
  employee: (id: string) => request<Record<string, unknown>>(`/employees/${id}`),
  createEmployee: (body: { name: string; remark?: string; workshopIds?: string[] }) =>
    request<{ id: string; employeeNo: string; name: string }>('/employees', { method: 'POST', body }),
  updateEmployee: (id: string, body: { name?: string; remark?: string }) =>
    request<{ message: string }>(`/employees/${id}`, { method: 'PATCH', body }),
  setEmployeeStatus: (id: string, action: 'disable' | 'enable') =>
    request<{ message: string }>(`/employees/${id}/${action}`, { method: 'POST' }),
  setEmployeeWorkshops: (id: string, workshopIds: string[]) =>
    request<{ message: string }>(`/employees/${id}/workshops`, { method: 'PUT', body: { workshopIds } }),
  createRebindToken: (id: string, expiresInMinutes = 30) =>
    request<{ token: string; expiresAt: string }>(`/employees/${id}/rebind-token`, {
      method: 'POST',
      body: { expiresInMinutes },
    }),

  invitations: () =>
    request<Array<{ id: string; code: string; status: string; expiresAt: string | null; createdAt: string; isExpired: boolean }>>(
      '/invitations/company',
    ),
  createInvitation: (expiresInDays?: number) =>
    request<{ id: string; code: string; expiresAt: string | null; created: boolean }>('/invitations/company', {
      method: 'POST',
      body: { expiresInDays },
    }),
  updateInvitation: (id: string, status: 'active' | 'disabled') =>
    request<{ message: string }>(`/invitations/company/${id}`, { method: 'PATCH', body: { status } }),

  admins: () =>
    request<Array<{ id: string; name: string; status: string; is_founder: boolean; joined_at: string }>>('/admins'),
  adminInvitations: () =>
    request<Array<{ id: string; status: string; expiresAt: string | null; createdAt: string; createdBy: string | null; usedCount: number }>>(
      '/admin-invitations',
    ),
  createAdminInvitation: (expiresInDays?: number) =>
    request<{ invitationId: string; invitationToken: string; expiresAt: string | null }>('/admin-invitations', {
      method: 'POST',
      body: { expiresInDays },
    }),
  updateAdminInvitation: (id: string, status: 'active' | 'disabled') =>
    request<{ message: string }>(`/admin-invitations/${id}`, { method: 'PATCH', body: { status } }),
  deactivateAdmin: (id: string) => request<{ message: string }>(`/admins/${id}/deactivate`, { method: 'POST' }),

  styles: (query: Record<string, string | number | undefined>) =>
    request<PageResult<StyleRow>>('/styles', { query }),
  style: (id: string) => request<StyleDetail>(`/styles/${id}`),
  createStyle: (body: unknown) => request<{ id: string; styleNo: string }>('/styles', { method: 'POST', body }),
  updateStyle: (id: string, body: unknown) => request<{ message: string }>(`/styles/${id}`, { method: 'PATCH', body }),
  completeStyle: (id: string) => request<{ message: string }>(`/styles/${id}/complete`, { method: 'POST' }),
  archiveStyle: (id: string) => request<{ message: string }>(`/styles/${id}/archive`, { method: 'POST' }),

  processes: (styleId: string) =>
    request<{ style: { id: string; name: string }; items: Array<{ id: string; name: string; groupName: string | null; unitPrice: string; sortOrder: number; hasReported: boolean; isZeroPrice: boolean }> }>(
      `/styles/${styleId}/processes`,
    ),
  createProcess: (styleId: string, body: unknown) =>
    request<{ id: string; warning?: string }>(`/styles/${styleId}/processes`, { method: 'POST', body }),
  updateProcess: (id: string, body: unknown) =>
    request<{ message: string }>(`/processes/${id}`, { method: 'PATCH', body }),
  changePrice: (id: string, unitPrice: string, reason?: string) =>
    request<{ warning?: string; message: string; affectedSettlements: number; affectedEmployees: string[] }>(
      `/processes/${id}/change-price`,
      { method: 'POST', body: { unitPrice, reason } },
    ),
  deleteProcess: (id: string) => request<{ message: string }>(`/processes/${id}`, { method: 'DELETE' }),

  templates: () =>
    request<Array<{ id: string; name: string; remark: string | null; items: Array<{ id: string; name: string; groupName: string | null; sortOrder: number }> }>>(
      '/process-templates',
    ),
  createTemplate: (body: unknown) => request<{ id: string }>('/process-templates', { method: 'POST', body }),
  updateTemplate: (id: string, body: unknown) =>
    request<{ message: string }>(`/process-templates/${id}`, { method: 'PATCH', body }),
  deleteTemplate: (id: string) => request<{ message: string }>(`/process-templates/${id}`, { method: 'DELETE' }),

  bundles: (styleId: string, query: Record<string, string | number | undefined>) =>
    request<PageResult<BundleRow> & { style: { id: string; name: string; status: string } }>(
      `/styles/${styleId}/bundles`,
      { query },
    ),
  createBundle: (styleId: string, body: { size?: string; quantity: number; remark?: string }) =>
    request<{ id: string; bundleNo: number }>(`/styles/${styleId}/bundles`, { method: 'POST', body }),
  createBundlesBatch: (styleId: string, items: Array<{ size?: string; quantity: number; remark?: string }>) =>
    request<{ count: number; bundleNos: number[] }>(`/styles/${styleId}/bundles/batch`, {
      method: 'POST',
      body: { items },
    }),
  updateBundle: (id: string, body: { size?: string; quantity?: number; remark?: string }) =>
    request<{ message: string }>(`/bundles/${id}`, { method: 'PATCH', body }),
  deleteBundle: (id: string) => request<{ message: string }>(`/bundles/${id}`, { method: 'DELETE' }),
  previewBundles: (styleId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{
      rows: Array<{ lineNo: number; bundleNo: number | null; size: string | null; quantity: number | null; remark: string | null; errors: string[]; valid: boolean }>;
      total: number;
      validCount: number;
      invalidCount: number;
      canImport: boolean;
    }>(`/styles/${styleId}/bundles/import/preview`, { method: 'POST', formData });
  },
  confirmBundles: (styleId: string, rows: unknown[]) =>
    request<{ imported: number; bundleNos: number[] }>(`/styles/${styleId}/bundles/import`, {
      method: 'POST',
      body: { rows },
    }),
  bundleTemplate: (styleId: string) => `/styles/${styleId}/bundles/template`,

  reports: (query: Record<string, string | number | undefined>) =>
    request<PageResult<ReportRow> & { summary: Record<string, number> }>('/reports', { query }),
  pendingReports: (query: Record<string, string | number | undefined>) =>
    request<PageResult<ReportRow> & { summary: Record<string, number> }>('/reports/pending', { query }),
  approveReport: (id: string) => request<{ message: string }>(`/reports/${id}/approve`, { method: 'POST' }),
  rejectReport: (id: string, reason: string) =>
    request<{ message: string }>(`/reports/${id}/reject`, { method: 'POST', body: { reason } }),
  batchReview: (ids: string[], action: 'approve' | 'reject', reason?: string) =>
    request<{ successCount: number; failedCount: number; failures: Array<{ id: string; code: string; message: string }> }>(
      '/reports/batch-review',
      { method: 'POST', body: { ids, action, reason } },
    ),
  proxyReport: (body: { employeeId: string; styleId: string; styleProcessId: string; bundleId: string; remark?: string }) =>
    request<{ id: string }>('/reports/proxy', { method: 'POST', body }),
  deleteReport: (id: string) => request<{ message: string }>(`/reports/${id}`, { method: 'DELETE' }),
  report: (id: string) => request<Record<string, unknown>>(`/reports/${id}`),

  disputes: (query: Record<string, string | number | undefined>) =>
    request<PageResult<DisputeRow> & { pendingCount: number }>('/report-disputes', { query }),
  resolveDispute: (id: string, result: string, reason?: string) =>
    request<{ message: string }>(`/report-disputes/${id}/resolve`, { method: 'POST', body: { result, reason } }),

  payrollByStyle: (styleId: string, keyword?: string) =>
    request<PayrollSummary[]>(`/payroll/styles/${styleId}/employees`, { query: { keyword } }),
  payrollEmployee: (employeeId: string, query: Record<string, string | number | undefined>) =>
    request<PageResult<{ styleId: string; styleNo: string; styleName: string; styleStatus: string; quantity: number; amount: string; settled: boolean; settlementId: string | null; settledAmount: string | null; settledAt: string | null }>>(
      `/payroll/employees/${employeeId}`,
      { query },
    ),
  payrollDetail: (employeeId: string, styleId: string) =>
    request<PayrollDetail>(`/payroll/employees/${employeeId}/styles/${styleId}`),

  settlements: (query: Record<string, string | number | undefined>) =>
    request<PageResult<SettlementRow> & { summary: { totalAmount: string } }>('/settlements', { query }),
  settlement: (id: string) => request<SettlementDetail>(`/settlements/${id}`),
  pendingSettlements: (styleId: string) =>
    request<{ style: { id: string; name: string; status: string }; items: PayrollSummary[]; settledCount: number; totalCount: number }>(
      '/settlements/pending',
      { query: { styleId } },
    ),
  createSettlement: (body: { employeeId: string; styleId: string; paymentMethod: string; remark?: string }) =>
    request<{ id: string; totalAmount: string; styleSettled: boolean }>('/settlements', { method: 'POST', body }),
  updateSettlement: (id: string, body: { totalAmount?: string; paymentMethod?: string; remark?: string; reason: string }) =>
    request<{ message: string }>(`/settlements/${id}`, { method: 'PATCH', body }),

  logs: (query: Record<string, string | number | undefined>) =>
    request<PageResult<{ id: string; operator_type: string; operator_id: string | null; action_type: string; target_type: string; target_id: string | null; summary: string; created_at: string }>>(
      '/operation-logs',
      { query },
    ),
  logDetail: (id: string) => request<Record<string, unknown>>(`/operation-logs/${id}`),
};
