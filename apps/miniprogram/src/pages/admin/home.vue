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
  try { data.value = await api.adminDashboard(); }
  catch (error) { toastError(error); }
  finally { loading.value = false; }
});

function go(url: string): void { uni.navigateTo({ url }); }

async function logout(): Promise<void> {
  if (!(await confirm('退出登录后需要重新登录，是否继续？'))) return;
  clearAuth();
  uni.reLaunch({ url: '/pages/login/index' });
}

async function setWebPassword(): Promise<void> {
  const input = await prompt('设置 Web 管理密码（至少 8 位）', '用于电脑浏览器登录管理后台');
  if (input === null) return;
  if (input.trim().length < 8) { toast('密码至少 8 位'); return; }
  try { const result = await api.setWebPassword(input.trim()); toast(result.message, 'success'); }
  catch (error) { toastError(error); }
}
</script>

<template>
  <view class="page workbench">
    <view class="head">
      <view>
        <view class="company">{{ data?.company.name || profile?.companyName || '管理工作台' }}</view>
        <view class="greeting">管理员 {{ data?.company.adminName || profile?.name || '' }}</view>
      </view>
      <view class="switch" @click="logout">退出</view>
    </view>

    <view class="section-title">待处理</view>
    <view class="tasks">
      <view class="task" @click="go('/pages/admin/review')">
        <view class="task-main">
          <view class="task-name">待审核报工</view>
          <view class="task-hint">查看并批量处理</view>
        </view>
        <view class="task-count">{{ data?.reports.pending ?? 0 }}<text> 条</text></view>
        <view class="chevron">›</view>
      </view>
      <view class="task" @click="go('/pages/admin/disputes')">
        <view class="task-main">
          <view class="task-name">待处理质疑</view>
          <view class="task-hint">核实实际完成人</view>
        </view>
        <view class="task-count" :class="{ urgent: (data?.disputes.pending ?? 0) > 0 }">{{ data?.disputes.pending ?? 0 }}<text> 条</text></view>
        <view class="chevron">›</view>
      </view>
    </view>

    <view class="section-title spaced">常用操作</view>
    <view class="actions">
      <view class="action" @click="go('/pages/admin/proxy')"><text class="action-symbol">＋</text><text>管理员代报</text></view>
      <view class="action" @click="go('/pages/admin/payroll')"><text class="action-symbol">¥</text><text>工资统计</text></view>
      <view class="action" @click="go('/pages/admin/settlement')"><text class="action-symbol">✓</text><text>工资结算</text></view>
    </view>

    <view class="section-title spaced">生产概况</view>
    <view class="production">
      <view class="production-row">
        <view class="production-label">生产中款式</view>
        <view class="production-value">{{ data?.styles.production ?? 0 }}<text> 款</text></view>
      </view>
      <view class="production-row">
        <view class="production-label">待结算员工款式</view>
        <view class="production-value">{{ data?.settlements.pendingPairs ?? 0 }}<text> 项</text></view>
      </view>
    </view>

    <view class="section-title spaced">其他</view>
    <view class="other">
      <view class="other-row" @click="setWebPassword">
        <text>设置 Web 管理密码</text><text class="chevron">›</text>
      </view>
      <view class="other-row" @click="logout">
        <text>退出登录 / 切换身份</text><text class="chevron">›</text>
      </view>
    </view>

    <view v-if="loading" class="loading">正在更新数据…</view>
    <view v-if="data?.recentLogs?.length" class="recent">
      <view class="section-title">最近操作</view>
      <view v-for="log in data.recentLogs.slice(0, 3)" :key="log.id" class="log-row">
        <view class="log-summary">{{ log.summary }}</view>
        <view class="log-time">{{ formatDateTime(log.created_at) }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.workbench { padding-top: 34rpx; padding-bottom: 60rpx; }
.head { display:flex; align-items:center; justify-content:space-between; margin-bottom:44rpx; }
.company { font-size:36rpx; line-height:1.3; font-weight:700; color:#202a28; }
.greeting { margin-top:8rpx; font-size:23rpx; color:#7a8581; }
.switch { color:#65716c; font-size:23rpx; padding:12rpx 0 12rpx 20rpx; }
.section-title { color:#64716b; font-size:23rpx; font-weight:650; margin-bottom:14rpx; }
.spaced { margin-top:36rpx; }
.tasks { background:#fff; border:1rpx solid #e7ede9; border-radius:14rpx; padding:0 22rpx; }
.task { display:flex; align-items:center; padding:23rpx 0; border-bottom:1rpx solid #edf1ee; }
.task:last-child { border-bottom:0; }
.task-main { flex:1; }
.task-name { font-size:29rpx; font-weight:650; color:#202a28; }
.task-hint { margin-top:5rpx; font-size:22rpx; color:#87918c; }
.task-count { font-size:32rpx; font-weight:700; color:#167d75; font-variant-numeric:tabular-nums; }
.task-count text { font-size:21rpx; font-weight:400; color:#7a8581; }
.task-count.urgent { color:#c45b45; }
.chevron { color:#a1aaa5; font-size:34rpx; margin-left:14rpx; }
.actions { display:grid; grid-template-columns:repeat(3,1fr); gap:12rpx; }
.action { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12rpx; background:#fff; border:1rpx solid #e7ede9; border-radius:12rpx; min-height:132rpx; color:#35413b; font-size:23rpx; }
.action-symbol { display:flex; align-items:center; justify-content:center; width:54rpx; height:54rpx; border-radius:12rpx; background:#eaf4f1; color:#167d75; font-size:34rpx; font-weight:600; }
.production,.other { background:#fff; border:1rpx solid #e7ede9; border-radius:12rpx; padding:0 22rpx; }
.production-row,.other-row { display:flex; justify-content:space-between; align-items:center; padding:21rpx 0; border-bottom:1rpx solid #edf1ee; }
.production-row:last-child,.other-row:last-child { border-bottom:0; }
.production-label { color:#68736e; font-size:24rpx; }
.production-value { color:#202a28; font-size:27rpx; font-weight:650; }
.production-value text { color:#7a8581; font-size:21rpx; font-weight:400; }
.other-row { font-size:25rpx; color:#35413b; }
.loading { color:#87918c; font-size:22rpx; text-align:center; padding:18rpx 0; }
.recent { margin-top:34rpx; }
.log-row { padding:14rpx 0; border-bottom:1rpx solid #edf1ee; }
.log-summary { font-size:23rpx; color:#35413b; }
.log-time { margin-top:5rpx; color:#87918c; font-size:20rpx; }
}
</style>
