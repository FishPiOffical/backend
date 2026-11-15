<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  fetchAdminBreezemoonDetail,
  fetchAdminBreezemoons,
  removeAdminBreezemoon,
  updateAdminBreezemoon,
  type AdminBreezemoonDetail,
  type AdminBreezemoonItem,
  type BreezemoonUpdatePayload,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminDrawer from '@/components/common/AdminDrawer.vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatDateTime, getBinaryContentStatusMeta } from '@/utils/format'

/**
 * 清风明月管理视图：
 * 1. 支持按状态（正常/已封禁）、作者 ID 与关键字检索并分页浏览；
 * 2. 右侧抽屉展示清风明月全文（纯文本）、来源城市/IP/UA 及审计记录，支持正文与状态编辑；
 * 3. 写入与永久删除操作均绑定 IdempotencyTracker，未知结果失败时可按原幂等键恢复确认。
 */
type PendingBreezemoonMutation =
  | {
      kind: 'edit'
      breezemoonId: string
      payload: BreezemoonUpdatePayload
      idempotencyKey: string
      title: string
    }
  | {
      kind: 'remove'
      breezemoonId: string
      authorName: string
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
const authorIdInput = ref(typeof route.query.authorId === 'string' ? route.query.authorId : '')
const appliedAuthorId = ref(typeof route.query.authorId === 'string' ? route.query.authorId.trim() : '')
const statusFilter = ref(
  route.query.status === '0' || route.query.status === '1' ? route.query.status : 'all',
)
const page = ref(1)
const pageSize = 20

const list = ref<AdminBreezemoonItem[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const drawerOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const drawerDetail = ref<AdminBreezemoonDetail | null>(null)
const confirmDiscardClose = ref(false)

const editForm = reactive({
  breezemoonContent: '',
  breezemoonStatus: 0,
})

const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')
const pendingRemove = ref<Extract<PendingBreezemoonMutation, { kind: 'remove' }> | null>(null)
const unknownRecovery = ref<PendingBreezemoonMutation | null>(null)

const editTracker = new IdempotencyTracker('admin-breezemoon-edit')
const removeTracker = new IdempotencyTracker('admin-breezemoon-remove')

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '已封禁' },
]

const canEditBreezemoon = computed(() => Boolean(auth.capabilities?.actions.breezemoonEdit))
const canRemoveBreezemoon = computed(() => Boolean(auth.capabilities?.actions.breezemoonRemove))
const canViewUsers = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminUsers),
)
const canViewAuditLogs = computed(() => Boolean(auth.capabilities?.canAccessAdmin))

const hasActiveFilter = computed(
  () => appliedKeyword.value !== '' || appliedAuthorId.value !== '' || statusFilter.value !== 'all',
)

