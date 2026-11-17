<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  fetchAdminCommentDetail,
  fetchAdminComments,
  removeAdminComment,
  updateAdminComment,
  type AdminCommentDetail,
  type AdminCommentItem,
  type CommentUpdatePayload,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import AdminDrawer from '@/components/common/AdminDrawer.vue'
import AdminPageHeader from '@/components/common/AdminPageHeader.vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import IdempotencyRecoveryBanner from '@/components/common/IdempotencyRecoveryBanner.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatCount, formatDateTime, getBinaryContentStatusMeta } from '@/utils/format'

/**
 * 全站评论审核与管理视图：
 * 1. 支持按状态（正常/已封禁）、所属文章 ID 与关键字检索并分页浏览；
 * 2. 右侧抽屉支持查看纯文本评论正文、段落评快照、所属文章及操作日志，并编辑正文/状态/可见性/赞踩数；
 * 3. 编辑与强力移除均绑定 IdempotencyTracker，网络结果未明时保留原幂等键支持安全重试。
 */
type PendingCommentMutation =
  | {
      kind: 'edit'
      commentId: string
      payload: CommentUpdatePayload
      idempotencyKey: string
      title: string
    }
  | {
      kind: 'remove'
      commentId: string
      authorName: string
      articleTitle: string
      idempotencyKey: string
      title: string
      description: string
      summaryItems: Array<{ label: string; value: string }>
    }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const keywordInput = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword.trim() : '')
const articleIdInput = ref(typeof route.query.articleId === 'string' ? route.query.articleId : '')
const appliedArticleId = ref(typeof route.query.articleId === 'string' ? route.query.articleId.trim() : '')
const statusFilter = ref(
  route.query.status === '0' || route.query.status === '1' ? route.query.status : 'all',
)
const page = ref(1)
const pageSize = 20

const list = ref<AdminCommentItem[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const drawerOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const drawerDetail = ref<AdminCommentDetail | null>(null)
const confirmDiscardClose = ref(false)

const editForm = reactive({
  commentContent: '',
  commentStatus: 0,
  commentVisible: 0,
  commentGoodCnt: 0,
  commentBadCnt: 0,
})

const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')
const pendingRemove = ref<Extract<PendingCommentMutation, { kind: 'remove' }> | null>(null)
const unknownRecovery = ref<PendingCommentMutation | null>(null)

const editTracker = new IdempotencyTracker('admin-comment-edit')
const removeTracker = new IdempotencyTracker('admin-comment-remove')

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '已封禁' },
]

const canEditComment = computed(() => Boolean(auth.capabilities?.actions.commentEdit))
const canRemoveComment = computed(() => Boolean(auth.capabilities?.actions.commentRemove))
const canViewArticles = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminArticles),
)
const canViewUsers = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminUsers),
)
const canViewAuditLogs = computed(() => Boolean(auth.capabilities?.canAccessAdmin))

const hasActiveFilter = computed(
  () => appliedKeyword.value !== '' || appliedArticleId.value !== '' || statusFilter.value !== 'all',
)

