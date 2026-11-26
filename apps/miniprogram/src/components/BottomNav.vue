<script setup lang="ts">
const props = defineProps<{ active: 'home' | 'report' | 'reports' | 'wages' | 'profile' }>();

const items = [
  { key: 'home', label: '首页', icon: '⌂', url: '/pages/employee/home' },
  { key: 'report', label: '报工', icon: '＋', url: '/pages/employee/report' },
  { key: 'reports', label: '报工记录', icon: '☰', url: '/pages/employee/reports' },
  { key: 'wages', label: '工资', icon: '¥', url: '/pages/employee/wages' },
  { key: 'profile', label: '我的', icon: '☺', url: '/pages/employee/profile' },
] as const;

function go(url: string): void {
  uni.reLaunch({ url });
}
</script>

<template>
  <view class="bottom-nav">
    <view
      v-for="item in items"
      :key="item.key"
      class="nav-item"
      :class="{ active: props.active === item.key }"
      @click="go(item.url)"
    >
      <text class="nav-dot">{{ item.icon }}</text>
      <text>{{ item.label }}</text>
    </view>
  </view>
</template>
