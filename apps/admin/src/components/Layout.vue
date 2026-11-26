<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '../api';
import { tokenStore } from '../api/client';
import { clearSession, session } from '../session';
import { toasts, toastError } from '../ui';

const router = useRouter();
const route = useRoute();
const companyName = ref(session.user?.companyName ?? '');
const pendingCount = ref(0);

const nav = [
  { group: '概览', items: [{ to: '/', label: '工作台', icon: '◧' }] },
  {
    group: '生产管理',
    items: [
      { to: '/styles', label: '款式管理', icon: '◈' },
      { to: '/templates', label: '工序模板', icon: '≡' },
      { to: '/workshops', label: '车间管理', icon: '⌂' },
    ],
  },
  {
    group: '报工',
    items: [
      { to: '/reports', label: '报工审核', icon: '✓' },
      { to: '/disputes', label: '报工争议', icon: '!' },
    ],
  },
  {
    group: '工资',
    items: [
      { to: '/payroll', label: '工资统计', icon: '¥' },
      { to: '/settlements', label: '工资结算', icon: '▤' },
    ],
  },
  {
    group: '组织',
    items: [
      { to: '/employees', label: '员工管理', icon: '☺' },
      { to: '/admins', label: '管理员与邀请', icon: '⚑' },
      { to: '/logs', label: '操作日志', icon: '☰' },
      { to: '/settings', label: '公司设置', icon: '⚙' },
    ],
  },
];

onMounted(async () => {
  try {
    const data = await api.dashboard();
    companyName.value = data.company.name;
    pendingCount.value = data.reports.pending + data.disputes.pending;
  } catch (error) {
    if (error instanceof Error && error.message.includes('无法连接')) toastError(error);
  }
});

function logout(): void {
  tokenStore.clear();
  clearSession();
  void router.replace({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">计</div>
        <div>
          <div class="brand-title">计件工资管理</div>
          <div class="brand-sub">{{ companyName }}</div>
        </div>
      </div>

      <nav class="nav">
        <div v-for="group in nav" :key="group.group" class="nav-group">
          <div class="nav-group-title">{{ group.group }}</div>
          <router-link
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to)) }"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
            <span v-if="item.to === '/reports' && pendingCount > 0" class="nav-badge">{{ pendingCount }}</span>
          </router-link>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div class="muted" style="font-size: 12px">{{ session.user?.name }}</div>
        <button class="btn btn-sm" style="margin-top: 8px" @click="logout">退出登录</button>
      </div>
    </aside>

    <main class="main">
      <router-view />
    </main>

    <div class="toasts">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind">{{ item.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 228px; flex-shrink: 0; background: #fff; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; gap: 10px; align-items: center; padding: 18px 16px; border-bottom: 1px solid var(--border); }
.brand-mark {
  width: 34px; height: 34px; border-radius: 9px; background: var(--primary); color: #fff;
  display: grid; place-items: center; font-weight: 700;
}
.brand-title { font-weight: 650; font-size: 14px; }
.brand-sub { font-size: 11px; color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav { flex: 1; overflow: auto; padding: 12px 10px; }
.nav-group { margin-bottom: 14px; }
.nav-group-title { font-size: 11px; color: #9aa1ae; padding: 4px 8px 6px; letter-spacing: 0.04em; }
.nav-item {
  display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px;
  color: #3f4756; font-size: 13px; margin-bottom: 2px;
}
.nav-item:hover { background: #f5f7fb; }
.nav-item.active { background: var(--primary-weak); color: var(--primary); font-weight: 600; }
.nav-icon { width: 16px; text-align: center; opacity: 0.8; }
.nav-badge { margin-left: auto; background: var(--danger); color: #fff; border-radius: 999px; font-size: 11px; padding: 0 6px; }
.sidebar-foot { padding: 12px 16px 18px; border-top: 1px solid var(--border); }
.main { flex: 1; min-width: 0; padding: 22px 26px 40px; }
</style>
