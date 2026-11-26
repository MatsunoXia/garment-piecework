<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { formatDateTime, statusText, toastError } from '../ui';

interface LogRow {
  id: string;
  operator_type: string;
  operator_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  created_at: string;
}

const rows = ref<LogRow[]>([]);
const total = ref(0);
const loading = ref(false);
const query = reactive({
  page: 1,
  pageSize: 30,
  actionType: '',
  targetType: '',
  operatorType: '',
  keyword: '',
  dateFrom: '',
  dateTo: '',
});

const detailOpen = ref(false);
const detail = ref<Record<string, unknown> | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.logs({
      page: query.page,
      pageSize: query.pageSize,
      actionType: query.actionType || undefined,
      targetType: query.targetType || undefined,
      operatorType: query.operatorType || undefined,
      keyword: query.keyword || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
    });
    rows.value = result.items;
    total.value = result.total;
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

async function openDetail(row: LogRow): Promise<void> {
  try {
    detail.value = await api.logDetail(row.id);
    detailOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const TARGET_TYPES = ['company', 'employee', 'admin', 'workshop', 'style', 'style_process', 'process_template', 'bundle', 'report', 'report_dispute', 'settlement', 'company_invitation', 'admin_invitation'];
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">操作日志</div>
        <div class="page-sub">追加式记录，普通业务接口不能修改或删除历史日志</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <input v-model="query.keyword" class="input" placeholder="摘要关键字" @keyup.enter="search" />
          <input v-model="query.actionType" class="input" placeholder="操作类型，如 style.create" @keyup.enter="search" />
          <select v-model="query.targetType" class="select" @change="search">
            <option value="">全部对象</option>
            <option v-for="type in TARGET_TYPES" :key="type" :value="type">{{ type }}</option>
          </select>
          <select v-model="query.operatorType" class="select" @change="search">
            <option value="">全部操作者</option>
            <option value="admin">管理员</option>
            <option value="employee">员工</option>
            <option value="system">系统</option>
          </select>
          <input v-model="query.dateFrom" class="input" type="date" />
          <span class="muted">至</span>
          <input v-model="query.dateTo" class="input" type="date" />
          <button class="btn" @click="search">查询</button>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr><th>时间</th><th>操作者类型</th><th>操作类型</th><th>对象</th><th>摘要</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="hint nowrap">{{ formatDateTime(row.created_at) }}</td>
            <td><span class="tag tag-gray">{{ statusText(row.operator_type) }}</span></td>
            <td class="mono">{{ row.action_type }}</td>
            <td class="mono muted">{{ row.target_type }}</td>
            <td>{{ row.summary }}</td>
            <td><button class="btn btn-sm" @click="openDetail(row)">详情</button></td>
          </tr>
          <tr v-if="!loading && rows.length === 0"><td colspan="6" class="empty">暂无日志</td></tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="load" />
    </div>

    <Modal v-if="detailOpen && detail" title="日志详情" wide @close="detailOpen = false">
      <dl class="detail-list mb-12">
        <dt>日志 ID</dt><dd class="mono">{{ detail.id }}</dd>
        <dt>操作类型</dt><dd class="mono">{{ detail.action_type }}</dd>
        <dt>对象</dt><dd class="mono">{{ detail.target_type }} / {{ detail.target_id }}</dd>
        <dt>操作者</dt><dd>{{ detail.operator_type }} / {{ detail.operator_id }}</dd>
        <dt>时间</dt><dd>{{ formatDateTime(String(detail.created_at)) }}</dd>
        <dt>摘要</dt><dd>{{ detail.summary }}</dd>
      </dl>
      <h4 style="margin-bottom: 8px">变更明细</h4>
      <pre class="json">{{ pretty(detail.detail ?? {}) }}</pre>
    </Modal>
  </div>
</template>
