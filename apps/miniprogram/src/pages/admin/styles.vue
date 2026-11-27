<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import { guard } from '../../utils/auth';
import { prompt, toast, toastError } from '../../utils/request';

type StyleRow = { id: string; styleNo: string; name: string; status: string; bundleCount?: number };
const rows = ref<StyleRow[]>([]);
const status = ref('');
const keyword = ref('');
const loading = ref(false);
const creating = ref(false);
const statusOptions = [{ label: '全部', value: '' }, { label: '生产中', value: 'production' }, { label: '已完成', value: 'completed' }, { label: '已结算', value: 'settled' }, { label: '已归档', value: 'archived' }];
const filteredLabel = computed(() => statusOptions.find(x => x.value === status.value)?.label || '全部');

onShow(() => { if (guard('admin')) void load(); });
async function load() {
  loading.value = true;
  try { const result = await api.adminStyles(status.value as 'production' | 'completed' | 'settled' | undefined); rows.value = result.items; }
  catch (e) { toastError(e); } finally { loading.value = false; }
}
function open(row: StyleRow) { uni.navigateTo({ url: `/pages/admin/style-detail?id=${row.id}` }); }
async function create() {
  const name = await prompt('输入款式名称', '款式名称在同一公司内不能重复');
  if (name === null) return;
  if (!name.trim()) { toast('请输入款式名称'); return; }
  creating.value = true;
  try { const result = await api.createStyle({ name: name.trim() }); toast(`创建成功，编号 ${result.styleNo}`, 'success'); await load(); open({ id: result.id, styleNo: result.styleNo, name: result.name, status: 'production' }); }
  catch (e) { toastError(e); } finally { creating.value = false; }
}
function stateText(value: string) { return ({ production: '生产中', completed: '已完成', settled: '已结算', archived: '已归档' } as Record<string,string>)[value] || value; }
</script>

<template>
  <view class="page styles-page">
    <view class="toolbar">
      <input v-model="keyword" class="search" placeholder="搜索款式名称或编号" confirm-type="search" />
      <view class="add" @click="create">＋ 新建</view>
    </view>
    <scroll-view scroll-x class="filters">
      <view v-for="item in statusOptions" :key="item.value" class="filter" :class="{ active: status === item.value }" @click="status = item.value; load()">{{ item.label }}</view>
    </scroll-view>
    <view class="count">{{ filteredLabel }} · {{ rows.length }} 款</view>
    <view v-if="loading && !rows.length" class="empty">加载中…</view>
    <view v-else-if="!rows.length" class="empty">暂无款式</view>
    <view v-for="row in rows.filter(x => !keyword || x.name.includes(keyword) || x.styleNo.toLowerCase().includes(keyword.toLowerCase()))" :key="row.id" class="style-row" @click="open(row)">
      <view class="style-main">
        <view class="style-name">{{ row.name }}</view>
        <view class="style-no">{{ row.styleNo }}</view>
      </view>
      <view class="style-state" :class="row.status">{{ stateText(row.status) }}</view>
      <text class="arrow">›</text>
    </view>
    <view v-if="creating" class="loading">正在创建…</view>
  </view>
</template>

<style scoped>
.styles-page { padding-top:24rpx; }
.toolbar { display:flex; gap:14rpx; align-items:center; }
.search { flex:1; height:76rpx; padding:0 20rpx; border-radius:10rpx; background:#fff; border:1rpx solid #e3eae6; font-size:25rpx; }
.add { background:#167d75; color:#fff; border-radius:10rpx; padding:20rpx 22rpx; font-size:24rpx; font-weight:600; }
.filters { white-space:nowrap; margin:24rpx 0 18rpx; }
.filter { display:inline-block; padding:12rpx 20rpx; margin-right:10rpx; border-radius:8rpx; color:#65716c; background:#edf1ee; font-size:23rpx; }
.filter.active { color:#fff; background:#167d75; }
.count { color:#84908a; font-size:22rpx; margin-bottom:10rpx; }
.style-row { display:flex; align-items:center; padding:24rpx 4rpx; border-bottom:1rpx solid #e8eeea; }
.style-main { flex:1; }
.style-name { font-size:29rpx; font-weight:650; }
.style-no { color:#84908a; font-size:21rpx; margin-top:7rpx; }
.style-state { font-size:21rpx; padding:6rpx 12rpx; border-radius:6rpx; background:#edf1ee; color:#66716b; }
.style-state.production { background:#eaf4f1; color:#167d75; }
.style-state.completed { background:#fff4e5; color:#a96818; }
.arrow { color:#9ba59f; font-size:36rpx; margin-left:14rpx; }
.loading { text-align:center; color:#87918c; padding:20rpx; }
</style>