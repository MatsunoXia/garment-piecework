<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '../api';
import { ApiError, tokenStore } from '../api/client';
import { setSession } from '../session';

const router = useRouter();
const route = useRoute();

const company = ref('');
const password = ref('');
const adminName = ref('');
const loading = ref(false);
const error = ref('');

async function submit(): Promise<void> {
  if (!company.value.trim() || !password.value) {
    error.value = '请填写公司编号/名称和管理密码';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const result = await api.login(company.value.trim(), password.value, adminName.value.trim() || undefined);
    if (!result.accessToken || !result.user.companyId || !result.user.companyName) {
      error.value = '登录返回数据不完整';
      return;
    }
    tokenStore.set(result.accessToken);
    setSession({
      id: result.user.id,
      name: result.user.name ?? '管理员',
      companyId: result.user.companyId,
      companyName: result.user.companyName,
    });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirect);
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : '登录失败，请检查公司编号、管理密码和 API 服务是否正常';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-mark">计</div>
        <div>
          <h1>服装厂计件工资管理</h1>
          <p class="muted">Web 管理后台 · 管理员登录</p>
        </div>
      </div>

      <form @submit.prevent="submit">
        <div class="field">
          <label>公司编号 / 公司名称</label>
          <input v-model="company" class="input" placeholder="例如 C8KQ2M3F 或 XX服装厂" autocomplete="organization" />
          <span class="hint">公司编号可在小程序「公司设置」中查看</span>
        </div>

        <div class="field">
          <label>Web 管理密码</label>
          <input v-model="password" class="input" type="password" placeholder="创建公司后在小程序设置" autocomplete="current-password" />
        </div>

        <div class="field">
          <label>管理员姓名（可选）</label>
          <input v-model="adminName" class="input" placeholder="不填则使用创始管理员身份" />
        </div>

        <div v-if="error" class="alert alert-danger">{{ error }}</div>

        <button class="btn btn-primary" style="width: 100%; justify-content: center" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <div class="login-tip">
        <strong>首次使用？</strong>
        <p>请先用创始管理员的微信打开小程序，在「公司设置」中设置 Web 管理密码，然后回到这里登录。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh; display: grid; place-items: center; padding: 24px;
  background: radial-gradient(1200px 500px at 15% 0%, #e8edff 0%, transparent 60%), var(--bg);
}
.login-card {
  width: 100%; max-width: 420px; background: #fff; border: 1px solid var(--border);
  border-radius: 14px; padding: 28px; box-shadow: var(--shadow);
}
.login-brand { display: flex; gap: 12px; align-items: center; margin-bottom: 22px; }
.login-mark {
  width: 42px; height: 42px; border-radius: 11px; background: var(--primary); color: #fff;
  display: grid; place-items: center; font-weight: 700; font-size: 18px;
}
.login-brand h1 { font-size: 18px; }
.login-brand p { margin: 2px 0 0; font-size: 12px; }
.login-tip { margin-top: 22px; padding-top: 16px; border-top: 1px dashed var(--border); font-size: 12px; color: var(--muted); }
.login-tip p { margin: 6px 0 0; line-height: 1.6; }
</style>
