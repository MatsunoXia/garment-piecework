<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

import { api } from '../../api';
import { ENABLE_DEV_UI } from '../../config';
import type { IdentityOption, LoginResult } from '../../types';
import {
  clearAuth,
  getProfile,
  getToken,
  goHome,
  markVisited,
  setProfile,
} from '../../utils/auth';
import { establishSession, savePendingToken } from '../../utils/session';
import { prompt, toast, toastError } from '../../utils/request';

type View = 'boot' | 'choose' | 'boss' | 'employee' | 'identity' | 'created';

const DEV_UI = ENABLE_DEV_UI;

const view = ref<View>('boot');
const loading = ref(false);
const selectionToken = ref('');
const identities = ref<IdentityOption[]>([]);
const showDev = ref(false);
const devOpenid = ref((uni.getStorageSync('gp_dev_openid') as string) || 'dev_boss_001');

const bossForm = reactive({ companyName: '', adminName: '', webPassword: '' });
const employeeForm = reactive({ name: '', inviteCode: '' });
const previewName = ref('');
const created = ref<{ companyNo: string; inviteCode: string; companyName: string } | null>(null);

onLoad(() => {
  void restore();
});

function routeLoginResult(result: LoginResult): boolean {
  if (result.requiresIdentitySelection) {
    selectionToken.value = result.selectionToken ?? '';
    identities.value = result.identities ?? [];
    view.value = 'identity';
    return true;
  }

  const profile = establishSession(result);
  if (profile) {
    goHome(profile.role);
    return true;
  }

  savePendingToken(result);
  return false;
}

function wechatLogin(): Promise<LoginResult> {
  return new Promise<LoginResult>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: async (loginResult) => {
        try {
          resolve(await api.wechatLogin(loginResult.code));
        } catch (error) {
          reject(error);
        }
      },
      fail: reject,
    });
  });
}

/**
 * 启动时会话恢复：
 * 1. 本地有完整身份 → 直接进入对应端
 * 2. 本地只有令牌（如上次停在加入流程）→ 校验真实身份
 * 3. 曾经用过小程序但本地被清 → 静默微信登录，按已有身份进入
 */
async function restore(): Promise<void> {
  const token = getToken();
  const profile = getProfile();

  if (token && profile && profile.role !== 'pending') {
    goHome(profile.role);
    return;
  }

  if (token) {
    try {
      const me = await api.me();
      if (me.role === 'admin' || me.role === 'employee') {
        setProfile({
          id: me.id,
          name: me.name,
          role: me.role,
          companyId: me.companyId ?? '',
          companyName: me.companyName ?? '',
        });
        markVisited();
        goHome(me.role);
        return;
      }

      // 上次已创建/加入成功但未走完流程：待加入令牌此时已能换出正式身份
      if (me.role === 'pending' && (me.identities?.length ?? 0) > 0) {
        const refreshed = await api.refresh();
        const profileFromToken = establishSession(refreshed);
        if (profileFromToken) {
          goHome(profileFromToken.role);
          return;
        }
      }
    } catch {
      // 令牌失效时 request 层会清理，这里继续展示身份选择
    }
  }

  if (!token) {
    // 没有本地会话时也尝试静默微信登录：
    // 已创建账号的用户会直接进入对应端，新用户则停在身份选择
    try {
      const status = await api.wechatStatus();
      if (status.configured) {
        const result = await wechatLogin();
        if (routeLoginResult(result)) return;
        if (getToken()) {
          view.value = 'choose';
          return;
        }
      }
    } catch {
      // 游客 AppID、网络或未配置时回落到手动选择
    }
  }

  view.value = 'choose';
}

