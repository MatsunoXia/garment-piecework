<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api, type Workshop } from '../api';
import Modal from '../components/Modal.vue';
import { confirmAction, statusText, statusTone, toast, toastError } from '../ui';

const rows = ref<Workshop[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const editing = ref<Workshop | null>(null);
const form = reactive({ name: '', status: 'active' as 'active' | 'disabled' });
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await api.workshops(true);
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openCreate(): void {
  editing.value = null;
  form.name = '';
  form.status = 'active';
  modalOpen.value = true;
}

function openEdit(row: Workshop): void {
  editing.value = row;
  form.name = row.name;
  form.status = row.status;
  modalOpen.value = true;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    toast('请填写车间名称', 'warn');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await api.updateWorkshop(editing.value.id, { name: form.name.trim(), status: form.status });
      toast('车间已更新', 'success');
    } else {
      await api.createWorkshop(form.name.trim());
      toast('车间已创建', 'success');
    }
    modalOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function remove(row: Workshop): Promise<void> {
  if (!confirmAction(`确认删除车间「${row.name}」？删除后员工与车间的关联会被清理，历史报工与工资不受影响。`)) return;
  try {
    const result = await api.deleteWorkshop(row.id);
    toast(result.message, 'success');
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
        <div class="page-title">车间管理</div>
        <div class="page-sub">车间决定员工可以参与哪些款式的生产，不设单独的员工生产权限</div>
      </div>
      <button class="btn btn-primary" @click="openCreate">新增车间</button>
    </div>

    <div class="alert alert-info">
      款式的生产范围可以设为「全公司」或「指定车间」。员工报工时，系统按后端配置校验所属车间，前端按钮不作为权限依据。
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>车间名称</th>
            <th class="num">员工数</th>
            <th class="num">引用款式数</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td><strong>{{ row.name }}</strong></td>
            <td class="num">{{ row.employeeCount }}</td>
            <td class="num">{{ row.styleCount }}</td>
            <td><span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span></td>
            <td>
              <div class="actions">
                <button class="btn btn-sm" @click="openEdit(row)">编辑</button>
                <button class="btn btn-sm btn-danger" @click="remove(row)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="5" class="empty">还没有车间。请先创建车间，再把员工分配到车间。</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="modalOpen" :title="editing ? '编辑车间' : '新增车间'" @close="modalOpen = false">
      <div class="field">
        <label>车间名称</label>
        <input v-model="form.name" class="input" maxlength="50" placeholder="例如 一车间 / 车缝组" />
        <span class="hint">同一公司内车间名称不能重复</span>
      </div>
      <div v-if="editing" class="field">
        <label>状态</label>
        <select v-model="form.status" class="select">
          <option value="active">正常</option>
          <option value="disabled">停用</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="modalOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submit">保存</button>
      </template>
    </Modal>
  </div>
</template>
