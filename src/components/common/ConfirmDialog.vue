<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 重要/危险操作二次确认弹窗组件：
 * 支持展示影响摘要列表、可选要求输入关键字二次核验，并在写入中锁定按钮防止误触重发。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    summaryItems?: Array<{ label: string; value: string }>
    danger?: boolean
    confirmText?: string
    cancelText?: string
    requireConfirmPhrase?: string
    pending?: boolean
  }>(),
  {
    summaryItems: () => [],
    danger: false,
    confirmText: '确认执行',
    cancelText: '取消',
    requireConfirmPhrase: '',
    pending: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const phraseInput = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      phraseInput.value = ''
    }
  },
)

const phraseMatched = computed(() => {
  if (!props.requireConfirmPhrase) {
    return true
  }
  return phraseInput.value.trim() === props.requireConfirmPhrase
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-mask" role="presentation" @click.self="!pending && emit('cancel')">
      <section class="dialog-card" role="alertdialog" aria-modal="true" :aria-label="title">
        <header class="dialog-card__header">
          <h3 class="dialog-card__title" :class="{ 'is-danger': danger }">{{ title }}</h3>
        </header>

        <div class="dialog-card__body">
          <p class="dialog-card__desc">{{ description }}</p>

          <dl v-if="summaryItems.length" class="dialog-summary">
            <div v-for="item in summaryItems" :key="item.label" class="dialog-summary__row">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>

          <div v-if="requireConfirmPhrase" class="dialog-phrase">
            <label class="dialog-phrase__label">
              请输入 <code class="admin-mono">{{ requireConfirmPhrase }}</code> 以确认此高风险操作：
            </label>
            <input
              v-model="phraseInput"
              type="text"
              class="admin-input"
              :disabled="pending"
              :placeholder="requireConfirmPhrase"
            />
          </div>
        </div>

        <footer class="dialog-card__footer">
          <button type="button" class="admin-btn" :disabled="pending" @click="emit('cancel')">
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="admin-btn"
            :class="danger ? 'admin-btn--danger' : 'admin-btn--primary'"
            :disabled="pending || !phraseMatched"
            @click="emit('confirm')"
          >
            {{ pending ? '提交确认中...' : confirmText }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--fp-mask-bg);
}

.dialog-card {
  width: 100%;
  max-width: 460px;
  border-radius: var(--fp-radius-lg);
  background: var(--fp-card);
  border: 1px solid var(--fp-border);
  box-shadow: var(--fp-dialog-shadow);
  overflow: hidden;
}

.dialog-card__header {
  padding: 16px 20px 10px;
}

.dialog-card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--fp-title);
}

.dialog-card__title.is-danger {
  color: var(--fp-danger-ink);
}

.dialog-card__body {
  padding: 0 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-card__desc {
  margin: 0;
  font-size: 13px;
  color: var(--fp-text);
  line-height: 1.6;
}

.dialog-summary {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--fp-radius-md);
  background: var(--fp-elevated);
  border: 1px solid var(--fp-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-summary__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.dialog-summary__row dt {
  color: var(--fp-muted);
}

.dialog-summary__row dd {
  margin: 0;
  color: var(--fp-title);
  font-weight: 500;
  text-align: right;
  word-break: break-word;
}

.dialog-phrase {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-phrase__label {
  font-size: 12px;
  color: var(--fp-muted);
}

.dialog-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--fp-border);
  background: var(--fp-elevated);
}
</style>
