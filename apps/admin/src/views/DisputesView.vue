<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api, type DisputeRow } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { confirmAction, formatDateTime, statusText, statusTone, toast, toastError } from '../ui';

const rows = ref<DisputeRow[]>([]);
const total = ref(0);
const pendingCount = ref(0);
const loading = ref(false);

const query = reactive({ page: 1, pageSize: 20, status: '' as '' | 'pending' | 'resolved' | 'terminated' });

const resolveOpen = ref(false);
const resolveTarget = ref<DisputeRow | null>(null);
const resolveResult = ref<'confirm_original' | 'confirm_challenger' | 'reject_original_report'>('confirm_original');
const resolveReason = ref('');
const saving = ref(false);

const detailOpen = ref(false);
const detailTarget = ref<DisputeRow | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.disputes({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status || undefined,
    });
    rows.value = result.items;
    total.value = result.total;
    pendingCount.value = result.pendingCount;
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

function openResolve(row: DisputeRow, result: 'confirm_original' | 'confirm_challenger' | 'reject_original_report'): void {
  resolveTarget.value = row;
  resolveResult.value = result;
  resolveReason.value = '';
  resolveOpen.value = true;
}

async function submitResolve(): Promise<void> {
  if (!resolveTarget.value) return;
  if (resolveResult.value === 'reject_original_report' && resolveReason.value.trim().length < 2) {
    toast('驳回原报工必须填写原因', 'warn');
    return;
  }
  saving.value = true;
  try {
    const result = await api.resolveDispute(
      resolveTarget.value.id,
      resolveResult.value,
      resolveResult.value === 'reject_original_report' ? resolveReason.value.trim() : undefined,
    );
    toast(result.message, 'success');
    resolveOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openDetail(row: DisputeRow): void {
  detailTarget.value = row;
  detailOpen.value = true;
}

const RESULT_HINT: Record<string, string> = {
  confirm_original: '确认原报工员工就是实际完成人，原报工继续有效。',
  confirm_challenger: '确认实际完成人是质疑员工，报工归属将调整给质疑员工（需该报工未结算）。',
  reject_original_report: '仅当原员工和质疑员工都不是实际完成人时使用。驳回后，实际完成人可重新报工。',
};

function turnPage(page: number): void {
  query.page = page;
  void load();
}

function normalizeConfirm(row: DisputeRow): void {
  if (confirmAction(`确认原员工「${row.originalEmployee.name}」为实际完成人？`)) {
    openResolve(row, 'confirm_original');
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">报工争议</div>
        <div class="page-sub">争议只允许三种处理结果；待处理争议会阻止款式标记完成</div>
      </div>
      <div class="tag tag-orange" v-if="pendingCount > 0">待处理 {{ pendingCount }}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <select v-model="query.status" class="select" @change="search">
            <option value="pending">待处理</option>
            <option value="resolved">已处理</option>
            <option value="terminated">已终止</option>
            <option value="">全部</option>
          </select>
          <button class="btn" @click="load">刷新</button>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>款式 / 工序</th>
            <th>捆号</th>
            <th>原员工</th>
            <th>质疑员工</th>
            <th>争议原因</th>
            <th>发起时间</th>
            <th>状态 / 结果</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <template v-if="row.report">
                <strong>{{ row.report.style.name }}</strong>
                <div class="hint">{{ row.report.process.name }} · {{ row.report.style.styleNo }}</div>
              </template>
              <span v-else class="muted">原报工已删除</span>
            </td>
            <td class="mono">{{ row.report?.bundle.bundleNo ?? '-' }}</td>
            <td>{{ row.originalEmployee.name }}<div class="hint">{{ row.originalEmployee.employeeNo }}</div></td>
            <td>{{ row.challenger.name }}<div class="hint">{{ row.challenger.employeeNo }}</div></td>
            <td class="muted">{{ row.reason || '-' }}</td>
            <td class="hint">{{ formatDateTime(row.createdAt) }}</td>
            <td>
              <span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span>
              <div v-if="row.resultText" class="hint">{{ row.resultText }}</div>
              <div v-if="row.rejectReason" class="hint">驳回原因：{{ row.rejectReason }}</div>
              <div v-if="row.terminationReason" class="hint">{{ row.terminationReason }}</div>
            </td>
            <td>
              <div class="actions">
                <template v-if="row.status === 'pending'">
                  <button class="btn btn-sm" @click="normalizeConfirm(row)">确认原员工</button>
                  <button class="btn btn-sm btn-primary" @click="openResolve(row, 'confirm_challenger')">转给质疑员工</button>
                  <button class="btn btn-sm btn-danger" @click="openResolve(row, 'reject_original_report')">驳回原报工</button>
                </template>
                <button class="btn btn-sm" @click="openDetail(row)">详情</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="8" class="empty">暂无争议记录</td>
          </tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="turnPage" />
    </div>

    <Modal v-if="resolveOpen && resolveTarget" title="处理报工争议" @close="resolveOpen = false">
      <div class="alert alert-warn">{{ RESULT_HINT[resolveResult] }}</div>
      <dl class="detail-list mb-12">
        <dt>款式 / 工序</dt>
        <dd>{{ resolveTarget.report?.style.name }} · {{ resolveTarget.report?.process.name }}</dd>
        <dt>捆号 / 数量</dt>
        <dd>捆号 {{ resolveTarget.report?.bundle.bundleNo }} · {{ resolveTarget.report?.bundle.quantity }} 件</dd>
        <dt>原员工</dt><dd>{{ resolveTarget.originalEmployee.name }}（{{ resolveTarget.originalEmployee.employeeNo }}）</dd>
        <dt>质疑员工</dt><dd>{{ resolveTarget.challenger.name }}（{{ resolveTarget.challenger.employeeNo }}）</dd>
        <dt>争议原因</dt><dd>{{ resolveTarget.reason || '-' }}</dd>
      </dl>
      <div v-if="resolveResult === 'reject_original_report'" class="field">
        <label>驳回原因（必填）</label>
        <textarea v-model="resolveReason" class="textarea" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="resolveOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitResolve">确认处理</button>
      </template>
    </Modal>

    <Modal v-if="detailOpen && detailTarget" title="争议详情" @close="detailOpen = false">
      <dl class="detail-list">
        <dt>状态</dt><dd>{{ statusText(detailTarget.status) }}</dd>
        <dt>处理结果</dt><dd>{{ detailTarget.resultText || '-' }}</dd>
        <dt>原员工</dt><dd>{{ detailTarget.originalEmployee.name }}（{{ detailTarget.originalEmployee.employeeNo }}）</dd>
        <dt>质疑员工</dt><dd>{{ detailTarget.challenger.name }}（{{ detailTarget.challenger.employeeNo }}）</dd>
        <dt>争议原因</dt><dd>{{ detailTarget.reason || '-' }}</dd>
        <dt>处理人</dt><dd>{{ detailTarget.handler?.name || '-' }}</dd>
        <dt>处理时间</dt><dd>{{ formatDateTime(detailTarget.handledAt) }}</dd>
        <dt>终止原因</dt><dd>{{ detailTarget.terminationReason || '-' }}</dd>
      </dl>
    </Modal>
  </div>
</template>
