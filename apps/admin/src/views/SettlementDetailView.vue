<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import { api, type SettlementDetail } from '../api';
import Modal from '../components/Modal.vue';
import { formatDateTime, money, statusText, statusTone, toast, toastError } from '../ui';

const route = useRoute();
const detail = ref<SettlementDetail | null>(null);
const loading = ref(true);
const adjustOpen = ref(false);
const saving = ref(false);
const form = reactive({ totalAmount: '', paymentMethod: 'cash', remark: '', reason: '' });

const hasDifference = computed(() => detail.value && detail.value.difference !== '0.00');

async function load(): Promise<void> {
  loading.value = true;
  try {
    detail.value = await api.settlement(String(route.params.id));
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openAdjust(): void {
  if (!detail.value) return;
  form.totalAmount = detail.value.totalAmount;
  form.paymentMethod = detail.value.paymentMethod;
  form.remark = detail.value.remark ?? '';
  form.reason = '';
  adjustOpen.value = true;
}

async function submitAdjust(): Promise<void> {
  if (!detail.value) return;
  if (form.reason.trim().length < 2) {
    toast('请填写修正原因（至少 2 个字）', 'warn');
    return;
  }
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(form.totalAmount)) {
    toast('修正金额最多三位小数且不能为负数', 'warn');
    return;
  }
  saving.value = true;
  try {
    const result = await api.updateSettlement(detail.value.id, {
      totalAmount: form.totalAmount,
      paymentMethod: form.paymentMethod,
      remark: form.remark.trim(),
      reason: form.reason.trim(),
    });
    toast(result.message, 'success');
    adjustOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="detail">
    <div class="page-head">
      <div>
        <div class="page-title">结算详情</div>
        <div class="page-sub">
          {{ detail.employee.name }}（{{ detail.employee.employeeNo }}） ·
          {{ detail.style.name }} <span class="mono">（{{ detail.style.styleNo }}）</span>
        </div>
      </div>
      <div class="toolbar">
        <router-link class="btn" to="/settlements">返回列表</router-link>
        <button class="btn btn-primary" @click="openAdjust">修正结算记录</button>
      </div>
    </div>

    <div v-if="hasDifference" class="alert alert-warn">
      当前工价计算的系统金额为 {{ money(detail.currentAmount) }}，结算记录金额为 {{ money(detail.totalAmount) }}，差额
      {{ money(detail.difference) }}。工价修改后系统金额会同步更新，实际已发放金额需线下核对处理。
    </div>

    <div class="stats mb-12">
      <div class="stat">
        <div class="stat-label">结算金额</div>
        <div class="stat-value" style="font-size: 20px">{{ money(detail.totalAmount) }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">当前工价计算金额</div>
        <div class="stat-value" style="font-size: 20px">{{ money(detail.currentAmount) }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">发放方式</div>
        <div class="stat-value" style="font-size: 18px">{{ statusText(detail.paymentMethod) }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">结算时间</div>
        <div class="stat-value" style="font-size: 15px">{{ formatDateTime(detail.settledAt) }}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>基本信息</h3></div>
        <div class="card-body">
          <dl class="detail-list">
            <dt>员工</dt><dd>{{ detail.employee.name }}（{{ detail.employee.employeeNo }}）</dd>
            <dt>员工状态</dt><dd>{{ statusText(detail.employee.status) }}</dd>
            <dt>款式</dt><dd>{{ detail.style.name }}（{{ detail.style.styleNo }}）</dd>
            <dt>款式状态</dt><dd><span class="tag" :class="statusTone(detail.style.status)">{{ statusText(detail.style.status) }}</span></dd>
            <dt>经办人</dt><dd>{{ detail.operator || '-' }}</dd>
            <dt>备注</dt><dd>{{ detail.remark || '-' }}</dd>
          </dl>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>审计记录</h3></div>
        <div class="card-body" style="padding-top: 8px">
          <div v-if="detail.adjustments.length === 0" class="muted">暂无修正或重算记录</div>
          <ul v-else class="audit-list">
            <li v-for="item in detail.adjustments" :key="item.id">
              <div>{{ item.summary }}</div>
              <div class="hint">{{ formatDateTime(item.createdAt) }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-head"><h3>工序明细</h3></div>
      <table class="table">
        <thead><tr><th>工序</th><th>分组</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.processItems" :key="item.id">
            <td>{{ item.processName }}</td>
            <td class="muted">{{ item.groupName || '-' }}</td>
            <td class="num">{{ item.quantity }}</td>
            <td class="num mono">{{ item.unitPrice }}</td>
            <td class="num mono">{{ item.amount }}</td>
          </tr>
          <tr v-if="detail.processItems.length === 0"><td colspan="5" class="empty">无工序明细</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card mt-16">
      <div class="card-head"><h3>报工依据（{{ detail.reportItems.length }} 条）</h3></div>
      <table class="table">
        <thead><tr><th>工序</th><th>捆号</th><th>码数</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.reportItems" :key="item.id">
            <td>{{ item.processName }}</td>
            <td class="mono">{{ item.bundleNo }}</td>
            <td>{{ item.size || '-' }}</td>
            <td class="num">{{ item.quantity }}</td>
            <td class="num mono">{{ item.unitPrice }}</td>
            <td class="num mono">{{ item.amount }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="adjustOpen" title="修正结算记录" @close="adjustOpen = false">
      <div class="alert alert-warn">
        修正会记录修改前内容、修改后内容、操作者、时间和原因。后续工价重算会保留本次人工调整差额，不会被静默覆盖。
      </div>
      <div class="field">
        <label>修正后金额（元）</label>
        <input v-model="form.totalAmount" class="input mono" inputmode="decimal" />
        <span class="hint">当前工价计算金额：{{ money(detail.currentAmount) }}</span>
      </div>
      <div class="field">
        <label>发放方式</label>
        <select v-model="form.paymentMethod" class="select">
          <option value="cash">现金</option>
          <option value="wechat_transfer">微信转账</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div class="field">
        <label>备注</label>
        <input v-model="form.remark" class="input" maxlength="200" />
      </div>
      <div class="field">
        <label>修正原因（必填）</label>
        <textarea v-model="form.reason" class="textarea" maxlength="200" placeholder="例如：线下补发差额 / 补录漏计报工" />
      </div>
      <template #footer>
        <button class="btn" @click="adjustOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitAdjust">确认修正</button>
      </template>
    </Modal>
  </div>
  <div v-else-if="loading" class="empty">加载中…</div>
  <div v-else class="empty">结算记录不存在</div>
</template>

<style scoped>
.audit-list { list-style: none; margin: 0; padding: 0; }
.audit-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.audit-list li:last-child { border-bottom: none; }
</style>
