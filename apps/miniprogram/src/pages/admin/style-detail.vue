<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import { guard } from '../../utils/auth';
import { confirm, prompt, toast, toastError } from '../../utils/request';

const id = ref('');
const data = ref<any>(null);
const loading = ref(false);
const production = computed(() => data.value?.status === 'production');
onLoad((query) => { id.value = String(query?.id || ''); });
onShow(() => { if (guard('admin') && id.value) void load(); });
async function load() { loading.value = true; try { data.value = await api.styleDetail(id.value); } catch(e) { toastError(e); } finally { loading.value = false; } }
function goBundles() { uni.navigateTo({ url: `/pages/admin/bundles?styleId=${id.value}&name=${encodeURIComponent(data.value?.name || '')}` }); }
function stateText(s: string) { return ({ production:'生产中', completed:'已完成', settled:'已结算', archived:'已归档' } as Record<string,string>)[s] || s; }
async function addProcess() {
  const name = await prompt('工序名称', '例如：平车、打边、上领');
  if (name === null) return;
  if (!name.trim()) { toast('请输入工序名称'); return; }
  const price = await prompt('工序单价（元/件）', '可先填 0，之后再补充工价');
  if (price === null) return;
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(price.trim())) { toast('请输入最多三位小数的非负数字'); return; }
  try { await api.createStyleProcess(id.value, { name: name.trim(), unitPrice: price.trim() }); toast('工序已添加', 'success'); await load(); } catch(e) { toastError(e); }
}
async function changePrice(p: any) {
  const price = await prompt(`修改「${p.name}」工价`, `当前工价：${p.unitPrice} 元/件，最多三位小数`);
  if (price === null) return;
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(price.trim())) { toast('工价格式不正确'); return; }
  if (!(await confirm('修改工价会同步重算该款工资及结算金额，确认继续？'))) return;
  try { await api.changeProcessPrice(p.id, { unitPrice: price.trim() }); toast('工价已更新', 'success'); await load(); } catch(e) { toastError(e); }
}
async function complete() {
  if (!(await confirm('标记完成后将不能继续新增报工和捆号，确认完成该款式？'))) return;
  try { const r = await api.completeStyle(id.value); toast(r.message, 'success'); await load(); } catch(e) { toastError(e); }
}
async function archive() {
  if (!(await confirm('归档后该款式将从日常生产列表中移出，确认归档？'))) return;
  try { const r = await api.archiveStyle(id.value); toast(r.message, 'success'); await load(); } catch(e) { toastError(e); }
}
function goPayroll() { uni.navigateTo({ url: '/pages/admin/payroll' }); }
</script>

<template>
  <view class="page detail-page">
    <view v-if="loading && !data" class="empty">加载中…</view>
    <template v-if="data">
      <view class="title-row">
        <view><view class="style-name">{{ data.name }}</view><view class="style-no">{{ data.styleNo }}</view></view>
        <view class="state">{{ stateText(data.status) }}</view>
      </view>
      <view class="metrics">
        <view><text class="metric-value">{{ data.stats.bundleCount }}</text><text class="metric-label">捆号</text></view>
        <view><text class="metric-value">{{ data.stats.bundleQuantity }}</text><text class="metric-label">总件数</text></view>
        <view><text class="metric-value">{{ data.stats.employeeCount }}</text><text class="metric-label">参与员工</text></view>
      </view>

      <view class="section-head"><text>工序与工价</text><text v-if="production" class="text-action" @click="addProcess">＋ 添加工序</text></view>
      <view v-if="!data.processes.length" class="empty-inline">还没有工序</view>
      <view v-for="p in data.processes" :key="p.id" class="process-row">
        <view class="process-main"><view class="process-name">{{ p.name }}</view><view class="process-group">{{ p.groupName || '未分组' }}<text v-if="p.hasReported"> · 已有报工</text></view></view>
        <view class="price" @click="changePrice(p)"><text>¥{{ p.unitPrice }}</text><text class="edit">修改</text></view>
      </view>

      <view class="section-head spaced"><text>款式管理</text></view>
      <view class="menu-list">
        <view class="menu-row" @click="goBundles"><text>捆号管理</text><text>管理捆号、批量录入 <text class="arrow">›</text></text></view>
        <view class="menu-row" @click="goPayroll"><text>员工工资</text><text>查看工资明细 <text class="arrow">›</text></text></view>
      </view>

      <view v-if="data.remark" class="remark">{{ data.remark }}</view>
      <view v-if="production" class="bottom-actions"><button class="btn primary" @click="complete">标记款式完成</button></view>
      <view v-else-if="data.status === 'completed' || data.status === 'settled'" class="bottom-actions"><button class="btn" @click="archive">归档款式</button></view>
    </template>
  </view>
</template>

<style scoped>
.detail-page { padding-top:30rpx; padding-bottom:50rpx; }
.title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:26rpx; }
.style-name { font-size:36rpx; font-weight:700; }
.style-no { color:#87918c; font-size:22rpx; margin-top:8rpx; }
.state { font-size:22rpx; color:#167d75; background:#eaf4f1; border-radius:6rpx; padding:8rpx 14rpx; }
.metrics { display:flex; padding:22rpx 0; border-top:1rpx solid #e7ede9; border-bottom:1rpx solid #e7ede9; }
.metrics>view { flex:1; display:flex; flex-direction:column; gap:6rpx; }
.metric-value { font-size:32rpx; font-weight:700; }
.metric-label { color:#87918c; font-size:21rpx; }
.section-head { display:flex; justify-content:space-between; align-items:center; font-size:27rpx; font-weight:650; margin:32rpx 0 12rpx; }
.text-action { color:#167d75; font-size:23rpx; font-weight:500; }
.process-row { display:flex; justify-content:space-between; align-items:center; padding:21rpx 0; border-bottom:1rpx solid #e8eeea; }
.process-name { font-size:27rpx; font-weight:600; }
.process-group { color:#87918c; font-size:21rpx; margin-top:6rpx; }
.price { display:flex; gap:14rpx; align-items:center; font-size:26rpx; font-weight:650; }
.edit { color:#167d75; font-size:22rpx; font-weight:400; }
.empty-inline { padding:24rpx 0; color:#87918c; font-size:23rpx; }
.spaced { margin-top:36rpx; }
.menu-list { border-top:1rpx solid #e7ede9; }
.menu-row { display:flex; justify-content:space-between; padding:24rpx 0; border-bottom:1rpx solid #e7ede9; font-size:26rpx; }
.menu-row>text:last-child { color:#87918c; font-size:22rpx; }
.arrow { font-size:32rpx; margin-left:8rpx; }
.remark { color:#7a8581; font-size:23rpx; margin-top:28rpx; }
.bottom-actions { margin-top:40rpx; }
</style>