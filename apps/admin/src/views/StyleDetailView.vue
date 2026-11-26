<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api, type BundleRow, type PayrollSummary, type ReportRow, type StyleDetail } from '../api';
import { download } from '../api/client';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import {
  confirmAction,
  formatDateTime,
  money,
  statusText,
  statusTone,
  toast,
  toastError,
} from '../ui';

const route = useRoute();
const router = useRouter();
const styleId = computed(() => String(route.params.id));

const detail = ref<StyleDetail | null>(null);
const tab = ref<'overview' | 'processes' | 'bundles' | 'reports' | 'payroll'>('overview');
const loading = ref(false);

const bundles = ref<BundleRow[]>([]);
const bundleTotal = ref(0);
const bundleQuery = reactive({ page: 1, pageSize: 20, keyword: '', reported: '' as '' | '0' | '1' });

const reports = ref<ReportRow[]>([]);
const reportTotal = ref(0);
const reportQuery = reactive({ page: 1, pageSize: 20, status: 'pending' as '' | 'pending' | 'approved' | 'rejected' });
const selectedReports = ref<string[]>([]);

const payroll = ref<PayrollSummary[]>([]);
const payrollKeyword = ref('');

const priceOpen = ref(false);
const priceTarget = ref<StyleDetail['processes'][number] | null>(null);
const priceForm = reactive({ unitPrice: '', reason: '' });

const processOpen = ref(false);
const processForm = reactive({ name: '', groupName: '', unitPrice: '0.000' });

const bundleOpen = ref(false);
const bundleForm = reactive({ size: '', quantity: 100, remark: '' });

const batchOpen = ref(false);
const batchText = ref('');

const importOpen = ref(false);
const importFile = ref<File | null>(null);
const importRows = ref<Array<{ lineNo: number; bundleNo: number | null; size: string | null; quantity: number | null; remark: string | null; errors: string[]; valid: boolean }>>([]);
const importInfo = ref<{ total: number; validCount: number; invalidCount: number; canImport: boolean } | null>(null);
const importing = ref(false);

const editBundleOpen = ref(false);
const editBundleTarget = ref<BundleRow | null>(null);
const editBundleForm = reactive({ size: '', quantity: 0, remark: '' });

const rejectOpen = ref(false);
const rejectTarget = ref<ReportRow | null>(null);
const rejectReason = ref('');

const settleOpen = ref(false);
const settleTarget = ref<PayrollSummary | null>(null);
const settleForm = reactive({ paymentMethod: 'cash', remark: '' });

const payrollDetailOpen = ref(false);
const payrollDetail = ref<Awaited<ReturnType<typeof api.payrollDetail>> | null>(null);

const saving = ref(false);

const isProduction = computed(() => detail.value?.status === 'production');
const canArchive = computed(() => detail.value?.status === 'settled');

