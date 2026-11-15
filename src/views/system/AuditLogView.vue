<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  fetchAdminAuditLogs,
  type AdminOperationItem,
  type OperationCodeOption,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatDateTime } from '@/utils/format'

/**
 * 全站操作审计日志视图：
 * 1. 支持按操作人（userId 或用户名）、操作代码（operationCode）与目标对象 ID（operationDataId）筛选与分页；
 * 2. 如实呈现操作日志表记录的操作代码、对象 ID、来源 IP 与 UA，绝不伪造变更前后字段快照；
 * 3. 对仍处于权限范围内的目标对象提供对应业务页面直达入口（文章、评论、清风明月、用户、举报）。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const operatorInput = ref(typeof route.query.operator === 'string' ? route.query.operator : '')
const appliedOperator = ref(typeof route.query.operator === 'string' ? route.query.operator.trim() : '')
const codeFilter = ref(typeof route.query.code === 'string' ? route.query.code.trim() : '')
const dataIdInput = ref(typeof route.query.dataId === 'string' ? route.query.dataId : '')
const appliedDataId = ref(typeof route.query.dataId === 'string' ? route.query.dataId.trim() : '')
const page = ref(1)
const pageSize = 20

const list = ref<AdminOperationItem[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })
const codeOptions = ref<OperationCodeOption[]>([])
const auditNote = ref(
  '审计日志基于全站操作流水表追加落库，如实记录操作行为码、目标对象 ID、操作人、IP 与 UA，不另行伪造字段级修改前/后快照。',
)

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const canViewUsers = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminUsers),
)
const canViewArticles = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminArticles),
)
const canViewComments = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminComments),
)
const canViewBreezemoons = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminBreezemoons),
)
const canViewReports = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminReports),
)

const hasActiveFilter = computed(
  () => appliedOperator.value !== '' || codeFilter.value !== '' || appliedDataId.value !== '',
)

const hasSelectedCodeOption = computed(() => {
  if (!codeFilter.value) return true
  return codeOptions.value.some((opt) => String(opt.code) === codeFilter.value)
})

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && list.value.length === 0) return 'loading'
  if (loadError.value && list.value.length === 0) return 'error'
  if (!loading.value && list.value.length === 0) {
    return hasActiveFilter.value ? 'filtered-empty' : 'empty'
  }
  return 'ready'
})

function resolveTargetTypeMeta(targetType?: string): {
  label: string
  tone: 'info' | 'warning' | 'danger' | 'success' | 'neutral'
} {
  switch (targetType) {
    case 'article':
      return { label: '文章对象', tone: 'info' }
    case 'comment':
      return { label: '评论对象', tone: 'warning' }
    case 'breezemoon':
      return { label: '清风明月', tone: 'success' }
    case 'user':
      return { label: '用户账号', tone: 'info' }
    case 'report':
      return { label: '举报记录', tone: 'warning' }
    case 'repeater':
      return { label: '复读机消息', tone: 'danger' }
    case 'system':
      return { label: '系统/配置', tone: 'neutral' }
    default:
      return { label: targetType || '通用对象', tone: 'neutral' }
  }
}

function getTargetRoute(item: AdminOperationItem): { to: string; label: string } | null {
  const id = item.operationDataId?.trim()
  if (!id) return null

  switch (item.targetType) {
    case 'article':
      return canViewArticles.value
        ? { to: `/content/articles/${encodeURIComponent(id)}`, label: '打开文章详情' }
        : null
    case 'comment':
      return canViewComments.value
        ? { to: `/content/comments?commentId=${encodeURIComponent(id)}&keyword=${encodeURIComponent(id)}`, label: '定位评论' }
        : null
    case 'breezemoon':
      return canViewBreezemoons.value
        ? {
            to: `/content/breezemoons?breezemoonId=${encodeURIComponent(id)}&keyword=${encodeURIComponent(id)}`,
            label: '定位清风明月',
          }
        : null
    case 'user':
      return canViewUsers.value ? { to: `/users/${encodeURIComponent(id)}`, label: '查看用户详情' } : null
    case 'report':
      return canViewReports.value ? { to: '/review/reports', label: '前往举报审核' } : null
    default:
      return null
  }
}

async function loadAuditLogs(): Promise<void> {
  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminAuditLogs({
      operator: appliedOperator.value || undefined,
      code: codeFilter.value || undefined,
      dataId: appliedDataId.value || undefined,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
    codeOptions.value = res.codeOptions
    if (res.auditNote) {
      auditNote.value = res.auditNote
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        unauthenticated.value = true
      } else if (err.status === 403) {
        forbidden.value = true
      } else {
        loadError.value = err.message
      }
    } else {
      loadError.value = err instanceof Error ? err.message : '加载审计日志失败'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch(): void {
  appliedOperator.value = operatorInput.value.trim()
  appliedDataId.value = dataIdInput.value.trim()
  page.value = 1
  void loadAuditLogs()
}

function handleCodeChange(): void {
  page.value = 1
  void loadAuditLogs()
}

function filterByOperator(operator: string): void {
  operatorInput.value = operator
  appliedOperator.value = operator
  page.value = 1
  void loadAuditLogs()
}

function filterByDataId(dataId: string): void {
  dataIdInput.value = dataId
  appliedDataId.value = dataId
  page.value = 1
  void loadAuditLogs()
}

function resetFilters(): void {
  operatorInput.value = ''
  appliedOperator.value = ''
  codeFilter.value = ''
  dataIdInput.value = ''
  appliedDataId.value = ''
  page.value = 1
  void loadAuditLogs()
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadAuditLogs()
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => [route.query.operator, route.query.code, route.query.dataId],
  ([nextOp, nextCode, nextDataId]) => {
    const op = typeof nextOp === 'string' ? nextOp.trim() : ''
    const code = typeof nextCode === 'string' ? nextCode.trim() : ''
    const dataId = typeof nextDataId === 'string' ? nextDataId.trim() : ''
    if (op !== appliedOperator.value || code !== codeFilter.value || dataId !== appliedDataId.value) {
      operatorInput.value = op
      appliedOperator.value = op
      codeFilter.value = code
      dataIdInput.value = dataId
      appliedDataId.value = dataId
      page.value = 1
      void loadAuditLogs()
    }
  },
)

watch(
  () => auth.sessionEpoch,
  () => {
    list.value = []
    if (auth.isLoggedIn && auth.canEnterConsole) {
      void loadAuditLogs()
    }
  },
)

onMounted(() => {
  void loadAuditLogs()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">系统与安全 · 全站操作审计日志</h1>
        <p class="admin-page__subtitle">
          集中追溯全站内容编辑、状态处置、用户角色变更、举报处理及后台安全操作流水。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadAuditLogs">
          {{ loading ? '刷新中...' : '刷新日志' }}
        </button>
      </div>
    </header>

    <div class="al-note" role="note">
      <strong>数据口径说明：</strong>{{ auditNote }}
    </div>

    <section class="admin-panel" aria-label="审计日志筛选条件">
      <form class="admin-filters al-filters" @submit.prevent="submitSearch">
        <label class="admin-field"><input aria-label="操作人 userId 或用户名..."
          v-model="operatorInput"
          type="search"
          class="admin-input al-input"
          placeholder="操作人 userId 或用户名..."
        /></label>
        <select
          v-model="codeFilter"
          class="admin-select al-select"
          aria-label="操作行为代码"
          @change="handleCodeChange"
        >
          <option value="">全部操作类型</option>
          <option v-if="!hasSelectedCodeOption" :value="codeFilter">代码 #{{ codeFilter }}</option>
          <option v-for="opt in codeOptions" :key="opt.code" :value="String(opt.code)">
            #{{ opt.code }} · {{ opt.label }}{{ opt.targetType ? ` [${opt.targetType}]` : '' }}
          </option>
        </select>
        <label class="admin-field"><input aria-label="目标对象 ID (operationDataId)..."
          v-model="dataIdInput"
          type="search"
          class="admin-input al-input"
          placeholder="目标对象 ID (operationDataId)..."
        /></label>
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="loading">筛选查询</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" @click="resetFilters">清空筛选</button>
      </form>
    </section>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      empty-text="当前暂无操作审计流水记录。"
      filtered-empty-text="未找到匹配的审计流水，请调整操作人、操作类型或对象 ID 条件。"
      @retry="loadAuditLogs"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="admin-table-wrap">
        <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
          <thead>
            <tr>
              <th>操作时间与流水 ID</th>
              <th>操作人</th>
              <th>操作行为与目标类型</th>
              <th>目标对象 ID 与关联直达</th>
              <th>来源 IP 与客户端 UA</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.oId">
              <td class="admin-mono al-time">
                <div>{{ formatDateTime(item.operationCreated) }}</div>
                <div class="al-sub">流水 {{ item.oId }}</div>
              </td>
              <td>
                <div class="al-cell-stack">
                  <RouterLink
                    v-if="canViewUsers && item.operationUserId"
                    :to="`/users/${encodeURIComponent(item.operationUserId)}`"
                    class="al-link"
                  >
                    {{ item.operationUserNickname || item.operationUserName || item.operationUserId }}
                  </RouterLink>
                  <span v-else>
                    {{ item.operationUserNickname || item.operationUserName || item.operationUserId || '-' }}
                  </span>
                  <div class="al-sub-actions">
                    <span class="al-sub admin-mono">
                      @{{ item.operationUserName || '-' }} · {{ item.operationUserId || '-' }}
                    </span>
                    <button
                      v-if="item.operationUserId && appliedOperator !== item.operationUserId"
                      type="button"
                      class="al-inline-btn"
                      @click="filterByOperator(item.operationUserId)"
                    >
                      只看此人
                    </button>
                  </div>
                </div>
              </td>
              <td>
                <div class="al-cell-stack">
                  <div class="al-action-title">
                    <strong>{{ item.operationCodeLabel || '未分类管理操作' }}</strong>
                    <code class="admin-mono al-code">#{{ item.operationCode }}</code>
                  </div>
                  <div>
                    <StatusBadge
                      :tone="resolveTargetTypeMeta(item.targetType).tone"
                      :label="resolveTargetTypeMeta(item.targetType).label"
                    />
                  </div>
                </div>
              </td>
              <td>
                <div class="al-cell-stack">
                  <code class="admin-mono al-data-id">{{ item.operationDataId || '-' }}</code>
                  <div class="al-sub-actions">
                    <button
                      v-if="item.operationDataId && appliedDataId !== item.operationDataId"
                      type="button"
                      class="al-inline-btn"
                      @click="filterByDataId(item.operationDataId)"
                    >
                      按此对象筛选
                    </button>
                    <RouterLink
                      v-if="getTargetRoute(item)"
                      :to="getTargetRoute(item)!.to"
                      class="al-link"
                    >
                      {{ getTargetRoute(item)!.label }}
                    </RouterLink>
                  </div>
                </div>
              </td>
              <td>
                <div class="al-cell-stack">
                  <div class="admin-mono">{{ item.operationIP || '-' }}</div>
                  <div class="al-sub al-ua admin-mono">{{ item.operationUA || '未记录 UA' }}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AdminPagination
        :page="pagination.p"
        :page-size="pagination.size"
        :total="pagination.total"
        :page-count="pagination.pageCount"
        :disabled="loading"
        @update:page="handlePageChange"
      />
    </PageStateView>
  </div>
</template>

<style scoped>
.al-note {
  padding: 12px 16px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  font-size: 13px;
  color: var(--fp-text);
  line-height: 1.5;
}

.al-filters {
  width: 100%;
}

.al-input {
  width: 220px;
  max-width: 100%;
}

.al-select {
  width: 240px;
  max-width: 100%;
}

.al-time {
  white-space: nowrap;
  font-size: 12px;
}

.al-cell-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.al-action-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--fp-title);
}

.al-code {
  font-size: 12px;
  color: var(--fp-muted);
}

.al-data-id {
  word-break: break-all;
  color: var(--fp-title);
}

.al-sub-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.al-sub {
  font-size: 12px;
  color: var(--fp-muted);
}

.al-link {
  color: var(--fp-link);
  font-weight: 500;
  font-size: 12px;
}

.al-inline-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--fp-link);
  cursor: pointer;
}

.al-inline-btn:hover {
  text-decoration: underline;
}

.al-ua {
  max-width: 260px;
  white-space: normal;
  word-break: break-all;
}

@media (max-width: 768px) {
  .al-input,
  .al-select {
    width: 100%;
  }
}
</style>
