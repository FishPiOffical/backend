<script setup lang="ts">
/**
 * 幂等写操作“结果未明”恢复横幅组件：
 * 统一展示操作标题、保留的 Idempotency-Key 以及“按原幂等键重试 / 放弃恢复”按钮。
 */
withDefaults(
  defineProps<{
    title: string
    idempotencyKey: string
    busy?: boolean
    headingPrefix?: string
    retryLabel?: string
    discardLabel?: string
  }>(),
  {
    busy: false,
    headingPrefix: '上次操作结果未明：',
    retryLabel: '按原幂等键重试',
    discardLabel: '放弃恢复',
  },
)

const emit = defineEmits<{
  retry: []
  discard: []
}>()
</script>

<template>
  <div class="recovery-banner" role="alert">
    <span class="recovery-banner__icon" aria-hidden="true">!</span>
    <div class="recovery-banner__body">
      <strong class="recovery-banner__title">{{ headingPrefix }}{{ title }}</strong>
      <p class="recovery-banner__desc">
        幂等键 <code class="admin-mono">{{ idempotencyKey }}</code> 已保留，建议沿用原幂等键重试确认结果。
      </p>
    </div>
    <div class="recovery-banner__actions">
      <button
        type="button"
        class="admin-btn admin-btn--sm admin-btn--primary"
        :disabled="busy"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </button>
      <button
        type="button"
        class="admin-btn admin-btn--sm"
        :disabled="busy"
        @click="emit('discard')"
      >
        {{ discardLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.recovery-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 14px;
  padding: 12px 16px;
  border-radius: var(--fp-radius-md);
  border: 1px solid rgba(217, 119, 6, 0.35);
  background: var(--fp-warning-soft);
  color: var(--fp-title);
}

.recovery-banner__icon {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--fp-warning);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recovery-banner__body {
  flex: 1 1 260px;
  min-width: 0;
}

.recovery-banner__title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--fp-title);
}

.recovery-banner__desc {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--fp-text);
  overflow-wrap: anywhere;
}

.recovery-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
