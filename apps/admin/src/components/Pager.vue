<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
}>();

const emit = defineEmits<{ 'update:page': [page: number] }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

function go(page: number): void {
  if (page < 1 || page > totalPages.value || page === props.page) return;
  emit('update:page', page);
}
</script>

<template>
  <div class="flex items-center gap-12" style="justify-content: flex-end; padding: 12px 4px 0">
    <span class="muted">共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
    <button class="btn btn-sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
    <button class="btn btn-sm" :disabled="page >= totalPages" @click="go(page + 1)">下一页</button>
  </div>
</template>