const isDrawerDirty = computed(() => {
  const d = drawerDetail.value
  if (!d || !canEditComment.value) return false
  return (
    editForm.commentContent !== (d.commentContent || '') ||
    editForm.commentStatus !== d.commentStatus ||
    editForm.commentVisible !== d.commentVisible ||
    Number(editForm.commentGoodCnt) !== d.commentGoodCnt ||
    Number(editForm.commentBadCnt) !== d.commentBadCnt
  )
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

function syncFormFromDetail(detail: AdminCommentDetail): void {
  editForm.commentContent = detail.commentContent || ''
  editForm.commentStatus = detail.commentStatus
  editForm.commentVisible = detail.commentVisible
  editForm.commentGoodCnt = detail.commentGoodCnt
  editForm.commentBadCnt = detail.commentBadCnt
  confirmDiscardClose.value = false
}

async function loadComments(): Promise<void> {
  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminComments({
      keyword: appliedKeyword.value || undefined,
      articleId: appliedArticleId.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
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
      loadError.value = err instanceof Error ? err.message : '加载评论列表失败'
    }
  } finally {
    loading.value = false
  }
}

async function openDetailDrawer(commentId: string): Promise<void> {
  const normalizedId = commentId.trim()
  if (!normalizedId) return

  drawerOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  drawerDetail.value = null
  confirmDiscardClose.value = false
  editTracker.reset()

  try {
    const detail = await fetchAdminCommentDetail(normalizedId)
    drawerDetail.value = detail
    syncFormFromDetail(detail)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      unauthenticated.value = true
      drawerOpen.value = false
      return
    }
    detailError.value = err instanceof Error ? err.message : '加载评论详情失败'
  } finally {
    detailLoading.value = false
  }
}

function forceCloseDrawer(): void {
  confirmDiscardClose.value = false
  drawerOpen.value = false
  if (drawerDetail.value) {
    syncFormFromDetail(drawerDetail.value)
  }
}

function requestCloseDrawer(): void {
  if (mutating.value) return
  if (isDrawerDirty.value && !confirmDiscardClose.value) {
    confirmDiscardClose.value = true
    return
  }
  forceCloseDrawer()
}

function selectStatus(status: string): void {
  if (statusFilter.value === status) return
  statusFilter.value = status
  page.value = 1
  void loadComments()
}

function submitSearch(): void {
  appliedKeyword.value = keywordInput.value.trim()
  appliedArticleId.value = articleIdInput.value.trim()
  page.value = 1
  void loadComments()
}

function filterByArticle(articleId: string): void {
  articleIdInput.value = articleId
  appliedArticleId.value = articleId
  page.value = 1
  void loadComments()
}

function resetFilters(): void {
  keywordInput.value = ''
  appliedKeyword.value = ''
  articleIdInput.value = ''
  appliedArticleId.value = ''
  statusFilter.value = 'all'
  page.value = 1
  void loadComments()
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadComments()
}

function buildUpdatePayload(): CommentUpdatePayload | null {
  const d = drawerDetail.value
  if (!d) return null

  const patch: CommentUpdatePayload = {}
  let changed = false

  if (editForm.commentContent !== (d.commentContent || '')) {
    if (!editForm.commentContent.trim()) {
      actionError.value = '评论正文不能为空。'
      return null
    }
    patch.commentContent = editForm.commentContent
    changed = true
  }
  if (editForm.commentStatus !== d.commentStatus) {
    patch.commentStatus = editForm.commentStatus
    changed = true
  }
  if (editForm.commentVisible !== d.commentVisible) {
    patch.commentVisible = editForm.commentVisible
    changed = true
  }

  const goodCnt = Number(editForm.commentGoodCnt)
  if (!Number.isFinite(goodCnt) || !Number.isInteger(goodCnt) || goodCnt < 0) {
    actionError.value = '点赞数必须为大于等于 0 的整数。'
    return null
  }
  if (goodCnt !== d.commentGoodCnt) {
    patch.commentGoodCnt = goodCnt
    changed = true
  }

  const badCnt = Number(editForm.commentBadCnt)
  if (!Number.isFinite(badCnt) || !Number.isInteger(badCnt) || badCnt < 0) {
    actionError.value = '点踩数必须为大于等于 0 的整数。'
    return null
  }
  if (badCnt !== d.commentBadCnt) {
    patch.commentBadCnt = badCnt
    changed = true
  }

  if (!changed) {
    actionError.value = '尚未修改任何评论字段。'
    return null
  }
  return patch
}

async function submitEditForm(): Promise<void> {
  if (!drawerDetail.value) return
  actionError.value = ''
  actionMessage.value = ''

  const payload = buildUpdatePayload()
  if (!payload) return

  const commentId = drawerDetail.value.oId
  const key = editTracker.resolve({ commentId, ...payload })
  await executeMutation({
    kind: 'edit',
    commentId,
    payload,
    idempotencyKey: key,
    title: `保存评论修改（${commentId}）`,
  })
}

function openRemoveConfirm(item: AdminCommentItem): void {
  actionError.value = ''
  actionMessage.value = ''
  const key = removeTracker.resolve({ kind: 'remove', commentId: item.oId })
  pendingRemove.value = {
    kind: 'remove',
    commentId: item.oId,
    authorName: item.commentAuthorName || item.commentAuthorId,
    articleTitle: item.commentArticleTitle || item.commentOnArticleId,
    idempotencyKey: key,
    title: '危险操作：永久移除评论',
    description: '将从数据库永久删除该评论，并同步递减所属文章评论数，操作不可恢复。',
    summaryItems: [
      { label: '评论 ID', value: item.oId },
      { label: '评论者', value: `@${item.commentAuthorName || item.commentAuthorId}` },
      { label: '所属文章', value: item.commentArticleTitle || item.commentOnArticleId },
      { label: '内容摘要', value: item.commentContentPreview || item.commentContent || '（空）' },
    ],
  }
}

async function executeMutation(task: PendingCommentMutation): Promise<void> {
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (task.kind === 'edit') {
      const res = await updateAdminComment(task.commentId, task.payload, task.idempotencyKey)
      editTracker.reset()
      unknownRecovery.value = null
      if (drawerDetail.value?.oId === task.commentId) {
        drawerDetail.value = res.detail
        syncFormFromDetail(res.detail)
      }
      actionMessage.value = res.replayed
        ? `已恢复上次评论修改结果（${task.commentId}）。`
        : `评论 ${task.commentId} 修改已保存。`
      await loadComments()
      return
    }

    const res = await removeAdminComment(task.commentId, task.idempotencyKey)
    removeTracker.reset()
    pendingRemove.value = null
    unknownRecovery.value = null
    if (drawerDetail.value?.oId === task.commentId) {
      drawerOpen.value = false
      drawerDetail.value = null
      confirmDiscardClose.value = false
    }
    actionMessage.value = res.replayed
      ? `已确认评论 ${task.commentId} 先前已完成移除。`
      : `评论 ${task.commentId} 已永久移除。`
    await loadComments()
  } catch (err) {
    pendingRemove.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = task
      actionError.value =
        err instanceof Error ? `${err.message}（写入结果未明，请保留原幂等键重试确认）` : '写入结果未明'
      return
    }
    if (err instanceof ApiError && err.status === 401) {
      unauthenticated.value = true
      return
    }
    if (task.kind === 'edit') {
      editTracker.reset()
    } else {
      removeTracker.reset()
    }
    unknownRecovery.value = null
    actionError.value = err instanceof Error ? err.message : '执行评论操作失败'
  } finally {
    mutating.value = false
  }
}

