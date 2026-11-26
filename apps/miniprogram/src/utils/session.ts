import type { LoginResult, Profile } from '../types';
import { markVisited, setProfile, setToken } from './auth';

/** 把登录结果写入本地会话；返回 null 表示该结果不能直接进入业务端 */
export function establishSession(result: LoginResult): Profile | null {
  if (!result.accessToken || !result.role || result.role === 'pending') return null;

  setToken(result.accessToken);

  const profile: Profile = {
    id: result.user?.id ?? '',
    name: result.user?.name ?? '',
    role: result.role,
    companyId: result.user?.companyId ?? '',
    companyName: result.user?.companyName ?? '',
  };

  setProfile(profile);
  markVisited();
  return profile;
}

/** 仅保存待加入身份（pending）的令牌，进入创建/加入流程 */
export function savePendingToken(result: LoginResult): boolean {
  if (!result.accessToken || result.role !== 'pending') return false;
  setToken(result.accessToken);
  return true;
}
