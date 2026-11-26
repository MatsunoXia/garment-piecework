<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { api, type DashboardData } from '../api';
import { formatDateTime, toastError } from '../ui';

const data = ref<DashboardData | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    data.value = await api.dashboard();
  } catch (error) {
    toastError(error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-title">工作台</div>
        <div class="page-sub" v-if="data">
          {{ data.company.name }} · 管理员 {{ data.company.adminName }}
          <span v-if="data.company.isFounder" class="tag tag-blue" style="margin-left: 6px">创始管理员</span>
        </div>
      </div>
      <div class="toolbar">
        <router-link class="btn" to="/reports">去审核报工</router-link>
        <router-link class="btn btn-primary" to="/styles">新建款式</router-link>
      </div>
    </div>

    <div v-if="loading" class="empty">加载中…</div>

    <template v-else-if="data">
      <div class="stats">
        <div class="stat">
          <div class="stat-label">待审核报工</div>
          <div class="stat-value">{{ data.reports.pending }}</div>
          <div class="stat-extra">今日通过 {{ data.reports.todayApproved }} 条</div>
        </div>
        <div class="stat">
          <div class="stat-label">待处理争议</div>
          <div class="stat-value">{{ data.disputes.pending }}</div>
          <div class="stat-extra">需及时处理，否则无法完成款式</div>
        </div>
        <div class="stat">
          <div class="stat-label">待结算金额</div>
          <div class="stat-value" style="font-size: 20px">¥{{ data.settlements.pendingAmount }}</div>
          <div class="stat-extra">{{ data.settlements.pendingPairs }} 个「员工+款式」待结算</div>
        </div>
        <div class="stat">
          <div class="stat-label">生产中款式</div>
          <div class="stat-value">{{ data.styles.production }}</div>
          <div class="stat-extra">已完成 {{ data.styles.completed }} · 已结算 {{ data.styles.settled }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">在册员工</div>
          <div class="stat-value">{{ data.employees.active }}</div>
          <div class="stat-extra">停用 {{ data.employees.disabled }} · 车间 {{ data.workshops }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">累计捆号</div>
          <div class="stat-value">{{ data.bundles.count }}</div>
          <div class="stat-extra">共 {{ data.bundles.quantity }} 件</div>
        </div>
      </div>

      <div class="grid-2 mt-16">
        <div class="card">
          <div class="card-head">
            <h3>最近操作</h3>
            <router-link to="/logs" class="btn btn-sm">查看全部</router-link>
          </div>
          <div class="card-body" style="padding-top: 8px">
            <div v-if="data.recentLogs.length === 0" class="empty">暂无操作记录</div>
            <ul v-else class="log-list">
              <li v-for="log in data.recentLogs" :key="log.id">
                <div class="log-summary">{{ log.summary }}</div>
                <div class="log-time">{{ formatDateTime(log.created_at) }}</div>
              </li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>常用操作</h3></div>
          <div class="card-body quick-grid">
            <router-link class="quick" to="/reports">
              <strong>审核报工</strong>
              <span>批量通过 / 驳回</span>
            </router-link>
            <router-link class="quick" to="/disputes">
              <strong>处理争议</strong>
              <span>归属确认与转移</span>
            </router-link>
            <router-link class="quick" to="/payroll">
              <strong>工资统计</strong>
              <span>按员工核对工序明细</span>
            </router-link>
            <router-link class="quick" to="/settlements">
              <strong>工资结算</strong>
              <span>登记线下已发放工资</span>
            </router-link>
            <router-link class="quick" to="/employees">
              <strong>员工管理</strong>
              <span>车间分配与微信绑定</span>
            </router-link>
            <router-link class="quick" to="/settings">
              <strong>公司设置</strong>
              <span>公司NO与 Web 密码</span>
            </router-link>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-list { list-style: none; margin: 0; padding: 0; }
.log-list li { padding: 10px 2px; border-bottom: 1px solid var(--border); }
.log-list li:last-child { border-bottom: none; }
.log-summary { font-size: 13px; line-height: 1.5; }
.log-time { font-size: 12px; color: var(--muted); margin-top: 3px; }
.quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.quick {
  display: flex; flex-direction: column; gap: 3px; padding: 13px 14px;
  border: 1px solid var(--border); border-radius: 9px; color: var(--text); background: var(--panel-2);
}
.quick:hover { border-color: var(--primary); background: var(--primary-weak); }
.quick strong { font-size: 13px; }
.quick span { font-size: 12px; color: var(--muted); }
</style>