const isDrawerDirty = computed(() => {
  const d = drawerDetail.value
  if (!d || !canEditBreezemoon.value) return false
  return (
    editForm.breezemoonContent !== (d.breezemoonContent || '') ||
    editForm.breezemoonStatus !== d.breezemoonStatus
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

function syncFormFromDetail(detail: AdminBreezemoonDetail): void {
  editForm.breezemoonContent = detail.breezemoonContent || ''
  editForm.breezemoonStatus = detail.breezemoonStatus
  confirmDiscardClose.value = false
}

async function loadBreezemoons(): Promise<void> {
  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminBreezemoons({
      keyword: appliedKeyword.value || undefined,
      authorId: appliedAuthorId.value || undefined,
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
      loadError.value = err instanceof Error ? err.message : '加载清风明月列表失败'
    }
  } finally {
    loading.value = false
  }
}

async function openDetailDrawer(breezemoonId: string): Promise<void> {
  const normalizedId = breezemoonId.trim()
  if (!normalizedId) return

  drawerOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  drawerDetail.value = null
  confirmDiscardClose.value = false
  editTracker.reset()

  try {
    const detail = await fetchAdminBreezemoonDetail(normalizedId)
    drawerDetail.value = detail
    syncFormFromDetail(detail)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      unauthenticated.value = true
      drawerOpen.value = false
      return
    }
    detailError.value = err instanceof Error ? err.message : '加载清风明月详情失败'
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
  void loadBreezemoons()
}

function submitSearch(): void {
  appliedKeyword.value = keywordInput.value.trim()
  appliedAuthorId.value = authorIdInput.value.trim()
  page.value = 1
  void loadBreezemoons()
}

function filterByAuthor(authorId: string): void {
  authorIdInput.value = authorId
  appliedAuthorId.value = authorId
  page.value = 1
  void loadBreezemoons()
}

function resetFilters(): void {
  keywordInput.value = ''
  appliedKeyword.value = ''
  authorIdInput.value = ''
  appliedAuthorId.value = ''
  statusFilter.value = 'all'
  page.value = 1
  void loadBreezemoons()
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadBreezemoons()
}

function buildUpdatePayload(): BreezemoonUpdatePayload | null {
  const d = drawerDetail.value
  if (!d) return null

  const patch: BreezemoonUpdatePayload = {}
  let changed = false

  if (editForm.breezemoonContent !== (d.breezemoonContent || '')) {
    if (!editForm.breezemoonContent.trim()) {
      actionError.value = '清风明月正文不能为空。'
      return null
    }
    patch.breezemoonContent = editForm.breezemoonContent
    changed = true
  }

  if (editForm.breezemoonStatus !== d.breezemoonStatus) {
    patch.breezemoonStatus = editForm.breezemoonStatus
    changed = true
  }

  if (!changed) {
    actionError.value = '尚未修改任何字段。'
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

  const breezemoonId = drawerDetail.value.oId
  const key = editTracker.resolve({ breezemoonId, ...payload })
  await executeMutation({
    kind: 'edit',
    breezemoonId,
    payload,
    idempotencyKey: key,
    title: `保存清风明月修改（${breezemoonId}）`,
  })
}

function openRemoveConfirm(item: AdminBreezemoonItem): void {
  actionError.value = ''
  actionMessage.value = ''
  const key = removeTracker.resolve({ kind: 'remove', breezemoonId: item.oId })
  pendingRemove.value = {
    kind: 'remove',
    breezemoonId: item.oId,
    authorName: item.breezemoonAuthorName || item.breezemoonAuthorId,
    idempotencyKey: key,
    title: '危险操作：永久移除清风明月',
    description: '将永久删除该条清风明月记录，操作不可恢复。',
    summaryItems: [
      { label: '记录 ID', value: item.oId },
      { label: '作者', value: `@${item.breezemoonAuthorName || item.breezemoonAuthorId}` },
      { label: '正文摘要', value: item.breezemoonContent || '（空内容）' },
    ],
  }
}

async function executeMutation(task: PendingBreezemoonMutation): Promise<void> {
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (task.kind === 'edit') {
      const res = await updateAdminBreezemoon(task.breezemoonId, task.payload, task.idempotencyKey)
      editTracker.reset()
      unknownRecovery.value = null
      if (drawerDetail.value?.oId === task.breezemoonId) {
        drawerDetail.value = res.detail
        syncFormFromDetail(res.detail)
      }
      actionMessage.value = res.replayed
        ? `已恢复上次清风明月修改结果（${task.breezemoonId}）。`
        : `清风明月 ${task.breezemoonId} 修改已保存。`
      await loadBreezemoons()
      return
    }

    const res = await removeAdminBreezemoon(task.breezemoonId, task.idempotencyKey)
    removeTracker.reset()
    pendingRemove.value = null
    unknownRecovery.value = null
    if (drawerDetail.value?.oId === task.breezemoonId) {
      drawerOpen.value = false
      drawerDetail.value = null
      confirmDiscardClose.value = false
    }
    actionMessage.value = res.replayed
      ? `已确认清风明月 ${task.breezemoonId} 先前已完成移除。`
      : `清风明月 ${task.breezemoonId} 已永久移除。`
    await loadBreezemoons()
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
    actionError.value = err instanceof Error ? err.message : '执行清风明月操作失败'
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
  () => [route.query.keyword, route.query.authorId, route.query.status],
  ([nextKeyword, nextAuthorId, nextStatus]) => {
    const kw = typeof nextKeyword === 'string' ? nextKeyword.trim() : ''
    const uid = typeof nextAuthorId === 'string' ? nextAuthorId.trim() : ''
    const st = nextStatus === '0' || nextStatus === '1' ? nextStatus : 'all'
    if (kw !== appliedKeyword.value || uid !== appliedAuthorId.value || st !== statusFilter.value) {
      keywordInput.value = kw
      appliedKeyword.value = kw
      authorIdInput.value = uid
      appliedAuthorId.value = uid
      statusFilter.value = st
      page.value = 1
      void loadBreezemoons()
    }
  },
)

watch(
  () => route.query.breezemoonId,
  (nextId) => {
    if (typeof nextId === 'string' && nextId.trim()) {
      void openDetailDrawer(nextId)
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
      void loadBreezemoons()
    }
  },
)

onMounted(() => {
  void loadBreezemoons()
  if (typeof route.query.breezemoonId === 'string' && route.query.breezemoonId.trim()) {
    void openDetailDrawer(route.query.breezemoonId)
  }
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">内容管理 · 清风明月</h1>
        <p class="admin-page__subtitle">
          查看全站清风明月短动态并按状态、作者或关键字筛选，支持纯文本核验、状态封禁及永久删除。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadBreezemoons">
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
      </div>
    </header>

    <div v-if="unknownRecovery" class="bm-banner bm-banner--warning" role="alert">
      <div class="bm-banner__body">
        <strong>上次操作结果未明：{{ unknownRecovery.title }}</strong>
        <p>
          幂等键 <code class="admin-mono">{{ unknownRecovery.idempotencyKey }}</code> 已保留，建议沿用原幂等键重试确认结果。
        </p>
      </div>
      <div class="bm-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="unknownRecovery && executeMutation(unknownRecovery)"
        >
          按原幂等键重试
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="mutating" @click="discardUnknownRecovery">
          放弃恢复
        </button>
      </div>
    </div>

    <div v-if="actionMessage" class="bm-banner bm-banner--success" role="status">
      {{ actionMessage }}
    </div>
    <div v-if="actionError" class="bm-banner bm-banner--danger" role="alert">
      {{ actionError }}
    </div>

    <section class="admin-panel bm-toolbar" aria-label="清风明月筛选工具栏">
      <div class="admin-tabs" role="tablist" aria-label="清风明月状态筛选">
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
        <label class="admin-field"><input aria-label="作者 ID（可选）..."
          v-model="authorIdInput"
          type="search"
          class="admin-input bm-author-input"
          placeholder="作者 ID（可选）..."
        /></label>
        <label class="admin-field"><input aria-label="搜索 ID、正文、城市或作者用户名..."
          v-model="keywordInput"
          type="search"
          class="admin-input bm-keyword-input"
          placeholder="搜索 ID、正文、城市或作者用户名..."
        /></label>
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="loading">搜索</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" @click="resetFilters">清空</button>
      </form>
    </section>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      empty-text="当前暂无清风明月记录。"
      filtered-empty-text="未检索到匹配的清风明月，请调整关键字、作者 ID 或状态筛选。"
      @retry="loadBreezemoons"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="admin-table-wrap">
        <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
          <thead>
            <tr>
              <th>正文内容（纯文本）</th>
              <th>发布作者</th>
              <th>状态</th>
              <th>创建 / 更新时间与 IP</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.oId">
              <td>
                <div class="bm-content-cell">
                  <p class="bm-preview">{{ item.breezemoonContent || '（空内容）' }}</p>
                  <div class="bm-sub admin-mono">
                    ID: {{ item.oId }}
                    <span v-if="item.breezemoonCity">· {{ item.breezemoonCity }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="bm-author-wrap">
                  <RouterLink
                    v-if="canViewUsers && item.breezemoonAuthorId"
                    :to="`/users/${encodeURIComponent(item.breezemoonAuthorId)}`"
                    class="bm-author-cell"
                  >
                    <img
                      v-if="item.breezemoonAuthorAvatarURL"
                      :src="item.breezemoonAuthorAvatarURL"
                      :alt="item.breezemoonAuthorName"
                      class="bm-avatar"
                    />
                    <div>
                      <div>{{ item.breezemoonAuthorNickname || item.breezemoonAuthorName || item.breezemoonAuthorId }}</div>
                      <div class="bm-sub admin-mono">@{{ item.breezemoonAuthorName || '-' }}</div>
                    </div>
                  </RouterLink>
                  <div v-else>
                    <div>{{ item.breezemoonAuthorNickname || item.breezemoonAuthorName || item.breezemoonAuthorId }}</div>
                    <div class="bm-sub admin-mono">@{{ item.breezemoonAuthorName || '-' }}</div>
                  </div>
                  <button
                    v-if="item.breezemoonAuthorId && appliedAuthorId !== item.breezemoonAuthorId"
                    type="button"
                    class="bm-inline-btn"
                    @click="filterByAuthor(item.breezemoonAuthorId)"
                  >
                    仅看该作者
                  </button>
                </div>
              </td>
              <td>
                <StatusBadge
                  :tone="getBinaryContentStatusMeta(item.breezemoonStatus).tone"
                  :label="item.breezemoonStatusLabel || getBinaryContentStatusMeta(item.breezemoonStatus).label"
                />
              </td>
              <td class="admin-mono bm-time">
                <div>{{ formatDateTime(item.breezemoonCreated) }}</div>
                <div class="bm-sub">
                  改 {{ formatDateTime(item.breezemoonUpdated) }} · IP {{ item.breezemoonIP || '-' }}
                </div>
              </td>
              <td>
                <div class="bm-row-actions">
                  <button type="button" class="admin-btn admin-btn--sm" @click="openDetailDrawer(item.oId)">
                    {{ canEditBreezemoon ? '详情 / 编辑' : '查看详情' }}
                  </button>
                  <button
                    v-if="canRemoveBreezemoon"
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

    <!-- 清风明月详情与编辑抽屉 -->
    <AdminDrawer
      :open="drawerOpen"
      :title="drawerDetail ? `清风明月详情 #${drawerDetail.oId}` : '清风明月详情'"
      :subtitle="
        drawerDetail
          ? `作者 @${drawerDetail.breezemoonAuthorName || drawerDetail.breezemoonAuthorId} · 正文为纯文本安全展示`
          : '正在读取详情...'
      "
      width="min(600px, 100vw)"
      :close-on-backdrop="!isDrawerDirty && !mutating"
      @close="requestCloseDrawer"
    >
      <div v-if="detailLoading" class="bm-drawer-state">正在加载清风明月详情与审计记录...</div>
      <div v-else-if="detailError" class="bm-banner bm-banner--danger" role="alert">
        {{ detailError }}
      </div>
      <div v-else-if="drawerDetail" class="bm-drawer-body">
        <div v-if="confirmDiscardClose" class="bm-banner bm-banner--warning" role="alert">
          <div class="bm-banner__body">
            <strong>检测到未保存的编辑内容</strong>
            <p>确认要放弃当前对正文或状态的修改并关闭抽屉吗？</p>
          </div>
          <div class="bm-banner__actions">
            <button type="button" class="admin-btn admin-btn--sm" @click="confirmDiscardClose = false">
              继续编辑
            </button>
            <button type="button" class="admin-btn admin-btn--sm admin-btn--danger" @click="forceCloseDrawer">
              放弃并关闭
            </button>
          </div>
        </div>

        <section class="bm-section">
          <h3 class="bm-section__title">基础元数据</h3>
          <dl class="bm-meta-grid">
            <div>
              <dt>作者</dt>
              <dd>
                <RouterLink
                  v-if="canViewUsers && drawerDetail.breezemoonAuthorId"
                  :to="`/users/${encodeURIComponent(drawerDetail.breezemoonAuthorId)}`"
                  class="bm-link"
                >
                  {{ drawerDetail.breezemoonAuthorNickname || drawerDetail.breezemoonAuthorName }} (@{{
                    drawerDetail.breezemoonAuthorName
                  }})
                </RouterLink>
                <span v-else>
                  {{
                    drawerDetail.breezemoonAuthorNickname ||
                    drawerDetail.breezemoonAuthorName ||
                    drawerDetail.breezemoonAuthorId
                  }}
                </span>
              </dd>
            </div>
            <div>
              <dt>发布城市</dt>
              <dd>{{ drawerDetail.breezemoonCity || '未记录' }}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd class="admin-mono">{{ formatDateTime(drawerDetail.breezemoonCreated) }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd class="admin-mono">{{ formatDateTime(drawerDetail.breezemoonUpdated) }}</dd>
            </div>
            <div class="bm-meta-span">
              <dt>来源 IP / UA</dt>
              <dd class="admin-mono">
                {{ drawerDetail.breezemoonIP || '-' }}
                <div class="bm-sub">{{ drawerDetail.breezemoonUA || '未记录 UA' }}</div>
              </dd>
            </div>
          </dl>
        </section>

        <section class="bm-section">
          <div class="bm-section__head">
            <h3 class="bm-section__title">正文与状态调控</h3>
            <span class="bm-sub">{{ canEditBreezemoon ? '仅提交实际修改的字段' : '当前账号仅只读' }}</span>
          </div>

          <form id="breezemoon-edit-form" class="bm-form" @submit.prevent="submitEditForm">
            <div class="bm-field">
              <label for="bm-content">清风明月正文（纯文本）</label>
              <textarea
                id="bm-content"
                v-model="editForm.breezemoonContent"
                class="admin-textarea bm-textarea"
                rows="5"
                :disabled="!canEditBreezemoon || mutating"
              />
            </div>

            <div class="bm-field">
              <label for="bm-status">内容状态</label>
              <select
                id="bm-status"
                v-model.number="editForm.breezemoonStatus"
                class="admin-select"
                :disabled="!canEditBreezemoon || mutating"
              >
                <option :value="0">正常 (0)</option>
                <option :value="1">已封禁 (1)</option>
              </select>
            </div>
          </form>
        </section>

        <section class="bm-section">
          <div class="bm-section__head">
            <h3 class="bm-section__title">近期操作审计记录</h3>
            <RouterLink
              v-if="canViewAuditLogs"
              :to="`/system/audit-logs?dataId=${encodeURIComponent(drawerDetail.oId)}`"
              class="bm-link"
            >
              在全站审计中筛选此条记录
            </RouterLink>
          </div>
          <div v-if="drawerDetail.recentOperations.length" class="bm-ops-list">
            <div v-for="op in drawerDetail.recentOperations" :key="op.oId" class="bm-op-row">
              <div class="bm-op-row__top">
                <strong>{{ op.operationCodeLabel }} (#{{ op.operationCode }})</strong>
                <span class="bm-sub admin-mono">{{ formatDateTime(op.operationCreated) }}</span>
              </div>
              <div class="bm-sub">
                操作人：{{ op.operationUserNickname || op.operationUserName || op.operationUserId }} · IP:
                <span class="admin-mono">{{ op.operationIP || '-' }}</span>
              </div>
            </div>
          </div>
          <p v-else class="bm-sub">暂无针对该清风明月的近期管理操作记录。</p>
        </section>
      </div>

      <template #footer>
        <div class="bm-drawer-footer">
          <button
            v-if="drawerDetail && canRemoveBreezemoon"
            type="button"
            class="admin-btn admin-btn--danger"
            :disabled="mutating"
            @click="openRemoveConfirm(drawerDetail)"
          >
            永久移除
          </button>
          <div class="bm-drawer-footer__right">
            <button type="button" class="admin-btn" :disabled="mutating" @click="requestCloseDrawer">
              关闭
            </button>
            <button
              v-if="drawerDetail && canEditBreezemoon"
              type="submit"
              form="breezemoon-edit-form"
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
      :require-confirm-phrase="pendingRemove?.breezemoonId || ''"
      :pending="mutating"
      @cancel="pendingRemove = null"
      @confirm="pendingRemove && executeMutation(pendingRemove)"
    />
  </div>
</template>

<style scoped>
.bm-banner {
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

.bm-banner__body p {
  margin: 4px 0 0;
}

.bm-banner__actions {
  display: flex;
  gap: 8px;
}

.bm-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.bm-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.bm-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.bm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
}

.bm-author-input {
  width: 180px;
  max-width: 100%;
}

.bm-keyword-input {
  width: 260px;
  max-width: 100%;
}

.bm-content-cell {
  min-width: 240px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bm-preview {
  margin: 0;
  color: var(--fp-title);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bm-sub {
  font-size: 12px;
  color: var(--fp-muted);
}

.bm-author-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.bm-author-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--fp-text);
  white-space: nowrap;
}

.bm-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--fp-border);
}

.bm-inline-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--fp-link);
  cursor: pointer;
}

.bm-inline-btn:hover {
  text-decoration: underline;
}

.bm-time {
  white-space: nowrap;
  font-size: 12px;
}

.bm-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bm-drawer-state {
  padding: 24px 0;
  color: var(--fp-muted);
  font-size: 13px;
}

.bm-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bm-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--fp-border);
}

.bm-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.bm-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bm-section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fp-title);
}

.bm-link {
  color: var(--fp-link);
  font-weight: 500;
}

.bm-meta-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  font-size: 13px;
}

.bm-meta-grid dt {
  font-size: 12px;
  color: var(--fp-muted);
}

.bm-meta-grid dd {
  margin: 2px 0 0;
  color: var(--fp-text);
  word-break: break-word;
}

.bm-meta-span {
  grid-column: 1 / -1;
}

.bm-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.bm-field label {
  font-weight: 500;
  color: var(--fp-title);
}

.bm-textarea {
  min-height: 112px;
  resize: vertical;
}

.bm-ops-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bm-op-row {
  padding: 8px 10px;
  border-radius: var(--fp-radius-sm);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.bm-op-row__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--fp-title);
}

.bm-drawer-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bm-drawer-footer__right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 768px) {
  .bm-author-input,
  .bm-keyword-input {
    width: 100%;
  }

  .bm-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