function discardUnknownRecovery(): void {
  if (!unknownRecovery.value) return
  if (unknownRecovery.value.kind === 'edit') {
    editTracker.reset()
  } else {
    removeTracker.reset()
  }
  unknownRecovery.value = null
  actionError.value = ''
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => [route.query.keyword, route.query.articleId, route.query.status],
  ([nextKeyword, nextArticleId, nextStatus]) => {
    const kw = typeof nextKeyword === 'string' ? nextKeyword.trim() : ''
    const aid = typeof nextArticleId === 'string' ? nextArticleId.trim() : ''
    const st = nextStatus === '0' || nextStatus === '1' ? nextStatus : 'all'
    if (kw !== appliedKeyword.value || aid !== appliedArticleId.value || st !== statusFilter.value) {
      keywordInput.value = kw
      appliedKeyword.value = kw
      articleIdInput.value = aid
      appliedArticleId.value = aid
      statusFilter.value = st
      page.value = 1
      void loadComments()
    }
  },
)

watch(
  () => route.query.commentId,
  (nextCommentId) => {
    if (typeof nextCommentId === 'string' && nextCommentId.trim()) {
      void openDetailDrawer(nextCommentId)
    }
  },
)

watch(
  () => auth.sessionEpoch,
  () => {
    list.value = []
    drawerOpen.value = false
    drawerDetail.value = null
    pendingRemove.value = null
    unknownRecovery.value = null
    editTracker.reset()
    removeTracker.reset()
    if (auth.isLoggedIn && auth.canEnterConsole) {
      void loadComments()
    }
  },
)

onMounted(() => {
  void loadComments()
  if (typeof route.query.commentId === 'string' && route.query.commentId.trim()) {
    void openDetailDrawer(route.query.commentId)
  }
})
</script>

