import { reactive } from 'vue';

export interface SessionUser {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
}

const USER_KEY = 'gp_admin_user';

function readUser(): SessionUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export const session = reactive<{ user: SessionUser | null }>({
  user: readUser(),
});

export function setSession(user: SessionUser): void {
  session.user = user;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  session.user = null;
  sessionStorage.removeItem(USER_KEY);
}
