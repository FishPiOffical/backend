<script setup lang="ts">
/**
 * 统一语义化提示横幅组件：用于操作成功、失败、警告与提示说明。
 */
withDefaults(
  defineProps<{
    tone?: 'success' | 'danger' | 'warning' | 'info'
    message?: string
    dismissible?: boolean
  }>(),
  {
    tone: 'info',
    message: '',
    dismissible: false,
  },
)

const emit = defineEmits<{
  dismiss: []
}>()

const icons: Record<'success' | 'danger' | 'warning' | 'info', string> = {
  success: '✓',
  danger: '!',
  warning: '!',
  info: 'i',
}
</script>

<template>
  <div
    class="banner-box"
    :data-tone="tone"
    :role="tone === 'danger' || tone === 'warning' ? 'alert' : 'status'"
  >
    <span class="banner-box__icon" aria-hidden="true">{{ icons[tone] }}</span>
    <div class="banner-box__content">
      <slot>{{ message }}</slot>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="admin-btn admin-btn--sm admin-btn--ghost banner-box__close"
      aria-label="关闭提示"
      @click="emit('dismiss')"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.banner-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.banner-box__icon {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  color: #ffffff;
}

.banner-box__content {
  flex: 1;
  min-width: 0;
}

.banner-box__close {
  min-height: 24px;
  padding: 0 6px;
}

.banner-box[data-tone='success'] {
  background: var(--fp-primary-soft);
  border-color: var(--fp-primary-border);
  color: var(--fp-title);
}

.banner-box[data-tone='success'] .banner-box__icon {
  background: var(--fp-primary-fill);
}

.banner-box[data-tone='danger'] {
  background: var(--fp-danger-soft);
  border-color: rgba(220, 38, 38, 0.25);
  color: var(--fp-danger-ink);
}

.banner-box[data-tone='danger'] .banner-box__icon {
  background: var(--fp-danger);
}

.banner-box[data-tone='warning'] {
  background: var(--fp-warning-soft);
  border-color: rgba(217, 119, 6, 0.3);
  color: var(--fp-title);
}

.banner-box[data-tone='warning'] .banner-box__icon {
  background: var(--fp-warning);
}

.banner-box[data-tone='info'] {
  background: var(--fp-info-soft);
  border-color: rgba(37, 99, 235, 0.22);
  color: var(--fp-title);
}

.banner-box[data-tone='info'] .banner-box__icon {
  background: var(--fp-link);
}
</style>
