<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  cancelStickAdminArticle,
  fetchAdminArticles,
  removeAdminArticle,
  stickAdminArticle,
  type AdminArticleSummary,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import {
  formatCount,
  formatDateTime,
  getArticleStatusMeta,
  getArticleTypeMeta,
} from '@/utils/format'

/**
 * 全站文章与长文专栏管理列表：
 * 支持按关键字、文章状态、文章类型筛选与分页浏览，提供快速置顶/取消置顶与强制移除操作（含幂等恢复保护）。
 */
type ArticleQuickActionKind = 'stick' | 'cancel-stick' | 'remove'

interface PendingQuickAction {
  kind: ArticleQuickActionKind
  articleId: string
  articleTitle: string
  title: string
  description: string
  summaryItems: Array<{ label: string; value: string }>
  danger: boolean
  confirmText: string
  requireConfirmPhrase?: string
  idempotencyKey: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const keywordInput = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword.trim() : '')
const statusFilter = ref(typeof route.query.status === 'string' ? route.query.status : 'all')
const typeFilter = ref(typeof route.query.type === 'string' ? route.query.type : 'all')
const page = ref(1)
const pageSize = 20

const list = ref<AdminArticleSummary[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')
const pendingConfirm = ref<PendingQuickAction | null>(null)
const unknownRecovery = ref<PendingQuickAction | null>(null)

const quickActionTracker = new IdempotencyTracker('admin-article-list-action')

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '已封禁' },
  { value: '2', label: '已锁定' },
]

const typeOptions = [
  { value: 'all', label: '全部类型' },
  { value: '0', label: '普通帖' },
  { value: '6', label: '长文专栏' },
  { value: '5', label: '问答' },
  { value: '1', label: '站内讨论' },
  { value: '2', label: '同城广播' },
  { value: '3', label: '思绪' },
]

const hasActiveFilter = computed(
  () => appliedKeyword.value !== '' || statusFilter.value !== 'all' || typeFilter.value !== 'all',
)

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

function hasMenuPermission(): boolean {
  const caps = auth.capabilities
  return Boolean(caps?.canAccessAdmin && caps.permissions.menuAdminArticles)
}

