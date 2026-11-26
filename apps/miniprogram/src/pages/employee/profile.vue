<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import BottomNav from '../../components/BottomNav.vue';
import { api } from '../../api';
import { clearAuth, guard } from '../../utils/auth';
import { confirm, toastError } from '../../utils/request';

const profile = ref<Awaited<ReturnType<typeof api.myProfile>> | null>(null);

async function load(): Promise<void> {
  try {
    profile.value = await api.myProfile();
  } catch (error) {
    toastError(error);
  }
}

onShow(() => {
  if (!guard('employee')) return;
  void load();
});

function go(url: string): void {
  uni.navigateTo({ url });
}

async function logout(): Promise<void> {
  const ok = await confirm('退出后需要重新登录，是否继续？');
  if (!ok) return;
  clearAuth();
  uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<template>
  <view class="page with-nav">
    <view class="profile-head">
      <view class="avatar">{{ (profile?.name || '员').slice(0, 1) }}</view>
      <view>
        <view class="name">{{ profile?.name }}</view>
        <view class="muted small">{{ profile?.companyName }} · 员工编号 {{ profile?.employeeNo }}</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">所属车间</view>
      <view v-if="(profile?.workshops.length ?? 0) === 0" class="muted small">
        尚未分配车间。请联系管理员分配，否则只能参与「全公司」范围的款式。
      </view>
      <view v-else>
        <text v-for="workshop in profile?.workshops ?? []" :key="workshop.id" class="chip">{{ workshop.name }}</text>
      </view>
      <view class="muted small" style="margin-top: 8rpx">
        车间决定你能参与哪些款式的生产，由管理员在小程序或 Web 后台调整。
      </view>
    </view>

    <view class="card">
      <view class="menu" @click="go('/pages/employee/reports')">
        <text>我的报工</text><text class="arrow">›</text>
      </view>
      <view class="menu" @click="go('/pages/employee/wages')">
        <text>我的工资</text><text class="arrow">›</text>
      </view>
      <view class="menu" @click="go('/pages/employee/disputes')">
        <text>我的争议</text><text class="arrow">›</text>
      </view>
      <view class="menu" @click="go('/pages/join/index?mode=rebind')">
        <text>重新绑定微信</text><text class="arrow">›</text>
      </view>
    </view>

    <view class="card">
      <view class="menu" @click="logout">
        <text style="color: #c92a2a">退出登录 / 切换身份</text><text class="arrow">›</text>
      </view>
    </view>

    <view class="muted small" style="text-align: center; margin-top: 20rpx">
      结算表示工资已由管理员在线下发放并登记，系统不执行实际支付。
    </view>

    <BottomNav active="profile" />
  </view>
</template>

<style scoped>
.profile-head { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 8rpx 32rpx; }
.avatar {
  width: 108rpx; height: 108rpx; border-radius: 50%; background: #3556d6; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 44rpx; font-weight: 700;
}
.name { font-size: 36rpx; font-weight: 700; }
.menu { display: flex; justify-content: space-between; align-items: center; padding: 26rpx 0; border-bottom: 1rpx solid #eef0f4; font-size: 28rpx; }
.menu:last-child { border-bottom: none; }
.arrow { color: #9aa1ae; font-size: 36rpx; }
</style>
