<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { PLACEHOLDER_MODULES } from '@/navigation/menu'
import { useAuthStore } from '@/stores/auth'
import { getLegacyAdminUrl } from '@/utils/format'

/**
 * 二至四阶段模块边界占位视图：
 * 展示规划阶段、权限要求、既定安全约束及旧版后台兼容入口；
 * 严格禁止构造任何模拟/占位业务表格或伪造统计数据。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const moduleId = computed(() => String(route.params.moduleId || '').trim())
const spec = computed(() => PLACEHOLDER_MODULES[moduleId.value] ?? null)

const isAuthorized = computed(() => {
  if (!spec.value || !auth.capabilities) {
    return false
  }
  return spec.value.check(auth.capabilities)
})

const pageState = computed<PageViewState>(() => {
  if (!auth.isLoggedIn) return 'unauthenticated'
  if (!spec.value) return 'empty'
  if (!isAuthorized.value) return 'forbidden'
  return 'ready'
})

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/workbench')
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <div class="ph-breadcrumb">
          <RouterLink to="/workbench">工作台</RouterLink>
          <span>/</span>
          <span>{{ spec?.groupLabel || '规划模块' }}</span>
        </div>
        <h1 class="admin-page__title">{{ spec?.title || '未定义的规划模块' }}</h1>
        <p class="admin-page__subtitle">
          阶段占位说明页：在对应 V3 后端接口上线前，明确权限边界、设计约束与旧后台兼容跳转方式。
        </p>
      </div>
      <div class="admin-page__actions">
        <RouterLink to="/workbench" class="admin-btn">返回工作台</RouterLink>
      </div>
    </header>

    <PageStateView
      :state="pageState"
      title="未找到对应的规划模块"
      description="请从左侧菜单或工作台选择有效的阶段功能模块。"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <template v-if="spec">
        <section class="admin-panel ph-card">
          <div class="ph-card__badges">
            <StatusBadge tone="info" :label="spec.phase" />
            <StatusBadge tone="neutral" :label="spec.groupLabel" />
          </div>

          <p class="ph-summary">{{ spec.summary }}</p>

          <div class="ph-notice" role="note">
            当前模块尚处于“阶段规划占位”状态：后台未为其接入独立 V3 列表接口前，界面绝不填充任何硬编码或虚假业务记录。
          </div>

          <dl class="ph-dl">
            <div class="ph-dl__row">
              <dt>所需权限键</dt>
              <dd class="admin-mono">{{ spec.requiredPermissionDesc }}</dd>
            </div>
            <div class="ph-dl__row">
              <dt>关键边界约束</dt>
              <dd>
                <ul class="ph-constraints">
                  <li v-for="c in spec.constraints" :key="c">{{ c }}</li>
                </ul>
              </dd>
            </div>
          </dl>

          <div class="ph-actions">
            <a
              :href="getLegacyAdminUrl(spec.legacyEntry)"
              target="_blank"
              rel="noopener noreferrer"
              class="admin-btn admin-btn--primary"
            >
              {{ spec.legacyLabel }}（新窗口打开 {{ spec.legacyEntry }}）
            </a>
            <RouterLink to="/workbench" class="admin-btn">返回待办与概览</RouterLink>
          </div>
        </section>
      </template>
    </PageStateView>
  </div>
</template>

<style scoped>
.ph-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fp-muted);
  margin-bottom: 4px;
}

.ph-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 820px;
}

.ph-card__badges {
  display: flex;
  gap: 8px;
}

.ph-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--fp-title);
}

.ph-notice {
  padding: 10px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border-strong);
  background: var(--fp-elevated);
  font-size: 13px;
  color: var(--fp-head);
}

.ph-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ph-dl__row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  font-size: 13px;
}

.ph-dl__row dt {
  color: var(--fp-muted);
}

.ph-dl__row dd {
  margin: 0;
}

.ph-constraints {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ph-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--fp-border);
}

@media (max-width: 640px) {
  .ph-dl__row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
