<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import BottomNav from '../../components/BottomNav.vue';
import { api } from '../../api';
import type { WageDetail, WageRow } from '../../types';
import { guard } from '../../utils/auth';
import { formatDateTime, statusText, toastError } from '../../utils/request';

const settled = ref<'' | 'false' | 'true'>('');
const rows = ref<WageRow[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const detail = ref<WageDetail | null>(null);
const detailOpen = ref(false);

const totalAmount = computed(() =>
  rows.value.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2),
);

async function load(reset = false): Promise<void> {
  if (reset) {
    page.value = 1;
    rows.value = [];
  }
  loading.value = true;
  try {
    const result = await api.myWages({
      page: page.value,
      pageSize: 20,
      settled: settled.value || undefined,
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

function switchSettled(next: typeof settled.value): void {
  settled.value = next;
  void load(true);
}

function loadMore(): void {
  if (rows.value.length >= total.value) return;
  page.value += 1;
  void load();
}

async function openDetail(row: WageRow): Promise<void> {
  try {
    detail.value = await api.myWageDetail(row.styleId);
    detailOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page with-nav">
    <view class="summary">
      <view class="muted small">当前列表工资合计</view>
      <view class="summary-amount">¥{{ totalAmount }}</view>
      <view class="muted small">只统计审核通过的报工，按当前工价计算</view>
    </view>

    <view class="tabs">
      <view class="tab" :class="{ active: settled === '' }" @click="switchSettled('')">全部</view>
      <view class="tab" :class="{ active: settled === 'false' }" @click="switchSettled('false')">未结算</view>
      <view class="tab" :class="{ active: settled === 'true' }" @click="switchSettled('true')">已结算</view>
    </view>

    <view v-if="loading && rows.length === 0" class="empty">加载中…</view>
    <view v-else-if="rows.length === 0" class="empty">暂无工资记录</view>

    <view v-for="row in rows" :key="row.styleId" class="card" @click="openDetail(row)">
      <view class="row between">
        <view class="strong">{{ row.styleName }}</view>
        <view class="tag" :class="row.settled ? 'green' : 'orange'">{{ row.settled ? '已结算' : '未结算' }}</view>
      </view>
      <view class="muted small" style="margin-top: 4rpx">{{ row.styleNo }} · {{ statusText(row.styleStatus) }}</view>
      <view class="divider"></view>
      <view class="row between">
        <view>
          <view class="muted small">计件数量</view>
          <view class="qty">{{ row.quantity }} 件</view>
        </view>
        <view class="right">
          <view class="muted small">应发工资</view>
          <view class="money">¥{{ row.amount }}</view>
        </view>
      </view>
      <view v-if="row.settled" class="muted small" style="margin-top: 10rpx">
        已登记结算 ¥{{ row.settledAmount }}（{{ formatDateTime(row.settledAt) }}）
      </view>
      <view class="detail-link">查看工序与报工明细 ›</view>
    </view>

    <view v-if="rows.length < total" class="more" @click="loadMore">
      {{ loading ? '加载中…' : '加载更多' }}
    </view>

    <view v-if="detailOpen" class="overlay" @click.self="detailOpen = false">
      <view class="sheet">
        <view class="sheet-title">{{ detail?.style.name }} · 工资明细</view>
        <view class="alert info">
          合计 {{ detail?.totalQuantity }} 件 / <text style="font-weight: 700">¥{{ detail?.totalAmount }}</text>
        </view>

        <view class="section-title">工序汇总</view>
        <view v-for="process in detail?.processes ?? []" :key="process.styleProcessId" class="line">
          <view>{{ process.processName }}</view>
          <view class="muted small">{{ process.quantity }} 件 × ¥{{ process.unitPrice }}</view>
          <view class="amount">¥{{ process.amount }}</view>
        </view>

        <view class="section-title">报工明细</view>
        <view v-for="report in detail?.reports ?? []" :key="report.reportId" class="line">
          <view>{{ report.processName }} · 捆号 {{ report.bundleNo }}</view>
          <view class="muted small">{{ report.quantity }} 件 × ¥{{ report.unitPrice }}</view>
          <view class="amount">¥{{ report.amount }}</view>
        </view>

        <view v-if="detail?.settlement" class="alert warn" style="margin-top: 20rpx">
          已结算 ¥{{ detail.settlement.totalAmount }}（{{ statusText(detail.settlement.paymentMethod) }}）。
          如工价调整，系统金额会更新，实际已发放金额请与管理员核对。
        </view>

        <button class="btn ghost" style="margin-top: 20rpx" @click="detailOpen = false">关闭</button>
      </view>
    </view>

    <BottomNav active="wages" />
  </view>
</template>

<style scoped>
.summary { background: linear-gradient(160deg, #3556d6, #5b78ea); color: #fff; border-radius: 24rpx; padding: 30rpx; margin-bottom: 20rpx; }
.summary .muted { color: rgba(255, 255, 255, 0.8); }
.summary-amount { font-size: 52rpx; font-weight: 700; margin: 8rpx 0; }
.tabs { display: flex; background: #fff; border-radius: 16rpx; padding: 8rpx; margin-bottom: 20rpx; }
.tab { flex: 1; text-align: center; padding: 14rpx 0; font-size: 24rpx; color: #6b7280; border-radius: 12rpx; }
.tab.active { background: #eef2ff; color: #3556d6; font-weight: 600; }
.strong { font-weight: 600; font-size: 30rpx; }
.qty { font-size: 32rpx; font-weight: 700; }
.money { font-size: 36rpx; font-weight: 700; color: #3556d6; }
.detail-link { color: #3556d6; font-size: 24rpx; margin-top: 14rpx; }
.more { text-align: center; color: #3556d6; font-size: 26rpx; padding: 20rpx 0; }
.section-title { font-size: 28rpx; font-weight: 600; margin: 24rpx 0 10rpx; }
.line { display: grid; grid-template-columns: 1fr auto; padding: 14rpx 0; border-bottom: 1rpx solid #eef0f4; font-size: 26rpx; }
.line .muted { grid-column: 1; }
.line .amount { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-weight: 600; }
</style>
