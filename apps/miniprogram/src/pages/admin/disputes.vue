<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import type { DisputeRow } from '../../types';
import { guard } from '../../utils/auth';
import { confirm, formatDateTime, prompt, statusText, toast, toastError, toneClass } from '../../utils/request';

const status = ref<'' | 'pending' | 'resolved' | 'terminated'>('pending');
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
    const result = await api.adminDisputes({
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
  if (!guard('admin')) return;
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

async function resolve(row: DisputeRow, result: 'confirm_original' | 'confirm_challenger' | 'reject_original_report'): Promise<void> {
  let reason: string | undefined;

  if (result === 'reject_original_report') {
    const input = await prompt('驳回原报工必须填写原因', '例如：原员工与质疑员工都不是实际完成人');
    if (input === null) return;
    if (input.trim().length < 2) {
      toast('请填写至少 2 个字的原因');
      return;
    }
    reason = input.trim();
  } else {
    const text =
      result === 'confirm_challenger'
        ? `确认实际完成人是「${row.challenger.name}」，把报工转给该员工？`
        : `确认原员工「${row.originalEmployee.name}」就是实际完成人？`;
    if (!(await confirm(text))) return;
  }

  try {
    const response = await api.resolveDispute(row.id, result, reason);
    toast(response.message);
    await load(true);
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page">
    <view class="tabs">
      <view class="tab" :class="{ active: status === 'pending' }" @click="switchStatus('pending')">待处理</view>
      <view class="tab" :class="{ active: status === 'resolved' }" @click="switchStatus('resolved')">已处理</view>
      <view class="tab" :class="{ active: status === 'terminated' }" @click="switchStatus('terminated')">已终止</view>
      <view class="tab" :class="{ active: status === '' }" @click="switchStatus('')">全部</view>
    </view>

    <view class="alert info">
      只有三种处理结果：确认原员工、转给质疑员工、驳回原报工。只有确认两人都不是实际完成人时，才驳回原报工。
    </view>

    <view v-if="loading && rows.length === 0" class="empty">加载中…</view>
    <view v-else-if="rows.length === 0" class="empty">暂无争议</view>

    <view v-for="row in rows" :key="row.id" class="card">
      <view class="row between">
        <view class="style-name">{{ row.report?.style.name || '原报工已删除' }}</view>
        <view class="tag" :class="toneClass(row.status)">{{ statusText(row.status) }}</view>
      </view>
      <view v-if="row.report" class="muted small" style="margin-top: 4rpx">
        {{ row.report.process.name }} · 捆号 {{ row.report.bundle.bundleNo }} · {{ row.report.bundle.quantity }} 件
      </view>

      <view class="people">
        <view class="person">
          <view class="muted small">原员工</view>
          <view class="person-name">{{ row.originalEmployee.name }}</view>
        </view>
        <view class="vs">vs</view>
        <view class="person">
          <view class="muted small">质疑员工</view>
          <view class="person-name">{{ row.challenger.name }}</view>
        </view>
      </view>

      <view v-if="row.reason" class="muted small">说明：{{ row.reason }}</view>
      <view v-if="row.resultText" class="result">处理结果：{{ row.resultText }}</view>
      <view class="muted small" style="margin-top: 8rpx">发起于 {{ formatDateTime(row.createdAt) }}</view>

      <view v-if="row.status === 'pending'" class="actions">
        <button class="btn ghost sm" @click="resolve(row, 'confirm_original')">确认原员工</button>
        <button class="btn primary sm" @click="resolve(row, 'confirm_challenger')">转给质疑员工</button>
        <button class="btn danger sm" @click="resolve(row, 'reject_original_report')">驳回原报工</button>
      </view>
    </view>

    <view v-if="rows.length < total" class="more" @click="loadMore">
      {{ loading ? '加载中…' : '加载更多' }}
    </view>
  </view>
</template>

<style scoped>
.tabs { display: flex; background: #fff; border-radius: 16rpx; padding: 8rpx; margin-bottom: 20rpx; }
.tab { flex: 1; text-align: center; padding: 14rpx 0; font-size: 24rpx; color: #6b7280; border-radius: 12rpx; }
.tab.active { background: #eef2ff; color: #3556d6; font-weight: 600; }
.style-name { font-size: 30rpx; font-weight: 700; }
.people { display: flex; align-items: center; background: #f7f8fc; border-radius: 14rpx; padding: 18rpx; margin: 16rpx 0; }
.person { flex: 1; text-align: center; }
.person-name { font-size: 28rpx; font-weight: 600; margin-top: 4rpx; }
.vs { color: #9aa1ae; font-size: 22rpx; }
.result { color: #3556d6; font-size: 26rpx; margin-top: 8rpx; }
.actions { display: flex; gap: 12rpx; margin-top: 20rpx; flex-wrap: wrap; }
.actions .btn { flex: 1; min-width: 180rpx; }
.more { text-align: center; color: #3556d6; font-size: 26rpx; padding: 20rpx 0; }
</style>
