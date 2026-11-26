<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { api, type EmployeeRow, type Workshop } from '../api';
import Modal from '../components/Modal.vue';
import Pager from '../components/Pager.vue';
import { confirmAction, formatDateTime, statusText, statusTone, toast, toastError } from '../ui';

const rows = ref<EmployeeRow[]>([]);
const total = ref(0);
const loading = ref(false);
const workshops = ref<Workshop[]>([]);

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '' as '' | 'active' | 'disabled',
  workshopId: '',
  bound: '' as '' | '0' | '1',
});

const createOpen = ref(false);
const createForm = reactive({ name: '', remark: '', workshopIds: [] as string[] });
const editOpen = ref(false);
const editTarget = ref<EmployeeRow | null>(null);
const editForm = reactive({ name: '', remark: '' });
const workshopOpen = ref(false);
const workshopTarget = ref<EmployeeRow | null>(null);
const workshopSelection = ref<string[]>([]);
const rebindOpen = ref(false);
const rebindResult = ref<{ token: string; expiresAt: string; employeeName: string } | null>(null);
const saving = ref(false);

const canSubmitCreate = computed(() => createForm.name.trim().length > 0);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.employees({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      workshopId: query.workshopId || undefined,
      bound: query.bound === '' ? undefined : query.bound,
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
    workshops.value = await api.workshops(true);
  } catch (error) {
    toastError(error);
  }
  await load();
});

function openCreate(): void {
  createForm.name = '';
  createForm.remark = '';
  createForm.workshopIds = [];
  createOpen.value = true;
}

