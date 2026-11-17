<script setup lang="ts">
/**
 * 统一页面头部组件：包含标题、徽标插槽、副标题与右侧操作区插槽。
 */
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
  }>(),
  {
    subtitle: '',
  },
)
</script>

<template>
  <header class="admin-page__header">
    <div class="page-head__main">
      <div class="admin-panel__title-row">
        <h1 class="admin-page__title">{{ title }}</h1>
        <slot name="badges" />
      </div>
      <p v-if="subtitle" class="admin-page__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="admin-page__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head__main {
  min-width: 0;
}
</style>
