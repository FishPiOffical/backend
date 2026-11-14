<script setup lang="ts">
/**
 * 页面级统一状态视图组件：覆盖加载中、未登录、无权限、读取失败、合法空数据与筛选无结果。
 */
export type PageViewState =
  | 'ready'
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'filtered-empty'

withDefaults(
  defineProps<{
    state: PageViewState
    title?: string
    description?: string
    errorMessage?: string
  }>(),
  {
    title: '',
    description: '',
    errorMessage: '',
  },
)

const emit = defineEmits<{
  retry: []
  resetFilters: []
  goLogin: []
  goHome: []
}>()
</script>

<template>
  <slot v-if="state === 'ready'" />

  <section v-else class="admin-panel state-box" role="status" aria-live="polite">
    <template v-if="state === 'loading'">
      <div class="state-box__spinner" aria-hidden="true" />
      <h3 class="state-box__title">{{ title || '正在加载真实数据...' }}</h3>
      <p class="state-box__desc">{{ description || '正在向后端实时核对身份、权限与业务记录。' }}</p>
    </template>

    <template v-else-if="state === 'unauthenticated'">
      <h3 class="state-box__title">{{ title || '登录状态未建立或已失效' }}</h3>
      <p class="state-box__desc">{{ description || '请使用第一方账号重新登录管理后台后继续操作。' }}</p>
      <div class="state-box__actions">
        <button type="button" class="admin-btn admin-btn--primary" @click="emit('goLogin')">前往登录</button>
      </div>
    </template>

    <template v-else-if="state === 'forbidden'">
      <h3 class="state-box__title">{{ title || '当前账号无权访问此功能' }}</h3>
      <p class="state-box__desc">
        {{ description || '权限按角色、指定审核资格及操作权单独核验。若权限刚发生变更，请刷新权限或返回工作台。' }}
      </p>
      <div class="state-box__actions">
        <button type="button" class="admin-btn" @click="emit('goHome')">返回工作台</button>
      </div>
    </template>

    <template v-else-if="state === 'error'">
      <h3 class="state-box__title">{{ title || '数据读取失败' }}</h3>
      <p class="state-box__desc state-box__desc--danger">
        {{ errorMessage || description || '请求未能完成，未覆写现有状态。' }}
      </p>
      <div class="state-box__actions">
        <button type="button" class="admin-btn admin-btn--primary" @click="emit('retry')">重新加载</button>
      </div>
    </template>

    <template v-else-if="state === 'filtered-empty'">
      <h3 class="state-box__title">{{ title || '当前筛选条件下无匹配结果' }}</h3>
      <p class="state-box__desc">{{ description || '可尝试调整状态页签或清空关键字后重新检索。' }}</p>
      <div class="state-box__actions">
        <button type="button" class="admin-btn" @click="emit('resetFilters')">重置筛选条件</button>
      </div>
    </template>

    <template v-else>
      <h3 class="state-box__title">{{ title || '暂无记录' }}</h3>
      <p class="state-box__desc">{{ description || '当前业务队列中尚无需要处理的数据。' }}</p>
    </template>
  </section>
</template>

<style scoped>
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 42px 24px;
  gap: 10px;
}

.state-box__spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--fp-border-strong);
  border-top-color: var(--fp-primary);
  animation: admin-spin 0.8s linear infinite;
}

@keyframes admin-spin {
  to {
    transform: rotate(360deg);
  }
}

.state-box__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
}

.state-box__desc {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  color: var(--fp-muted);
}

.state-box__desc--danger {
  color: var(--fp-danger-ink);
}

.state-box__actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
