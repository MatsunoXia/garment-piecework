export type Role = 'admin' | 'employee' | 'pending';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  companyId: string;
  companyName: string;
}

export interface IdentityOption {
  role: 'admin' | 'employee';
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string;
}

export interface LoginResult {
  accessToken?: string;
  tokenType?: 'Bearer';
  role?: Role;
  user?: { id: string; name: string | null; companyId: string | null; companyName?: string | null };
  requiresIdentitySelection?: boolean;
  selectionToken?: string;
  identities?: IdentityOption[];
  needsJoin?: boolean;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportableStyle {
  id: string;
  styleNo: string;
  name: string;
  bundleCount: number;
  processCount: number;
}

export interface ProcessOption {
  id: string;
  name: string;
  groupName: string | null;
  unitPrice: string;
  hasReported: boolean;
}

export interface BundleOption {
  id: string;
  bundleNo: number;
  size: string | null;
  quantity: number;
  remark: string | null;
  reported: boolean;
  reportedByMe: boolean;
  reportedStatus: string | null;
  activeReportId?: string | null;
  reportedByName?: string | null;
}

export interface MyReport {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  source: string;
  reportedAt: string;
  rejectReason: string | null;
  operatorRemark: string | null;
  style: { id: string; name: string; styleNo: string };
  process: { id: string; name: string; unitPrice: string };
  bundle: { id: string; bundleNo: number; size: string | null; quantity: number };
}

export interface WageRow {
  styleId: string;
  styleNo: string;
  styleName: string;
  styleStatus: string;
  quantity: number;
  amount: string;
  settled: boolean;
  settlementId: string | null;
  settledAmount: string | null;
  settledAt: string | null;
  lastReportedAt: string;
}

export interface WageDetail {
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
  }>;
  totalQuantity: number;
  totalAmount: string;
  settlement: {
    id: string;
    totalAmount: string;
    paymentMethod: string;
    settledAt: string;
    difference: string;
  } | null;
}

export interface DisputeRow {
  id: string;
  status: string;
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
