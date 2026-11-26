<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import BottomNav from '../../components/BottomNav.vue';
import { api } from '../../api';
import type { DisputeRow } from '../../types';
import { guard } from '../../utils/auth';
import { formatDateTime, statusText, toastError, toneClass } from '../../utils/request';

const status = ref<'' | 'pending' | 'resolved' | 'terminated'>('');
const rows = ref<DisputeRow[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);

async function load(reset = false): Promise<void> {
  if (reset) {
    page.value = 1;
    rows.value = [];
  }
  loading.value = true;
  try {
    const result = await api.myDisputes({
      page: page.value,
      pageSize: 20,
      status: status.value || undefined,
    });
    rows.value = reset ? result.items : [...rows.value, ...result.items];
    total.value = result.total;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  if (!guard('employee')) return;
  void load(true);
});

function switchStatus(next: typeof status.value): void {
  status.value = next;
  void load(true);
}

function loadMore(): void {
  if (rows.value.length >= total.value) return;
  page.value += 1;
  void load();
}
</script>

<template>
  <view class="page with-nav">
    <view class="tabs">
      <view class="tab" :class="{ active: status === '' }" @click="switchStatus('')">全部</view>
      <view class="tab" :class="{ active: status === 'pending' }" @click="switchStatus('pending')">处理中</view>
      <view class="tab" :class="{ active: status === 'resolved' }" @click="switchStatus('resolved')">已处理</view>
      <view class="tab" :class="{ active: status === 'terminated' }" @click="switchStatus('terminated')">已终止</view>
    </view>

    <view class="alert info">
      发现某条报工归属不正确时，可在「报工」页点击已被报工的捆号发起争议。管理员只会有三种处理结果：确认原员工、转给质疑员工、驳回原报工。
    </view>

    <view v-if="loading && rows.length === 0" class="empty">加载中…</view>
    <view v-else-if="rows.length === 0" class="empty">暂无争议记录</view>

    <view v-for="row in rows" :key="row.id" class="card">
      <view class="row between">
        <view class="strong">{{ row.report?.style.name || '原报工已删除' }}</view>
        <view class="tag" :class="toneClass(row.status)">{{ statusText(row.status) }}</view>
      </view>
      <view v-if="row.report" class="muted small" style="margin-top: 4rpx">
        {{ row.report.process.name }} · 捆号 {{ row.report.bundle.bundleNo }} · {{ row.report.bundle.quantity }} 件
      </view>
      <view class="divider"></view>
      <view class="row between small">
        <view>原员工：{{ row.originalEmployee.name }}</view>
        <view>质疑员工：{{ row.challenger.name }}</view>
      </view>
      <view v-if="row.reason" class="muted small" style="margin-top: 10rpx">说明：{{ row.reason }}</view>
      <view v-if="row.resultText" class="result">处理结果：{{ row.resultText }}</view>
      <view v-if="row.rejectReason" class="result danger-text">驳回原因：{{ row.rejectReason }}</view>
      <view v-if="row.terminationReason" class="muted small" style="margin-top: 6rpx">{{ row.terminationReason }}</view>
      <view class="muted small" style="margin-top: 10rpx">发起于 {{ formatDateTime(row.createdAt) }}</view>
    </view>

    <view v-if="rows.length < total" class="more" @click="loadMore">
      {{ loading ? '加载中…' : '加载更多' }}
    </view>

    <BottomNav active="reports" />
  </view>
</template>

<style scoped>
.tabs { display: flex; background: #fff; border-radius: 16rpx; padding: 8rpx; margin-bottom: 20rpx; }
.tab { flex: 1; text-align: center; padding: 14rpx 0; font-size: 24rpx; color: #6b7280; border-radius: 12rpx; }
.tab.active { background: #eef2ff; color: #3556d6; font-weight: 600; }
.strong { font-weight: 600; font-size: 30rpx; }
.result { margin-top: 10rpx; font-size: 26rpx; color: #3556d6; }
.danger-text { color: #c92a2a; }
.more { text-align: center; color: #3556d6; font-size: 26rpx; padding: 20rpx 0; }
</style>
