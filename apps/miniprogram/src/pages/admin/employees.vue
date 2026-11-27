<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import { guard } from '../../utils/auth';
import { confirm, prompt, toast, toastError } from '../../utils/request';

const rows = ref<any[]>([]);
const keyword = ref('');
const status = ref('active');
const loading = ref(false);
onShow(() => { if (guard('admin')) void load(); });
async function load() {
  loading.value = true;
  try { const r = await api.adminEmployeesList({ page:1, pageSize:200, status: status.value, keyword: keyword.value || undefined }); rows.value = r.items; }
  catch(e) { toastError(e); } finally { loading.value = false; }
}
async function add() {
  const name = await prompt('员工姓名', '不需要微信账号也可以先创建员工');
  if (name === null) return;
  if (!name.trim()) { toast('请输入员工姓名'); return; }
  try { const r = await api.createEmployee({ name:name.trim() }); toast(`已创建员工，编号 ${r.employeeNo}`, 'success'); await load(); }
  catch(e) { toastError(e); }
}
async function toggle(row: any) {
  const active = row.status !== 'active';
  if (!(await confirm(active ? `启用员工「${row.name}」？` : `停用员工「${row.name}」？停用后员工不能继续报工。`))) return;
  try { await api.setEmployeeStatus(row.id, active); toast(active ? '员工已启用' : '员工已停用', 'success'); await load(); }
  catch(e) { toastError(e); }
}
</script>

<template>
  <view class="page employees-page">
    <view class="toolbar"><input v-model="keyword" class="search" placeholder="搜索姓名或员工编号" confirm-type="search" @confirm="load" /><view class="add" @click="add">＋ 新增员工</view></view>
    <view class="tabs"><text :class="{active:status==='active'}" @click="status='active';load()">在职</text><text :class="{active:status==='disabled'}" @click="status='disabled';load()">已停用</text></view>
    <view class="count">{{ rows.length }} 名员工</view>
    <view v-if="loading && !rows.length" class="empty">加载中…</view>
    <view v-else-if="!rows.length" class="empty">暂无员工</view>
    <view v-for="row in rows" :key="row.id" class="employee-row">
      <view class="employee-info"><view class="employee-name">{{ row.name }}</view><view class="employee-no">编号 {{ row.employeeNo }}</view></view>
      <view class="status" :class="{disabled:row.status!=='active'}">{{ row.status==='active'?'在职':'已停用' }}</view>
      <view class="toggle" @click="toggle(row)">{{ row.status==='active'?'停用':'启用' }}</view>
    </view>
  </view>
</template>

<style scoped>
.toolbar { display:flex; gap:12rpx; align-items:center; }
.search { flex:1; min-width:0; height:76rpx; padding:0 18rpx; background:#fff; border:1rpx solid #e2e9e4; border-radius:9rpx; font-size:24rpx; }
.add { background:#167d75; color:#fff; padding:20rpx 18rpx; border-radius:9rpx; font-size:22rpx; white-space:nowrap; }
.tabs { display:flex; gap:24rpx; padding:24rpx 0 14rpx; border-bottom:1rpx solid #e7ede9; }
.tabs text { font-size:24rpx; color:#7b8781; padding-bottom:10rpx; }
.tabs text.active { color:#167d75; border-bottom:4rpx solid #167d75; font-weight:650; }
.count { color:#87918c; font-size:22rpx; padding:16rpx 0 4rpx; }
.employee-row { display:flex; align-items:center; padding:23rpx 0; border-bottom:1rpx solid #e8eeea; }
.employee-info { flex:1; }
.employee-name { font-size:28rpx; font-weight:600; }
.employee-no { color:#87918c; font-size:21rpx; margin-top:6rpx; }
.status { color:#28764c; background:#eaf5ef; padding:6rpx 10rpx; border-radius:6rpx; font-size:20rpx; }
.status.disabled { color:#8a918d; background:#edf0ee; }
.toggle { color:#167d75; margin-left:18rpx; font-size:22rpx; }
</style>