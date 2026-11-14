<script setup lang="ts">
/**
 * 统一语义化状态标签组件：同时采用文字与色彩区分状态，避免仅靠颜色传达信息。
 */
withDefaults(
  defineProps<{
    tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    label: string
  }>(),
  {
    tone: 'neutral',
  },
)
</script>

<template>
  <span class="status-badge" :data-tone="tone">{{ label }}</span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: var(--fp-radius-sm);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  white-space: nowrap;
  border: 1px solid transparent;
}

.status-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.85;
}

.status-badge[data-tone='success'] {
  background: var(--fp-primary-soft);
  color: var(--fp-primary);
}

.status-badge[data-tone='warning'] {
  background: var(--fp-warning-soft);
  color: var(--fp-warning);
}

.status-badge[data-tone='danger'] {
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.status-badge[data-tone='info'] {
  background: rgba(40, 101, 188, 0.12);
  color: var(--fp-link);
}

.status-badge[data-tone='neutral'] {
  background: var(--fp-elevated);
  border-color: var(--fp-border);
  color: var(--fp-muted);
}
</style>
