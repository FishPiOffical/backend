<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { fetchAdminDashboard, type AdminDashboardData } from '@/api/admin'
import { ApiError } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ADMIN_NAV_GROUPS, type AdminNavItem } from '@/navigation/menu'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatCount, formatDateTime } from '@/utils/format'

/**
 * 管理后台工作台视图：
 * 严格展示后端真实返回的待办数量、社区统计与近期操作日志；无权或缺失字段显示“未知”，严禁伪造为 0。
 */
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const loading = ref(false)
const errorMessage = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)
const dashboard = ref<AdminDashboardData | null>(null)
const refreshingCaps = ref(false)

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && !dashboard.value) return 'loading'
  if (errorMessage.value && !dashboard.value) return 'error'
  return dashboard.value ? 'ready' : 'loading'
})

interface QuickEntry {
  groupLabel: string
  item: AdminNavItem
}

// 从共享菜单配置筛选当前登录账号可见的 Stage 1 模块及后续规划入口
const quickEntries = computed<QuickEntry[]>(() => {
  const caps = dashboard.value?.capabilities ?? auth.capabilities
  if (!caps) {
    return []
  }
  const result: QuickEntry[] = []
  for (const group of ADMIN_NAV_GROUPS) {
    if (!caps.menus[group.key]) {
      continue
    }
    for (const item of group.items) {
      if (item.id === 'workbench') {
        continue
      }
      if (item.hideWhenRhypic && caps.rhypicEnabled) {
        continue
      }
      if (item.check && !item.check(caps)) {
        continue
      }
      result.push({ groupLabel: group.label, item })
    }
  }
  return result
})

const stageOneEntries = computed(() =>
  quickEntries.value.filter(
    (entry) =>
      entry.item.phase === '一期V3' ||
      entry.item.phase === '二期V3' ||
      entry.item.phase === '三期V3' ||
      entry.item.phase === '既有V3',
  ),
)

const previewEntries = computed(() =>
  quickEntries.value.filter(
    (entry) =>
      entry.item.phase !== '一期V3' &&
      entry.item.phase !== '二期V3' &&
      entry.item.phase !== '三期V3' &&
      entry.item.phase !== '既有V3',
  ),
)

const statCards = computed(() => {
  const stats = dashboard.value?.communityStats
  return [
    { key: 'memberCount', label: '注册会员', value: formatCount(stats?.memberCount) },
    { key: 'articleCount', label: '文章总数', value: formatCount(stats?.articleCount) },
    { key: 'commentCount', label: '评论总数', value: formatCount(stats?.commentCount) },
    { key: 'domainCount', label: '活跃领域', value: formatCount(stats?.domainCount) },
    { key: 'tagCount', label: '标签总数', value: formatCount(stats?.tagCount) },
    { key: 'linkCount', label: '友链数量', value: formatCount(stats?.linkCount) },
    { key: 'maxOnlineVisitorCount', label: '峰值在线访客', value: formatCount(stats?.maxOnlineVisitorCount) },
  ]
})

async function loadDashboard(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const data = await fetchAdminDashboard()
    dashboard.value = data
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        unauthenticated.value = true
        return
      }
      if (err.status === 403) {
        forbidden.value = true
        return
      }
      errorMessage.value = err.message
    } else {
      errorMessage.value = err instanceof Error ? err.message : '加载工作台概览失败'
    }
  } finally {
    loading.value = false
  }
}

async function handleRefreshAll(): Promise<void> {
  refreshingCaps.value = true
  try {
    await Promise.all([auth.refreshCapabilities(), loadDashboard()])
  } finally {
    refreshingCaps.value = false
  }
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/workbench' } })
}

function goHome(): void {
  void router.push('/forbidden')
}

