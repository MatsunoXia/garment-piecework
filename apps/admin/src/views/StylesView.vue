<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api, type StyleRow, type Workshop } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { formatDate, statusText, statusTone, toast, toastError } from '../ui';

const router = useRouter();
const rows = ref<StyleRow[]>([]);
const total = ref(0);
const workshops = ref<Workshop[]>([]);
const templates = ref<Array<{ id: string; name: string; items: Array<{ name: string; groupName: string | null }> }>>([]);
const loading = ref(false);

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '' as '' | 'production' | 'completed' | 'settled' | 'archived',
});

const createOpen = ref(false);
const saving = ref(false);
const form = reactive({
  name: '',
  remark: '',
  productionScope: 'all' as 'all' | 'workshops',
  workshopIds: [] as string[],
  templateId: '',
  processes: [] as Array<{ name: string; groupName: string; unitPrice: string }>,
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.styles({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
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

onMounted(async () => {
  try {
    const [workshopList, templateList] = await Promise.all([api.workshops(), api.templates()]);
    workshops.value = workshopList;
    templates.value = templateList;
  } catch (error) {
    toastError(error);
  }
  await load();
});

function openCreate(): void {
  form.name = '';
  form.remark = '';
  form.productionScope = 'all';
  form.workshopIds = [];
  form.templateId = '';
  form.processes = [];
  createOpen.value = true;
}

function applyTemplate(): void {
  const template = templates.value.find((item) => item.id === form.templateId);
  if (!template) return;
  form.processes = template.items.map((item) => ({
    name: item.name,
    groupName: item.groupName ?? '',
    unitPrice: '0.000',
  }));
}

function addProcess(): void {
  form.processes.push({ name: '', groupName: '', unitPrice: '0.000' });
}

function removeProcess(index: number): void {
  form.processes.splice(index, 1);
}

async function submitCreate(): Promise<void> {
  if (!form.name.trim()) {
    toast('请填写款式名称', 'warn');
    return;
  }
  if (form.productionScope === 'workshops' && form.workshopIds.length === 0) {
    toast('请选择至少一个生产车间', 'warn');
    return;
  }
  const processes = form.processes
    .filter((item) => item.name.trim())
    .map((item, index) => ({
      name: item.name.trim(),
      groupName: item.groupName.trim() || undefined,
      unitPrice: item.unitPrice || '0',
      sortOrder: index,
    }));

  saving.value = true;
  try {
    const created = await api.createStyle({
      name: form.name.trim(),
      remark: form.remark.trim() || undefined,
      productionScope: form.productionScope,
      workshopIds: form.productionScope === 'workshops' ? form.workshopIds : undefined,
      processes,
    });
    toast(`款式创建成功：${created.styleNo}`, 'success');
    createOpen.value = false;
    await router.push(`/styles/${created.id}`);
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
        <div class="page-title">款式管理</div>
        <div class="page-sub">款式编号自动生成 KYYYYMMNNN；同一款式工序只有一套当前工价</div>
      </div>
      <button class="btn btn-primary" @click="openCreate">新建款式</button>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <input v-model="query.keyword" class="input" placeholder="款式名称 / 编号" @keyup.enter="search" />
          <select v-model="query.status" class="select" @change="search">
            <option value="">全部状态</option>
            <option value="production">生产中</option>
            <option value="completed">已完成</option>
            <option value="settled">已结算</option>
            <option value="archived">已归档</option>
          </select>
          <button class="btn" @click="search">查询</button>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>款式编号</th>
            <th>款式名称</th>
            <th>状态</th>
            <th>生产范围</th>
            <th class="num">工序</th>
            <th class="num">捆号</th>
            <th class="num">待审核</th>
            <th class="num">已结算</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="mono">{{ row.styleNo }}</td>
            <td>
              <strong>{{ row.name }}</strong>
              <span v-if="row.hasZeroPrice" class="tag tag-orange" style="margin-left: 6px">有 0 元工价</span>
            </td>
            <td><span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span></td>
            <td>
              <span v-if="row.productionScope === 'all'" class="tag tag-gray">全公司</span>
              <span v-else class="tag tag-blue">指定车间（{{ row.workshopCount }}）</span>
            </td>
            <td class="num">{{ row.processCount }}</td>
            <td class="num">{{ row.bundleCount }}</td>
            <td class="num">
              <span :class="{ 'tag tag-orange': row.pendingReportCount > 0, muted: row.pendingReportCount === 0 }">
                {{ row.pendingReportCount }}
              </span>
            </td>
            <td class="num">{{ row.settlementCount }}</td>
            <td class="hint">{{ formatDate(row.createdAt) }}</td>
            <td><button class="btn btn-sm" @click="router.push(`/styles/${row.id}`)">详情</button></td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="10" class="empty">还没有款式。点击「新建款式」开始录入生产任务。</td>
          </tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="load" />
    </div>

    <Modal v-if="createOpen" title="新建款式" wide @close="createOpen = false">
      <div class="grid-2">
        <div class="field">
          <label>款式名称</label>
          <input v-model="form.name" class="input" maxlength="100" />
        </div>
        <div class="field">
          <label>备注</label>
          <input v-model="form.remark" class="input" maxlength="200" />
        </div>
      </div>

      <div class="field">
        <label>生产范围</label>
        <div class="flex gap-12">
          <label class="check"><input v-model="form.productionScope" type="radio" value="all" /> 全公司员工</label>
          <label class="check"><input v-model="form.productionScope" type="radio" value="workshops" /> 指定车间</label>
        </div>
      </div>

      <div v-if="form.productionScope === 'workshops'" class="field">
        <label>允许生产的车间</label>
        <div class="flex gap-12" style="flex-wrap: wrap">
          <label v-for="workshop in workshops" :key="workshop.id" class="check">
            <input v-model="form.workshopIds" type="checkbox" :value="workshop.id" /> {{ workshop.name }}
          </label>
          <span v-if="workshops.length === 0" class="muted">请先在「车间管理」创建车间</span>
        </div>
      </div>

      <div class="field">
        <label>工序模板（可选）</label>
        <div class="flex gap-8">
          <select v-model="form.templateId" class="select">
            <option value="">不使用模板</option>
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
          </select>
          <button class="btn" type="button" :disabled="!form.templateId" @click="applyTemplate">填充工序</button>
        </div>
        <span class="hint">模板只填充工序名称，工价需要按本款单独填写。单价支持三位小数，如 0.005。</span>
      </div>

      <div class="field">
        <label>工序与工价</label>
        <table class="table">
          <thead>
            <tr>
              <th>工序名称</th>
              <th>分组</th>
              <th style="width: 130px">单价（元）</th>
              <th style="width: 60px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(process, index) in form.processes" :key="index">
              <td><input v-model="process.name" class="input" maxlength="100" /></td>
              <td><input v-model="process.groupName" class="input" maxlength="100" /></td>
              <td><input v-model="process.unitPrice" class="input mono" inputmode="decimal" /></td>
              <td><button class="btn btn-sm btn-danger" type="button" @click="removeProcess(index)">删</button></td>
            </tr>
          </tbody>
        </table>
        <button class="btn btn-sm mt-12" type="button" @click="addProcess">+ 添加工序</button>
      </div>

      <template #footer>
        <button class="btn" @click="createOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitCreate">创建款式</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.check { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; }
</style>
