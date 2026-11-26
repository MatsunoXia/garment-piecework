<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import BottomNav from '../../components/BottomNav.vue';
import { api } from '../../api';
import type { MyReport } from '../../types';
import { guard } from '../../utils/auth';
import { confirm, formatDateTime, statusText, toast, toastError, toneClass } from '../../utils/request';

const status = ref<'' | 'pending' | 'approved' | 'rejected'>('');
const rows = ref<MyReport[]>([]);
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
    const result = await api.myReports({
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

async function remove(row: MyReport): Promise<void> {
  const ok = await confirm('确认删除这条报工？已进入结算的报工不能删除。');
  if (!ok) return;
  try {
    const result = await api.deleteReport(row.id);
    toast(result.message);
    await load(true);
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page with-nav">
    <view class="tabs">
      <view class="tab" :class="{ active: status === '' }" @click="switchStatus('')">全部</view>
      <view class="tab" :class="{ active: status === 'pending' }" @click="switchStatus('pending')">待审核</view>
      <view class="tab" :class="{ active: status === 'approved' }" @click="switchStatus('approved')">已通过</view>
      <view class="tab" :class="{ active: status === 'rejected' }" @click="switchStatus('rejected')">已驳回</view>
    </view>

    <view v-if="loading && rows.length === 0" class="empty">加载中…</view>
    <view v-else-if="rows.length === 0" class="empty">暂无报工记录，去「报工」页提交吧</view>

    <view v-for="row in rows" :key="row.id" class="card">
      <view class="row between">
        <view class="strong">{{ row.style.name }}</view>
        <view class="tag" :class="toneClass(row.status)">{{ statusText(row.status) }}</view>
      </view>
      <view class="muted small" style="margin-top: 4rpx">{{ row.style.styleNo }} · {{ statusText(row.source) }}</view>
      <view class="divider"></view>
      <view class="row between">
        <view>
          <view class="proc">{{ row.process.name }}</view>
          <view class="muted small">捆号 {{ row.bundle.bundleNo }} · {{ row.bundle.size || '均码' }}</view>
        </view>
        <view class="right">
          <view class="qty">{{ row.bundle.quantity }} 件</view>
          <view class="muted small">¥{{ row.process.unitPrice }}/件</view>
        </view>
      </view>
      <view v-if="row.rejectReason" class="alert danger" style="margin: 16rpx 0 0">
        驳回原因：{{ row.rejectReason }}
      </view>
      <view v-if="row.operatorRemark" class="muted small" style="margin-top: 8rpx">
        代报备注：{{ row.operatorRemark }}
      </view>
      <view class="row between" style="margin-top: 16rpx">
        <view class="muted small">{{ formatDateTime(row.reportedAt) }}</view>
        <button class="btn sm danger" @click="remove(row)">删除</button>
      </view>
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
.proc { font-size: 28rpx; font-weight: 600; }
.qty { font-size: 32rpx; font-weight: 700; }
.more { text-align: center; color: #3556d6; font-size: 26rpx; padding: 20rpx 0; }
</style>
