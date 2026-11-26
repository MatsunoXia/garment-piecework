<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import { guard } from '../../utils/auth';
import { toast, toastError } from '../../utils/request';

interface EmployeeOption {
  id: string;
  employeeNo: string;
  name: string;
}

interface StyleOption {
  id: string;
  styleNo: string;
  name: string;
}

interface ProcessOption {
  id: string;
  name: string;
  unitPrice: string;
}

interface BundleItem {
  id: string;
  bundleNo: number;
  size: string | null;
  quantity: number;
  reported: boolean;
  reportedByName: string | null;
}

const employees = ref<EmployeeOption[]>([]);
const styles = ref<StyleOption[]>([]);
const processes = ref<ProcessOption[]>([]);
const bundles = ref<BundleItem[]>([]);

const employeeIndex = ref(-1);
const styleIndex = ref(-1);
const processIndex = ref(-1);
const bundleId = ref('');
const remark = ref('');
const loading = ref(false);
const submitting = ref(false);

const selectedEmployee = computed(() => (employeeIndex.value >= 0 ? employees.value[employeeIndex.value] : null));
const selectedStyle = computed(() => (styleIndex.value >= 0 ? styles.value[styleIndex.value] : null));
const selectedProcess = computed(() => (processIndex.value >= 0 ? processes.value[processIndex.value] : null));
const selectedBundle = computed(() => bundles.value.find((item) => item.id === bundleId.value) ?? null);

onShow(async () => {
  if (!guard('admin')) return;
  await loadBase();
});

async function loadBase(): Promise<void> {
  loading.value = true;
  try {
    const [employeeResult, styleResult] = await Promise.all([api.adminEmployees(), api.adminStyles('production')]);
    employees.value = employeeResult.items;
    styles.value = styleResult.items;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function onEmployeeChange(event: { detail: { value: number | string } }): Promise<void> {
  employeeIndex.value = Number(event.detail.value);
}

async function onStyleChange(event: { detail: { value: number | string } }): Promise<void> {
  styleIndex.value = Number(event.detail.value);
  processIndex.value = -1;
  bundleId.value = '';
  processes.value = [];
  bundles.value = [];
  const style = selectedStyle.value;
  if (!style) return;
  loading.value = true;
  try {
    const result = await api.styleProcesses(style.id);
    processes.value = result.items;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function onProcessChange(event: { detail: { value: number | string } }): Promise<void> {
  processIndex.value = Number(event.detail.value);
  bundleId.value = '';
  bundles.value = [];
  const style = selectedStyle.value;
  const process = selectedProcess.value;
  if (!style || !process) return;
  loading.value = true;
  try {
    const result = await api.bundleAvailability(style.id, process.id);
    bundles.value = result.items;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function pickBundle(item: BundleItem): void {
  if (item.reported) {
    toast(`该捆已由 ${item.reportedByName ?? '他人'} 报工`);
    return;
  }
  bundleId.value = item.id;
}

async function submit(): Promise<void> {
  if (!selectedEmployee.value || !selectedStyle.value || !selectedProcess.value || !selectedBundle.value) {
    toast('请选择员工、款式、工序和捆号');
    return;
  }
  submitting.value = true;
  try {
    const result = await api.proxyReport({
      employeeId: selectedEmployee.value.id,
      styleId: selectedStyle.value.id,
      styleProcessId: selectedProcess.value.id,
      bundleId: selectedBundle.value.id,
      remark: remark.value.trim() || undefined,
    });
    toast(`代报成功：捆号 ${result.bundleNo}，${result.quantity} 件`, 'success');
    remark.value = '';
    bundleId.value = '';
    if (selectedStyle.value && selectedProcess.value) {
      const refreshed = await api.bundleAvailability(selectedStyle.value.id, selectedProcess.value.id);
      bundles.value = refreshed.items;
    }
  } catch (error) {
    toastError(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page">
    <view class="alert warn">
      管理员代报提交后立即视为「已通过」，请确认员工和捆号无误。同一捆号同一工序只能有一名员工报工。
    </view>

    <view class="card">
      <view class="field">
        <view class="field-label">员工</view>
        <picker :range="employees" range-key="name" @change="onEmployeeChange">
          <view class="picker-box">
            <text>{{ selectedEmployee ? `${selectedEmployee.name}（${selectedEmployee.employeeNo}）` : '请选择员工' }}</text>
            <text class="muted">›</text>
          </view>
        </picker>
      </view>

      <view class="field">
        <view class="field-label">款式</view>
        <picker :range="styles" range-key="name" @change="onStyleChange">
          <view class="picker-box">
            <text>{{ selectedStyle ? `${selectedStyle.name}（${selectedStyle.styleNo}）` : '请选择生产中的款式' }}</text>
            <text class="muted">›</text>
          </view>
        </picker>
      </view>

      <view v-if="processes.length > 0" class="field">
        <view class="field-label">工序</view>
        <picker :range="processes" range-key="name" @change="onProcessChange">
          <view class="picker-box">
            <text>{{ selectedProcess ? `${selectedProcess.name} · ¥${selectedProcess.unitPrice}/件` : '请选择工序' }}</text>
            <text class="muted">›</text>
          </view>
        </picker>
      </view>

      <view v-if="bundles.length > 0" class="field">
        <view class="field-label">捆号（点击选择，灰色表示已被报工）</view>
        <view class="bundle-grid">
          <view
            v-for="item in bundles"
            :key="item.id"
            class="bundle"
            :class="{ selected: bundleId === item.id, reported: item.reported }"
            @click="pickBundle(item)"
          >
            <view class="bundle-no">#{{ item.bundleNo }}</view>
            <view class="small">{{ item.size || '均码' }}</view>
            <view class="small">{{ item.quantity }} 件</view>
            <view v-if="item.reported" class="flag">{{ item.reportedByName || '已报' }}</view>
          </view>
        </view>
      </view>

      <view class="field">
        <view class="field-label">备注（选填）</view>
        <input v-model="remark" class="input" placeholder="例如：员工手机没电，管理员代报" />
      </view>

      <button class="btn primary" :disabled="submitting" @click="submit">
        {{ submitting ? '提交中…' : '确认代报（立即通过）' }}
      </button>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
  </view>
</template>

<style scoped>
.bundle-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14rpx; }
.bundle { background: #f7f8fc; border-radius: 14rpx; padding: 18rpx 10rpx; text-align: center; border: 2rpx solid transparent; }
.bundle.selected { border-color: #3556d6; background: #eef2ff; }
.bundle.reported { background: #f1f3f5; color: #9aa1ae; }
.bundle-no { font-weight: 700; font-size: 30rpx; }
.flag { font-size: 20rpx; color: #b26a00; margin-top: 4rpx; }
</style>
