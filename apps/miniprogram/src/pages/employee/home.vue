<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import BottomNav from '../../components/BottomNav.vue';
import { api } from '../../api';
import { getProfile, guard } from '../../utils/auth';
import { toastError } from '../../utils/request';

const loading = ref(true);
const data = ref<Awaited<ReturnType<typeof api.myDashboard>> | null>(null);
const profile = getProfile();

onShow(async () => {
  if (!guard('employee')) return;
  loading.value = true;
  try {
    data.value = await api.myDashboard();
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
});

function go(url: string): void {
  uni.navigateTo({ url });
}
</script>

<template>
  <view class="page with-nav">
    <view class="hero">
      <view class="row between">
        <view>
          <view class="hello">你好，{{ data?.employee.name || profile?.name }}</view>
          <view class="company">{{ data?.employee.companyName || profile?.companyName }}</view>
        </view>
        <view class="badge">员工 {{ data?.employee.employeeNo || '' }}</view>
      </view>
      <view class="hero-stats">
        <view class="hero-stat">
          <view class="hero-label">本月计件</view>
          <view class="hero-value">{{ data?.month.quantity ?? 0 }}</view>
        </view>
        <view class="hero-stat">
          <view class="hero-label">本月工资</view>
          <view class="hero-value">¥{{ data?.month.amount ?? '0.00' }}</view>
        </view>
      </view>
    </view>

    <view class="grid-2" style="margin-top: -30rpx">
      <view class="stat-box">
        <view class="stat-label">待审核报工</view>
        <view class="stat-value">{{ data?.pendingReports ?? 0 }}</view>
      </view>
      <view class="stat-box">
        <view class="stat-label">未结算工资</view>
        <view class="stat-value" style="font-size: 32rpx">¥{{ data?.unsettled.amount ?? '0.00' }}</view>
        <view class="muted small">{{ data?.unsettled.styles ?? 0 }} 个款式待结算</view>
      </view>
    </view>

    <view class="card" style="margin-top: 20rpx">
      <view class="card-title">快捷操作</view>
      <view class="quick-grid">
        <view class="quick primary" @click="go('/pages/employee/report')">
          <view class="quick-icon">＋</view>
          <view class="quick-title">去报工</view>
          <view class="quick-sub">选择款式、工序、捆号</view>
        </view>
        <view class="quick" @click="go('/pages/employee/reports')">
          <view class="quick-icon">☰</view>
          <view class="quick-title">我的报工</view>
          <view class="quick-sub">查看进度与审核结果</view>
        </view>
        <view class="quick" @click="go('/pages/employee/wages')">
          <view class="quick-icon">¥</view>
          <view class="quick-title">我的工资</view>
          <view class="quick-sub">按款式查看明细</view>
        </view>
        <view class="quick" @click="go('/pages/employee/disputes')">
          <view class="quick-icon">!</view>
          <view class="quick-title">报工争议</view>
          <view class="quick-sub">归属有误可发起申诉</view>
        </view>
      </view>
    </view>

    <view v-if="(data?.pendingDisputes ?? 0) > 0" class="alert warn">
      你有 {{ data?.pendingDisputes }} 条待处理争议，管理员处理后会更新结果。
    </view>

    <view class="alert info">
      报工数量自动取捆号数量，无需手动输入。同一捆号同一工序只能由一名员工报工。
    </view>

    <BottomNav active="home" />
  </view>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #3556d6, #5b78ea);
  border-radius: 24rpx;
  padding: 32rpx;
  color: #fff;
  margin-bottom: 50rpx;
}
.hello { font-size: 36rpx; font-weight: 700; }
.company { font-size: 24rpx; opacity: 0.85; margin-top: 6rpx; }
.badge { background: rgba(255, 255, 255, 0.2); border-radius: 999rpx; padding: 6rpx 18rpx; font-size: 22rpx; }
.hero-stats { display: flex; margin-top: 30rpx; }
.hero-stat { flex: 1; }
.hero-label { font-size: 22rpx; opacity: 0.8; }
.hero-value { font-size: 40rpx; font-weight: 700; margin-top: 4rpx; }
.quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.quick { background: #f7f8fc; border-radius: 16rpx; padding: 22rpx; }
.quick.primary { background: #eef2ff; }
.quick-icon { font-size: 32rpx; color: #3556d6; }
.quick-title { font-size: 28rpx; font-weight: 600; margin-top: 8rpx; }
.quick-sub { font-size: 22rpx; color: #6b7280; margin-top: 4rpx; }
</style>
