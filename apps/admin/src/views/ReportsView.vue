<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api, type ReportRow } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { confirmAction, formatDateTime, statusText, statusTone, toast, toastError } from '../ui';

const rows = ref<ReportRow[]>([]);
const total = ref(0);
const summary = ref<Record<string, number>>({});
const loading = ref(false);
const selected = ref<string[]>([]);

const query = reactive({
  page: 1,
  pageSize: 20,
  status: 'pending' as '' | 'pending' | 'approved' | 'rejected',
  keyword: '',
  dateFrom: '',
  dateTo: '',
});

const rejectOpen = ref(false);
const rejectReason = ref('');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.reports({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status || undefined,
      keyword: query.keyword || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
    });
    rows.value = result.items;
    total.value = result.total;
    summary.value = result.summary ?? {};
    selected.value = [];
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

function search(): void {
  query.page = 1;
  void load();
}

onMounted(load);

function toggleAll(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  selected.value = checked ? rows.value.filter((row) => row.status === 'pending').map((row) => row.id) : [];
}

async function approveOne(row: ReportRow): Promise<void> {
  try {
    await api.approveReport(row.id);
    toast('审核通过', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function batch(action: 'approve' | 'reject'): Promise<void> {
  if (selected.value.length === 0) {
    toast('请先勾选待审核报工', 'warn');
    return;
  }
  if (action === 'reject') {
    rejectReason.value = '';
    rejectOpen.value = true;
    return;
  }
  if (!confirmAction(`确认批量通过 ${selected.value.length} 条报工？`)) return;
  await runBatch('approve');
}

async function runBatch(action: 'approve' | 'reject'): Promise<void> {
  try {
    const result = await api.batchReview(selected.value, action, action === 'reject' ? rejectReason.value.trim() : undefined);
    toast(
      `${action === 'approve' ? '通过' : '驳回'} ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ''}`,
      result.failedCount ? 'warn' : 'success',
    );
    if (result.failedCount > 0) {
      console.warn('批量审核失败明细', result.failures);
      toast(result.failures[0]?.message ?? '部分记录处理失败', 'warn');
    }
    rejectOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function submitReject(): Promise<void> {
  if (rejectReason.value.trim().length < 2) {
    toast('请填写驳回原因（至少 2 个字）', 'warn');
    return;
  }
  await runBatch('reject');
}

async function remove(row: ReportRow): Promise<void> {
  if (!confirmAction(`确认删除该报工？已结算报工不能删除。`)) return;
  try {
    await api.deleteReport(row.id);
    toast('报工已删除', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">报工审核</div>
        <div class="page-sub">同一捆号同一工序只能有一名员工报工；驳回后实际完成人可重新报工</div>
      </div>
      <div class="toolbar">
        <button class="btn" :disabled="selected.length === 0" @click="batch('reject')">批量驳回（{{ selected.length }}）</button>
        <button class="btn btn-primary" :disabled="selected.length === 0" @click="batch('approve')">批量通过（{{ selected.length }}）</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <select v-model="query.status" class="select" @change="search">
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="">全部状态</option>
          </select>
          <input v-model="query.keyword" class="input" placeholder="员工 / 款式关键字" @keyup.enter="search" />
          <input v-model="query.dateFrom" class="input" type="date" />
          <span class="muted">至</span>
          <input v-model="query.dateTo" class="input" type="date" />
          <button class="btn" @click="search">查询</button>
        </div>
        <div class="hint">
          待审核 {{ summary.pending ?? 0 }} · 已通过 {{ summary.approved ?? 0 }} · 已驳回 {{ summary.rejected ?? 0 }}
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th style="width: 36px"><input type="checkbox" @change="toggleAll" /></th>
            <th>款式</th>
            <th>工序</th>
            <th>捆号</th>
            <th>报工员工</th>
            <th>来源</th>
            <th>报工时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td><input v-model="selected" type="checkbox" :value="row.id" :disabled="row.status !== 'pending'" /></td>
            <td><strong>{{ row.style.name }}</strong><div class="hint mono">{{ row.style.styleNo }}</div></td>
            <td>{{ row.process.name }}<div class="hint">¥{{ row.process.unitPrice }}/件</div></td>
            <td class="mono">{{ row.bundle.bundleNo }}<div class="hint">{{ row.bundle.size || '-' }} · {{ row.bundle.quantity }} 件</div></td>
            <td>{{ row.employee.name }}<div class="hint">{{ row.employee.employeeNo }}</div></td>
            <td><span class="tag" :class="row.source === 'admin_proxy' ? 'tag-blue' : 'tag-gray'">{{ statusText(row.source) }}</span></td>
            <td class="hint">{{ formatDateTime(row.reportedAt) }}</td>
            <td>
              <span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span>
              <div v-if="row.rejectReason" class="hint">{{ row.rejectReason }}</div>
              <div v-if="row.operatorRemark" class="hint">备注：{{ row.operatorRemark }}</div>
            </td>
            <td>
              <div class="actions">
                <template v-if="row.status === 'pending'">
                  <button class="btn btn-sm btn-primary" @click="approveOne(row)">通过</button>
                  <button class="btn btn-sm" @click="selected = [row.id]; batch('reject')">驳回</button>
                </template>
                <button class="btn btn-sm btn-danger" @click="remove(row)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0"><td colspan="9" class="empty">没有符合条件的报工</td></tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="load" />
    </div>

    <Modal v-if="rejectOpen" title="批量驳回报工" @close="rejectOpen = false">
      <div class="alert alert-info">将对选中的 {{ selected.length }} 条报工执行驳回，驳回后该捆号工序可由实际完成人重新报工。</div>
      <div class="field">
        <label>驳回原因（必填）</label>
        <textarea v-model="rejectReason" class="textarea" maxlength="200" placeholder="例如：归属有误，请实际完成人重新报工" />
      </div>
      <template #footer>
        <button class="btn" @click="rejectOpen = false">取消</button>
        <button class="btn btn-danger" @click="submitReject">确认驳回</button>
      </template>
    </Modal>
  </div>
</template>