async function loadDetail(): Promise<void> {
  loading.value = true;
  try {
    detail.value = await api.style(styleId.value);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function loadBundles(): Promise<void> {
  try {
    const result = await api.bundles(styleId.value, {
      page: bundleQuery.page,
      pageSize: bundleQuery.pageSize,
      keyword: bundleQuery.keyword || undefined,
      reported: bundleQuery.reported === '' ? undefined : bundleQuery.reported,
    });
    bundles.value = result.items;
    bundleTotal.value = result.total;
  } catch (error) {
    toastError(error);
  }
}

async function loadReports(): Promise<void> {
  try {
    const result = await api.reports({
      styleId: styleId.value,
      status: reportQuery.status || undefined,
      page: reportQuery.page,
      pageSize: reportQuery.pageSize,
    });
    reports.value = result.items;
    reportTotal.value = result.total;
    selectedReports.value = [];
  } catch (error) {
    toastError(error);
  }
}

async function loadPayroll(): Promise<void> {
  try {
    payroll.value = await api.payrollByStyle(styleId.value, payrollKeyword.value || undefined);
  } catch (error) {
    toastError(error);
  }
}

async function switchTab(next: typeof tab.value): Promise<void> {
  tab.value = next;
  if (next === 'bundles') await loadBundles();
  if (next === 'reports') await loadReports();
  if (next === 'payroll') await loadPayroll();
}

onMounted(loadDetail);

async function completeStyle(): Promise<void> {
  if (!confirmAction('确认将该款式标记为完成？完成后不再允许新增报工和捆号，但仍可按规则修改工价。')) return;
  try {
    const result = await api.completeStyle(styleId.value);
    toast(result.message, 'success');
    await loadDetail();
  } catch (error) {
    toastError(error);
  }
}

async function archiveStyle(): Promise<void> {
  if (!confirmAction('确认归档该款式？归档后不可再修改。')) return;
  try {
    const result = await api.archiveStyle(styleId.value);
    toast(result.message, 'success');
    await loadDetail();
  } catch (error) {
    toastError(error);
  }
}

function openPrice(process: StyleDetail['processes'][number]): void {
  priceTarget.value = process;
  priceForm.unitPrice = process.unitPrice;
  priceForm.reason = '';
  priceOpen.value = true;
}

async function submitPrice(): Promise<void> {
  if (!priceTarget.value) return;
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(priceForm.unitPrice)) {
    toast('工价最多三位小数且不能为负数', 'warn');
    return;
  }
  const hasSettlements = (detail.value?.stats.settlementCount ?? 0) > 0;
  if (
    hasSettlements &&
    !confirmAction(
      '该款已有员工完成结算，本次修改将同步更新相关员工的工资统计及结算金额。实际已发放的工资不会自动调整，请核对并在线下处理差额。是否继续？',
    )
  ) {
    return;
  }
  saving.value = true;
  try {
    const result = await api.changePrice(priceTarget.value.id, priceForm.unitPrice, priceForm.reason || undefined);
    toast(result.message, 'success');
    if (result.warning) toast(result.warning, 'warn');
    if (result.affectedEmployees.length > 0) {
      toast(`已重算 ${result.affectedSettlements} 条结算：${result.affectedEmployees.join('、')}`, 'info');
    }
    priceOpen.value = false;
    await loadDetail();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openProcess(): void {
  processForm.name = '';
  processForm.groupName = '';
  processForm.unitPrice = '0.000';
  processOpen.value = true;
}

async function submitProcess(): Promise<void> {
  if (!processForm.name.trim()) {
    toast('请填写工序名称', 'warn');
    return;
  }
  saving.value = true;
  try {
    const result = await api.createProcess(styleId.value, {
      name: processForm.name.trim(),
      groupName: processForm.groupName.trim() || undefined,
      unitPrice: processForm.unitPrice,
    });
    toast('工序已新增', 'success');
    if (result.warning) toast(result.warning, 'warn');
    processOpen.value = false;
    await loadDetail();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function deleteProcess(process: StyleDetail['processes'][number]): Promise<void> {
  if (!confirmAction(`确认删除工序「${process.name}」？已产生报工的工序不能删除。`)) return;
  try {
    await api.deleteProcess(process.id);
    toast('工序已删除', 'success');
    await loadDetail();
  } catch (error) {
    toastError(error);
  }
}

function openBundle(): void {
  bundleForm.size = '';
  bundleForm.quantity = 100;
  bundleForm.remark = '';
  bundleOpen.value = true;
}

async function submitBundle(): Promise<void> {
  saving.value = true;
  try {
    const created = await api.createBundle(styleId.value, {
      size: bundleForm.size.trim() || undefined,
      quantity: bundleForm.quantity,
      remark: bundleForm.remark.trim() || undefined,
    });
    toast(`捆号 ${created.bundleNo} 已创建`, 'success');
    bundleOpen.value = false;
    await Promise.all([loadBundles(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function submitBatch(): Promise<void> {
  const items = batchText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [size, quantity] = line.split(/[,，\s]+/);
      return { size: size || undefined, quantity: Number(quantity) };
    });

  if (items.length === 0) {
    toast('请按「码数,数量」每行一条填写', 'warn');
    return;
  }
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    toast('数量必须是大于 0 的整数', 'warn');
    return;
  }
  saving.value = true;
  try {
    const result = await api.createBundlesBatch(styleId.value, items);
    toast(`已批量创建 ${result.count} 个捆号`, 'success');
    batchOpen.value = false;
    await Promise.all([loadBundles(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openEditBundle(bundle: BundleRow): void {
  editBundleTarget.value = bundle;
  editBundleForm.size = bundle.size ?? '';
  editBundleForm.quantity = bundle.quantity;
  editBundleForm.remark = bundle.remark ?? '';
  editBundleOpen.value = true;
}

async function submitEditBundle(): Promise<void> {
  if (!editBundleTarget.value) return;
  saving.value = true;
  try {
    await api.updateBundle(editBundleTarget.value.id, {
      size: editBundleForm.size.trim(),
      quantity: editBundleForm.quantity,
      remark: editBundleForm.remark.trim(),
    });
    toast('捆号已更新', 'success');
    editBundleOpen.value = false;
    await Promise.all([loadBundles(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function deleteBundle(bundle: BundleRow): Promise<void> {
  if (!confirmAction(`确认删除捆号 ${bundle.bundleNo}？有报工历史的捆号永久禁止删除。`)) return;
  try {
    await api.deleteBundle(bundle.id);
    toast('捆号已删除', 'success');
    await Promise.all([loadBundles(), loadDetail()]);
  } catch (error) {
    toastError(error);
  }
}

function openImport(): void {
  importFile.value = null;
  importRows.value = [];
  importInfo.value = null;
  importOpen.value = true;
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importFile.value = file;
  importing.value = true;
  try {
    const result = await api.previewBundles(styleId.value, file);
    importRows.value = result.rows;
    importInfo.value = result;
  } catch (error) {
    toastError(error);
    importRows.value = [];
    importInfo.value = null;
  } finally {
    importing.value = false;
  }
}

async function confirmImport(): Promise<void> {
  if (!importInfo.value?.canImport) {
    toast('存在错误行，请修正 Excel 后重新上传', 'warn');
    return;
  }
  importing.value = true;
  try {
    const result = await api.confirmBundles(
      styleId.value,
      importRows.value.map((row) => ({
        bundleNo: row.bundleNo ?? undefined,
        size: row.size ?? undefined,
        quantity: row.quantity,
        remark: row.remark ?? undefined,
      })),
    );
    toast(`成功导入 ${result.imported} 条捆号`, 'success');
    importOpen.value = false;
    await Promise.all([loadBundles(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    importing.value = false;
  }
}

async function downloadTemplate(): Promise<void> {
  try {
    await download(api.bundleTemplate(styleId.value), '捆号导入模板.xlsx');
  } catch (error) {
    toastError(error);
  }
}

function toggleAllReports(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  selectedReports.value = checked ? reports.value.filter((row) => row.status === 'pending').map((row) => row.id) : [];
}

async function batchApprove(): Promise<void> {
  if (selectedReports.value.length === 0) {
    toast('请先勾选待审核报工', 'warn');
    return;
  }
  try {
    const result = await api.batchReview(selectedReports.value, 'approve');
    toast(`通过 ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ''}`, result.failedCount ? 'warn' : 'success');
    await Promise.all([loadReports(), loadDetail()]);
  } catch (error) {
    toastError(error);
  }
}

async function approveOne(row: ReportRow): Promise<void> {
  try {
    await api.approveReport(row.id);
    toast('审核通过', 'success');
    await Promise.all([loadReports(), loadDetail()]);
  } catch (error) {
    toastError(error);
  }
}

function openReject(row: ReportRow): void {
  rejectTarget.value = row;
  rejectReason.value = '';
  rejectOpen.value = true;
}

async function submitReject(): Promise<void> {
  if (!rejectTarget.value) return;
  if (rejectReason.value.trim().length < 2) {
    toast('请填写驳回原因（至少 2 个字）', 'warn');
    return;
  }
  saving.value = true;
  try {
    await api.rejectReport(rejectTarget.value.id, rejectReason.value.trim());
    toast('已驳回，实际完成人可重新报工', 'success');
    rejectOpen.value = false;
    await Promise.all([loadReports(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function deleteReport(row: ReportRow): Promise<void> {
  if (!confirmAction(`确认删除该报工？删除后捆号历史标记不会重置。`)) return;
  try {
    await api.deleteReport(row.id);
    toast('报工已删除', 'success');
    await Promise.all([loadReports(), loadDetail()]);
  } catch (error) {
    toastError(error);
  }
}

function openSettle(row: PayrollSummary): void {
  settleTarget.value = row;
  settleForm.paymentMethod = 'cash';
  settleForm.remark = '';
  settleOpen.value = true;
}

async function submitSettle(): Promise<void> {
  if (!settleTarget.value) return;
  saving.value = true;
  try {
    const result = await api.createSettlement({
      employeeId: settleTarget.value.employeeId,
      styleId: styleId.value,
      paymentMethod: settleForm.paymentMethod,
      remark: settleForm.remark.trim() || undefined,
    });
    toast(`结算完成：¥${result.totalAmount}`, 'success');
    if (result.styleSettled) toast('该款全部员工已结算，款式已自动标记为已结算', 'info');
    settleOpen.value = false;
    await Promise.all([loadPayroll(), loadDetail()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function openPayrollDetail(row: PayrollSummary): Promise<void> {
  try {
    payrollDetail.value = await api.payrollDetail(row.employeeId, styleId.value);
    payrollDetailOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <div v-if="detail">
    <div class="page-head">
      <div>
        <div class="flex items-center gap-8" style="flex-wrap: wrap">
          <span class="page-title">{{ detail.name }}</span>
          <span class="tag" :class="statusTone(detail.status)">{{ statusText(detail.status) }}</span>
        </div>
        <div class="page-sub">
          <span class="mono">{{ detail.styleNo }}</span> ·
          <span v-if="detail.productionScope === 'all'">全公司可生产</span>
          <span v-else>限定车间：{{ detail.workshops.map((w) => w.name).join('、') || '未设置' }}</span>
          · 创建人 {{ detail.createdBy ?? '-' }}
        </div>
      </div>
      <div class="toolbar">
        <button class="btn" @click="router.push('/styles')">返回列表</button>
        <button v-if="isProduction" class="btn btn-primary" @click="completeStyle">标记完成</button>
        <button v-if="canArchive" class="btn" @click="archiveStyle">归档</button>
      </div>
    </div>

    <div class="stats mb-12">
      <div class="stat">
        <div class="stat-label">工序数</div>
        <div class="stat-value">{{ detail.processes.length }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">捆号 / 总件数</div>
        <div class="stat-value">{{ detail.stats.bundleCount }} / {{ detail.stats.bundleQuantity }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">待审核报工</div>
        <div class="stat-value">{{ detail.stats.reports.pending ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">已通过报工</div>
        <div class="stat-value">{{ detail.stats.reports.approved ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">参与员工 / 已结算</div>
        <div class="stat-value">{{ detail.stats.employeeCount }} / {{ detail.stats.settlementCount }}</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'overview' }" @click="switchTab('overview')">概览</button>
      <button class="tab" :class="{ active: tab === 'processes' }" @click="switchTab('processes')">工序与工价</button>
      <button class="tab" :class="{ active: tab === 'bundles' }" @click="switchTab('bundles')">捆号管理</button>
      <button class="tab" :class="{ active: tab === 'reports' }" @click="switchTab('reports')">报工记录</button>
      <button class="tab" :class="{ active: tab === 'payroll' }" @click="switchTab('payroll')">工资与结算</button>
    </div>

    <!-- 概览 -->
    <div v-if="tab === 'overview'" class="grid-2">
      <div class="card">
        <div class="card-head"><h3>基本信息</h3></div>
        <div class="card-body">
          <dl class="detail-list">
            <dt>款式编号</dt><dd class="mono">{{ detail.styleNo }}</dd>
            <dt>款式名称</dt><dd>{{ detail.name }}</dd>
            <dt>备注</dt><dd>{{ detail.remark || '-' }}</dd>
            <dt>状态</dt><dd>{{ statusText(detail.status) }}</dd>
            <dt>创建时间</dt><dd>{{ formatDateTime(detail.createdAt) }}</dd>
            <dt>完成时间</dt><dd>{{ formatDateTime(detail.completedAt) }}</dd>
            <dt>结算时间</dt><dd>{{ formatDateTime(detail.settledAt) }}</dd>
            <dt>生产范围</dt>
            <dd>{{ detail.productionScope === 'all' ? '全公司员工' : detail.workshops.map((w) => w.name).join('、') }}</dd>
          </dl>
          <div class="alert alert-info mt-16" style="margin-bottom: 0">
            同一款式的同一工序始终只有一套当前工价。修改工价后，该款所有员工工资统计与已结算金额都会按新工价重算；线下已发放金额不会自动调整。
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>工序工价一览</h3></div>
        <table class="table">
          <thead><tr><th>工序</th><th>分组</th><th class="num">单价</th><th>报工历史</th></tr></thead>
          <tbody>
            <tr v-for="process in detail.processes" :key="process.id">
              <td>{{ process.name }}</td>
              <td class="muted">{{ process.groupName || '-' }}</td>
              <td class="num mono">{{ process.unitPrice }}</td>
              <td><span v-if="process.hasReported" class="tag tag-green">有</span><span v-else class="muted">无</span></td>
            </tr>
            <tr v-if="detail.processes.length === 0"><td colspan="4" class="empty">还没有工序</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 工序 -->
    <div v-if="tab === 'processes'" class="card">
      <div class="card-head">
        <h3>工序与工价</h3>
        <button class="btn btn-primary btn-sm" :disabled="!isProduction" @click="openProcess">新增工序</button>
      </div>
      <table class="table">
        <thead>
          <tr><th>工序名称</th><th>分组</th><th class="num">当前工价</th><th>报工历史</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="process in detail.processes" :key="process.id">
            <td><strong>{{ process.name }}</strong></td>
            <td class="muted">{{ process.groupName || '-' }}</td>
            <td class="num mono">
              {{ process.unitPrice }}
              <span v-if="process.unitPrice === '0.000'" class="tag tag-orange" style="margin-left: 6px">0 元，请确认</span>
            </td>
            <td><span v-if="process.hasReported" class="tag tag-green">已有报工</span><span v-else class="muted">无</span></td>
            <td>
              <div class="actions">
                <button class="btn btn-sm" @click="openPrice(process)">修改工价</button>
                <button class="btn btn-sm btn-danger" :disabled="!isProduction" @click="deleteProcess(process)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="detail.processes.length === 0"><td colspan="5" class="empty">还没有工序，请先新增</td></tr>
        </tbody>
      </table>
      <div class="card-body hint">
        单价支持三位小数（如 0.005）。款式完成或结算后，工序名称和结构锁定，但仍可按业务规则修改工价；若数据库尚未执行迁移 0001，改价会被数据库触发器拒绝并提示。
      </div>
    </div>

    <!-- 捆号 -->
    <div v-if="tab === 'bundles'" class="card">
      <div class="card-head">
        <div class="toolbar">
          <input v-model="bundleQuery.keyword" class="input" placeholder="捆号 / 码数 / 备注" @keyup.enter="loadBundles" />
          <select v-model="bundleQuery.reported" class="select" @change="loadBundles">
            <option value="">全部</option>
            <option value="0">未报工</option>
            <option value="1">已有报工</option>
          </select>
          <button class="btn" @click="loadBundles">查询</button>
        </div>
        <div class="toolbar">
          <button class="btn btn-sm" @click="downloadTemplate">下载模板</button>
          <button class="btn btn-sm" :disabled="!isProduction" @click="openImport">Excel 导入</button>
          <button class="btn btn-sm" :disabled="!isProduction" @click="batchOpen = true">批量新增</button>
          <button class="btn btn-sm btn-primary" :disabled="!isProduction" @click="openBundle">新增捆号</button>
        </div>
      </div>
      <table class="table">
        <thead>
          <tr><th>捆号</th><th>码数</th><th class="num">数量</th><th>备注</th><th>报工历史</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="bundle in bundles" :key="bundle.id">
            <td class="mono">{{ bundle.bundleNo }}</td>
            <td>{{ bundle.size || '-' }}</td>
            <td class="num">{{ bundle.quantity }}</td>
            <td class="muted">{{ bundle.remark || '-' }}</td>
            <td>
              <span v-if="bundle.hasReported" class="tag tag-green">已有报工</span>
              <span v-else class="tag tag-gray">未报工</span>
            </td>
            <td>
              <div class="actions">
                <button class="btn btn-sm" @click="openEditBundle(bundle)">编辑</button>
                <button class="btn btn-sm btn-danger" :disabled="bundle.hasReported" @click="deleteBundle(bundle)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="bundles.length === 0"><td colspan="6" class="empty">还没有捆号</td></tr>
        </tbody>
      </table>
      <Pager v-model:page="bundleQuery.page" :page-size="bundleQuery.pageSize" :total="bundleTotal" @update:page="loadBundles" />
    </div>

    <!-- 报工 -->
    <div v-if="tab === 'reports'" class="card">
      <div class="card-head">
        <div class="toolbar">
          <select v-model="reportQuery.status" class="select" @change="loadReports">
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="">全部</option>
          </select>
          <button class="btn btn-sm" @click="loadReports">刷新</button>
        </div>
        <button class="btn btn-primary btn-sm" @click="batchApprove">批量通过（{{ selectedReports.length }}）</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 36px"><input type="checkbox" @change="toggleAllReports" /></th>
            <th>工序</th>
            <th>捆号</th>
            <th>员工</th>
            <th>来源</th>
            <th>报工时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in reports" :key="row.id">
            <td><input v-model="selectedReports" type="checkbox" :value="row.id" :disabled="row.status !== 'pending'" /></td>
            <td><strong>{{ row.process.name }}</strong><div class="hint">¥{{ row.process.unitPrice }}/件</div></td>
            <td class="mono">{{ row.bundle.bundleNo }} <span class="hint">（{{ row.bundle.quantity }} 件）</span></td>
            <td>{{ row.employee.name }}<div class="hint">{{ row.employee.employeeNo }}</div></td>
            <td>{{ statusText(row.source) }}</td>
            <td class="hint">{{ formatDateTime(row.reportedAt) }}</td>
            <td>
              <span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span>
              <div v-if="row.rejectReason" class="hint">{{ row.rejectReason }}</div>
            </td>
            <td>
              <div class="actions">
                <template v-if="row.status === 'pending'">
                  <button class="btn btn-sm btn-primary" @click="approveOne(row)">通过</button>
                  <button class="btn btn-sm" @click="openReject(row)">驳回</button>
                </template>
                <button class="btn btn-sm btn-danger" @click="deleteReport(row)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="reports.length === 0"><td colspan="8" class="empty">没有符合条件的报工</td></tr>
        </tbody>
      </table>
      <Pager v-model:page="reportQuery.page" :page-size="reportQuery.pageSize" :total="reportTotal" @update:page="loadReports" />
    </div>

    <!-- 工资 -->
    <div v-if="tab === 'payroll'" class="card">
      <div class="card-head">
        <h3>员工工资（按当前工价计算）</h3>
        <div class="toolbar">
          <input v-model="payrollKeyword" class="input" placeholder="姓名 / 编号" @keyup.enter="loadPayroll" />
          <button class="btn btn-sm" @click="loadPayroll">查询</button>
        </div>
      </div>
      <table class="table">
        <thead>
          <tr><th>员工</th><th class="num">计件数量</th><th class="num">应发金额</th><th>结算状态</th><th class="num">系统结算金额</th><th class="num">差额</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in payroll" :key="row.employeeId">
            <td><strong>{{ row.name }}</strong><div class="hint">{{ row.employeeNo }}</div></td>
            <td class="num">{{ row.quantity }}</td>
            <td class="num mono"><strong>{{ money(row.amount) }}</strong></td>
            <td>
              <span v-if="row.settled" class="tag tag-green">已结算</span>
              <span v-else class="tag tag-orange">待结算</span>
              <div v-if="row.settledAt" class="hint">{{ formatDateTime(row.settledAt) }}</div>
            </td>
            <td class="num mono">{{ row.settledAmount ? money(row.settledAmount) : '-' }}</td>
            <td class="num mono">{{ row.difference ?? '-' }}</td>
            <td>
              <div class="actions">
                <button class="btn btn-sm" @click="openPayrollDetail(row)">明细</button>
                <button v-if="!row.settled" class="btn btn-sm btn-primary" @click="openSettle(row)">结算</button>
                <router-link v-else-if="row.settlementId" class="btn btn-sm" :to="`/settlements/${row.settlementId}`">结算单</router-link>
              </div>
            </td>
          </tr>
          <tr v-if="payroll.length === 0"><td colspan="7" class="empty">暂无已审核通过的报工</td></tr>
        </tbody>
      </table>
      <div class="card-body hint">
        结算单位是「员工 + 款式」，只统计审核通过的报工，金额由后端使用 Decimal 精确计算。
      </div>
    </div>

    <!-- 改价 -->
    <Modal v-if="priceOpen && priceTarget" :title="`修改工价 · ${priceTarget.name}`" @close="priceOpen = false">
      <div v-if="(detail?.stats.settlementCount ?? 0) > 0" class="alert alert-warn">
        该款已有员工完成结算。修改工价会同步更新相关员工的工资统计及结算金额；实际已发放的工资不会自动调整，请核对并在线下处理差额。
      </div>
      <div class="field">
        <label>当前工价</label>
        <div class="mono">{{ priceTarget.unitPrice }}</div>
      </div>
      <div class="field">
        <label>新工价（元 / 件，最多三位小数）</label>
        <input v-model="priceForm.unitPrice" class="input mono" inputmode="decimal" />
      </div>
      <div class="field">
        <label>修改原因（可选）</label>
        <input v-model="priceForm.reason" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="priceOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitPrice">确认修改</button>
      </template>
    </Modal>

    <Modal v-if="processOpen" title="新增工序" @close="processOpen = false">
      <div class="field">
        <label>工序名称</label>
        <input v-model="processForm.name" class="input" maxlength="100" />
      </div>
      <div class="field">
        <label>分组（可选）</label>
        <input v-model="processForm.groupName" class="input" maxlength="100" />
      </div>
      <div class="field">
        <label>单价（元 / 件）</label>
        <input v-model="processForm.unitPrice" class="input mono" inputmode="decimal" />
      </div>
      <template #footer>
        <button class="btn" @click="processOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitProcess">保存</button>
      </template>
    </Modal>

    <Modal v-if="bundleOpen" title="新增捆号" @close="bundleOpen = false">
      <div class="field">
        <label>码数 / 尺码（可选）</label>
        <input v-model="bundleForm.size" class="input" maxlength="30" />
      </div>
      <div class="field">
        <label>数量（必须大于 0）</label>
        <input v-model.number="bundleForm.quantity" class="input" type="number" min="1" />
      </div>
      <div class="field">
        <label>备注（可选）</label>
        <input v-model="bundleForm.remark" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="bundleOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitBundle">保存</button>
      </template>
    </Modal>

    <Modal v-if="batchOpen" title="批量新增捆号" @close="batchOpen = false">
      <div class="field">
        <label>每行一条，格式：码数,数量</label>
        <textarea v-model="batchText" class="textarea mono" rows="8" placeholder="M,100&#10;L,120&#10;XL,80" />
        <span class="hint">捆号由系统自动分配当前款式内最小可用正整数</span>
      </div>
      <template #footer>
        <button class="btn" @click="batchOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitBatch">批量创建</button>
      </template>
    </Modal>

    <Modal v-if="importOpen" title="Excel 导入捆号" wide @close="importOpen = false">
      <div class="alert alert-info">
        表头需包含：捆号（可选，留空自动分配）、码数、数量、备注。导入前先预览校验，确认后再写入。
      </div>
      <div class="flex gap-12 items-center mb-12">
        <input type="file" accept=".xlsx,.xls" @change="onFileChange" />
        <button class="btn btn-sm" @click="downloadTemplate">下载模板</button>
      </div>
      <div v-if="importing" class="muted">解析中…</div>
      <template v-if="importInfo">
        <div class="mb-12">
          <span class="tag tag-blue">共 {{ importInfo.total }} 行</span>
          <span class="tag tag-green" style="margin-left: 6px">可导入 {{ importInfo.validCount }}</span>
          <span class="tag tag-red" style="margin-left: 6px">错误 {{ importInfo.invalidCount }}</span>
        </div>
        <table class="table">
          <thead><tr><th>行号</th><th>捆号</th><th>码数</th><th class="num">数量</th><th>备注</th><th>校验</th></tr></thead>
          <tbody>
            <tr v-for="row in importRows" :key="row.lineNo">
              <td class="mono">{{ row.lineNo }}</td>
              <td class="mono">{{ row.bundleNo ?? '自动' }}</td>
              <td>{{ row.size || '-' }}</td>
              <td class="num">{{ row.quantity ?? '-' }}</td>
              <td class="muted">{{ row.remark || '-' }}</td>
              <td>
                <span v-if="row.valid" class="tag tag-green">通过</span>
                <span v-else class="tag tag-red">{{ row.errors.join('；') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <template #footer>
        <button class="btn" @click="importOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="importing || !importInfo?.canImport" @click="confirmImport">确认导入</button>
      </template>
    </Modal>

    <Modal v-if="editBundleOpen && editBundleTarget" :title="`编辑捆号 ${editBundleTarget.bundleNo}`" @close="editBundleOpen = false">
      <div v-if="editBundleTarget.hasReported" class="alert alert-warn">该捆号已有报工历史，数量与码数不可修改，只能修改备注。</div>
      <div class="field">
        <label>码数</label>
        <input v-model="editBundleForm.size" class="input" maxlength="30" :disabled="editBundleTarget.hasReported" />
      </div>
      <div class="field">
        <label>数量</label>
        <input v-model.number="editBundleForm.quantity" class="input" type="number" min="1" :disabled="editBundleTarget.hasReported" />
      </div>
      <div class="field">
        <label>备注</label>
        <input v-model="editBundleForm.remark" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="editBundleOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitEditBundle">保存</button>
      </template>
    </Modal>

    <Modal v-if="rejectOpen && rejectTarget" title="驳回报工" @close="rejectOpen = false">
      <div class="alert alert-info">
        {{ rejectTarget.process.name }} · 捆号 {{ rejectTarget.bundle.bundleNo }} · {{ rejectTarget.employee.name }}
      </div>
      <div class="field">
        <label>驳回原因（必填）</label>
        <textarea v-model="rejectReason" class="textarea" maxlength="200" placeholder="例如：该捆实际由张三完成" />
      </div>
      <template #footer>
        <button class="btn" @click="rejectOpen = false">取消</button>
        <button class="btn btn-danger" :disabled="saving" @click="submitReject">确认驳回</button>
      </template>
    </Modal>

    <Modal v-if="settleOpen && settleTarget" :title="`结算 · ${settleTarget.name}`" @close="settleOpen = false">
      <div class="alert alert-warn">
        结算仅表示已在现场核对并通过现金/转账完成发放，系统不执行实际付款。确认后金额将按当前工价记录。
      </div>
      <dl class="detail-list mb-12">
        <dt>员工</dt><dd>{{ settleTarget.name }}（{{ settleTarget.employeeNo }}）</dd>
        <dt>计件数量</dt><dd>{{ settleTarget.quantity }}</dd>
        <dt>应发金额</dt><dd class="mono"><strong>{{ money(settleTarget.amount) }}</strong></dd>
      </dl>
      <div class="field">
        <label>发放方式</label>
        <select v-model="settleForm.paymentMethod" class="select">
          <option value="cash">现金</option>
          <option value="wechat_transfer">微信转账</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div class="field">
        <label>备注（可选）</label>
        <input v-model="settleForm.remark" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="settleOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitSettle">确认已发放并登记</button>
      </template>
    </Modal>

    <Modal v-if="payrollDetailOpen && payrollDetail" title="工资明细" wide @close="payrollDetailOpen = false">
      <div class="alert alert-info">
        {{ payrollDetail.employee.name }}（{{ payrollDetail.employee.employeeNo }}） · {{ payrollDetail.style.name }} ·
        合计 {{ payrollDetail.totalQuantity }} 件 / <strong>{{ money(payrollDetail.totalAmount) }}</strong>
      </div>
      <h4 style="margin: 4px 0 8px">工序汇总</h4>
      <table class="table">
        <thead><tr><th>工序</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead>
        <tbody>
          <tr v-for="process in payrollDetail.processes" :key="process.styleProcessId">
            <td>{{ process.processName }}</td>
            <td class="num">{{ process.quantity }}</td>
            <td class="num mono">{{ process.unitPrice }}</td>
            <td class="num mono">{{ process.amount }}</td>
          </tr>
        </tbody>
      </table>
      <h4 style="margin: 18px 0 8px">报工明细</h4>
      <table class="table">
        <thead><tr><th>工序</th><th>捆号</th><th>码数</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>报工时间</th></tr></thead>
        <tbody>
          <tr v-for="report in payrollDetail.reports" :key="report.reportId">
            <td>{{ report.processName }}</td>
            <td class="mono">{{ report.bundleNo }}</td>
            <td>{{ report.size || '-' }}</td>
            <td class="num">{{ report.quantity }}</td>
            <td class="num mono">{{ report.unitPrice }}</td>
            <td class="num mono">{{ report.amount }}</td>
            <td class="hint">{{ formatDateTime(report.reportedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="payrollDetail.settlement" class="alert alert-warn mt-16">
        已结算金额 ¥{{ payrollDetail.settlement.totalAmount }}，与当前工价计算金额差额 ¥{{ payrollDetail.settlement.difference }}。
      </div>
    </Modal>
  </div>

  <div v-else-if="loading" class="empty">加载中…</div>
  <div v-else class="empty">款式不存在或无权访问</div>
</template>
