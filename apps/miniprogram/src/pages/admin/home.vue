<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import { clearAuth, getProfile, guard } from '../../utils/auth';
import { confirm, formatDateTime, prompt, toast, toastError } from '../../utils/request';

const data = ref<Awaited<ReturnType<typeof api.adminDashboard>> | null>(null);
const loading = ref(true);
const profile = getProfile();

onShow(async () => {
  if (!guard('admin')) return;
  loading.value = true;
  try {
    data.value = await api.adminDashboard();
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
});

function go(url: string): void {
  uni.navigateTo({ url });
}

async function logout(): Promise<void> {
  const ok = await confirm('退出登录后需要重新扫码/微信登录，是否继续？');
  if (!ok) return;
  clearAuth();
  uni.reLaunch({ url: '/pages/login/index' });
}

async function setWebPassword(): Promise<void> {
  const input = await prompt('设置 Web 管理密码（至少 8 位）', '用于电脑浏览器登录管理后台');
  if (input === null) return;
  if (input.trim().length < 8) {
    toast('密码至少 8 位');
    return;
  }
  try {
    const result = await api.setWebPassword(input.trim());
    toast(result.message, 'success');
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page">
    <view class="hero">
      <view class="row between">
        <view>
          <view class="hello">{{ data?.company.name || profile?.companyName }}</view>
          <view class="sub">管理员 {{ data?.company.adminName || profile?.name }}</view>
        </view>
        <view class="switch" @click="logout">切换身份</view>
      </view>
    </view>

    <view class="grid-2" style="margin-top: -30rpx">
      <view class="stat-box" @click="go('/pages/admin/review')">
        <view class="stat-label">待审核报工</view>
        <view class="stat-value">{{ data?.reports.pending ?? 0 }}</view>
        <view class="muted small">今日通过 {{ data?.reports.todayApproved ?? 0 }} 条</view>
      </view>
      <view class="stat-box" @click="go('/pages/admin/disputes')">
        <view class="stat-label">待处理争议</view>
        <view class="stat-value">{{ data?.disputes.pending ?? 0 }}</view>
        <view class="muted small">未处理会阻止款式完成</view>
      </view>
      <view class="stat-box">
        <view class="stat-label">待结算金额</view>
        <view class="stat-value" style="font-size: 32rpx">¥{{ data?.settlements.pendingAmount ?? '0.00' }}</view>
        <view class="muted small">{{ data?.settlements.pendingPairs ?? 0 }} 个员工款式待结算</view>
      </view>
      <view class="stat-box">
        <view class="stat-label">生产中款式</view>
        <view class="stat-value">{{ data?.styles.production ?? 0 }}</view>
        <view class="muted small">已完成 {{ data?.styles.completed ?? 0 }}</view>
      </view>
    </view>

    <view class="card" style="margin-top: 20rpx">
      <view class="card-title">管理工作</view>
      <view class="menu" @click="go('/pages/admin/review')">
        <view>
          <view class="menu-title">报工审核</view>
          <view class="muted small">批量通过 / 驳回，突出款式、工序、捆号</view>
        </view>
        <view class="arrow">›</view>
      </view>
      <view class="menu" @click="go('/pages/admin/disputes')">
        <view>
          <view class="menu-title">争议处理</view>
          <view class="muted small">确认原员工 / 转给质疑员工 / 驳回原报工</view>
        </view>
        <view class="arrow">›</view>
      </view>
      <view class="menu" @click="go('/pages/admin/proxy')">
        <view>
          <view class="menu-title">管理员代报</view>
          <view class="muted small">代员工报工，提交后立即通过</view>
        </view>
        <view class="arrow">›</view>
      </view>
      <view class="menu" @click="go('/pages/admin/payroll')">
        <view>
          <view class="menu-title">工资统计</view>
          <view class="muted small">按款式查看员工工资与工序明细</view>
        </view>
        <view class="arrow">›</view>
      </view>
      <view class="menu" @click="go('/pages/admin/settlement')">
        <view>
          <view class="menu-title">工资结算</view>
          <view class="muted small">登记线下已发放工资（员工+款式）</view>
        </view>
        <view class="arrow">›</view>
      </view>
      <view class="menu" @click="setWebPassword">
        <view>
          <view class="menu-title">设置 Web 管理密码</view>
          <view class="muted small">用于电脑浏览器登录管理后台（仅创始管理员）</view>
        </view>
        <view class="arrow">›</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">最近操作</view>
      <view v-if="(data?.recentLogs.length ?? 0) === 0" class="muted small">暂无记录</view>
      <view v-for="log in data?.recentLogs ?? []" :key="log.id" class="log">
        <view class="log-text">{{ log.summary }}</view>
        <view class="muted small">{{ formatDateTime(log.created_at) }}</view>
      </view>
    </view>

    <view class="alert info">
      工价修改、结算修正等复杂管理建议使用 Web 管理后台；小程序保留日常审核、争议和结算能力。
    </view>
  </view>
</template>

<style scoped>
.hero { background: linear-gradient(160deg, #2f4fc9, #5b78ea); color: #fff; border-radius: 24rpx; padding: 32rpx; margin-bottom: 50rpx; }
.hello { font-size: 36rpx; font-weight: 700; }
.sub { font-size: 24rpx; opacity: 0.85; margin-top: 6rpx; }
.switch { font-size: 22rpx; background: rgba(255, 255, 255, 0.18); padding: 8rpx 18rpx; border-radius: 999rpx; }
.menu { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid #eef0f4; }
.menu:last-child { border-bottom: none; }
.menu-title { font-size: 30rpx; font-weight: 600; }
.arrow { color: #9aa1ae; font-size: 38rpx; }
.log { padding: 16rpx 0; border-bottom: 1rpx solid #eef0f4; }
.log:last-child { border-bottom: none; }
.log-text { font-size: 26rpx; line-height: 1.5; }
</style>