watch(
  () => auth.sessionEpoch,
  () => {
    dashboard.value = null
    errorMessage.value = ''
    if (auth.isLoggedIn && auth.canEnterConsole) {
      void loadDashboard()
    }
  },
)

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">工作台 · 待办与概览</h1>
        <p class="admin-page__subtitle">
          集中展示当前账号权限下的真实待办提醒、社区运行概况与近期后台审计操作。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading || refreshingCaps" @click="handleRefreshAll">
          {{ loading || refreshingCaps ? '刷新中...' : '刷新概览与权限' }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage && dashboard" class="wb-alert" role="alert">
      <span>本次刷新未能完成：{{ errorMessage }}，当前仍显示上次成功获取的概览数据。</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="loadDashboard">重试</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="errorMessage"
      @retry="loadDashboard"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <template v-if="dashboard">
        <!-- 待办提醒区 -->
        <section class="wb-grid wb-grid--todos" aria-label="待办审核提醒">
          <article class="admin-panel wb-todo-card">
            <div class="wb-todo-card__top">
              <span class="wb-todo-card__label">待处理举报</span>
              <StatusBadge
                :tone="dashboard.todos.pendingReports === null ? 'neutral' : dashboard.todos.pendingReports > 0 ? 'warning' : 'success'"
                :label="dashboard.todos.pendingReports === null ? '未授权/未知' : dashboard.todos.pendingReports > 0 ? '待处置' : '已清零'"
              />
            </div>
            <div class="wb-todo-card__value admin-mono">
              {{ formatCount(dashboard.todos.pendingReports) }}
            </div>
            <p class="wb-todo-card__hint">
              需具备 <code class="admin-mono">menuAdminReports</code> 权限，未授权时固定显示“未知”。
            </p>
            <div class="wb-todo-card__footer">
              <RouterLink
                v-if="auth.hasPermission('menuAdminReports') && dashboard.capabilities.canAccessAdmin"
                to="/review/reports"
                class="admin-btn admin-btn--sm admin-btn--primary"
              >
                进入举报审核
              </RouterLink>
              <span v-else class="wb-muted-text">当前账号无举报队列权限</span>
            </div>
          </article>

          <article class="admin-panel wb-todo-card">
            <div class="wb-todo-card__top">
              <span class="wb-todo-card__label">待审企业认证</span>
              <StatusBadge
                :tone="dashboard.todos.pendingIdentityApplications === null ? 'neutral' : dashboard.todos.pendingIdentityApplications > 0 ? 'warning' : 'success'"
                :label="dashboard.todos.pendingIdentityApplications === null ? '未授权/未知' : dashboard.todos.pendingIdentityApplications > 0 ? '待审核' : '已清零'"
              />
            </div>
            <div class="wb-todo-card__value admin-mono">
              {{ formatCount(dashboard.todos.pendingIdentityApplications) }}
            </div>
            <p class="wb-todo-card__hint">
              仅当操作员具备企业认证审核白名单资格时返回真实待审条数；认证原图需显式点击一次性查看。
            </p>
            <div class="wb-todo-card__footer">
              <RouterLink
                v-if="dashboard.capabilities.isIdentityReviewer"
                to="/review/identity"
                class="admin-btn admin-btn--sm admin-btn--primary"
              >
                进入企业认证审核
              </RouterLink>
              <span v-else class="wb-muted-text">当前账号无企业认证审核资格</span>
            </div>
          </article>
        </section>

        <!-- 社区运行统计卡片 -->
        <section class="admin-panel" aria-label="社区统计">
          <div class="wb-section-head">
            <div>
              <h2 class="wb-section-title">社区基础统计</h2>
              <p class="wb-section-desc">
                {{ dashboard.meta.statsNote || '数据实时来自服务端统计仓储，缺少权限或指标未暴露时保留“未知”。' }}
              </p>
            </div>
            <span class="wb-meta-time admin-mono">更新于 {{ formatDateTime(dashboard.meta.fetchedAt) }}</span>
          </div>

          <div class="wb-stats-grid">
            <div v-for="card in statCards" :key="card.key" class="wb-stat-item">
              <span class="wb-stat-item__label">{{ card.label }}</span>
              <strong class="wb-stat-item__value admin-mono">{{ card.value }}</strong>
            </div>
          </div>
        </section>

        <!-- 已开放功能与后续阶段预览入口 -->
        <section class="admin-panel" aria-label="功能入口">
          <div class="wb-section-head">
            <div>
              <h2 class="wb-section-title">已接入管理模块与分期路线</h2>
              <p class="wb-section-desc">
                仅展示当前账号具备权限的入口；已接入 V3 接口模块可直接执行业务读写，其余规划模块以契约预览页呈现。
              </p>
            </div>
          </div>

          <div v-if="stageOneEntries.length" class="wb-entry-group">
            <h3 class="wb-entry-heading">已上线模块（一、二期 V3 / 既有 V3 接口）</h3>
            <div class="wb-entry-grid">
              <RouterLink
                v-for="entry in stageOneEntries"
                :key="entry.item.id"
                :to="entry.item.to"
                class="wb-entry-card"
              >
                <div class="wb-entry-card__top">
                  <span class="wb-entry-card__group">{{ entry.groupLabel }}</span>
                  <StatusBadge
                    :tone="entry.item.phase === '一期V3' || entry.item.phase === '二期V3' || entry.item.phase === '三期V3' ? 'success' : 'info'"
                    :label="entry.item.phase"
                  />
                </div>
                <strong class="wb-entry-card__title">{{ entry.item.label }}</strong>
              </RouterLink>
            </div>
          </div>

          <div v-if="previewEntries.length" class="wb-entry-group">
            <h3 class="wb-entry-heading">三至四阶段建设模块（边界占位预览）</h3>
            <div class="wb-entry-grid wb-entry-grid--compact">
              <RouterLink
                v-for="entry in previewEntries"
                :key="entry.item.id"
                :to="entry.item.to"
                class="wb-entry-card wb-entry-card--muted"
              >
                <div class="wb-entry-card__top">
                  <span class="wb-entry-card__group">{{ entry.groupLabel }}</span>
                  <StatusBadge tone="neutral" :label="entry.item.phase" />
                </div>
                <strong class="wb-entry-card__title">{{ entry.item.label }}</strong>
              </RouterLink>
            </div>
          </div>
        </section>

        <!-- 最近后台操作记录 -->
        <section class="admin-panel" aria-label="最近操作记录">
          <div class="wb-section-head">
            <div>
              <h2 class="wb-section-title">最近管理操作记录（最多 10 条）</h2>
              <p class="wb-section-desc">
                当当前账号缺少后台全局只读权限时该列表为空，不会展示非本人职责外的管理流水。
              </p>
            </div>
            <RouterLink
              v-if="dashboard.capabilities.canAccessAdmin"
              to="/system/audit-logs"
              class="admin-btn admin-btn--sm"
            >
              进入全站操作审计
            </RouterLink>
          </div>

          <div v-if="dashboard.recentOperations.length" class="admin-table-wrap">
            <table class="admin-table admin-table--wide" :class="{ 'admin-table--compact': theme.compactTable }">
              <thead>
                <tr>
                  <th>操作时间</th>
                  <th>操作人</th>
                  <th>操作行为</th>
                  <th>操作代码</th>
                  <th>目标数据 ID</th>
                  <th>来源 IP</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="op in dashboard.recentOperations" :key="op.oId">
                  <td class="admin-mono">{{ formatDateTime(op.operationCreated) }}</td>
                  <td>{{ op.operationUserName || op.operationUserId || '未知' }}</td>
                  <td>{{ op.operationCodeLabel || '管理操作' }}</td>
                  <td class="admin-mono">#{{ op.operationCode }}</td>
                  <td class="admin-mono">{{ op.operationDataId || '-' }}</td>
                  <td class="admin-mono">{{ op.operationIP || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="wb-empty-note">
            当前暂无可展示的管理操作流水，或当前账号仅授权访问特定审核专项模块。
          </div>
        </section>
      </template>
    </PageStateView>
  </div>
</template>

<style scoped>
.wb-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-warning);
  background: var(--fp-warning-soft);
  color: var(--fp-title);
  font-size: 13px;
}

.wb-grid {
  display: grid;
  gap: 16px;
}

.wb-grid--todos {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.wb-todo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  border-top: 3px solid var(--fp-primary);
}

.wb-todo-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wb-todo-card__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fp-head);
}

