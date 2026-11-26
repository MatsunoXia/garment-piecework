<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

import { api } from '../../api';
import { clearAuth, getToken, goHome } from '../../utils/auth';
import { establishSession } from '../../utils/session';
import { toast, toastError } from '../../utils/request';

type Mode = 'invite' | 'rebind';

const mode = ref<Mode>('invite');
const loading = ref(false);

const invitationToken = ref('');
const invitationName = ref('');
const rebindToken = ref('');

onLoad((options) => {
  if (!getToken()) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  if (options?.mode === 'rebind') mode.value = 'rebind';
});

async function finishLogin(): Promise<void> {
  const result = await api.refresh();
  const profile = establishSession(result);

  if (!profile) {
    toast('身份尚未生效，请重新登录');
    clearAuth();
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }

  goHome(profile.role);
}

async function acceptInvitation(): Promise<void> {
  if (!invitationToken.value.trim() || !invitationName.value.trim()) {
    toast('请填写邀请口令和姓名');
    return;
  }
  loading.value = true;
  try {
    await api.acceptAdminInvitation({
      token: invitationToken.value.trim(),
      name: invitationName.value.trim(),
    });
    toast('已加入公司，正在登录…', 'success');
    await finishLogin();
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function rebind(): Promise<void> {
  if (!rebindToken.value.trim()) {
    toast('请输入重新绑定口令');
    return;
  }
  loading.value = true;
  try {
    const result = await api.rebindWechat(rebindToken.value.trim());
    toast(`已绑定员工 ${result.employee.name}，请重新登录`, 'success');
    clearAuth();
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/login/index' });
    }, 1200);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function back(): void {
  uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<template>
  <view class="page">
    <view class="back" @click="back">← 返回身份选择</view>

    <view class="tabs">
      <view class="tab" :class="{ active: mode === 'invite' }" @click="mode = 'invite'">管理员邀请</view>
      <view class="tab" :class="{ active: mode === 'rebind' }" @click="mode = 'rebind'">员工换微信</view>
    </view>

    <view v-if="mode === 'invite'" class="card">
      <view class="card-title">通过邀请口令成为管理员</view>
      <view class="alert info">
        老板或已有管理员在 Web 后台「管理员与邀请」中生成邀请口令后，把口令和姓名填在这里即可加入。
      </view>
      <view class="field">
        <view class="field-label">管理员邀请口令</view>
        <textarea v-model="invitationToken" class="textarea" placeholder="粘贴管理员提供的邀请口令" />
      </view>
      <view class="field">
        <view class="field-label">你的姓名</view>
        <input v-model="invitationName" class="input" maxlength="50" placeholder="管理员姓名" />
      </view>
      <button class="btn primary" :disabled="loading" @click="acceptInvitation">加入公司</button>
    </view>

    <view v-else class="card">
      <view class="card-title">员工微信重新绑定</view>
      <view class="alert warn">
        用于员工更换微信。请向管理员索取一次性口令（默认 30 分钟有效）。绑定成功后原微信将不能再以该员工身份登录。
      </view>
      <view class="field">
        <view class="field-label">重新绑定口令</view>
        <textarea v-model="rebindToken" class="textarea" placeholder="粘贴管理员生成的口令" />
      </view>
      <button class="btn primary" :disabled="loading" @click="rebind">绑定到当前微信</button>
    </view>

    <view class="tip">
      员工加入公司不需要管理员邀请：返回身份选择，选择「我是员工」，填写姓名和公司NO即可。
    </view>
  </view>
</template>

<style scoped>
.back { color: #6b7280; font-size: 25rpx; margin-bottom: 22rpx; }
.tabs { display: flex; background: #fff; border-radius: 16rpx; padding: 8rpx; margin-bottom: 20rpx; }
.tab { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: #6b7280; border-radius: 12rpx; }
.tab.active { background: #eef2ff; color: #3556d6; font-weight: 600; }
.tip { margin-top: 36rpx; color: #9aa1ae; font-size: 23rpx; line-height: 1.6; text-align: center; }
</style>