async function submitCreate(): Promise<void> {
  if (!canSubmitCreate.value) return;
  saving.value = true;
  try {
    const created = await api.createEmployee({
      name: createForm.name.trim(),
      remark: createForm.remark.trim() || undefined,
      workshopIds: createForm.workshopIds,
    });
    toast(`员工创建成功，编号 ${created.employeeNo}`, 'success');
    createOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openEdit(row: EmployeeRow): void {
  editTarget.value = row;
  editForm.name = row.name;
  editForm.remark = row.remark ?? '';
  editOpen.value = true;
}

async function submitEdit(): Promise<void> {
  if (!editTarget.value) return;
  saving.value = true;
  try {
    await api.updateEmployee(editTarget.value.id, {
      name: editForm.name.trim(),
      remark: editForm.remark.trim(),
    });
    toast('员工信息已更新', 'success');
    editOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openWorkshops(row: EmployeeRow): void {
  workshopTarget.value = row;
  workshopSelection.value = row.workshops.map((item) => item.id);
  workshopOpen.value = true;
}

async function submitWorkshops(): Promise<void> {
  if (!workshopTarget.value) return;
  saving.value = true;
  try {
    await api.setEmployeeWorkshops(workshopTarget.value.id, workshopSelection.value);
    toast('员工车间已更新', 'success');
    workshopOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: EmployeeRow): Promise<void> {
  const disable = row.status === 'active';
  if (!confirmAction(disable ? `确认停用员工「${row.name}」？停用后不能继续报工。` : `确认启用员工「${row.name}」？`)) return;
  try {
    await api.setEmployeeStatus(row.id, disable ? 'disable' : 'enable');
    toast(disable ? '员工已停用' : '员工已启用', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function openRebind(row: EmployeeRow): Promise<void> {
  if (!confirmAction(`为「${row.name}」生成微信重新绑定口令？生成后原绑定仍有效，直到新微信使用该口令。`)) return;
  try {
    const result = await api.createRebindToken(row.id, 30);
    rebindResult.value = { token: result.token, expiresAt: result.expiresAt, employeeName: row.name };
    rebindOpen.value = true;
  } catch (error) {
    toastError(error);
  }
}

async function copyToken(): Promise<void> {
  if (!rebindResult.value) return;
  try {
    await navigator.clipboard.writeText(rebindResult.value.token);
    toast('口令已复制', 'success');
  } catch {
    toast('复制失败，请手动选择文本复制', 'warn');
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">员工管理</div>
        <div class="page-sub">员工编号按公司独立递增；停用员工不能继续报工</div>
      </div>
      <button class="btn btn-primary" @click="openCreate">新增员工</button>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="toolbar">
          <input v-model="query.keyword" class="input" placeholder="姓名 / 员工编号" @keyup.enter="search" />
          <select v-model="query.status" class="select" @change="search">
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </select>
          <select v-model="query.workshopId" class="select" @change="search">
            <option value="">全部车间</option>
            <option v-for="workshop in workshops" :key="workshop.id" :value="workshop.id">{{ workshop.name }}</option>
          </select>
          <select v-model="query.bound" class="select" @change="search">
            <option value="">微信绑定：全部</option>
            <option value="1">已绑定</option>
            <option value="0">未绑定</option>
          </select>
          <button class="btn" @click="search">查询</button>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>编号</th>
            <th>姓名</th>
            <th>所属车间</th>
            <th>微信绑定</th>
            <th>报工数</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="mono">{{ row.employeeNo }}</td>
            <td><strong>{{ row.name }}</strong><div v-if="row.remark" class="hint">{{ row.remark }}</div></td>
            <td>
              <span v-if="row.workshops.length === 0" class="muted">未分配</span>
              <span v-for="workshop in row.workshops" :key="workshop.id" class="tag tag-gray" style="margin-right: 4px">{{ workshop.name }}</span>
            </td>
            <td>
              <span v-if="row.isBound" class="tag tag-green">已绑定</span>
              <span v-else class="tag tag-gray">未绑定</span>
              <div v-if="row.wechat" class="hint mono">{{ row.wechat }}</div>
            </td>
            <td class="num">{{ row.reportCount }}</td>
            <td><span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span></td>
            <td class="hint">{{ formatDateTime(row.createdAt) }}</td>
            <td>
              <div class="actions">
                <button class="btn btn-sm" @click="openEdit(row)">编辑</button>
                <button class="btn btn-sm" @click="openWorkshops(row)">车间</button>
                <button class="btn btn-sm" @click="openRebind(row)">重新绑定</button>
                <button class="btn btn-sm" :class="{ 'btn-danger': row.status === 'active' }" @click="toggleStatus(row)">
                  {{ row.status === 'active' ? '停用' : '启用' }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="8" class="empty">暂无员工。可让员工用公司NO加入，或在此直接创建。</td>
          </tr>
        </tbody>
      </table>
      <Pager v-model:page="query.page" :page-size="query.pageSize" :total="total" @update:page="load" />
    </div>

    <Modal v-if="createOpen" title="新增员工" @close="createOpen = false">
      <div class="field">
        <label>姓名</label>
        <input v-model="createForm.name" class="input" maxlength="50" />
      </div>
      <div class="field">
        <label>备注（可选）</label>
        <input v-model="createForm.remark" class="input" maxlength="200" />
      </div>
      <div class="field">
        <label>所属车间（决定可参与哪些款式）</label>
        <div class="check-list">
          <label v-for="workshop in workshops.filter((w) => w.status === 'active')" :key="workshop.id" class="check">
            <input v-model="createForm.workshopIds" type="checkbox" :value="workshop.id" />
            {{ workshop.name }}
          </label>
          <span v-if="workshops.length === 0" class="muted">还没有车间，可先到「车间管理」创建</span>
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="createOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving || !canSubmitCreate" @click="submitCreate">创建</button>
      </template>
    </Modal>

    <Modal v-if="editOpen" title="编辑员工" @close="editOpen = false">
      <div class="field">
        <label>姓名</label>
        <input v-model="editForm.name" class="input" maxlength="50" />
      </div>
      <div class="field">
        <label>备注</label>
        <input v-model="editForm.remark" class="input" maxlength="200" />
      </div>
      <template #footer>
        <button class="btn" @click="editOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitEdit">保存</button>
      </template>
    </Modal>

    <Modal v-if="workshopOpen" :title="`设置车间 · ${workshopTarget?.name ?? ''}`" @close="workshopOpen = false">
      <p class="hint" style="margin-top: 0">员工只能报「全公司」或「所属车间」允许的款式。可多选。</p>
      <div class="check-list">
        <label v-for="workshop in workshops" :key="workshop.id" class="check">
          <input v-model="workshopSelection" type="checkbox" :value="workshop.id" />
          {{ workshop.name }}
          <span v-if="workshop.status === 'disabled'" class="tag tag-gray">已停用</span>
        </label>
      </div>
      <template #footer>
        <button class="btn" @click="workshopOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitWorkshops">保存</button>
      </template>
    </Modal>

    <Modal v-if="rebindOpen && rebindResult" title="微信重新绑定口令" @close="rebindOpen = false">
      <div class="alert alert-warn">
        该口令仅可使用一次，30 分钟内有效。请交给员工本人在新微信中打开小程序 → 我的 → 重新绑定微信，粘贴口令完成绑定。
      </div>
      <div class="field">
        <label>员工</label>
        <div>{{ rebindResult.employeeName }}</div>
      </div>
      <div class="field">
        <label>口令</label>
        <textarea class="textarea mono" readonly :value="rebindResult.token" />
      </div>
      <div class="field">
        <label>有效期至</label>
        <div>{{ formatDateTime(rebindResult.expiresAt) }}</div>
      </div>
      <template #footer>
        <button class="btn" @click="rebindOpen = false">关闭</button>
        <button class="btn btn-primary" @click="copyToken">复制口令</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.check-list { display: flex; flex-direction: column; gap: 8px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
</style>