.wb-todo-card__value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--fp-title);
}

.wb-todo-card__hint {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.wb-todo-card__footer {
  margin-top: auto;
  padding-top: 6px;
}

.wb-muted-text {
  font-size: 12px;
  color: var(--fp-muted);
}

.wb-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 14px;
}

.wb-section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
}

.wb-section-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.wb-meta-time {
  font-size: 12px;
  color: var(--fp-muted);
}

.wb-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.wb-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
}

.wb-stat-item__label {
  font-size: 12px;
  color: var(--fp-muted);
}

.wb-stat-item__value {
  font-size: 20px;
  font-weight: 600;
  color: var(--fp-title);
}

.wb-entry-group + .wb-entry-group {
  margin-top: 18px;
}

.wb-entry-heading {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fp-head);
}

.wb-entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.wb-entry-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(185px, 1fr));
}

.wb-entry-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px 15px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  color: var(--fp-title);
  transition:
    border-color var(--fp-transition-fast),
    background-color var(--fp-transition-fast),
    transform var(--fp-transition-fast),
    box-shadow var(--fp-transition-fast);
}

.wb-entry-card:hover {
  border-color: var(--fp-primary);
  background: var(--fp-card);
  color: var(--fp-title);
  transform: translateY(-1px);
  box-shadow: var(--fp-card-hover-shadow);
}

.wb-entry-card--muted {
  opacity: 0.9;
}

.wb-entry-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wb-entry-card__group {
  font-size: 11px;
  color: var(--fp-muted);
}

.wb-entry-card__title {
  font-size: 14px;
  font-weight: 600;
}

.wb-empty-note {
  padding: 18px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px dashed var(--fp-border-strong);
  color: var(--fp-muted);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 768px) {
  .wb-grid--todos {
    grid-template-columns: 1fr;
  }
}
</style>