async function loadArticles(): Promise<void> {
  if (!hasMenuPermission()) {
    forbidden.value = true
    list.value = []
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminArticles({
      keyword: appliedKeyword.value,
      status: statusFilter.value,
      type: typeFilter.value,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
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
      loadError.value = err.message
    } else {
      loadError.value = err instanceof Error ? err.message : '加载文章列表失败'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch(): void {
  appliedKeyword.value = keywordInput.value.trim()
  page.value = 1
  void loadArticles()
}

function selectStatus(next: string): void {
  if (statusFilter.value === next) return
  statusFilter.value = next
  page.value = 1
  void loadArticles()
}

function handleTypeChange(): void {
  page.value = 1
  void loadArticles()
}

function handlePageChange(next: number): void {
  page.value = next
  void loadArticles()
}

function resetFilters(): void {
  keywordInput.value = ''
  appliedKeyword.value = ''
  statusFilter.value = 'all'
  typeFilter.value = 'all'
  page.value = 1
  void loadArticles()
}

function openQuickActionConfirm(kind: ArticleQuickActionKind, item: AdminArticleSummary): void {
  actionError.value = ''
  actionMessage.value = ''
  const key = quickActionTracker.resolve({ kind, articleId: item.oId })

  if (kind === 'stick') {
    pendingConfirm.value = {
      kind,
      articleId: item.oId,
      articleTitle: item.articleTitle,
      title: '确认置顶该文章？',
      description: '置顶后文章将在社区与后台列表优先排前显示，并写入管理员操作审计日志。',
      summaryItems: [
        { label: '文章 ID', value: item.oId },
        { label: '文章标题', value: item.articleTitle },
        { label: '作者', value: `@${item.articleAuthorName}` },
      ],
      danger: false,
      confirmText: '确认置顶',
      idempotencyKey: key,
    }
    return
  }

  if (kind === 'cancel-stick') {
    pendingConfirm.value = {
      kind,
      articleId: item.oId,
      articleTitle: item.articleTitle,
      title: '确认取消文章置顶？',
      description: '取消置顶后将恢复按默认时间规则排序。',
      summaryItems: [
        { label: '文章 ID', value: item.oId },
        { label: '文章标题', value: item.articleTitle },
      ],
      danger: false,
      confirmText: '取消置顶',
      idempotencyKey: key,
    }
    return
  }

  pendingConfirm.value = {
    kind: 'remove',
    articleId: item.oId,
    articleTitle: item.articleTitle,
    title: '警告：永久强制移除文章',
    description:
      '该操作不受发帖 24 小时限制，将清理关联标签、长文专栏章节及搜索索引且不可撤销！请输入文章 ID 确认删除。',
    summaryItems: [
      { label: '文章 ID', value: item.oId },
      { label: '文章标题', value: item.articleTitle },
      { label: '作者', value: `@${item.articleAuthorName}` },
      { label: '评论数', value: formatCount(item.articleCommentCount) },
    ],
    danger: true,
    confirmText: '永久移除文章',
    requireConfirmPhrase: item.oId,
    idempotencyKey: key,
  }
}

async function executeQuickAction(task: PendingQuickAction): Promise<void> {
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (task.kind === 'stick') {
      const res = await stickAdminArticle(task.articleId, task.idempotencyKey)
      actionMessage.value = res.replayed
        ? `已恢复上次置顶结果（文章 ${task.articleId}）。`
        : `文章《${task.articleTitle}》已置顶。`
    } else if (task.kind === 'cancel-stick') {
      const res = await cancelStickAdminArticle(task.articleId, task.idempotencyKey)
      actionMessage.value = res.replayed
        ? `已恢复上次取消置顶结果（文章 ${task.articleId}）。`
        : `文章《${task.articleTitle}》已取消置顶。`
    } else {
      const res = await removeAdminArticle(task.articleId, task.idempotencyKey)
      actionMessage.value = res.replayed
        ? `已确认文章 ${task.articleId} 先前已完成移除。`
        : `文章《${task.articleTitle}》已永久移除。`
    }

    quickActionTracker.reset()
    pendingConfirm.value = null
    unknownRecovery.value = null
    await loadArticles()
  } catch (err) {
    pendingConfirm.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = task
      actionError.value =
        err instanceof Error ? `${err.message}（写入结果未明，请保留原幂等键核对后再试）` : '写入结果未明'
      return
    }
    if (err instanceof ApiError && err.status === 401) {
      unauthenticated.value = true
      return
    }
    quickActionTracker.reset()
    unknownRecovery.value = null
    actionError.value = err instanceof Error ? err.message : '执行操作失败'
  } finally {
    mutating.value = false
  }
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => route.query.keyword,
  (nextKeyword) => {
    const normalized = typeof nextKeyword === 'string' ? nextKeyword.trim() : ''
    if (normalized !== appliedKeyword.value) {
      keywordInput.value = normalized
      appliedKeyword.value = normalized
      page.value = 1
      void loadArticles()
    }
  },
)

watch(
  () => auth.sessionEpoch,
  () => {
    list.value = []
    pendingConfirm.value = null
    unknownRecovery.value = null
    quickActionTracker.reset()
    if (auth.isLoggedIn && auth.canEnterConsole) {
      void loadArticles()
    }
  },
)

onMounted(() => {
  void loadArticles()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">内容管理 · 文章与专栏</h1>
        <p class="admin-page__subtitle">
          全站文章检索、长文专栏章节管理、置顶/锁定/封禁与强制移除均通过 V3 发布锁与操作审计接口执行。
        </p>
      </div>
      <div class="admin-page__actions">
        <RouterLink
          v-if="auth.capabilities?.actions.articleCreate"
          to="/content/articles/new"
          class="admin-btn admin-btn--primary"
        >
          后台新建文章
        </RouterLink>
        <button type="button" class="admin-btn" :disabled="loading" @click="loadArticles">
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
      </div>
    </header>

    <div v-if="unknownRecovery" class="al-banner al-banner--warning" role="alert">
      <div class="al-banner__body">
        <strong>操作状态待确认：{{ unknownRecovery.title }}</strong>
        <p>
          {{ actionError }}
          <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="al-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="executeQuickAction(unknownRecovery)"
        >
          按原操作恢复确认
        </button>
        <button type="button" class="admin-btn admin-btn--sm" @click="unknownRecovery = null">忽略</button>
      </div>
    </div>

    <div v-if="actionMessage" class="al-banner al-banner--success" role="status">
      {{ actionMessage }}
    </div>
    <div v-if="actionError && !unknownRecovery" class="al-banner al-banner--danger" role="alert">
      {{ actionError }}
    </div>

    <section class="admin-panel al-toolbar" aria-label="文章筛选工具栏">
      <div class="admin-tabs" role="tablist" aria-label="文章状态筛选">
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          type="button"
          class="admin-tab"
          :class="{ 'is-active': statusFilter === opt.value }"
          @click="selectStatus(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>

      <form class="admin-filters" @submit.prevent="submitSearch">
        <select
          v-model="typeFilter"
          class="admin-select al-type-select"
          aria-label="文章类型"
          @change="handleTypeChange"
        >
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <input
          v-model="keywordInput"
          type="search"
          class="admin-input al-keyword-input"
          placeholder="搜索文章 ID、标题、标签或作者用户名..."
        />
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="loading">搜索</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" @click="resetFilters">清空</button>
      </form>
    </section>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadArticles"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="admin-table-wrap">
        <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
          <thead>
            <tr>
              <th>文章标题与标签</th>
              <th>作者</th>
              <th>类型与专栏</th>
              <th>状态与标记</th>
              <th>互动指标</th>
              <th>创建 / 更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.oId">
              <td>
                <div class="al-title-cell">
                  <RouterLink :to="`/content/articles/${encodeURIComponent(item.oId)}`" class="al-title-link">
                    {{ item.articleTitle || '（无标题）' }}
                  </RouterLink>
                  <div class="al-meta-line">
                    <span class="admin-mono">ID: {{ item.oId }}</span>
                    <span v-if="item.articleTags">· 标签: {{ item.articleTags }}</span>
                  </div>
                </div>
              </td>
              <td>
                <RouterLink :to="`/users/${encodeURIComponent(item.articleAuthorId)}`" class="al-author-cell">
                  <img :src="item.articleAuthorAvatarURL" :alt="item.articleAuthorName" class="al-avatar" />
                  <div>
                    <div>{{ item.articleAuthorNickname || item.articleAuthorName }}</div>
                    <div class="al-sub admin-mono">@{{ item.articleAuthorName }}</div>
                  </div>
                </RouterLink>
              </td>
              <td>
                <div class="al-badge-stack">
                  <StatusBadge :tone="getArticleTypeMeta(item.articleType).tone" :label="item.articleTypeLabel" />
                  <span v-if="item.longArticleChapter" class="al-sub">
                    《{{ item.longArticleChapter.columnTitle }}》第 {{ item.longArticleChapter.chapterNo }} 章
                  </span>
                </div>
              </td>
              <td>
                <div class="al-badge-stack">
                  <StatusBadge
                    :tone="getArticleStatusMeta(item.articleStatus).tone"
                    :label="getArticleStatusMeta(item.articleStatus).label"
                  />
                  <div class="al-mini-badges">
                    <StatusBadge v-if="item.articleStick > 0" tone="info" label="已置顶" />
                    <StatusBadge v-if="item.articlePerfect === 1" tone="success" label="优选" />
                    <StatusBadge v-if="item.articleShowInList === 0" tone="neutral" label="列表隐藏" />
                  </div>
                </div>
              </td>
              <td class="admin-mono al-metrics">
                <div>评 {{ formatCount(item.articleCommentCount) }} · 览 {{ formatCount(item.articleViewCount) }}</div>
                <div class="al-sub">赞 {{ formatCount(item.articleGoodCnt) }} · 藏 {{ formatCount(item.articleCollectCnt) }}</div>
              </td>
              <td class="admin-mono al-time">
                <div>{{ formatDateTime(item.articleCreateTime) }}</div>
                <div class="al-sub">改 {{ formatDateTime(item.articleUpdateTime) }}</div>
              </td>
              <td>
                <div class="al-row-actions">
                  <RouterLink
                    :to="`/content/articles/${encodeURIComponent(item.oId)}`"
                    class="admin-btn admin-btn--sm"
                  >
                    详情 / 编辑
                  </RouterLink>
                  <button
                    v-if="item.articleStick > 0 && auth.capabilities?.actions.articleCancelStick"
                    type="button"
                    class="admin-btn admin-btn--sm"
                    :disabled="mutating"
                    @click="openQuickActionConfirm('cancel-stick', item)"
                  >
                    取消置顶
                  </button>
                  <button
                    v-else-if="item.articleStick <= 0 && auth.capabilities?.actions.articleStick"
                    type="button"
                    class="admin-btn admin-btn--sm"
                    :disabled="mutating"
                    @click="openQuickActionConfirm('stick', item)"
                  >
                    置顶
                  </button>
                  <button
                    v-if="auth.capabilities?.actions.articleRemove"
                    type="button"
                    class="admin-btn admin-btn--sm admin-btn--danger-outline"
                    :disabled="mutating"
                    @click="openQuickActionConfirm('remove', item)"
                  >
                    移除
                  </button>
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

    <ConfirmDialog
      :open="Boolean(pendingConfirm)"
      :title="pendingConfirm?.title || ''"
      :description="pendingConfirm?.description || ''"
      :summary-items="pendingConfirm?.summaryItems || []"
      :danger="pendingConfirm?.danger || false"
      :confirm-text="pendingConfirm?.confirmText || '确认'"
      :require-confirm-phrase="pendingConfirm?.requireConfirmPhrase || ''"
      :pending="mutating"
      @cancel="pendingConfirm = null"
      @confirm="pendingConfirm && executeQuickAction(pendingConfirm)"
    />
  </div>
</template>

<style scoped>
.al-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  padding: 12px 16px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  font-size: 13px;
}

.al-banner__body p {
  margin: 4px 0 0;
}

.al-banner__actions {
  display: flex;
  gap: 8px;
}

.al-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.al-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.al-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.al-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
}

.al-type-select {
  width: 140px;
}

.al-keyword-input {
  width: 280px;
  max-width: 100%;
}

.al-title-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  max-width: 360px;
}

.al-title-link {
  font-weight: 600;
  color: var(--fp-title);
}

.al-title-link:hover {
  color: var(--fp-link);
}

.al-meta-line,
.al-sub {
  font-size: 12px;
  color: var(--fp-muted);
}

.al-author-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--fp-text);
  white-space: nowrap;
}

.al-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--fp-border);
}

.al-badge-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.al-mini-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.al-metrics,
.al-time {
  white-space: nowrap;
  font-size: 12px;
}

.al-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 768px) {
  .al-type-select,
  .al-keyword-input {
    width: 100%;
  }
}
</style>
