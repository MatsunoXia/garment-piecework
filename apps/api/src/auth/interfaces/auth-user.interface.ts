export type UserRole = 'admin' | 'employee' | 'pending';

export interface AuthUser {
  /** admin.id / employee.id；pending 时为 openid */
  sub: string;
  role: UserRole;
  companyId?: string;
  openid: string;
  name?: string;
  /** 仅身份选择令牌使用，不能用于业务接口 */
  purpose?: 'identity_selection';
}

export interface AuthenticatedRequest {
  user: AuthUser;
}

export interface IdentityOption {
  role: 'admin' | 'employee';
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string;
}
