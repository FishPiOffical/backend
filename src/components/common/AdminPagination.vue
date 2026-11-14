<script setup lang="ts">
/**
 * 统一分页控件：明确展示总条数、页码、每页大小与上一页/下一页控制。
 */
const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageCount: number
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
}>()

function goTo(target: number): void {
  if (props.disabled) {
    return
  }
  const safeMax = Math.max(1, props.pageCount)
  const clamped = Math.min(Math.max(1, target), safeMax)
  if (clamped !== props.page) {
    emit('update:page', clamped)
  }
}
</script>

<template>
  <nav class="admin-pagination" aria-label="分页导航">
    <span class="admin-pagination__summary admin-mono">
      共 {{ total }} 条 · 第 {{ page }} / {{ Math.max(1, pageCount) }} 页 · 每页 {{ pageSize }} 条
    </span>
    <div class="admin-pagination__controls">
      <button type="button" class="admin-btn admin-btn--sm" :disabled="disabled || page <= 1" @click="goTo(1)">
        首页
      </button>
      <button type="button" class="admin-btn admin-btn--sm" :disabled="disabled || page <= 1" @click="goTo(page - 1)">
        上一页
      </button>
      <button
        type="button"
        class="admin-btn admin-btn--sm"
        :disabled="disabled || page >= Math.max(1, pageCount)"
        @click="goTo(page + 1)"
      >
        下一页
      </button>
      <button
        type="button"
        class="admin-btn admin-btn--sm"
        :disabled="disabled || page >= Math.max(1, pageCount)"
        @click="goTo(Math.max(1, pageCount))"
      >
        末页
      </button>
    </div>
  </nav>
</template>

<style scoped>
.admin-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 12px 16px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius-lg);
  background: var(--fp-card);
}

.admin-pagination__summary {
  font-size: 12px;
  color: var(--fp-muted);
}

.admin-pagination__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