<template>
  <div class="admin-page">
    <AdminPageHeader
      title="内容管理 · 评论审核与编辑"
      subtitle="全站评论按时间倒序分页检索，正文统一采用纯文本渲染，禁止 HTML 注入风险，编辑与强删均带审计记录。"
    >
      <template #actions>
        <RouterLink v-if="canViewArticles" to="/content/articles" class="admin-btn">
          前往文章管理
        </RouterLink>
        <button type="button" class="admin-btn" :disabled="loading" @click="loadComments">
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
      </template>
    </AdminPageHeader>

    <IdempotencyRecoveryBanner
      v-if="unknownRecovery"
      :title="unknownRecovery.title"
      :idempotency-key="unknownRecovery.idempotencyKey"
      :busy="mutating"
      @retry="unknownRecovery && executeMutation(unknownRecovery)"
      @discard="discardUnknownRecovery"
    />

    <AdminAlertBanner v-if="actionMessage" tone="success" :message="actionMessage" />
    <AdminAlertBanner v-if="actionError" tone="danger" :message="actionError" />

    <section class="admin-panel cm-toolbar" aria-label="评论筛选工具栏">
      <div class="admin-tabs" role="tablist" aria-label="评论状态筛选">
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
        <label class="admin-field"><input aria-label="所属文章 ID"
          v-model="articleIdInput"
          type="search"
          class="admin-input cm-article-input"
          placeholder="所属文章 ID（可选）..."
        /></label>
        <label class="admin-field"><input aria-label="搜索关键词"
          v-model="keywordInput"
          type="search"
          class="admin-input cm-keyword-input"
          placeholder="搜索评论 ID、正文或作者用户名..."
        /></label>
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="loading">搜索</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" @click="resetFilters">清空</button>
      </form>
    </section>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      empty-text="当前全站暂无符合条件的评论记录。"
      filtered-empty-text="未检索到匹配的评论，请调整关键字、文章 ID 或状态筛选。"
      @retry="loadComments"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="admin-table-wrap">
        <table class="admin-table admin-table--wide" :class="{ 'admin-table--compact': theme.compactTable }">
          <thead>
            <tr>
              <th>评论内容摘要（纯文本）</th>
              <th>评论者</th>
              <th>所属文章</th>
              <th>状态与互动</th>
              <th>发布时间与 IP</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.oId">
              <td>
                <div class="cm-content-cell">
                  <p class="cm-preview">{{ item.commentContentPreview || item.commentContent || '（空内容）' }}</p>
                  <div class="cm-sub admin-mono">
                    ID: {{ item.oId }}
                    <span v-if="item.commentOriginalCommentId">
                      · 回复 {{ item.commentOriginalCommentId }}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <RouterLink
                  v-if="canViewUsers && item.commentAuthorId"
                  :to="`/users/${encodeURIComponent(item.commentAuthorId)}`"
                  class="cm-author-cell"
                >
                  <img
                    v-if="item.commentAuthorAvatarURL"
                    :src="item.commentAuthorAvatarURL"
                    :alt="item.commentAuthorName"
                    class="cm-avatar"
                  />
                  <div>
                    <div>{{ item.commentAuthorNickname || item.commentAuthorName || item.commentAuthorId }}</div>
                    <div class="cm-sub admin-mono">@{{ item.commentAuthorName || '-' }}</div>
                  </div>
                </RouterLink>
                <div v-else>
                  <div>{{ item.commentAuthorNickname || item.commentAuthorName || item.commentAuthorId }}</div>
                  <div class="cm-sub admin-mono">@{{ item.commentAuthorName || '-' }}</div>
                </div>
              </td>
              <td>
                <div class="cm-article-cell">
                  <RouterLink
                    v-if="canViewArticles && item.commentOnArticleId"
                    :to="`/content/articles/${encodeURIComponent(item.commentOnArticleId)}`"
                    class="cm-article-link"
                  >
                    {{ item.commentArticleTitle || item.commentOnArticleId }}
                  </RouterLink>
                  <span v-else>{{ item.commentArticleTitle || item.commentOnArticleId || '-' }}</span>
                  <div class="cm-article-meta">
                    <span class="cm-sub admin-mono">文章 {{ item.commentOnArticleId || '-' }}</span>
                    <button
                      v-if="item.commentOnArticleId && appliedArticleId !== item.commentOnArticleId"
                      type="button"
                      class="cm-inline-btn"
                      @click="filterByArticle(item.commentOnArticleId)"
                    >
                      仅看此文
                    </button>
                  </div>
                </div>
              </td>
              <td>
                <div class="cm-badge-stack">
                  <div class="cm-badge-row">
                    <StatusBadge
                      :tone="getBinaryContentStatusMeta(item.commentStatus).tone"
                      :label="item.commentStatusLabel || getBinaryContentStatusMeta(item.commentStatus).label"
                    />
                    <StatusBadge
                      :tone="item.commentVisible === 0 ? 'info' : 'warning'"
                      :label="item.commentVisible === 0 ? '全站可见' : '仅作者可见'"
                    />
                  </div>
                  <div class="cm-sub admin-mono">
                    赞 {{ formatCount(item.commentGoodCnt) }} · 踩 {{ formatCount(item.commentBadCnt) }} · 回
                    {{ formatCount(item.commentReplyCnt) }} · 赏 {{ formatCount(item.commentThankCnt) }}
                  </div>
                </div>
              </td>
              <td class="admin-mono cm-time">
                <div>{{ formatDateTime(item.commentCreateTime) }}</div>
                <div class="cm-sub">IP: {{ item.commentIP || '-' }}</div>
              </td>
              <td>
                <div class="cm-row-actions">
                  <button type="button" class="admin-btn admin-btn--sm" @click="openDetailDrawer(item.oId)">
                    {{ canEditComment ? '详情 / 编辑' : '查看详情' }}
                  </button>
                  <button
                    v-if="canRemoveComment"
                    type="button"
                    class="admin-btn admin-btn--sm admin-btn--danger-outline"
                    :disabled="mutating"
                    @click="openRemoveConfirm(item)"
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

    <!-- 评论详情与编辑抽屉 -->
    <AdminDrawer
      :open="drawerOpen"
      :title="drawerDetail ? `评论详情与处置 #${drawerDetail.oId}` : '评论详情'"
      :subtitle="
        drawerDetail
          ? `作者 @${drawerDetail.commentAuthorName || drawerDetail.commentAuthorId} · 正文为纯文本安全展示`
          : '正在读取详情...'
      "
      width="min(640px, 100vw)"
      :close-on-backdrop="!isDrawerDirty && !mutating"
      @close="requestCloseDrawer"
    >
      <div v-if="detailLoading" class="cm-drawer-state">正在加载评论完整详情与审计记录...</div>
      <div v-else-if="detailError" class="cm-banner cm-banner--danger" role="alert">
        {{ detailError }}
      </div>
      <div v-else-if="drawerDetail" class="cm-drawer-body">
        <div v-if="confirmDiscardClose" class="cm-banner cm-banner--warning" role="alert">
          <div class="cm-banner__body">
            <strong>检测到未保存的编辑内容</strong>
            <p>确认要放弃对当前评论正文或状态的更改并关闭抽屉吗？</p>
          </div>
          <div class="cm-banner__actions">
            <button type="button" class="admin-btn admin-btn--sm" @click="confirmDiscardClose = false">
              继续编辑
            </button>
            <button type="button" class="admin-btn admin-btn--sm admin-btn--danger" @click="forceCloseDrawer">
              放弃并关闭
            </button>
          </div>
        </div>

        <section class="cm-section">
          <h3 class="cm-section__title">基础上下文与元数据</h3>
          <dl class="cm-meta-grid">
            <div>
              <dt>所属文章</dt>
              <dd>
                <RouterLink
                  v-if="canViewArticles && drawerDetail.commentOnArticleId"
                  :to="`/content/articles/${encodeURIComponent(drawerDetail.commentOnArticleId)}`"
                  class="cm-article-link"
                >
                  {{ drawerDetail.commentArticleTitle || drawerDetail.commentOnArticleId }}
                </RouterLink>
                <span v-else>{{ drawerDetail.commentArticleTitle || drawerDetail.commentOnArticleId || '-' }}</span>
              </dd>
            </div>
            <div>
              <dt>评论者</dt>
              <dd>
                <RouterLink
                  v-if="canViewUsers && drawerDetail.commentAuthorId"
                  :to="`/users/${encodeURIComponent(drawerDetail.commentAuthorId)}`"
                  class="cm-article-link"
                >
                  {{ drawerDetail.commentAuthorNickname || drawerDetail.commentAuthorName }} (@{{
                    drawerDetail.commentAuthorName
                  }})
                </RouterLink>
                <span v-else>
                  {{ drawerDetail.commentAuthorNickname || drawerDetail.commentAuthorName || drawerDetail.commentAuthorId }}
                </span>
              </dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd class="admin-mono">{{ formatDateTime(drawerDetail.commentCreateTime) }}</dd>
            </div>
            <div>
              <dt>匿名 / 悬赏采纳</dt>
              <dd>
                {{ drawerDetail.commentAnonymous === 1 ? '匿名评论' : '实名发布' }} ·
                {{ drawerDetail.commentQnAOffered === 1 ? '已被采纳/悬赏' : '普通评论' }}
              </dd>
            </div>
            <div>
              <dt>来源 IP / UA</dt>
              <dd class="admin-mono">
                {{ drawerDetail.commentIP || '-' }}
                <div class="cm-sub">{{ drawerDetail.commentUA || '未记录 UA' }}</div>
              </dd>
            </div>
            <div>
              <dt>父评论 ID</dt>
              <dd class="admin-mono">{{ drawerDetail.commentOriginalCommentId || '无（一级评论）' }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="drawerDetail.commentParagraphId || drawerDetail.commentParagraphSnapshot"
          class="cm-section cm-paragraph-box"
        >
          <h3 class="cm-section__title">关联长文段落评快照</h3>
          <p class="cm-sub admin-mono">
            段落 ID: {{ drawerDetail.commentParagraphId || '-' }} · 第 {{ drawerDetail.commentParagraphIndex }} 段 ·
            状态码 {{ drawerDetail.commentParagraphStatus }}
          </p>
          <pre class="cm-plain-pre">{{ drawerDetail.commentParagraphSnapshot || '暂无原文段落快照' }}</pre>
        </section>

        <section class="cm-section">
          <div class="cm-section__head">
            <h3 class="cm-section__title">评论正文与状态调控</h3>
            <span class="cm-sub">{{ canEditComment ? '仅提交实际修改的字段' : '当前账号仅只读' }}</span>
          </div>

          <form id="comment-edit-form" class="cm-form" @submit.prevent="submitEditForm">
            <div class="cm-field">
              <label for="cm-content">评论正文（Markdown / 纯文本）</label>
              <textarea
                id="cm-content"
                v-model="editForm.commentContent"
                class="admin-textarea cm-textarea"
                rows="5"
                :disabled="!canEditComment || mutating"
              />
            </div>

            <div class="cm-field-row">
              <div class="cm-field">
                <label for="cm-status">评论状态</label>
                <select
                  id="cm-status"
                  v-model.number="editForm.commentStatus"
                  class="admin-select"
                  :disabled="!canEditComment || mutating"
                >
                  <option :value="0">正常 (0)</option>
                  <option :value="1">已封禁 (1)</option>
                </select>
              </div>
              <div class="cm-field">
                <label for="cm-visible">可见范围</label>
                <select
                  id="cm-visible"
                  v-model.number="editForm.commentVisible"
                  class="admin-select"
                  :disabled="!canEditComment || mutating"
                >
                  <option :value="0">全站可见 (0)</option>
                  <option :value="1">仅作者可见 (1)</option>
                </select>
              </div>
            </div>

            <div class="cm-field-row">
              <div class="cm-field">
                <label for="cm-good">点赞数</label>
                <input
                  id="cm-good"
                  v-model.number="editForm.commentGoodCnt"
                  type="number"
                  min="0"
                  step="1"
                  class="admin-input admin-mono"
                  :disabled="!canEditComment || mutating"
                />
              </div>
              <div class="cm-field">
                <label for="cm-bad">点踩数</label>
                <input
                  id="cm-bad"
                  v-model.number="editForm.commentBadCnt"
                  type="number"
                  min="0"
                  step="1"
                  class="admin-input admin-mono"
                  :disabled="!canEditComment || mutating"
                />
              </div>
            </div>
          </form>
        </section>

        <section class="cm-section">
          <div class="cm-section__head">
            <h3 class="cm-section__title">近期操作审计记录</h3>
            <RouterLink
              v-if="canViewAuditLogs"
              :to="`/system/audit-logs?dataId=${encodeURIComponent(drawerDetail.oId)}`"
              class="cm-article-link"
            >
              在全站审计中筛选此评论
            </RouterLink>
          </div>
          <div v-if="drawerDetail.recentOperations.length" class="cm-ops-list">
            <div v-for="op in drawerDetail.recentOperations" :key="op.oId" class="cm-op-row">
              <div class="cm-op-row__top">
                <strong>{{ op.operationCodeLabel }} (#{{ op.operationCode }})</strong>
                <span class="cm-sub admin-mono">{{ formatDateTime(op.operationCreated) }}</span>
              </div>
              <div class="cm-sub">
                操作人：{{ op.operationUserNickname || op.operationUserName || op.operationUserId }} · IP:
                <span class="admin-mono">{{ op.operationIP || '-' }}</span>
              </div>
            </div>
          </div>
          <p v-else class="cm-sub">暂无针对该评论的近期管理操作记录。</p>
        </section>
      </div>

      <template #footer>
        <div class="cm-drawer-footer">
          <button
            v-if="drawerDetail && canRemoveComment"
            type="button"
            class="admin-btn admin-btn--danger"
            :disabled="mutating"
            @click="openRemoveConfirm(drawerDetail)"
          >
            永久移除评论
          </button>
          <div class="cm-drawer-footer__right">
            <button type="button" class="admin-btn" :disabled="mutating" @click="requestCloseDrawer">
              关闭
            </button>
            <button
              v-if="drawerDetail && canEditComment"
              type="submit"
              form="comment-edit-form"
              class="admin-btn admin-btn--primary"
              :disabled="mutating || !isDrawerDirty"
            >
              {{ mutating ? '保存中...' : '保存修改' }}
            </button>
          </div>
        </div>
      </template>
    </AdminDrawer>

    <ConfirmDialog
      :open="Boolean(pendingRemove)"
      :title="pendingRemove?.title || ''"
      :description="pendingRemove?.description || ''"
      :summary-items="pendingRemove?.summaryItems || []"
      :danger="true"
      confirm-text="确认永久移除"
      :require-confirm-phrase="pendingRemove?.commentId || ''"
      :pending="mutating"
      @cancel="pendingRemove = null"
      @confirm="pendingRemove && executeMutation(pendingRemove)"
    />
  </div>
</template>

<style scoped>
.cm-banner {
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

.cm-banner__body p {
  margin: 4px 0 0;
}

.cm-banner__actions {
  display: flex;
  gap: 8px;
}

.cm-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.cm-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.cm-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.cm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
}

.cm-article-input {
  width: 190px;
  max-width: 100%;
}

.cm-keyword-input {
  width: 260px;
  max-width: 100%;
}

.cm-content-cell {
  min-width: 240px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cm-preview {
  margin: 0;
  color: var(--fp-title);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cm-sub {
  font-size: 12px;
  color: var(--fp-muted);
}

.cm-author-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--fp-text);
  white-space: nowrap;
}

.cm-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--fp-border);
}

