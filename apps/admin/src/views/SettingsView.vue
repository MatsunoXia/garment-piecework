<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { api, type CompanyInfo } from '../api';
import Modal from '../components/Modal.vue';
import { confirmAction, formatDateTime, statusText, statusTone, toast, toastError } from '../ui';

const company = ref<CompanyInfo | null>(null);
const invitation = ref<{ id: string; code: string; status: string; isExpired: boolean; expiresAt: string | null } | null>(null);
const loading = ref(false);

const renameOpen = ref(false);
const newName = ref('');
const pwdOpen = ref(false);
const pwdForm = reactive({ password: '', confirm: '' });
const disableOpen = ref(false);
const disableText = ref('');
const saving = ref(false);

const isFounder = computed(() => company.value?.isFounder === true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [info, invitations] = await Promise.all([api.company(), api.invitations()]);
    company.value = info;
    invitation.value = invitations.find((item) => item.status === 'active') ?? invitations[0] ?? null;
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openRename(): void {
  newName.value = company.value?.name ?? '';
  renameOpen.value = true;
}

async function submitRename(): Promise<void> {
  if (!newName.value.trim()) {
    toast('请填写公司名称', 'warn');
    return;
  }
  saving.value = true;
  try {
    await api.renameCompany(newName.value.trim());
    toast('公司名称已更新', 'success');
    renameOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

function openPassword(): void {
  pwdForm.password = '';
  pwdForm.confirm = '';
  pwdOpen.value = true;
}

async function submitPassword(): Promise<void> {
  if (pwdForm.password.length < 8) {
    toast('密码至少 8 位', 'warn');
    return;
  }
  if (pwdForm.password !== pwdForm.confirm) {
    toast('两次输入的密码不一致', 'warn');
    return;
  }
  saving.value = true;
  try {
    await api.setWebPassword(pwdForm.password);
    toast('Web 管理密码已更新', 'success');
    pwdOpen.value = false;
    await load();
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}

async function createInvitation(): Promise<void> {
  try {
    const result = await api.createInvitation();
    toast(`公司NO（员工邀请码）：${result.code}`, 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function copyCode(): Promise<void> {
  if (!invitation.value) return;
  try {
    await navigator.clipboard.writeText(invitation.value.code);
    toast('公司NO已复制', 'success');
  } catch {
    toast('复制失败，请手动选择文本复制', 'warn');
  }
}

async function disableInvitation(): Promise<void> {
  if (!invitation.value) return;
  if (!confirmAction('确认停用当前公司NO？停用后员工无法使用该码加入。')) return;
  try {
    await api.updateInvitation(invitation.value.id, 'disabled');
    toast('公司NO已停用', 'success');
    await load();
  } catch (error) {
    toastError(error);
  }
}

async function disableCompany(): Promise<void> {
  if (disableText.value !== '停用公司') {
    toast('请输入「停用公司」确认', 'warn');
    return;
  }
  saving.value = true;
  try {
    const result = await api.disableCompany();
    toast(result.message, 'warn');
    disableOpen.value = false;
  } catch (error) {
    toastError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="company">
    <div class="page-head">
      <div>
        <div class="page-title">公司设置</div>
        <div class="page-sub">公司数据严格隔离；停用后禁止正常业务写入，历史数据保留</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head">
          <h3>公司信息</h3>
          <button class="btn btn-sm" @click="openRename">修改名称</button>
        </div>
        <div class="card-body">
          <dl class="detail-list">
            <dt>公司编号</dt><dd class="mono">{{ company.companyNo }}</dd>
            <dt>公司名称</dt><dd>{{ company.name }}</dd>
            <dt>状态</dt><dd><span class="tag" :class="statusTone(company.status)">{{ statusText(company.status) }}</span></dd>
            <dt>创建时间</dt><dd>{{ formatDateTime(company.createdAt) }}</dd>
            <dt>当前管理员</dt><dd>{{ company.adminName }}</dd>
          </dl>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Web 管理密码</h3>
          <button class="btn btn-sm" :disabled="!isFounder" @click="openPassword">
            {{ company.webPasswordConfigured ? '重置密码' : '设置密码' }}
          </button>
        </div>
        <div class="card-body">
          <p class="hint" style="margin-top: 0">
            用于 Web 管理后台登录（公司编号 + 管理密码）。仅创始管理员可以设置或重置。
          </p>
          <div class="alert" :class="company.webPasswordConfigured ? 'alert-info' : 'alert-warn'" style="margin-bottom: 0">
            {{ company.webPasswordConfigured ? '已设置 Web 管理密码。' : '尚未设置 Web 管理密码，当前无法从浏览器登录后台。' }}
          </div>
          <p v-if="!isFounder" class="hint mt-12">当前账号不是创始管理员，无法修改 Web 管理密码。</p>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-head">
        <h3>公司NO（员工加入用）</h3>
        <div class="toolbar">
          <button class="btn btn-sm" @click="createInvitation">生成新公司NO</button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="!invitation" class="muted">暂无公司NO，点击「生成新公司NO」创建。</div>
        <template v-else>
          <div class="invite-code">
            <span class="mono">{{ invitation.code }}</span>
            <span class="tag" :class="invitation.status === 'active' && !invitation.isExpired ? 'tag-green' : 'tag-red'">
              {{ invitation.status === 'active' && !invitation.isExpired ? '有效' : '已失效' }}
            </span>
            <button class="btn btn-sm" @click="copyCode">复制</button>
            <button v-if="invitation.status === 'active'" class="btn btn-sm btn-danger" @click="disableInvitation">停用</button>
          </div>
          <p class="hint">
            员工在小程序首次进入时选择「我是员工」，填写姓名和这串公司NO即可加入。每家公司同时只保留一个有效公司NO。
            <span v-if="invitation.expiresAt">有效期至 {{ formatDateTime(invitation.expiresAt) }}。</span>
          </p>
        </template>
      </div>
    </div>

    <div class="card mt-16" v-if="isFounder">
      <div class="card-head"><h3>停用公司</h3></div>
      <div class="card-body">
        <div class="alert alert-danger">
          停用后公司所有管理员和员工都将无法继续登录和写入业务数据，历史数据保留但不可操作。此操作不可在界面中撤销，请谨慎使用。
        </div>
        <button class="btn btn-danger" @click="disableOpen = true">停用公司</button>
      </div>
    </div>

    <Modal v-if="renameOpen" title="修改公司名称" @close="renameOpen = false">
      <div class="field">
        <label>公司名称</label>
        <input v-model="newName" class="input" maxlength="100" />
      </div>
      <template #footer>
        <button class="btn" @click="renameOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitRename">保存</button>
      </template>
    </Modal>

    <Modal v-if="pwdOpen" title="设置 Web 管理密码" @close="pwdOpen = false">
      <div class="field">
        <label>新密码（至少 8 位）</label>
        <input v-model="pwdForm.password" class="input" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label>确认新密码</label>
        <input v-model="pwdForm.confirm" class="input" type="password" autocomplete="new-password" />
      </div>
      <template #footer>
        <button class="btn" @click="pwdOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submitPassword">保存</button>
      </template>
    </Modal>

    <Modal v-if="disableOpen" title="停用公司" @close="disableOpen = false">
      <div class="alert alert-danger">该操作会让公司所有账号无法继续使用系统。请输入「停用公司」确认。</div>
      <div class="field">
        <label>确认文字</label>
        <input v-model="disableText" class="input" placeholder="停用公司" />
      </div>
      <template #footer>
        <button class="btn" @click="disableOpen = false">取消</button>
        <button class="btn btn-danger" :disabled="saving" @click="disableCompany">确认停用</button>
      </template>
    </Modal>
  </div>
  <div v-else-if="loading" class="empty">加载中…</div>
  <div v-else class="empty">无法获取公司信息</div>
</template>

<style scoped>
.invite-code { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 650; letter-spacing: 0.08em; flex-wrap: wrap; }
</style>
