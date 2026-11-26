<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { api } from '../api';
import Modal from '../components/Modal.vue';
import { confirmAction, toast, toastError } from '../ui';

interface Template {
  id: string;
  name: string;
  remark: string | null;
  items: Array<{ id: string; name: string; groupName: string | null; sortOrder: number }>;
}

const rows = ref<Template[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const editing = ref<Template | null>(null);
const form = reactive({
  name: '',
  remark: '',
  items: [] as Array<{ name: string; groupName: string }>,
});
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await api.templates();
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
  form.remark = '';
  form.items = [{ name: '', groupName: '' }];
  modalOpen.value = true;
}

function openEdit(template: Template): void {
  editing.value = template;
  form.name = template.name;
  form.remark = template.remark ?? '';
  form.items = template.items.map((item) => ({ name: item.name, groupName: item.groupName ?? '' }));
  modalOpen.value = true;
}

function addItem(): void {
  form.items.push({ name: '', groupName: '' });
}

function removeItem(index: number): void {
  form.items.splice(index, 1);
}

async function submit(): Promise<void> {
  const items = form.items
    .filter((item) => item.name.trim())
    .map((item, index) => ({
      name: item.name.trim(),
      groupName: item.groupName.trim() || undefined,
      sortOrder: index,
    }));

  if (!form.name.trim() || items.length === 0) {
    toast('请填写模板名称和至少一道工序', 'warn');
    return;
  }

  saving.value = true;
  try {
    if (editing.value) {
      await api.updateTemplate(editing.value.id, { name: form.name.trim(), remark: form.remark.trim(), items });
      toast('模板已更新', 'success');
    } else {
      await api.createTemplate({ name: form.name.trim(), remark: form.remark.trim(), items });
      toast('模板已创建', 'success');
    }
    modalOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function remove(template: Template): Promise<void> {
  if (!confirmAction(`确认删除模板「${template.name}」？已创建的款式不受影响。`)) return;
  try {
    await api.deleteTemplate(template.id);
    toast('模板已删除', 'success');
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
        <div class="page-title">工序模板</div>
        <div class="page-sub">创建款式时可套用模板快速生成工序；模板不含工价</div>
      </div>
      <button class="btn btn-primary" @click="openCreate">新建模板</button>
    </div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="rows.length === 0" class="card empty">还没有模板。新建一个常用工序模板，可减少重复录入。</div>
    <div v-else class="grid-2">
      <div v-for="template in rows" :key="template.id" class="card">
        <div class="card-head">
          <div>
            <h3>{{ template.name }}</h3>
            <div class="hint">{{ template.remark || '无备注' }} · {{ template.items.length }} 道工序</div>
          </div>
          <div class="actions">
            <button class="btn btn-sm" @click="openEdit(template)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="remove(template)">删除</button>
          </div>
        </div>
        <div class="card-body" style="padding-top: 10px">
          <div class="process-list">
            <span v-for="(item, index) in template.items" :key="item.id" class="process-chip">
              {{ index + 1 }}. {{ item.name }}
              <span v-if="item.groupName" class="muted">（{{ item.groupName }}）</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <Modal v-if="modalOpen" :title="editing ? '编辑工序模板' : '新建工序模板'" wide @close="modalOpen = false">
      <div class="grid-2">
        <div class="field">
          <label>模板名称</label>
          <input v-model="form.name" class="input" maxlength="100" placeholder="例如 衬衫标准工序" />
        </div>
        <div class="field">
          <label>备注（可选）</label>
          <input v-model="form.remark" class="input" maxlength="200" />
        </div>
      </div>
      <div class="field">
        <label>工序明细</label>
        <table class="table">
          <thead><tr><th>工序名称</th><th>分组</th><th style="width: 60px"></th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in form.items" :key="index">
              <td><input v-model="item.name" class="input" maxlength="100" /></td>
              <td><input v-model="item.groupName" class="input" maxlength="100" /></td>
              <td><button class="btn btn-sm btn-danger" type="button" @click="removeItem(index)">删</button></td>
            </tr>
          </tbody>
        </table>
        <button class="btn btn-sm mt-12" type="button" @click="addItem">+ 添加工序</button>
      </div>
      <template #footer>
        <button class="btn" @click="modalOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submit">保存</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.process-list { display: flex; flex-wrap: wrap; gap: 8px; }
.process-chip { background: #f4f6fb; border: 1px solid var(--border); border-radius: 7px; padding: 5px 9px; font-size: 12px; }
</style>
