import { createRouter, createWebHashHistory } from 'vue-router';

import { onUnauthorized, tokenStore } from './api/client';
import { clearSession } from './session';

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./components/Layout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'employees', name: 'employees', component: () => import('./views/EmployeesView.vue'), meta: { title: '员工管理' } },
      { path: 'workshops', name: 'workshops', component: () => import('./views/WorkshopsView.vue'), meta: { title: '车间管理' } },
      { path: 'styles', name: 'styles', component: () => import('./views/StylesView.vue'), meta: { title: '款式管理' } },
      { path: 'styles/:id', name: 'style-detail', component: () => import('./views/StyleDetailView.vue'), meta: { title: '款式详情' } },
      { path: 'templates', name: 'templates', component: () => import('./views/TemplatesView.vue'), meta: { title: '工序模板' } },
      { path: 'reports', name: 'reports', component: () => import('./views/ReportsView.vue'), meta: { title: '报工审核' } },
      { path: 'disputes', name: 'disputes', component: () => import('./views/DisputesView.vue'), meta: { title: '报工争议' } },
      { path: 'payroll', name: 'payroll', component: () => import('./views/PayrollView.vue'), meta: { title: '工资统计' } },
      { path: 'settlements', name: 'settlements', component: () => import('./views/SettlementsView.vue'), meta: { title: '工资结算' } },
      { path: 'settlements/:id', name: 'settlement-detail', component: () => import('./views/SettlementDetailView.vue'), meta: { title: '结算详情' } },
      { path: 'admins', name: 'admins', component: () => import('./views/AdminsView.vue'), meta: { title: '管理员与邀请' } },
      { path: 'logs', name: 'logs', component: () => import('./views/LogsView.vue'), meta: { title: '操作日志' } },
      { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: '公司设置' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = tokenStore.get();
  if (!to.meta.public && !token) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.name === 'login' && token) return { name: 'dashboard' };
  return true;
});

onUnauthorized(() => {
  clearSession();
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' });
  }
});