.cm-article-cell {
  min-width: 170px;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cm-article-link {
  color: var(--fp-link);
  font-weight: 500;
  word-break: break-word;
}

.cm-article-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cm-inline-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--fp-link);
  cursor: pointer;
}

.cm-inline-btn:hover {
  text-decoration: underline;
}

.cm-badge-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cm-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cm-time {
  white-space: nowrap;
  font-size: 12px;
}

.cm-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cm-drawer-state {
  padding: 24px 0;
  color: var(--fp-muted);
  font-size: 13px;
}

.cm-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cm-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--fp-border);
}

.cm-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.cm-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cm-section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fp-title);
}

.cm-meta-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  font-size: 13px;
}

.cm-meta-grid dt {
  font-size: 12px;
  color: var(--fp-muted);
}

.cm-meta-grid dd {
  margin: 2px 0 0;
  color: var(--fp-text);
  word-break: break-word;
}

.cm-paragraph-box {
  padding: 12px;
  border-radius: var(--fp-radius-md);
  background: var(--fp-elevated);
  border: 1px solid var(--fp-border);
}

.cm-plain-pre {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fp-text);
}

.cm-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.cm-field label {
  font-weight: 500;
  color: var(--fp-title);
}

.cm-textarea {
  min-height: 112px;
  resize: vertical;
}

.cm-field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cm-ops-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cm-op-row {
  padding: 8px 10px;
  border-radius: var(--fp-radius-sm);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.cm-op-row__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--fp-title);
}

.cm-drawer-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cm-drawer-footer__right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 768px) {
  .cm-article-input,
  .cm-keyword-input {
    width: 100%;
  }

  .cm-meta-grid,
  .cm-field-row {
    grid-template-columns: 1fr;
  }
}
</style>
