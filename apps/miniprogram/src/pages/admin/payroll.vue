<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import type { WageDetail } from '../../types';
import { guard } from '../../utils/auth';
import { formatDateTime, statusText, toastError } from '../../utils/request';

interface StyleOption {
  id: string;
  styleNo: string;
  name: string;
  status: string;
}

interface SummaryRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  quantity: number;
  amount: string;
  settled: boolean;
  settledAmount: string | null;
  difference: string | null;
}

const styles = ref<StyleOption[]>([]);
const styleIndex = ref(-1);
const rows = ref<SummaryRow[]>([]);
const loading = ref(false);
const detail = ref<WageDetail | null>(null);
const detailOpen = ref(false);

const selectedStyle = computed(() => (styleIndex.value >= 0 ? styles.value[styleIndex.value] : null));
const totalAmount = computed(() => rows.value.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2));
const totalQuantity = computed(() => rows.value.reduce((sum, row) => sum + row.quantity, 0));

onShow(async () => {
  if (!guard('admin')) return;
  try {
    const result = await api.adminStyles();
    styles.value = result.items;
  } catch (error) {
    toastError(error);
  }
});

async function onStyleChange(event: { detail: { value: number | string } }): Promise<void> {
  styleIndex.value = Number(event.detail.value);
  rows.value = [];
  const style = selectedStyle.value;
  if (!style) return;
  loading.value = true;
  try {
    rows.value = await api.payrollByStyle(style.id);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function openDetail(row: SummaryRow): Promise<void> {
  const style = selectedStyle.value;
  if (!style) return;
  try {
    detail.value = await api.payrollDetail(row.employeeId, style.id);
    detailOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <view class="page">
    <view class="card">
      <view class="field" style="margin-bottom: 0">
        <view class="field-label">选择款式</view>
        <picker :range="styles" range-key="name" @change="onStyleChange">
          <view class="picker-box">
            <text>{{ selectedStyle ? `${selectedStyle.name}（${selectedStyle.styleNo}）` : '请选择款式' }}</text>
            <text class="muted">›</text>
          </view>
        </picker>
      </view>
    </view>

    <view v-if="selectedStyle" class="summary">
      <view class="grid-2">
        <view>
          <view class="muted small">参与员工</view>
          <view class="summary-value">{{ rows.length }}</view>
        </view>
        <view>
          <view class="muted small">计件总数</view>
          <view class="summary-value">{{ totalQuantity }}</view>
        </view>
        <view>
          <view class="muted small">工资合计</view>
          <view class="summary-value">¥{{ totalAmount }}</view>
        </view>
        <view>
          <view class="muted small">未结算人数</view>
          <view class="summary-value">{{ rows.filter((r) => !r.settled).length }}</view>
        </view>
      </view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="selectedStyle && rows.length === 0" class="empty">该款式暂无已审核报工</view>

    <view v-for="row in rows" :key="row.employeeId" class="card" @click="openDetail(row)">
      <view class="row between">
        <view>
          <view class="name">{{ row.name }}</view>
          <view class="muted small">{{ row.employeeNo }} · {{ row.quantity }} 件</view>
        </view>
        <view class="right">
          <view class="money">¥{{ row.amount }}</view>
          <view class="tag" :class="row.settled ? 'green' : 'orange'">{{ row.settled ? '已结算' : '未结算' }}</view>
        </view>
      </view>
      <view v-if="row.settled && row.settledAmount" class="muted small" style="margin-top: 8rpx">
        系统结算 ¥{{ row.settledAmount }}<text v-if="row.difference !== '0.00'">，差额 ¥{{ row.difference }}</text>
      </view>
    </view>

    <view v-if="detailOpen" class="overlay" @click.self="detailOpen = false">
      <view class="sheet">
        <view class="sheet-title">{{ detail?.employee.name }} · {{ detail?.style.name }}</view>
        <view class="alert info">合计 {{ detail?.totalQuantity }} 件 / <text style="font-weight:700">¥{{ detail?.totalAmount }}</text></view>

        <view class="section-title">工序汇总</view>
        <view v-for="process in detail?.processes ?? []" :key="process.styleProcessId" class="line">
          <view>{{ process.processName }}</view>
          <view class="muted small">{{ process.quantity }} 件 × ¥{{ process.unitPrice }}</view>
          <view class="amount">¥{{ process.amount }}</view>
        </view>

        <view class="section-title">报工明细</view>
        <view v-for="report in detail?.reports ?? []" :key="report.reportId" class="line">
          <view>{{ report.processName }} · 捆号 {{ report.bundleNo }}</view>
          <view class="muted small">{{ report.quantity }} 件 × ¥{{ report.unitPrice }} · {{ formatDateTime(report.reportedAt) }}</view>
          <view class="amount">¥{{ report.amount }}</view>
        </view>

        <view v-if="detail?.settlement" class="alert warn" style="margin-top: 20rpx">
          已结算 ¥{{ detail.settlement.totalAmount }}（{{ statusText(detail.settlement.paymentMethod) }}，{{ formatDateTime(detail.settlement.settledAt) }}）
        </view>

        <button class="btn ghost" style="margin-top: 20rpx" @click="detailOpen = false">关闭</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.summary { background: linear-gradient(160deg, #2f4fc9, #5b78ea); color: #fff; border-radius: 20rpx; padding: 26rpx; margin-bottom: 20rpx; }
.summary .muted { color: rgba(255, 255, 255, 0.8); }
.summary-value { font-size: 36rpx; font-weight: 700; margin-top: 4rpx; }
.name { font-size: 30rpx; font-weight: 600; }
.money { font-size: 34rpx; font-weight: 700; color: #3556d6; }
.section-title { font-size: 28rpx; font-weight: 600; margin: 24rpx 0 10rpx; }
.line { display: grid; grid-template-columns: 1fr auto; padding: 14rpx 0; border-bottom: 1rpx solid #eef0f4; font-size: 26rpx; }
.line .muted { grid-column: 1; }
.line .amount { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-weight: 600; }
</style>
