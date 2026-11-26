<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { api } from '../api';
import Modal from '../components/Modal.vue';
import { confirmAction, formatDateTime, statusText, statusTone, toast, toastError } from '../ui';

interface AdminRow {
  id: string;
  name: string;
  status: string;
  is_founder: boolean;
  joined_at: string;
}

interface InvitationRow {
  id: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string | null;
  usedCount: number;
}

const admins = ref<AdminRow[]>([]);
const invitations = ref<InvitationRow[]>([]);
const loading = ref(false);

const createOpen = ref(false);
const expiresInDays = ref(7);
const tokenResult = ref<{ token: string; expiresAt: string | null } | null>(null);
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [adminList, invitationList] = await Promise.all([api.admins(), api.adminInvitations()]);
    admins.value = adminList;
    invitations.value = invitationList;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function createInvitation(): Promise<void> {
  saving.value = true;
  try {
    const result = await api.createAdminInvitation(Number(expiresInDays.value) || undefined);
    tokenResult.value = { token: result.invitationToken, expiresAt: result.expiresAt };
    createOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function toggleInvitation(row: InvitationRow): Promise<void> {
  const next = row.status === 'active' ? 'disabled' : 'active';
  if (!confirmAction(next === 'disabled' ? '确认停用该管理员邀请？' : '确认重新启用该邀请？')) return;
  try {
    await api.updateAdminInvitation(row.id, next);
    toast(next === 'disabled' ? '邀请已停用' : '邀请已启用', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function deactivate(row: AdminRow): Promise<void> {
  if (!confirmAction(`确认停用管理员「${row.name}」？最后一名有效管理员不能被停用。`)) return;
  try {
    await api.deactivateAdmin(row.id);
    toast('管理员已停用', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function copyToken(): Promise<void> {
  if (!tokenResult.value) return;
  try {
    await navigator.clipboard.writeText(tokenResult.value.token);
    toast('邀请口令已复制', 'success');
  } catch {
    toast('复制失败，请手动选择文本复制', 'warn');
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">管理员与邀请</div>
        <div class="page-sub">管理员通过微信小程序使用邀请口令加入公司；公司至少保留一名有效管理员</div>
      </div>
      <button class="btn btn-primary" @click="createOpen = true">创建管理员邀请</button>
    </div>

    <div v-if="tokenResult" class="alert alert-warn">
      <strong>邀请口令（仅显示一次）：</strong>
      <div class="flex gap-8 items-center mt-12">
        <code class="mono" style="word-break: break-all">{{ tokenResult.token }}</code>
        <button class="btn btn-sm" @click="copyToken">复制</button>
      </div>
      <div class="hint mt-12">
        有效期至 {{ formatDateTime(tokenResult.expiresAt) }}。同一邀请可被多人使用，每次使用均有记录。请通过安全渠道发送。
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>管理员</h3></div>
        <table class="table">
          <thead><tr><th>姓名</th><th>身份</th><th>加入时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in admins" :key="row.id">
              <td><strong>{{ row.name }}</strong></td>
              <td>
                <span v-if="row.is_founder" class="tag tag-blue">创始管理员</span>
                <span v-else class="tag tag-gray">管理员</span>
              </td>
              <td class="hint">{{ formatDateTime(row.joined_at) }}</td>
              <td>
                <button v-if="!row.is_founder" class="btn btn-sm btn-danger" @click="deactivate(row)">停用</button>
                <span v-else class="muted">受保护</span>
              </td>
            </tr>
            <tr v-if="!loading && admins.length === 0"><td colspan="4" class="empty">暂无管理员</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-head"><h3>管理员邀请</h3></div>
        <table class="table">
          <thead><tr><th>创建时间</th><th>状态</th><th>有效期</th><th class="num">使用次数</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in invitations" :key="row.id">
              <td class="hint">{{ formatDateTime(row.createdAt) }}</td>
              <td><span class="tag" :class="statusTone(row.status)">{{ statusText(row.status) }}</span></td>
              <td class="hint">{{ row.expiresAt ? formatDateTime(row.expiresAt) : '长期有效' }}</td>
              <td class="num">{{ row.usedCount }}</td>
              <td>
                <button class="btn btn-sm" @click="toggleInvitation(row)">
                  {{ row.status === 'active' ? '停用' : '启用' }}
                </button>
              </td>
            </tr>
            <tr v-if="!loading && invitations.length === 0"><td colspan="5" class="empty">暂无邀请</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal v-if="createOpen" title="创建管理员邀请" @close="createOpen = false">
      <div class="alert alert-info">
        邀请口令可被多人使用，每次使用都会记录。管理员需在微信小程序中通过邀请口令加入公司。
      </div>
      <div class="field">
        <label>有效期（天，留空表示长期有效）</label>
        <input v-model.number="expiresInDays" class="input" type="number" min="1" max="365" />
      </div>
      <template #footer>
        <button class="btn" @click="createOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="createInvitation">创建</button>
      </template>
    </Modal>
  </div>
</template>
