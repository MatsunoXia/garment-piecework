<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { api, type PayrollSummary, type StyleRow } from '../api';
import Modal from '../components/Modal.vue';
import { formatDateTime, money, toastError } from '../ui';

const styles = ref<StyleRow[]>([]);
const styleId = ref('');
const keyword = ref('');
const rows = ref<PayrollSummary[]>([]);
const loading = ref(false);
const detailOpen = ref(false);
const detail = ref<Awaited<ReturnType<typeof api.payrollDetail>> | null>(null);

onMounted(async () => {
  try {
    const result = await api.styles({ page: 1, pageSize: 100 });
    styles.value = result.items;
    if (result.items.length > 0) {
      styleId.value = result.items[0].id;
      await load();
    }
  } catch (error) {
    toastError(error);
  }
});

async function load(): Promise<void> {
  if (!styleId.value) return;
  loading.value = true;
  try {
    rows.value = await api.payrollByStyle(styleId.value, keyword.value || undefined);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

async function openDetail(employeeId: string): Promise<void> {
  try {
    detail.value = await api.payrollDetail(employeeId, styleId.value);
    detailOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}

const totals = () => {
  const amount = rows.value.reduce((sum, row) => sum + Number(row.amount), 0);
  const quantity = rows.value.reduce((sum, row) => sum + row.quantity, 0);
  return { amount: amount.toFixed(2), quantity };
};
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">工资统计</div>
        <div class="page-sub">只统计审核通过的报工；金额按当前工价实时计算</div>
      </div>
      <div class="toolbar">
        <select v-model="styleId" class="select" style="min-width: 240px" @change="load">
          <option value="">选择款式</option>
          <option v-for="style in styles" :key="style.id" :value="style.id">
            {{ style.styleNo }} · {{ style.name }}
          </option>
        </select>
        <input v-model="keyword" class="input" placeholder="员工姓名 / 编号" @keyup.enter="load" />
        <button class="btn" @click="load">查询</button>
      </div>
    </div>

    <div v-if="!styleId" class="card empty">请选择款式查看工资统计</div>

    <template v-else>
      <div class="stats mb-12">
        <div class="stat">
          <div class="stat-label">参与员工</div>
          <div class="stat-value">{{ rows.length }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">计件总数</div>
          <div class="stat-value">{{ totals().quantity }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">工资合计</div>
          <div class="stat-value" style="font-size: 20px">{{ money(totals().amount) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">未结算人数</div>
          <div class="stat-value">{{ rows.filter((row) => !row.settled).length }}</div>
        </div>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>员工</th><th class="num">计件数量</th><th class="num">应发金额</th>
              <th>结算状态</th><th class="num">系统结算金额</th><th class="num">差额</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.employeeId">
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
                  <button class="btn btn-sm" @click="openDetail(row.employeeId)">明细</button>
                  <router-link v-if="row.settled && row.settlementId" class="btn btn-sm" :to="`/settlements/${row.settlementId}`">结算单</router-link>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0"><td colspan="7" class="empty">该款式暂无已审核通过的报工</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <Modal v-if="detailOpen && detail" title="工资明细" wide @close="detailOpen = false">
      <div class="alert alert-info">
        {{ detail.employee.name }}（{{ detail.employee.employeeNo }}） · {{ detail.style.name }} ·
        合计 {{ detail.totalQuantity }} 件 / <strong>{{ money(detail.totalAmount) }}</strong>
      </div>
      <h4 style="margin: 4px 0 8px">工序汇总</h4>
      <table class="table">
        <thead><tr><th>工序</th><th>分组</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead>
        <tbody>
          <tr v-for="process in detail.processes" :key="process.styleProcessId">
            <td>{{ process.processName }}</td>
            <td class="muted">{{ process.groupName || '-' }}</td>
            <td class="num">{{ process.quantity }}</td>
            <td class="num mono">{{ process.unitPrice }}</td>
            <td class="num mono">{{ process.amount }}</td>
          </tr>
        </tbody>
      </table>
      <h4 style="margin: 18px 0 8px">报工明细（{{ detail.reports.length }} 条）</h4>
      <table class="table">
        <thead><tr><th>工序</th><th>捆号</th><th>码数</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>报工时间</th></tr></thead>
        <tbody>
          <tr v-for="report in detail.reports" :key="report.reportId">
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
      <div v-if="detail.settlement" class="alert alert-warn mt-16">
        已结算金额 ¥{{ detail.settlement.totalAmount }}（{{ detail.settlement.paymentMethod }}，{{ formatDateTime(detail.settlement.settledAt) }}），
        与当前工价计算金额差额 ¥{{ detail.settlement.difference }}。
      </div>
    </Modal>
  </div>
</template>