/** 确保有一个可用的待加入身份（pending），用于创建公司或加入公司 */
async function ensurePendingSession(): Promise<boolean> {
  if (getToken()) {
    // 令牌可能已经对应管理员/员工（例如上次创建成功后直接退出）
    try {
      const refreshed = await api.refresh();
      if (refreshed.requiresIdentitySelection) {
        selectionToken.value = refreshed.selectionToken ?? '';
        identities.value = refreshed.identities ?? [];
        view.value = 'identity';
        return false;
      }
      const profileFromToken = establishSession(refreshed);
      if (profileFromToken) {
        goHome(profileFromToken.role);
        return false;
      }
    } catch {
      // 令牌失效则继续走登录
    }
    if (getToken()) return true;
  }

  let lastError: unknown;

  try {
    const result = await wechatLogin();
    if (routeLoginResult(result)) return false;
    if (getToken()) return true;
  } catch (error) {
    lastError = error;
  }

  if (!DEV_UI) throw lastError instanceof Error ? lastError : new Error('无法获取微信身份');

  const reason = lastError instanceof Error ? lastError.message : '微信身份获取失败';
  const input = await prompt(
    `微信登录不可用：${reason}\n\n可输入本地开发 OpenID 继续（需 API 已开启 ENABLE_DEV_LOGIN=true）：`,
    devOpenid.value,
  );

  if (input === null || !input.trim()) {
    throw lastError instanceof Error ? lastError : new Error('已取消登录');
  }

  devOpenid.value = input.trim();
  uni.setStorageSync('gp_dev_openid', devOpenid.value);

  const result = await api.devLogin(devOpenid.value);
  if (routeLoginResult(result)) return false;
  return Boolean(getToken());
}

