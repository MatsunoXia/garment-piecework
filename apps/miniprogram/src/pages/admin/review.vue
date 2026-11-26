<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import { guard } from '../../utils/auth';
import { confirm, formatDateTime, prompt, toast, toastError } from '../../utils/request';

interface PendingReport {
  id: string;
  status: string;
  source: string;
  reportedAt: string;
  style: { name: string; styleNo: string };
  process: { name: string; unitPrice: string };
  bundle: { bundleNo: number; quantity: number; size: string | null };
  employee: { name: string; employeeNo: string };
}

const rows = ref<PendingReport[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const selected = ref<string[]>([]);
const allChecked = computed(() => rows.value.length > 0 && selected.value.length === rows.value.length);

async function load(reset = false): Promise<void> {
  if (reset) {
    page.value = 1;
    rows.value = [];
    selected.value = [];
  }
  loading.value = true;
  try {
    const result = await api.pendingReports({ page: page.value, pageSize: 20 });
    rows.value = reset ? result.items : [...rows.value, ...result.items];
    total.value = result.total;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  if (!guard('admin')) return;
  void load(true);
});

function toggle(id: string): void {
  const index = selected.value.indexOf(id);
  if (index >= 0) selected.value.splice(index, 1);
  else selected.value.push(id);
}

function toggleAll(): void {
  selected.value = allChecked.value ? [] : rows.value.map((item) => item.id);
}

function loadMore(): void {
  if (rows.value.length >= total.value) return;
  page.value += 1;
  void load();
}

async function approve(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    toast('请先勾选报工');
    return;
  }
  if (!(await confirm(`确认通过 ${ids.length} 条报工？`, '批量通过'))) return;
  try {
    const result = await api.batchReview(ids, 'approve');
    toast(`通过 ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ''}`);
    await load(true);
  } catch (error) {
    toastError(error);
  }
}

async function reject(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    toast('请先勾选报工');
    return;
  }
  const reason = await prompt('请填写驳回原因（必填）', '例如：该捆由他人完成');
  if (reason === null) return;
  if (reason.trim().length < 2) {
    toast('驳回原因至少 2 个字');
    return;
  }
  try {
    const result = await api.batchReview(ids, 'reject', reason.trim());
    toast(`驳回 ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ''}`);
    await load(true);
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page review-page">
    <view class="card top-bar">
      <view class="row between">
        <view class="row" @click="toggleAll">
          <view class="checkbox" :class="{ checked: allChecked }">{{ allChecked ? '✓' : '' }}</view>
          <text class="small">全选本页</text>
        </view>
        <text class="muted small">待审核 {{ total }} 条</text>
      </view>
    </view>

    <view v-if="loading && rows.length === 0" class="empty">加载中…</view>
    <view v-else-if="rows.length === 0" class="empty">没有待审核报工 🎉</view>

    <view v-for="row in rows" :key="row.id" class="card report">
      <view class="row between">
        <view class="row" @click="toggle(row.id)">
          <view class="checkbox" :class="{ checked: selected.includes(row.id) }">
            {{ selected.includes(row.id) ? '✓' : '' }}
          </view>
          <view class="style-name">{{ row.style.name }}</view>
        </view>
        <view class="tag" :class="row.source === 'admin_proxy' ? 'blue' : ''">
          {{ row.source === 'admin_proxy' ? '代报' : '员工报工' }}
        </view>
      </view>
      <view class="muted small" style="margin-left: 52rpx">{{ row.style.styleNo }}</view>

      <view class="highlight">
        <view class="hi-item">
          <view class="hi-label">工序</view>
          <view class="hi-value">{{ row.process.name }}</view>
          <view class="muted small">¥{{ row.process.unitPrice }}/件</view>
        </view>
        <view class="hi-item">
          <view class="hi-label">捆号</view>
          <view class="hi-value">#{{ row.bundle.bundleNo }}</view>
          <view class="muted small">{{ row.bundle.size || '均码' }} · {{ row.bundle.quantity }} 件</view>
        </view>
        <view class="hi-item">
          <view class="hi-label">员工</view>
          <view class="hi-value">{{ row.employee.name }}</view>
          <view class="muted small">{{ row.employee.employeeNo }}</view>
        </view>
      </view>

      <view class="muted small">报工时间 {{ formatDateTime(row.reportedAt) }}</view>

      <view class="row gap" style="margin-top: 18rpx">
        <button class="btn primary sm" style="flex: 1" @click="approve([row.id])">通过</button>
        <button class="btn danger sm" style="flex: 1" @click="reject([row.id])">驳回</button>
      </view>
    </view>

    <view v-if="rows.length < total" class="more" @click="loadMore">
      {{ loading ? '加载中…' : '加载更多' }}
    </view>

    <view v-if="selected.length > 0" class="batch-bar">
      <view class="muted small">已选 {{ selected.length }} 条</view>
      <view class="row gap">
        <button class="btn danger sm" @click="reject(selected)">批量驳回</button>
        <button class="btn primary sm" @click="approve(selected)">批量通过</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.review-page { padding-bottom: 160rpx; }
.top-bar { padding: 18rpx 24rpx; }
.checkbox {
  width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid #d5d9e2;
  margin-right: 14rpx; display: flex; align-items: center; justify-content: center;
  font-size: 24rpx; color: #fff; flex-shrink: 0;
}
.checkbox.checked { background: #3556d6; border-color: #3556d6; }
.style-name { font-size: 30rpx; font-weight: 700; }
.highlight { display: flex; background: #f7f8fc; border-radius: 14rpx; padding: 18rpx; margin: 16rpx 0; }
.hi-item { flex: 1; }
.hi-label { font-size: 22rpx; color: #6b7280; }
.hi-value { font-size: 30rpx; font-weight: 700; margin: 4rpx 0; }
.gap { gap: 16rpx; }
.more { text-align: center; color: #3556d6; font-size: 26rpx; padding: 20rpx 0; }
.batch-bar {
  position: fixed; left: 0; right: 0; bottom: 0; background: #fff;
  display: flex; justify-content: space-between; align-items: center;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 20rpx rgba(16, 24, 40, 0.08);
}
</style>
