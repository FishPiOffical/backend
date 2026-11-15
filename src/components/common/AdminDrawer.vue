<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

/**
 * 简单编辑右侧抽屉组件：桌面右侧展开，移动端自动占满全屏宽度；支持 Esc 快捷关闭与聚焦保持。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    width?: string
    closeOnBackdrop?: boolean
  }>(),
  {
    subtitle: '',
    width: '520px',
    closeOnBackdrop: true,
  },
)

const emit = defineEmits<{
  close: []
}>()

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) {
    emit('close')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown)
    } else {
      window.removeEventListener('keydown', onKeyDown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="open" class="drawer-backdrop" role="presentation" @click.self="closeOnBackdrop && emit('close')">
        <aside class="drawer-panel" :style="{ maxWidth: width }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="drawer-panel__header">
            <div class="drawer-panel__heading">
              <h2 class="drawer-panel__title">{{ title }}</h2>
              <p v-if="subtitle" class="drawer-panel__subtitle">{{ subtitle }}</p>
            </div>
            <button type="button" class="admin-btn admin-btn--sm admin-btn--ghost" aria-label="关闭抽屉" @click="emit('close')">
              ✕ 关闭
            </button>
          </header>
          <div class="drawer-panel__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="drawer-panel__footer">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: var(--fp-mask-bg);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.drawer-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--fp-card);
  border-left: 1px solid var(--fp-border);
  box-shadow: var(--fp-dialog-shadow);
}

.drawer-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--fp-border);
  background: var(--fp-card);
}

.drawer-panel__heading {
  min-width: 0;
}

.drawer-panel__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--fp-title);
}

.drawer-panel__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.drawer-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
}

.drawer-panel__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid var(--fp-border);
  background: var(--fp-elevated);
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 180ms ease;
}

.drawer-fade-enter-active .drawer-panel,
.drawer-fade-leave-active .drawer-panel {
  transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-fade-enter-from .drawer-panel,
.drawer-fade-leave-to .drawer-panel {
  transform: translateX(24px);
}

@media (max-width: 768px) {
  .drawer-panel {
    max-width: 100% !important;
    border-left: none;
  }
}
</style>
