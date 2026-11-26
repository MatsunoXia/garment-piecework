<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { api } from '../../api';
import type { BundleOption, ProcessOption, ReportableStyle } from '../../types';
import { guard } from '../../utils/auth';
import { confirm, prompt, toast, toastError } from '../../utils/request';

const step = ref<1 | 2 | 3>(1);
const loading = ref(false);
const submitting = ref(false);

const styles = ref<ReportableStyle[]>([]);
const selectedStyle = ref<ReportableStyle | null>(null);
const processes = ref<ProcessOption[]>([]);
const selectedProcess = ref<ProcessOption | null>(null);
const bundles = ref<BundleOption[]>([]);
const selectedBundleIds = ref<string[]>([]);

const selectedBundles = computed(() => bundles.value.filter((item) => selectedBundleIds.value.includes(item.id)));
const selectedQuantity = computed(() => selectedBundles.value.reduce((sum, item) => sum + item.quantity, 0));

onShow(async () => {
  if (!guard('employee')) return;
  await loadStyles();
});

async function loadStyles(): Promise<void> {
  loading.value = true;
  try {
    styles.value = await api.reportableStyles();
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function pickStyle(style: ReportableStyle): Promise<void> {
  loading.value = true;
  try {
    const result = await api.reportOptions(style.id);
    selectedStyle.value = style;
    processes.value = result.processes ?? [];
    step.value = 2;
    selectedBundleIds.value = [];
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function pickProcess(process: ProcessOption): Promise<void> {
  if (!selectedStyle.value) return;
  loading.value = true;
  try {
    const result = await api.reportOptions(selectedStyle.value.id, process.id);
    selectedProcess.value = process;
    bundles.value = result.bundles;
    selectedBundleIds.value = [];
    step.value = 3;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function toggleBundle(bundle: BundleOption): void {
  if (bundle.reported) {
    if (bundle.reportedByMe) {
      toast(`这捆你已报工（${bundle.reportedStatus === 'pending' ? '待审核' : '已通过'}）`);
      return;
    }
    void dispute(bundle);
    return;
  }

  const index = selectedBundleIds.value.indexOf(bundle.id);
  if (index >= 0) {
    selectedBundleIds.value.splice(index, 1);
  } else {
    selectedBundleIds.value.push(bundle.id);
  }
}

async function dispute(bundle: BundleOption): Promise<void> {
  if (!bundle.activeReportId) return;
  const ok = await confirm(
    `捆号 ${bundle.bundleNo} 的「${selectedProcess.value?.name ?? ''}」目前由 ${bundle.reportedByName ?? '他人'} 报工。\n如你才是实际完成人，可发起归属争议，由管理员处理。`,
    '发起争议',
  );
  if (!ok) return;

  const reason = await prompt('请简要说明情况（可选）', '例如：这捆是我做的');
  if (reason === null) return;

  try {
    await api.createDispute({
      reportId: bundle.activeReportId,
      reason: reason.trim() || undefined,
    });
    toast('争议已提交，请等待管理员处理', 'success');
  } catch (error) {
    toastError(error);
  }
}

function back(): void {
  if (step.value === 3) {
    step.value = 2;
    selectedBundleIds.value = [];
    return;
  }
  if (step.value === 2) {
    step.value = 1;
    selectedStyle.value = null;
    return;
  }
}

async function submit(): Promise<void> {
  if (!selectedStyle.value || !selectedProcess.value || selectedBundleIds.value.length === 0) {
    toast('请选择要报工的捆号');
    return;
  }
  submitting.value = true;
  try {
    const result = await api.createReports(
      selectedBundleIds.value.map((bundleId) => ({
        styleId: selectedStyle.value!.id,
        styleProcessId: selectedProcess.value!.id,
        bundleId,
      })),
    );

    if (result.failedCount > 0) {
      toast(
        `成功 ${result.successCount} 条，失败 ${result.failedCount} 条：${result.failures[0]?.message ?? ''}`,
      );
    } else {
      toast(`报工成功 ${result.successCount} 条，等待管理员审核`, 'success');
    }

    selectedBundleIds.value = [];
    if (selectedStyle.value && selectedProcess.value) {
      const refreshed = await api.reportOptions(selectedStyle.value.id, selectedProcess.value.id);
      bundles.value = refreshed.bundles;
    }
  } catch (error) {
    toastError(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page report-page">
    <view class="steps">
      <view class="step" :class="{ active: step >= 1 }">1 款式</view>
      <view class="step-line"></view>
      <view class="step" :class="{ active: step >= 2 }">2 工序</view>
      <view class="step-line"></view>
      <view class="step" :class="{ active: step >= 3 }">3 捆号</view>
    </view>

    <view v-if="step > 1" class="selected-bar">
      <view>
        <view class="small muted">当前款式</view>
        <view class="strong">{{ selectedStyle?.name }}</view>
      </view>
      <view v-if="selectedProcess" class="right">
        <view class="small muted">{{ selectedProcess.name }}</view>
        <view class="strong">¥{{ selectedProcess.unitPrice }}/件</view>
      </view>
    </view>

    <!-- 步骤 1：选款式 -->
    <view v-if="step === 1">
      <view v-if="loading" class="empty">加载中…</view>
      <view v-else-if="styles.length === 0" class="empty">
        暂无可报工的款式。请确认管理员已分配车间，且款式生产范围包含你的车间。
      </view>
      <view v-else>
        <view v-for="style in styles" :key="style.id" class="style-card" @click="pickStyle(style)">
          <view class="row between">
            <view class="strong">{{ style.name }}</view>
            <view class="tag blue">{{ style.styleNo }}</view>
          </view>
          <view class="muted small" style="margin-top: 8rpx">
            {{ style.processCount }} 道工序 · {{ style.bundleCount }} 个捆号
          </view>
        </view>
      </view>
    </view>

    <!-- 步骤 2：选工序 -->
    <view v-if="step === 2">
      <view v-if="loading" class="empty">加载中…</view>
      <view v-else-if="processes.length === 0" class="empty">该款式还没有工序，请联系管理员</view>
      <view v-else>
        <view v-for="process in processes" :key="process.id" class="process-card" @click="pickProcess(process)">
          <view>
            <view class="strong">{{ process.name }}</view>
            <view class="muted small">{{ process.groupName || '未分组' }}</view>
          </view>
          <view class="right">
            <view class="price">¥{{ process.unitPrice }}</view>
            <view class="muted small">每件</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 步骤 3：选捆号 -->
    <view v-if="step === 3">
      <view class="alert info">
        点选捆号即可，数量自动取捆号数量。灰色表示已被报工，点击可发起归属争议。
      </view>
      <view v-if="bundles.length === 0" class="empty">该款式还没有捆号</view>
      <view v-else class="bundle-grid">
        <view
          v-for="bundle in bundles"
          :key="bundle.id"
          class="bundle"
          :class="{
            selected: selectedBundleIds.includes(bundle.id),
            reported: bundle.reported,
            mine: bundle.reportedByMe,
          }"
          @click="toggleBundle(bundle)"
        >
          <view class="bundle-no">#{{ bundle.bundleNo }}</view>
          <view class="bundle-size">{{ bundle.size || '均码' }}</view>
          <view class="bundle-qty">{{ bundle.quantity }} 件</view>
          <view v-if="bundle.reported" class="bundle-flag">
            {{ bundle.reportedByMe ? '我已报' : (bundle.reportedByName || '已报工') }}
          </view>
        </view>
      </view>
    </view>

    <view v-if="step === 3" class="submit-bar">
      <view class="row between">
        <view>
          <view class="muted small">已选 {{ selectedBundleIds.length }} 捆 / {{ selectedQuantity }} 件</view>
          <view class="strong">预计工资 ¥{{ ((Number(selectedProcess?.unitPrice ?? 0)) * selectedQuantity).toFixed(3) }}</view>
        </view>
        <button class="btn primary" style="width: 260rpx" :disabled="submitting || selectedBundleIds.length === 0" @click="submit">
          {{ submitting ? '提交中…' : '提交报工' }}
        </button>
      </view>
    </view>

    <view v-if="step > 1" class="back" @click="back">← 返回上一步</view>
  </view>
</template>

<style scoped>
.report-page { padding-bottom: 180rpx; }
.steps { display: flex; align-items: center; margin-bottom: 20rpx; }
.step { font-size: 24rpx; color: #9aa1ae; padding: 6rpx 16rpx; border-radius: 999rpx; background: #fff; }
.step.active { color: #3556d6; background: #eef2ff; font-weight: 600; }
.step-line { flex: 1; height: 2rpx; background: #e5e7eb; margin: 0 8rpx; }
.selected-bar {
  background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; display: flex; justify-content: space-between;
  margin-bottom: 20rpx;
}
.strong { font-weight: 600; font-size: 28rpx; }
.style-card, .process-card {
  background: #fff; border-radius: 18rpx; padding: 28rpx; margin-bottom: 16rpx;
  display: flex; justify-content: space-between; align-items: center;
}
.process-card { align-items: center; }
.price { font-size: 32rpx; font-weight: 700; color: #3556d6; }
.bundle-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14rpx; }
.bundle {
  background: #fff; border-radius: 14rpx; padding: 18rpx 12rpx; text-align: center;
  border: 2rpx solid transparent;
}
.bundle.selected { border-color: #3556d6; background: #eef2ff; }
.bundle.reported { background: #f1f3f5; color: #9aa1ae; }
.bundle.mine { background: #f1f3f5; color: #6b7280; }
.bundle-no { font-weight: 700; font-size: 30rpx; }
.bundle-size { font-size: 22rpx; margin-top: 4rpx; }
.bundle-qty { font-size: 22rpx; margin-top: 2rpx; }
.bundle-flag { font-size: 20rpx; margin-top: 6rpx; color: #b26a00; }
.submit-bar {
  position: fixed; left: 0; right: 0; bottom: 0; background: #fff;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 20rpx rgba(16, 24, 40, 0.08);
}
.back { text-align: center; color: #6b7280; font-size: 26rpx; margin-top: 40rpx; }
</style>
