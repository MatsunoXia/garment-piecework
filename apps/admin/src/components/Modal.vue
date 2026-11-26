<script setup lang="ts">
defineProps<{
  title: string;
  wide?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <teleport to="body">
    <div class="modal-mask" @click.self="emit('close')">
      <div class="modal" :class="{ 'modal-lg': wide }">
        <div class="modal-head">
          <h3>{{ title }}</h3>
          <button class="close" type="button" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </teleport>
</template>
