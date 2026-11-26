import type { Profile, Role } from '../types';

const TOKEN_KEY = 'gp_token';
const PROFILE_KEY = 'gp_profile';
const VISITED_KEY = 'gp_visited';

export function markVisited(): void {
  uni.setStorageSync(VISITED_KEY, '1');
}

export function hasVisited(): boolean {
  return uni.getStorageSync(VISITED_KEY) === '1';
}

export function getToken(): string {
  return (uni.getStorageSync(TOKEN_KEY) as string) || '';
}

export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function getProfile(): Profile | null {
  const value = uni.getStorageSync(PROFILE_KEY) as Profile | '';
  return value && typeof value === 'object' ? value : null;
}

export function setProfile(profile: Profile): void {
  uni.setStorageSync(PROFILE_KEY, profile);
}

export function clearAuth(): void {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(PROFILE_KEY);
}

export function goHome(role?: Role): void {
  const target = role ?? getProfile()?.role;
  if (target === 'admin') {
    uni.reLaunch({ url: '/pages/admin/home' });
    return;
  }
  if (target === 'employee') {
    uni.reLaunch({ url: '/pages/employee/home' });
    return;
  }
  uni.reLaunch({ url: '/pages/join/index' });
}

/** 页面守卫：角色不匹配时回到对应首页 */
export function guard(role: 'admin' | 'employee'): boolean {
  const token = getToken();
  const profile = getProfile();

  if (!token || !profile) {
    uni.reLaunch({ url: '/pages/login/index' });
    return false;
  }

  if (profile.role !== role) {
    uni.showToast({ title: '当前身份无权访问', icon: 'none' });
    goHome();
    return false;
  }

  return true;
}