async function submitBoss(): Promise<void> {
  if (!bossForm.companyName.trim() || !bossForm.adminName.trim()) {
    toast('请填写公司名称和你的姓名');
    return;
  }
  if (bossForm.webPassword && bossForm.webPassword.length < 8) {
    toast('Web 管理密码至少 8 位');
    return;
  }

  loading.value = true;
  try {
    if (!(await ensurePendingSession())) return;

    const result = await api.createCompany({
      companyName: bossForm.companyName.trim(),
      adminName: bossForm.adminName.trim(),
      webPassword: bossForm.webPassword.trim() || undefined,
    });

    // 创建后立刻换取管理员身份，但仍停留在结果页，方便记录公司编号/公司NO
    const refreshed = await api.refresh();
    const profile = establishSession(refreshed);

    if (!profile || profile.role !== 'admin') {
      toast('公司已创建，请重新登录进入管理端');
      clearAuth();
      view.value = 'choose';
      return;
    }

    created.value = {
      companyName: result.companyName,
      companyNo: result.companyNo,
      inviteCode: result.inviteCode,
    };
    view.value = 'created';
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function submitEmployee(): Promise<void> {
  if (!employeeForm.name.trim() || !employeeForm.inviteCode.trim()) {
    toast('请填写姓名和公司NO');
    return;
  }

  loading.value = true;
  try {
    if (!(await ensurePendingSession())) return;

    const joined = await api.joinCompany({
      inviteCode: employeeForm.inviteCode.trim().toUpperCase(),
      name: employeeForm.name.trim(),
    });

    const refreshed = await api.refresh();
    const profile = establishSession(refreshed);

    if (!profile || profile.role !== 'employee') {
      toast('已加入公司，请重新登录');
      clearAuth();
      view.value = 'choose';
      return;
    }

    toast(`已加入 ${joined.companyName}`, 'success');
    goHome('employee');
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function previewInvite(): Promise<void> {
  if (!employeeForm.inviteCode.trim()) {
    toast('请先输入公司NO');
    return;
  }
  try {
    const result = await api.previewInvite(employeeForm.inviteCode.trim().toUpperCase());
    previewName.value = result.companyName;
  } catch (error) {
    previewName.value = '';
    toastError(error);
  }
}

async function chooseIdentity(identity: IdentityOption): Promise<void> {
  if (!selectionToken.value) return;
  loading.value = true;
  try {
    const result = await api.selectIdentity(selectionToken.value, identity.role, identity.id);
    const profile = establishSession(result);
    if (profile) goHome(profile.role);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function devEnter(): Promise<void> {
  if (!devOpenid.value.trim()) {
    toast('请输入开发 OpenID');
    return;
  }
  loading.value = true;
  try {
    uni.setStorageSync('gp_dev_openid', devOpenid.value.trim());
    const result = await api.devLogin(devOpenid.value.trim());
    if (routeLoginResult(result)) return;
    if (getToken()) {
      toast('已模拟该微信身份，请选择老板或员工');
    }
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function enterAdmin(): void {
  const profile = getProfile();
  if (profile?.role === 'admin') {
    goHome('admin');
    return;
  }
  clearAuth();
  view.value = 'choose';
}

function copy(value: string): void {
  uni.setClipboardData({ data: value });
}

function resetLocal(): void {
  clearAuth();
  uni.removeStorageSync('gp_visited');
  uni.removeStorageSync('gp_dev_openid');
  created.value = null;
  view.value = 'choose';
  toast('已清除本地登录状态');
}

function goInvitePage(): void {
  uni.navigateTo({ url: '/pages/join/index' });
}

function back(): void {
  view.value = 'choose';
  previewName.value = '';
}
</script>

<template>
  <view class="entry-page">
    <view class="hero">
      <view class="logo">计</view>
      <view class="hero-title">服装厂计件工资</view>
      <view class="hero-sub">报工、审核、工资与结算，一个入口搞定</view>
    </view>

    <view v-if="view === 'boot'" class="boot">
      <view class="boot-spinner"></view>
      <view class="muted small">正在恢复登录状态…</view>
    </view>

    <!-- 首次进入：选择身份 -->
    <view v-else-if="view === 'choose'" class="body">
      <view class="section-title">你是？</view>

      <view class="role-card boss" @click="view = 'boss'">
        <view class="role-icon">厂</view>
        <view class="role-text">
          <view class="role-name">我是老板 / 管理员</view>
          <view class="role-desc">创建公司，管理员工、款式、报工与工资</view>
        </view>
        <view class="role-arrow">›</view>
      </view>

      <view class="role-card employee" @click="view = 'employee'">
        <view class="role-icon">员</view>
        <view class="role-text">
          <view class="role-name">我是员工</view>
          <view class="role-desc">输入公司NO加入，报工并查看自己的工资</view>
        </view>
        <view class="role-arrow">›</view>
      </view>

      <view class="links">
        <text class="link" @click="goInvitePage">有管理员邀请？</text>
        <text class="link" @click="showDev = !showDev">{{ showDev ? '收起本地调试' : '本地开发调试' }}</text>
      </view>

      <view v-if="showDev" class="dev-box">
        <view class="field">
          <view class="field-label">模拟微信 OpenID</view>
          <input v-model="devOpenid" class="input" placeholder="dev_boss_001" />
        </view>
        <button class="btn ghost" :disabled="loading" @click="devEnter">使用该身份继续</button>
        <view class="muted small" style="margin-top: 12rpx">
          需要 API 的 ENABLE_DEV_LOGIN=true。换一个 OpenID 可分别模拟老板和员工。
        </view>
        <view class="reset-link" @click="resetLocal">清除本地登录，重新走首次进入</view>
      </view>

      <view class="tip">
        已创建过账号的微信会自动识别身份并进入对应界面，无需再次选择。
      </view>
    </view>

    <!-- 老板：创建公司 -->
    <view v-else-if="view === 'boss'" class="body">
      <view class="back" @click="back">← 返回身份选择</view>
      <view class="form-title">创建公司</view>
      <view class="form-sub">你将自动成为创始管理员</view>

      <view class="card">
        <view class="field">
          <view class="field-label">公司名称</view>
          <input v-model="bossForm.companyName" class="input" maxlength="100" placeholder="例如 鹏城服装厂" />
        </view>
        <view class="field">
          <view class="field-label">你的姓名（管理员姓名）</view>
          <input v-model="bossForm.adminName" class="input" maxlength="50" placeholder="例如 张厂长" />
        </view>
        <view class="field" style="margin-bottom: 0">
          <view class="field-label">Web 管理密码（可选，至少 8 位）</view>
          <input v-model="bossForm.webPassword" class="input" password placeholder="用于电脑浏览器登录管理后台" />
          <view class="muted small" style="margin-top: 8rpx">
            设置后可在电脑上访问 Web 后台；以后也能在管理首页重置。
          </view>
        </view>
      </view>

      <view class="alert info">
        创建后会生成两个码：<text style="font-weight:600">公司编号</text>（电脑后台登录用）和
        <text style="font-weight:600">公司NO</text>（发给员工加入用）。请妥善保存。
      </view>

      <button class="btn primary" :disabled="loading" @click="submitBoss">
        {{ loading ? '创建中…' : '创建公司并进入管理端' }}
      </button>
    </view>

    <!-- 员工：加入公司 -->
    <view v-else-if="view === 'employee'" class="body">
      <view class="back" @click="back">← 返回身份选择</view>
      <view class="form-title">加入公司</view>
      <view class="form-sub">向老板索取 8 位公司NO</view>

      <view class="card">
        <view class="field">
          <view class="field-label">你的姓名</view>
          <input v-model="employeeForm.name" class="input" maxlength="50" placeholder="用于工资统计，请填真实姓名" />
        </view>
        <view class="field" style="margin-bottom: 0">
          <view class="field-label">公司NO</view>
          <input v-model="employeeForm.inviteCode" class="input" maxlength="32" placeholder="例如 K7M2Q9XP" />
          <view class="muted small" style="margin-top: 8rpx">
            由老板创建公司后生成，员工加入专用；不是 C 开头的公司编号。
          </view>
        </view>
      </view>

      <button class="btn ghost sm" style="margin-bottom: 20rpx" @click="previewInvite">校验公司NO</button>
      <view v-if="previewName" class="alert info">校验通过，将加入：{{ previewName }}</view>

      <view class="alert warn">
        加入后由管理员分配车间。员工编号由系统自动分配。同一微信只能绑定一名员工。
      </view>

      <button class="btn primary" :disabled="loading" @click="submitEmployee">
        {{ loading ? '加入中…' : '加入公司并进入员工端' }}
      </button>
    </view>

    <!-- 多身份选择 -->
    <view v-else-if="view === 'identity'" class="body">
      <view class="form-title">选择登录身份</view>
      <view class="form-sub">当前微信关联多个身份，请选择本次使用的身份</view>

      <view v-for="identity in identities" :key="identity.id" class="identity" @click="chooseIdentity(identity)">
        <view>
          <view class="identity-name">
            {{ identity.role === 'admin' ? '管理员' : '员工' }} · {{ identity.name }}
          </view>
          <view class="muted small">{{ identity.description }}</view>
        </view>
        <view class="role-arrow">›</view>
      </view>
    </view>

    <!-- 创建成功 -->
    <view v-else-if="view === 'created' && created" class="body">
      <view class="success-icon">✓</view>
      <view class="form-title" style="text-align: center">公司创建成功</view>
      <view class="form-sub" style="text-align: center">{{ created.companyName }}</view>

      <view class="card">
        <view class="result-row">
          <view>
            <view class="muted small">公司编号（电脑后台登录用）</view>
            <view class="result-value mono">{{ created.companyNo }}</view>
          </view>
          <text class="copy" @click="copy(created.companyNo)">复制</text>
        </view>
        <view class="divider"></view>
        <view class="result-row">
          <view>
            <view class="muted small">公司NO（发给员工加入用）</view>
            <view class="result-value mono">{{ created.inviteCode }}</view>
          </view>
          <text class="copy" @click="copy(created.inviteCode)">复制</text>
        </view>
      </view>

      <view class="alert info">
        员工在首次进入时选择「我是员工」，填写姓名和这串公司NO即可加入。公司编号不要发给员工。
      </view>

      <button class="btn primary" @click="enterAdmin">进入管理工作台</button>
    </view>
  </view>
</template>

<style scoped>
.entry-page { min-height: 100vh; background: #f5f6fa; padding-bottom: 60rpx; }
.hero {
  background: linear-gradient(160deg, #3556d6 0%, #4d6ee8 70%, #6d8bf0 100%);
  padding: 120rpx 44rpx 86rpx;
  color: #fff;
  border-radius: 0 0 44rpx 44rpx;
}
.logo {
  width: 92rpx; height: 92rpx; border-radius: 24rpx; background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center; font-size: 44rpx; font-weight: 700;
  margin-bottom: 24rpx;
}
.hero-title { font-size: 44rpx; font-weight: 700; }
.hero-sub { font-size: 24rpx; opacity: 0.85; margin-top: 8rpx; }
.body { padding: 30rpx 32rpx; }
.boot { padding: 160rpx 0; display: flex; flex-direction: column; align-items: center; gap: 20rpx; }
.boot-spinner {
  width: 52rpx; height: 52rpx; border-radius: 50%;
  border: 5rpx solid #dfe5f5; border-top-color: #3556d6;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.section-title { font-size: 32rpx; font-weight: 600; margin: 6rpx 0 22rpx; }

.role-card {
  display: flex; align-items: center; gap: 22rpx; background: #fff;
  border-radius: 20rpx; padding: 30rpx 26rpx; margin-bottom: 18rpx;
  box-shadow: 0 4rpx 18rpx rgba(16, 24, 40, 0.06);
}
.role-card:active { transform: scale(0.99); }
.role-icon {
  width: 84rpx; height: 84rpx; border-radius: 20rpx; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 34rpx; font-weight: 700;
}
.boss .role-icon { background: #eef2ff; color: #3556d6; }
.employee .role-icon { background: #ebfbee; color: #2b8a3e; }
.role-text { flex: 1; }
.role-name { font-size: 32rpx; font-weight: 600; }
.role-desc { font-size: 23rpx; color: #6b7280; margin-top: 6rpx; line-height: 1.5; }
.role-arrow { color: #b6bcc8; font-size: 44rpx; }

.links { display: flex; justify-content: space-between; padding: 18rpx 4rpx 0; }
.link { color: #3556d6; font-size: 25rpx; }

.dev-box { margin-top: 22rpx; background: #fff; border-radius: 18rpx; padding: 24rpx; }
.reset-link { margin-top: 20rpx; text-align: center; color: #9aa1ae; font-size: 23rpx; }

.tip { margin-top: 40rpx; color: #9aa1ae; font-size: 23rpx; line-height: 1.6; text-align: center; }

.back { color: #6b7280; font-size: 25rpx; margin-bottom: 26rpx; }
.form-title { font-size: 40rpx; font-weight: 700; }
.form-sub { color: #6b7280; font-size: 24rpx; margin: 8rpx 0 26rpx; }

.identity {
  background: #fff; border-radius: 18rpx; padding: 28rpx; margin-bottom: 16rpx;
  display: flex; justify-content: space-between; align-items: center;
}
.identity-name { font-size: 30rpx; font-weight: 600; margin-bottom: 4rpx; }

.success-icon {
  width: 108rpx; height: 108rpx; border-radius: 50%; background: #ebfbee; color: #2b8a3e;
  font-size: 52rpx; display: flex; align-items: center; justify-content: center;
  margin: 20rpx auto 24rpx;
}
.result-row { display: flex; justify-content: space-between; align-items: center; padding: 8rpx 0; }
.result-value { font-size: 36rpx; font-weight: 700; letter-spacing: 0.04em; margin-top: 6rpx; }
.copy { color: #3556d6; font-size: 25rpx; }
.mono { font-variant-numeric: tabular-nums; }
</style>
