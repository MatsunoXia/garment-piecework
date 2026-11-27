<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import { guard } from '../../utils/auth';
import { toast, toastError } from '../../utils/request';

const styleId = ref('');
const styleName = ref('');
const rows = ref<any[]>([]);
const total = ref(0);
const status = ref<'all'|'unused'|'reported'>('all');
const mode = ref<'single'|'batch'>('single');
const size = ref('');
const quantity = ref('');
const batchText = ref('');
const loading = ref(false);
const submitting = ref(false);
const parsed = computed(() => {
  const result: Array<{size?: string; quantity: number}> = [];
  const errors: string[] = [];
  batchText.value.split(/[\n;；]+/).map(x => x.trim()).filter(Boolean).forEach((line, i) => {
    const m = line.match(/^(?:(\S+?)#\s*)?(\d+(?:\s+\d+)*)$/);
    if (!m) { errors.push(`第 ${i+1} 行格式不正确：${line}`); return; }
    const vals = m[2].trim().split(/\s+/).map(Number);
    if (vals.some(x => !Number.isInteger(x) || x < 1)) { errors.push(`第 ${i+1} 行件数必须为正整数`); return; }
    vals.forEach(n => result.push({ size: m[1] || undefined, quantity: n }));
  });
  return { items: result, errors };
});
const visible = computed(() => rows.value.filter(x => status.value === 'all' || (status.value === 'reported' ? x.hasReported : !x.hasReported)));
onLoad(q => { styleId.value = String(q?.styleId || ''); styleName.value = decodeURIComponent(String(q?.name || '')); });
onShow(() => { if (guard('admin') && styleId.value) void load(); });
async function load() {
  loading.value = true;
  try { const r = await api.adminBundleList(styleId.value, { page:1, pageSize:200 }); rows.value = r.items; total.value = r.total; }
  catch(e) { toastError(e); } finally { loading.value = false; }
}
async function addSingle() {
  const n = Number(quantity.value);
  if (!Number.isInteger(n) || n < 1) { toast('件数必须为正整数'); return; }
  submitting.value = true;
  try { const r = await api.createBundle(styleId.value, { size:size.value.trim() || undefined, quantity:n }); toast(`已新增捆号 #${r.bundleNo}`, 'success'); quantity.value=''; await load(); }
  catch(e) { toastError(e); } finally { submitting.value = false; }
}
async function addBatch() {
  if (!parsed.value.items.length || parsed.value.errors.length) { toast(parsed.value.errors[0] || '请先输入有效内容'); return; }
  if (parsed.value.items.length > 200) { toast('单次最多新增 200 捆'); return; }
  submitting.value = true;
  try { const r = await api.batchCreateBundles(styleId.value, parsed.value.items); toast(`成功新增 ${r.count} 捆`, 'success'); batchText.value=''; await load(); }
  catch(e) { toastError(e); } finally { submitting.value = false; }
}
</script>

<template>
  <view class="page bundles-page">
    <view class="heading">{{ styleName || '捆号管理' }}</view>
    <view class="mode-tabs"><view :class="{active:mode==='single'}" @click="mode='single'">单条录入</view><view :class="{active:mode==='batch'}" @click="mode='batch'">批量录入</view></view>
    <view v-if="mode==='single'" class="entry">
      <view class="fields"><input v-model="size" class="field-input size-input" placeholder="码数（选填）" /><input v-model="quantity" class="field-input" type="number" placeholder="件数" /></view>
      <button class="btn primary" :disabled="submitting" @click="addSingle">新增一捆</button>
    </view>
    <view v-else class="entry">
      <textarea v-model="batchText" class="batch-input" placeholder="每行一组，例如：&#10;180# 10 20 30 30&#10;175# 15 20&#10;不写码数时：10 20 30" />
      <view class="parse-summary">识别 {{ parsed.items.length }} 捆 <text v-if="parsed.errors.length" class="error">· {{ parsed.errors.length }} 行有误</text></view>
      <view v-for="err in parsed.errors" :key="err" class="parse-error">{{ err }}</view>
      <button class="btn primary" :disabled="submitting || !parsed.items.length || parsed.errors.length>0" @click="addBatch">确认新增 {{ parsed.items.length }} 捆</button>
    </view>

    <view class="list-head"><text>捆号列表（{{ total }}）</text><text class="refresh" @click="load">刷新</text></view>
    <view class="filters"><text v-for="t in [{v:'all',l:'全部'},{v:'unused',l:'未报工'},{v:'reported',l:'已有报工'}]" :key="t.v" :class="{active:status===t.v}" @click="status=t.v as any">{{ t.l }}</text></view>
    <view v-if="loading && !rows.length" class="empty">加载中…</view>
    <view v-else-if="!visible.length" class="empty">暂无捆号</view>
    <view v-for="b in visible" :key="b.id" class="bundle-row">
      <view class="bundle-number">#{{ b.bundleNo }}</view>
      <view class="bundle-meta"><text>{{ b.size || '均码' }}</text><text>{{ b.quantity }} 件</text></view>
      <view class="bundle-status" :class="{reported:b.hasReported}">{{ b.hasReported ? '已有报工' : '未报工' }}</view>
    </view>
  </view>
</template>

<style scoped>
.bundles-page { padding-top:26rpx; }
.heading { font-size:32rpx; font-weight:700; margin-bottom:22rpx; }
.mode-tabs { display:flex; background:#eaf0ec; border-radius:10rpx; padding:5rpx; margin-bottom:18rpx; }
.mode-tabs view { flex:1; text-align:center; padding:15rpx; font-size:24rpx; color:#6f7a74; border-radius:8rpx; }
.mode-tabs view.active { background:#fff; color:#167d75; font-weight:650; }
.entry { background:#fff; border:1rpx solid #e7ede9; border-radius:12rpx; padding:20rpx; }
.fields { display:flex; gap:12rpx; margin-bottom:16rpx; }
.field-input { min-width:0; flex:1; height:76rpx; padding:0 16rpx; border:1rpx solid #e1e8e3; border-radius:8rpx; font-size:25rpx; }
.size-input { flex:.8; }
.batch-input { width:100%; height:210rpx; box-sizing:border-box; padding:14rpx; background:#fafcfb; border:1rpx solid #e1e8e3; border-radius:8rpx; font-size:24rpx; }
.parse-summary { font-size:22rpx; color:#68756e; padding:12rpx 0; }
.error,.parse-error { color:#bd493d; }
.parse-error { font-size:21rpx; padding:4rpx 0; }
.list-head { display:flex; justify-content:space-between; margin:32rpx 0 12rpx; font-size:26rpx; font-weight:650; }
.refresh { color:#167d75; font-size:22rpx; font-weight:400; }
.filters { display:flex; gap:10rpx; margin-bottom:10rpx; }
.filters text { padding:9rpx 16rpx; background:#edf1ee; border-radius:7rpx; color:#68756e; font-size:21rpx; }
.filters text.active { background:#167d75; color:#fff; }
.bundle-row { display:flex; align-items:center; padding:19rpx 2rpx; border-bottom:1rpx solid #e8eeea; }
.bundle-number { width:100rpx; font-size:28rpx; font-weight:700; }
.bundle-meta { flex:1; display:flex; gap:20rpx; color:#65716b; font-size:23rpx; }
.bundle-status { color:#28764c; background:#eaf5ef; border-radius:6rpx; padding:6rpx 10rpx; font-size:20rpx; }
.bundle-status.reported { color:#a96818; background:#fff4e5; }
</style>