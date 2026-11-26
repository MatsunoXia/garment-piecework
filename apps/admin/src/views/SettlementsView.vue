<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api, type PayrollSummary, type SettlementRow, type StyleRow } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { formatDateTime, money, statusText, toast, toastError } from '../ui';

const rows = ref<SettlementRow[]>([]);
const total = ref(0);
const summaryAmount = ref('0.00');
const loading = ref(false);

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  paymentMethod: '',
  dateFrom: '',
  dateTo: '',
});

const styles = ref<StyleRow[]>([]);
const pendingStyleId = ref('');
const pending = ref<PayrollSummary[]>([]);
const pendingStyleStatus = ref('');
const pendingLoading = ref(false);

const settleOpen = ref(false);
const settleTarget = ref<PayrollSummary | null>(null);
const settleForm = reactive({ paymentMethod: 'cash', remark: '' });
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.settlements({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      paymentMethod: query.paymentMethod || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
    });
    rows.value = result.items;
    total.value = result.total;
    summaryAmount.value = result.summary.totalAmount;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const result = await api.styles({ page: 1, pageSize: 100 });
    styles.value = result.items.filter((item) => item.status === 'completed' || item.status === 'settled');
  } catch (error) {
    toastError(error);
  }
  await load();
});

function search(): void {
  query.page = 1;
  void load();
}

async function loadPending(): Promise<void> {
  if (!pendingStyleId.value) {
    pending.value = [];
    return;
  }
  pendingLoading.value = true;
  try {
    const result = await api.pendingSettlements(pendingStyleId.value);
    pending.value = result.items;
    pendingStyleStatus.value = result.style.status;
  } catch (error) {
    toastError(error);
  } finally {
    pendingLoading.value = false;
  }
}

function openSettle(row: PayrollSummary): void {
  settleTarget.value = row;
  settleForm.paymentMethod = 'cash';
  settleForm.remark = '';
  settleOpen.value = true;
}

async function submitSettle(): Promise<void> {
  if (!settleTarget.value || !pendingStyleId.value) return;
  saving.value = true;
  try {
    const result = await api.createSettlement({
      employeeId: settleTarget.value.employeeId,
      styleId: pendingStyleId.value,
      paymentMethod: settleForm.paymentMethod,
      remark: settleForm.remark.trim() || undefined,
    });
    toast(`结算成功：${money(result.totalAmount)}`, 'success');
    if (result.styleSettled) toast('该款全部员工已结算，款式已进入已结算状态', 'info');
    settleOpen.value = false;
    await Promise.all([loadPending(), load()]);
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">工资结算</div>
        <div class="page-sub">结算表示工资已在线下发放并登记，系统不执行付款</div>
      </div>
    </div>

    <div class="card mb-12">
      <div class="card-head">
        <h3>按款式结算</h3>
        <div class="toolbar">
          <select v-model="pendingStyleId" class="select" style="min-width: 260px" @change="loadPending">
            <option value="">选择已完成/已结算款式</option>
            <option v-for="style in styles" :key="style.id" :value="style.id">
              {{ style.styleNo }} · {{ style.name }}（{{ statusText(style.status) }}）
            </option>
          </select>
        </div>
      </div>
      <div v-if="!pendingStyleId" class="card-body muted">选择款式后，可查看待结算员工并逐个登记结算。</div>
      <div v-else-if="pendingLoading" class="card-body muted">加载中…</div>
      <template v-else>
        <div v-if="pendingStyleStatus === 'production'" class="card-body">
          <div class="alert alert-warn" style="margin-bottom: 0">该款式仍在生产中，需先处理完待审核报工与争议并标记完成，才能结算。</div>
        </div>
        <table v-else class="table">
          <thead><tr><th>员工</th><th class="num">计件数量</th><th class="num">应发金额</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in pending" :key="row.employeeId">
              <td><strong>{{ row.name }}</strong><div class="hint">{{ row.employeeNo }}</div></td>
              <td class="num">{{ row.quantity }}</td>
              <td class="num mono"><strong>{{ money(row.amount) }}</strong></td>
              <td><button class="btn btn-sm btn-primary" @click="openSettle(row)">登记结算</button></td>
            </tr>
            <tr v-if="pending.length === 0"><td colspan="4" class="empty">该款已无待结算员工</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <input v-model="query.keyword" class="input" placeholder="员工 / 款式关键字" @keyup.enter="search" />
          <select v-model="query.paymentMethod" class="select" @change="search">
            <option value="">全部方式</option>
            <option value="cash">现金</option>
            <option value="wechat_transfer">微信转账</option>
            <option value="other">其他</option>
          </select>
          <input v-model="query.dateFrom" class="input" type="date" />
          <span class="muted">至</span>
          <input v-model="query.dateTo" class="input" type="date" />
          <button class="btn" @click="search">查询</button>
        </div>
        <div class="hint">本页合计 {{ money(summaryAmount) }}</div>
      </div>

      <table class="table">
        <thead>
          <tr><th>结算时间</th><th>员工</th><th>款式</th><th class="num">金额</th><th>方式</th><th>经办人</th><th>报工明细</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="hint">{{ formatDateTime(row.settledAt) }}</td>
            <td><strong>{{ row.employee.name }}</strong><div class="hint">{{ row.employee.employeeNo }}</div></td>
            <td>{{ row.style.name }}<div class="hint mono">{{ row.style.styleNo }}</div></td>
            <td class="num mono"><strong>{{ money(row.totalAmount) }}</strong></td>
            <td>{{ statusText(row.paymentMethod) }}</td>
            <td>{{ row.operator || '-' }}</td>
            <td class="num">{{ row.reportCount }}</td>
            <td>
              <div class="actions">
                <router-link class="btn btn-sm" :to="`/settlements/${row.id}`">详情</router-link>
                <router-link class="btn btn-sm" :to="`/payroll`">工资</router-link>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0"><td colspan="8" class="empty">暂无结算记录</td></tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="load" />
    </div>

    <Modal v-if="settleOpen && settleTarget" :title="`登记结算 · ${settleTarget.name}`" @close="settleOpen = false">
      <div class="alert alert-warn">
        请先在线下核对并完成实际发放，再在系统中登记。登记后若修改工价，系统金额会同步变化，但实际发放金额不会自动调整。
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
        <label>备注</label>
        <input v-model="settleForm.remark" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="settleOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitSettle">确认登记</button>
      </template>
    </Modal>
  </div>
</template>
