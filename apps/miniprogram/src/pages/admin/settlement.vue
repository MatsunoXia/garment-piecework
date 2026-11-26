<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import { guard } from '../../utils/auth';
import { toast, toastError } from '../../utils/request';

interface StyleOption {
  id: string;
  styleNo: string;
  name: string;
  status: string;
}

interface PendingRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  quantity: number;
  amount: string;
}

const styles = ref<StyleOption[]>([]);
const styleIndex = ref(-1);
const rows = ref<PendingRow[]>([]);
const styleStatus = ref('');
const loading = ref(false);

const sheetOpen = ref(false);
const target = ref<PendingRow | null>(null);
const paymentMethod = ref('cash');
const remark = ref('');
const submitting = ref(false);

const methods = [
  { value: 'cash', label: '现金' },
  { value: 'wechat_transfer', label: '微信转账' },
  { value: 'other', label: '其他' },
];

const selectedStyle = computed(() => (styleIndex.value >= 0 ? styles.value[styleIndex.value] : null));

onShow(async () => {
  if (!guard('admin')) return;
  try {
    const result = await api.adminStyles();
    styles.value = result.items.filter((item) => item.status === 'completed' || item.status === 'settled');
  } catch (error) {
    toastError(error);
  }
});

async function onStyleChange(event: { detail: { value: number | string } }): Promise<void> {
  styleIndex.value = Number(event.detail.value);
  rows.value = [];
  styleStatus.value = '';
  const style = selectedStyle.value;
  if (!style) return;
  loading.value = true;
  try {
    const result = await api.pendingSettlements(style.id);
    rows.value = result.items;
    styleStatus.value = result.style.status;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function openSettle(row: PendingRow): void {
  target.value = row;
  paymentMethod.value = 'cash';
  remark.value = '';
  sheetOpen.value = true;
}

async function submit(): Promise<void> {
  if (!target.value || !selectedStyle.value) return;
  submitting.value = true;
  try {
    const result = await api.createSettlement({
      employeeId: target.value.employeeId,
      styleId: selectedStyle.value.id,
      paymentMethod: paymentMethod.value,
      remark: remark.value.trim() || undefined,
    });
    toast(`已登记结算 ¥${result.totalAmount}`, 'success');
    if (result.styleSettled) toast('该款全部员工已结算，款式进入已结算状态');
    sheetOpen.value = false;
    const refreshed = await api.pendingSettlements(selectedStyle.value.id);
    rows.value = refreshed.items;
    styleStatus.value = refreshed.style.status;
  } catch (error) {
    toastError(error);
  } finally {
    submitting.value = false;
  }
}

function pickMethod(value: string): void {
  paymentMethod.value = value;
}
</script>

<template>
  <view class="page">
    <view class="alert warn">
      结算表示工资已在现场核对并通过现金/转账发放完成，系统只做登记，不执行付款。登记后如修改工价，系统金额会同步变化，实际发放金额不会自动调整。
    </view>

    <view class="card">
      <view class="field" style="margin-bottom: 0">
        <view class="field-label">选择已完成的款式</view>
        <picker :range="styles" range-key="name" @change="onStyleChange">
          <view class="picker-box">
            <text>{{ selectedStyle ? `${selectedStyle.name}（${selectedStyle.styleNo}）` : '请选择款式' }}</text>
            <text class="muted">›</text>
          </view>
        </picker>
      </view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="selectedStyle && styleStatus === 'production'" class="alert danger">
      该款式仍在生产中，请先在 Web 后台标记完成后再结算。
    </view>
    <view v-else-if="selectedStyle && rows.length === 0" class="empty">
      该款已无待结算员工 🎉
    </view>

    <view v-for="row in rows" :key="row.employeeId" class="card">
      <view class="row between">
        <view>
          <view class="name">{{ row.name }}</view>
          <view class="muted small">{{ row.employeeNo }} · {{ row.quantity }} 件</view>
        </view>
        <view class="right">
          <view class="money">¥{{ row.amount }}</view>
          <button class="btn primary sm" style="margin-top: 8rpx" @click="openSettle(row)">登记结算</button>
        </view>
      </view>
    </view>

    <view v-if="sheetOpen && target" class="overlay" @click.self="sheetOpen = false">
      <view class="sheet">
        <view class="sheet-title">登记结算 · {{ target.name }}</view>
        <view class="alert info">
          员工 {{ target.name }}（{{ target.employeeNo }}），计件 {{ target.quantity }} 件，
          应发 <text style="font-weight: 700">¥{{ target.amount }}</text>
        </view>

        <view class="field">
          <view class="field-label">发放方式</view>
          <view class="row" style="gap: 12rpx">
            <view
              v-for="method in methods"
              :key="method.value"
              class="chip"
              :class="{ active: paymentMethod === method.value }"
              @click="pickMethod(method.value)"
            >
              {{ method.label }}
            </view>
          </view>
        </view>

        <view class="field">
          <view class="field-label">备注（选填）</view>
          <input v-model="remark" class="input" placeholder="例如：现金已当面点清" />
        </view>

        <button class="btn primary" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '确认已发放并登记' }}
        </button>
        <button class="btn ghost" style="margin-top: 16rpx" @click="sheetOpen = false">取消</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.name { font-size: 30rpx; font-weight: 600; }
.money { font-size: 36rpx; font-weight: 700; color: #3556d6; text-align: right; }
</style>
