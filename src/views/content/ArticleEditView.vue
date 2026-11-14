<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import {
  cancelStickAdminArticle,
  createAdminArticle,
  fetchAdminArticleDetail,
  removeAdminArticle,
  stickAdminArticle,
  updateAdminArticle,
  type AdminArticleDetail,
  type ArticleCreatePayload,
  type ArticleUpdatePayload,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
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
 * 文章创建 / 详情与编辑视图：
 * 1. 支持新建模式（/content/articles/new）与详情编辑模式（/content/articles/:articleId）；
 * 2. 长文类型（articleType = 6）支持绑定作者已有专栏或新建专栏、设置章节号与封面链接；
 * 3. 保留思绪贴正文只读、封禁自动归档至“回收站”等既有业务规则说明；
 * 4. 离开未保存页面提供双重提醒（onBeforeRouteLeave + beforeunload），写操作接入 IdempotencyTracker。
 */
interface ArticleFormState {
  userName: string
  articleTitle: string
  articleContent: string
  articleRewardContent: string
  articleTags: string
  articleType: number
  articleStatus: number
  articlePerfect: number
  articleStatement: number
  articleShowInList: number
  articleCommentable: boolean
  articleRewardPoint: number
  articleQnAOfferPoint: number
  articlePushOrder: number
  articleViewCount: number
  articleGoodCnt: number
  articleBadCnt: number
  articleCollectCnt: number
  articleWatchCnt: number
  columnId: string
  columnTitle: string
  columnCoverURL: string
  chapterNo: string
}

type ArticleMutationKind = 'create' | 'update' | 'stick' | 'cancel-stick' | 'remove'

interface PendingArticleMutation {
  kind: ArticleMutationKind
  title: string
  description: string
  summaryItems: Array<{ label: string; value: string }>
  danger: boolean
  confirmText: string
  requireConfirmPhrase?: string
  createPayload?: ArticleCreatePayload
  updatePayload?: ArticleUpdatePayload
  idempotencyKey: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const isCreateMode = computed(() => route.name === 'content-article-create')
const articleId = computed(() => (typeof route.params.articleId === 'string' ? route.params.articleId : ''))

const detail = ref<AdminArticleDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')
const pendingConfirm = ref<PendingArticleMutation | null>(null)
const unknownRecovery = ref<PendingArticleMutation | null>(null)
const bypassLeaveGuard = ref(false)

const formTracker = new IdempotencyTracker('admin-article-form')
const actionTracker = new IdempotencyTracker('admin-article-op')

const initialSnapshot = ref<string>('')
const form = reactive<ArticleFormState>({
  userName: '',
  articleTitle: '',
  articleContent: '',
  articleRewardContent: '',
  articleTags: '',
  articleType: 0,
  articleStatus: 0,
  articlePerfect: 0,
  articleStatement: 0,
  articleShowInList: 1,
  articleCommentable: true,
  articleRewardPoint: 0,
  articleQnAOfferPoint: 0,
  articlePushOrder: 0,
  articleViewCount: 0,
  articleGoodCnt: 0,
  articleBadCnt: 0,
  articleCollectCnt: 0,
  articleWatchCnt: 0,
  columnId: '',
  columnTitle: '',
  columnCoverURL: '',
  chapterNo: '',
})

const canEditArticle = computed(() => Boolean(auth.capabilities?.actions.articleEdit))
const canCreateArticle = computed(() => Boolean(auth.capabilities?.actions.articleCreate))
const canStick = computed(() => Boolean(auth.capabilities?.actions.articleStick))
const canCancelStick = computed(() => Boolean(auth.capabilities?.actions.articleCancelStick))
const canRemove = computed(() => Boolean(auth.capabilities?.actions.articleRemove))
const isFormEditable = computed(() => (isCreateMode.value ? canCreateArticle.value : canEditArticle.value))
const isThoughtArticle = computed(() => !isCreateMode.value && form.articleType === 3)

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && !isCreateMode.value && !detail.value) return 'loading'
  if (loadError.value && !isCreateMode.value && !detail.value) return 'error'
  return 'ready'
})

function serializeForm(): string {
  return JSON.stringify({ ...form })
}

const isDirty = computed(() => initialSnapshot.value !== '' && serializeForm() !== initialSnapshot.value)

function resetCreateForm(): void {
  detail.value = null
  loadError.value = ''
  forbidden.value = !canCreateArticle.value
  unauthenticated.value = false
  form.userName = typeof route.query.userName === 'string' ? route.query.userName : ''
  form.articleTitle = ''
  form.articleContent = ''
  form.articleRewardContent = ''
  form.articleTags = ''
  form.articleType = 0
  form.articleStatus = 0
  form.articlePerfect = 0
  form.articleStatement = 0
  form.articleShowInList = 1
  form.articleCommentable = true
  form.articleRewardPoint = 0
  form.articleQnAOfferPoint = 0
  form.articlePushOrder = 0
  form.articleViewCount = 0
  form.articleGoodCnt = 0
  form.articleBadCnt = 0
  form.articleCollectCnt = 0
  form.articleWatchCnt = 0
  form.columnId = ''
  form.columnTitle = ''
  form.columnCoverURL = ''
  form.chapterNo = ''
  initialSnapshot.value = serializeForm()
}

function hydrateFromDetail(data: AdminArticleDetail): void {
  detail.value = data
  form.userName = data.articleAuthorName
  form.articleTitle = data.articleTitle
  form.articleContent = data.articleContent
  form.articleRewardContent = data.articleRewardContent
  form.articleTags = data.articleTags
  form.articleType = data.articleType
  form.articleStatus = data.articleStatus
  form.articlePerfect = data.articlePerfect
  form.articleStatement = data.articleStatement
  form.articleShowInList = data.articleShowInList
  form.articleCommentable = data.articleCommentable
  form.articleRewardPoint = data.articleRewardPoint
  form.articleQnAOfferPoint = data.articleQnAOfferPoint
  form.articlePushOrder = data.articlePushOrder
  form.articleViewCount = data.articleViewCount
  form.articleGoodCnt = data.articleGoodCnt
  form.articleBadCnt = data.articleBadCnt
  form.articleCollectCnt = data.articleCollectCnt
  form.articleWatchCnt = data.articleWatchCnt
  form.columnId = data.longArticleChapter?.columnId || ''
  form.columnTitle = ''
  form.columnCoverURL = data.longArticleChapter?.columnCoverURL || ''
  form.chapterNo = data.longArticleChapter?.chapterNo ? String(data.longArticleChapter.chapterNo) : ''
  initialSnapshot.value = serializeForm()
}

async function loadArticle(): Promise<void> {
  if (isCreateMode.value) {
    resetCreateForm()
    return
  }

  const caps = auth.capabilities
  if (!caps?.canAccessAdmin || !caps.permissions.menuAdminArticles) {
    forbidden.value = true
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const data = await fetchAdminArticleDetail(articleId.value)
    hydrateFromDetail(data)
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
      loadError.value = err instanceof Error ? err.message : '加载文章详情失败'
    }
  } finally {
    loading.value = false
  }
}

function handleColumnSelectChange(): void {
  if (!detail.value) return
  if (form.columnId === '__NEW__' || form.columnId === '') {
    form.columnCoverURL = ''
    return
  }
  const matched = detail.value.authorColumns.find((col) => col.oId === form.columnId)
  if (matched) {
    form.columnCoverURL = matched.columnCoverURL || ''
  }
}

function buildCreatePayload(): ArticleCreatePayload | null {
  if (!form.userName.trim()) {
    actionError.value = '请填写作者用户名。'
    return null
  }
  if (!form.articleTitle.trim()) {
    actionError.value = '文章标题不能为空。'
    return null
  }
  if (!form.articleContent.trim()) {
    actionError.value = '文章正文不能为空。'
    return null
  }
  const payload: ArticleCreatePayload = {
    userName: form.userName.trim(),
    articleTitle: form.articleTitle.trim(),
    articleContent: form.articleContent,
    articleRewardContent: form.articleRewardContent,
    articleTags: form.articleTags.trim(),
    articleType: Number(form.articleType),
    articleRewardPoint: Math.max(0, Number(form.articleRewardPoint) || 0),
    articleQnAOfferPoint: Math.max(0, Number(form.articleQnAOfferPoint) || 0),
    articleShowInList: Number(form.articleShowInList),
    articleStatement: Number(form.articleStatement),
    articleCommentable: Boolean(form.articleCommentable),
  }
  if (Number(form.articleType) === 6) {
    payload.columnId = form.columnId
    payload.columnTitle = form.columnTitle.trim()
    payload.columnCoverURL = form.columnCoverURL.trim()
    if (form.chapterNo.trim()) {
      payload.chapterNo = form.chapterNo.trim()
    }
  }
  return payload
}

function buildUpdatePayload(): ArticleUpdatePayload | null {
  const current = detail.value
  if (!current) return null
  const patch: ArticleUpdatePayload = {}

  if (form.articleTitle.trim() !== current.articleTitle) {
    if (!form.articleTitle.trim()) {
      actionError.value = '文章标题不能为空。'
      return null
    }
    patch.articleTitle = form.articleTitle.trim()
  }
  if (!isThoughtArticle.value && form.articleContent !== current.articleContent) {
    if (!form.articleContent.trim()) {
      actionError.value = '文章正文不能为空。'
      return null
    }
    patch.articleContent = form.articleContent
  }
  if (form.articleRewardContent !== current.articleRewardContent) {
    patch.articleRewardContent = form.articleRewardContent
  }
  if (form.articleTags.trim() !== current.articleTags) {
    patch.articleTags = form.articleTags.trim()
  }
  if (Number(form.articleType) !== current.articleType) {
    patch.articleType = Number(form.articleType)
  }
  if (Number(form.articleStatus) !== current.articleStatus) {
    patch.articleStatus = Number(form.articleStatus)
  }
  if (Number(form.articlePerfect) !== current.articlePerfect) {
    patch.articlePerfect = Number(form.articlePerfect)
  }
  if (Number(form.articleStatement) !== current.articleStatement) {
    patch.articleStatement = Number(form.articleStatement)
  }
  if (Number(form.articleShowInList) !== current.articleShowInList) {
    patch.articleShowInList = Number(form.articleShowInList)
  }
  if (Boolean(form.articleCommentable) !== current.articleCommentable) {
    patch.articleCommentable = Boolean(form.articleCommentable)
  }
  if (Number(form.articleRewardPoint) !== current.articleRewardPoint) {
    patch.articleRewardPoint = Math.max(0, Number(form.articleRewardPoint) || 0)
  }
  if (Number(form.articleQnAOfferPoint) !== current.articleQnAOfferPoint) {
    patch.articleQnAOfferPoint = Math.max(0, Number(form.articleQnAOfferPoint) || 0)
  }
  if (Number(form.articlePushOrder) !== current.articlePushOrder) {
    patch.articlePushOrder = Number(form.articlePushOrder) || 0
  }
  if (Number(form.articleViewCount) !== current.articleViewCount) {
    patch.articleViewCount = Math.max(0, Number(form.articleViewCount) || 0)
  }
  if (Number(form.articleGoodCnt) !== current.articleGoodCnt) {
    patch.articleGoodCnt = Math.max(0, Number(form.articleGoodCnt) || 0)
  }
  if (Number(form.articleBadCnt) !== current.articleBadCnt) {
    patch.articleBadCnt = Math.max(0, Number(form.articleBadCnt) || 0)
  }
  if (Number(form.articleCollectCnt) !== current.articleCollectCnt) {
    patch.articleCollectCnt = Math.max(0, Number(form.articleCollectCnt) || 0)
  }
  if (Number(form.articleWatchCnt) !== current.articleWatchCnt) {
    patch.articleWatchCnt = Math.max(0, Number(form.articleWatchCnt) || 0)
  }

  if (Number(form.articleType) === 6) {
    const prevColId = current.longArticleChapter?.columnId || ''
    const prevCover = current.longArticleChapter?.columnCoverURL || ''
    const prevChapter = current.longArticleChapter?.chapterNo ? String(current.longArticleChapter.chapterNo) : ''
    const columnTouched =
      form.columnId !== prevColId ||
      form.columnTitle.trim() !== '' ||
      form.columnCoverURL.trim() !== prevCover ||
      form.chapterNo.trim() !== prevChapter ||
      current.articleType !== 6
    if (columnTouched) {
      patch.columnId = form.columnId
      if (form.columnId === '__NEW__') {
        patch.columnTitle = form.columnTitle.trim()
      }
      patch.columnCoverURL = form.columnCoverURL.trim()
      patch.chapterNo = form.chapterNo.trim()
    }
  }

  if (Object.keys(patch).length === 0) {
    actionError.value = '尚未修改任何文章字段。'
    return null
  }
  return patch
}

async function submitForm(): Promise<void> {
  actionError.value = ''
  actionMessage.value = ''

  if (isCreateMode.value) {
    const createPayload = buildCreatePayload()
    if (!createPayload) return
    const key = formTracker.resolve({ mode: 'create', ...createPayload })
    await executeMutation({
      kind: 'create',
      title: `新建文章《${createPayload.articleTitle}》`,
      description: '发布新文章并记录管理操作日志',
      summaryItems: [],
      danger: false,
      confirmText: '发布文章',
      createPayload,
      idempotencyKey: key,
    })
    return
  }

  const updatePayload = buildUpdatePayload()
  if (!updatePayload) return
  const key = formTracker.resolve({ mode: 'update', articleId: articleId.value, ...updatePayload })
  await executeMutation({
    kind: 'update',
    title: `保存文章编辑（${articleId.value}）`,
    description: '更新文章属性与长文专栏配置',
    summaryItems: [],
    danger: false,
    confirmText: '保存更改',
    updatePayload,
    idempotencyKey: key,
  })
}

function openStickConfirm(stick: boolean): void {
  if (!detail.value) return
  actionError.value = ''
  actionMessage.value = ''
  const kind: ArticleMutationKind = stick ? 'stick' : 'cancel-stick'
  const key = actionTracker.resolve({ kind, articleId: detail.value.oId })
  pendingConfirm.value = {
    kind,
    title: stick ? '确认置顶该文章？' : '确认取消该文章置顶？',
    description: stick ? '置顶后将更新置顶时间戳。' : '取消置顶后将恢复默认列表排序。',
    summaryItems: [
      { label: '文章 ID', value: detail.value.oId },
      { label: '标题', value: detail.value.articleTitle },
    ],
    danger: false,
    confirmText: stick ? '确认置顶' : '取消置顶',
    idempotencyKey: key,
  }
}

function openRemoveConfirm(): void {
  if (!detail.value) return
  actionError.value = ''
  actionMessage.value = ''
  const key = actionTracker.resolve({ kind: 'remove', articleId: detail.value.oId })
  pendingConfirm.value = {
    kind: 'remove',
    title: '危险操作：永久移除文章',
    description: '将强制移除该文章及全部关联评论、标签、专栏章节与搜索索引，操作不可恢复。',
    summaryItems: [
      { label: '文章 ID', value: detail.value.oId },
      { label: '文章标题', value: detail.value.articleTitle },
      { label: '作者', value: `@${detail.value.articleAuthorName}` },
    ],
    danger: true,
    confirmText: '确认移除',
    requireConfirmPhrase: detail.value.oId,
    idempotencyKey: key,
  }
}

async function executeMutation(task: PendingArticleMutation): Promise<void> {
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (task.kind === 'create' && task.createPayload) {
      const res = await createAdminArticle(task.createPayload, task.idempotencyKey)
      formTracker.reset()
      unknownRecovery.value = null
      bypassLeaveGuard.value = true
      actionMessage.value = res.replayed ? '已恢复上次新建文章结果。' : '文章创建成功，已进入详情页。'
      await router.replace(`/content/articles/${encodeURIComponent(res.articleId)}`)
      hydrateFromDetail(res.detail)
      bypassLeaveGuard.value = false
      return
    }

    if (task.kind === 'update' && task.updatePayload) {
      const res = await updateAdminArticle(articleId.value, task.updatePayload, task.idempotencyKey)
      formTracker.reset()
      unknownRecovery.value = null
      hydrateFromDetail(res.detail)
      actionMessage.value = res.replayed ? '已恢复上次文章保存结果。' : '文章更新已提交并同步最新状态。'
      return
    }

    if (task.kind === 'stick') {
      const res = await stickAdminArticle(articleId.value, task.idempotencyKey)
      actionTracker.reset()
      pendingConfirm.value = null
      unknownRecovery.value = null
      hydrateFromDetail(res.detail)
      actionMessage.value = res.replayed ? '已恢复上次置顶结果。' : '文章已置顶。'
      return
    }

    if (task.kind === 'cancel-stick') {
      const res = await cancelStickAdminArticle(articleId.value, task.idempotencyKey)
      actionTracker.reset()
      pendingConfirm.value = null
      unknownRecovery.value = null
      hydrateFromDetail(res.detail)
      actionMessage.value = res.replayed ? '已恢复上次取消置顶结果。' : '已取消文章置顶。'
      return
    }

    if (task.kind === 'remove') {
      await removeAdminArticle(articleId.value, task.idempotencyKey)
      actionTracker.reset()
      pendingConfirm.value = null
      unknownRecovery.value = null
      bypassLeaveGuard.value = true
      await router.replace('/content/articles')
    }
  } catch (err) {
    pendingConfirm.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = task
      actionError.value =
        err instanceof Error ? `${err.message}（写入结果未明，请点击右侧“按原操作恢复确认”）` : '写入结果未明'
      return
    }
    if (err instanceof ApiError && err.status === 401) {
      unauthenticated.value = true
      return
    }
    if (task.kind === 'create' || task.kind === 'update') {
      formTracker.reset()
    } else {
      actionTracker.reset()
    }
    unknownRecovery.value = null
    actionError.value = err instanceof Error ? err.message : '操作提交失败'
  } finally {
    mutating.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (isDirty.value && !bypassLeaveGuard.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onBeforeRouteLeave(() => {
  if (isDirty.value && !bypassLeaveGuard.value) {
    return window.confirm('当前文章存在尚未保存的修改，确定放弃修改并离开吗？')
  }
  return true
})

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch([isCreateMode, articleId], () => {
  actionError.value = ''
  actionMessage.value = ''
  pendingConfirm.value = null
  unknownRecovery.value = null
  formTracker.reset()
  actionTracker.reset()
  void loadArticle()
})

watch(
  () => auth.sessionEpoch,
  () => {
    pendingConfirm.value = null
    unknownRecovery.value = null
    formTracker.reset()
    actionTracker.reset()
    if (auth.isLoggedIn && auth.canEnterConsole) {
      void loadArticle()
    }
  },
)

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  void loadArticle()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <div class="ae-breadcrumb">
          <RouterLink to="/content/articles">文章与专栏</RouterLink>
          <span>/</span>
          <span class="admin-mono">{{ isCreateMode ? '新建文章' : articleId }}</span>
        </div>
        <h1 class="admin-page__title">
          {{ isCreateMode ? '后台新建文章' : detail?.articleTitle || '文章详情与编辑' }}
        </h1>
        <p class="admin-page__subtitle">
          {{
            isCreateMode
              ? '指定站内作者用户名发布文章；支持同步绑定长文专栏章节。'
              : '支持修订正文、打赏区内容、状态/优选/列表展示、互动计数及长文专栏章节与封面。'
          }}
        </p>
      </div>

      <div class="admin-page__actions">
        <RouterLink to="/content/articles" class="admin-btn">返回列表</RouterLink>
        <template v-if="!isCreateMode && detail">
          <RouterLink
            v-if="auth.capabilities?.permissions.menuAdminComments"
            :to="{ path: '/content/comments', query: { articleId: detail.oId } }"
            class="admin-btn"
          >
            查看所属评论 ({{ formatCount(detail.articleCommentCount) }})
          </RouterLink>
          <RouterLink
            :to="{ path: '/system/audit-logs', query: { dataId: detail.oId } }"
            class="admin-btn"
          >
            审计日志
          </RouterLink>
          <button
            v-if="detail.articleStick > 0 && canCancelStick"
            type="button"
            class="admin-btn"
            :disabled="mutating"
            @click="openStickConfirm(false)"
          >
            取消置顶
          </button>
          <button
            v-else-if="detail.articleStick <= 0 && canStick"
            type="button"
            class="admin-btn"
            :disabled="mutating"
            @click="openStickConfirm(true)"
          >
            置顶文章
          </button>
          <button
            v-if="canRemove"
            type="button"
            class="admin-btn admin-btn--danger-outline"
            :disabled="mutating"
            @click="openRemoveConfirm"
          >
            强制移除
          </button>
        </template>
      </div>
    </header>

    <div v-if="unknownRecovery" class="ae-banner ae-banner--warning" role="alert">
      <div class="ae-banner__body">
        <strong>待核对写入结果：{{ unknownRecovery.title }}</strong>
        <p>
          {{ actionError }}
          <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="ae-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="executeMutation(unknownRecovery)"
        >
          按原操作恢复确认
        </button>
        <button type="button" class="admin-btn admin-btn--sm" @click="unknownRecovery = null">忽略</button>
      </div>
    </div>

    <div v-if="actionMessage" class="ae-banner ae-banner--success" role="status">
      {{ actionMessage }}
    </div>
    <div v-if="actionError && !unknownRecovery" class="ae-banner ae-banner--danger" role="alert">
      {{ actionError }}
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadArticle"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <form class="ae-layout" @submit.prevent="submitForm">
        <!-- 主编辑栏 -->
        <section class="admin-panel ae-main-col">
          <div class="ae-section-head">
            <h2 class="ae-card-title">{{ isCreateMode ? '文章内容与作者' : '正文与打赏区域' }}</h2>
            <div v-if="!isCreateMode && detail" class="ae-status-badges">
              <StatusBadge
                :tone="getArticleStatusMeta(detail.articleStatus).tone"
                :label="getArticleStatusMeta(detail.articleStatus).label"
              />
              <StatusBadge :tone="getArticleTypeMeta(detail.articleType).tone" :label="detail.articleTypeLabel" />
              <StatusBadge v-if="detail.articleStick > 0" tone="info" label="置顶中" />
              <StatusBadge v-if="isDirty" tone="warning" label="有未保存修改" />
            </div>
          </div>

          <div v-if="isCreateMode" class="ae-field">
            <label for="ae-author">作者用户名（userName，必填）</label>
            <input
              id="ae-author"
              v-model="form.userName"
              type="text"
              class="admin-input"
              maxlength="64"
              :disabled="!isFormEditable || mutating"
              placeholder="输入已有用户的 userName，例如 alice"
            />
          </div>

          <div class="ae-field">
            <label for="ae-title">文章标题（最长 255 字符）</label>
            <input
              id="ae-title"
              v-model="form.articleTitle"
              type="text"
              class="admin-input"
              maxlength="255"
              :disabled="!isFormEditable || mutating"
            />
          </div>

          <div class="ae-field">
            <label for="ae-tags">文章标签（逗号分隔，最长 255 字符）</label>
            <input
              id="ae-tags"
              v-model="form.articleTags"
              type="text"
              class="admin-input"
              maxlength="255"
              :disabled="!isFormEditable || mutating"
              placeholder="例如：公告,社区反馈"
            />
            <p v-if="!isCreateMode && Number(form.articleStatus) === 1" class="ae-hint ae-hint--warning">
              注意：当文章状态保存为“已封禁 (1)”时，后端会自动将标签归档为“回收站”。
            </p>
          </div>

          <div class="ae-field">
            <label for="ae-content">文章正文（Markdown）</label>
            <textarea
              id="ae-content"
              v-model="form.articleContent"
              class="admin-textarea ae-textarea-lg admin-mono"
              rows="14"
              :disabled="!isFormEditable || mutating || isThoughtArticle"
            />
            <p v-if="isThoughtArticle" class="ae-hint ae-hint--warning">
              提示：思绪贴（类型 3）在后台编辑时会按既有规则保留原正文不变。
            </p>
          </div>

          <div class="ae-field">
            <label for="ae-reward-content">打赏可见扩展正文（可选）</label>
            <textarea
              id="ae-reward-content"
              v-model="form.articleRewardContent"
              class="admin-textarea admin-mono"
              rows="4"
              :disabled="!isFormEditable || mutating"
            />
          </div>
        </section>

        <!-- 属性与长文专栏配置栏 -->
        <aside class="ae-side-col">
          <section class="admin-panel ae-side-card">
            <h2 class="ae-card-title">状态、分类与可见性</h2>

            <div class="ae-grid-2">
              <div class="ae-field">
                <label for="ae-type">文章类型</label>
                <select id="ae-type" v-model.number="form.articleType" class="admin-select" :disabled="!isFormEditable || mutating">
                  <option :value="0">普通帖 (0)</option>
                  <option :value="6">长文专栏 (6)</option>
                  <option :value="5">问答 (5)</option>
                  <option :value="1">站内讨论 (1)</option>
                  <option :value="2">同城广播 (2)</option>
                  <option :value="3">思绪 (3)</option>
                </select>
              </div>

              <div v-if="!isCreateMode" class="ae-field">
                <label for="ae-status">文章状态</label>
                <select id="ae-status" v-model.number="form.articleStatus" class="admin-select" :disabled="!isFormEditable || mutating">
                  <option :value="0">正常 (0)</option>
                  <option :value="1">已封禁 (1)</option>
                  <option :value="2">已锁定 (2)</option>
                </select>
              </div>
            </div>

            <div class="ae-grid-2">
              <div v-if="!isCreateMode" class="ae-field">
                <label for="ae-perfect">优选状态</label>
                <select id="ae-perfect" v-model.number="form.articlePerfect" class="admin-select" :disabled="!isFormEditable || mutating">
                  <option :value="0">普通文章 (0)</option>
                  <option :value="1">优选文章 (1)</option>
                </select>
              </div>

              <div class="ae-field">
                <label for="ae-show-in-list">首页列表展示</label>
                <select id="ae-show-in-list" v-model.number="form.articleShowInList" class="admin-select" :disabled="!isFormEditable || mutating">
                  <option :value="1">展示 (1)</option>
                  <option :value="0">隐藏 (0)</option>
                </select>
              </div>
            </div>

            <div class="ae-grid-2">
              <div class="ae-field">
                <label for="ae-statement">版权声明</label>
                <select id="ae-statement" v-model.number="form.articleStatement" class="admin-select" :disabled="!isFormEditable || mutating">
                  <option :value="0">不显示 (0)</option>
                  <option :value="1">显示声明 (1)</option>
                </select>
              </div>

              <div class="ae-field ae-checkbox-wrap">
                <label class="ae-checkbox">
                  <input v-model="form.articleCommentable" type="checkbox" :disabled="!isFormEditable || mutating" />
                  <span>允许评论回复</span>
                </label>
              </div>
            </div>

            <div class="ae-grid-2">
              <div class="ae-field">
                <label for="ae-reward-point">打赏积分</label>
                <input
                  id="ae-reward-point"
                  v-model.number="form.articleRewardPoint"
                  type="number"
                  min="0"
                  class="admin-input admin-mono"
                  :disabled="!isFormEditable || mutating"
                />
              </div>
              <div class="ae-field">
                <label for="ae-qna-point">问答悬赏积分</label>
                <input
                  id="ae-qna-point"
                  v-model.number="form.articleQnAOfferPoint"
                  type="number"
                  min="0"
                  class="admin-input admin-mono"
                  :disabled="!isFormEditable || mutating"
                />
              </div>
            </div>

            <div v-if="!isCreateMode" class="ae-grid-3">
              <div class="ae-field">
                <label for="ae-view">浏览量</label>
                <input id="ae-view" v-model.number="form.articleViewCount" type="number" min="0" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
              <div class="ae-field">
                <label for="ae-good">点赞数</label>
                <input id="ae-good" v-model.number="form.articleGoodCnt" type="number" min="0" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
              <div class="ae-field">
                <label for="ae-bad">点踩数</label>
                <input id="ae-bad" v-model.number="form.articleBadCnt" type="number" min="0" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
              <div class="ae-field">
                <label for="ae-collect">收藏数</label>
                <input id="ae-collect" v-model.number="form.articleCollectCnt" type="number" min="0" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
              <div class="ae-field">
                <label for="ae-watch">关注数</label>
                <input id="ae-watch" v-model.number="form.articleWatchCnt" type="number" min="0" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
              <div class="ae-field">
                <label for="ae-push">邮件推送序</label>
                <input id="ae-push" v-model.number="form.articlePushOrder" type="number" class="admin-input admin-mono" :disabled="!isFormEditable || mutating" />
              </div>
            </div>
          </section>

          <!-- 长文专栏联动面板 -->
          <section v-if="Number(form.articleType) === 6" class="admin-panel ae-side-card">
            <h2 class="ae-card-title">长文专栏与章节关联</h2>
            <div class="ae-field">
              <label for="ae-col-select">归属专栏（作者已有专栏列表）</label>
              <select
                id="ae-col-select"
                v-model="form.columnId"
                class="admin-select"
                :disabled="!isFormEditable || mutating"
                @change="handleColumnSelectChange"
              >
                <option value="">不关联专栏</option>
                <option v-for="col in detail?.authorColumns || []" :key="col.oId" :value="col.oId">
                  {{ col.columnTitle }}（{{ col.columnArticleCount }} 篇）
                </option>
                <option value="__NEW__">+ 新建专栏</option>
              </select>
            </div>

            <div v-if="form.columnId === '__NEW__'" class="ae-field">
              <label for="ae-col-title">新建专栏标题</label>
              <input
                id="ae-col-title"
                v-model="form.columnTitle"
                type="text"
                maxlength="64"
                class="admin-input"
                :disabled="!isFormEditable || mutating"
              />
            </div>

            <div v-if="form.columnId !== ''" class="ae-grid-2">
              <div class="ae-field">
                <label for="ae-chapter-no">章节序号（留空自动分配）</label>
                <input
                  id="ae-chapter-no"
                  v-model="form.chapterNo"
                  type="text"
                  class="admin-input admin-mono"
                  placeholder="正整数，如 1"
                  :disabled="!isFormEditable || mutating"
                />
              </div>
              <div class="ae-field">
                <label for="ae-col-cover">专栏封面 URL（http/https）</label>
                <input
                  id="ae-col-cover"
                  v-model="form.columnCoverURL"
                  type="url"
                  maxlength="1024"
                  class="admin-input"
                  :disabled="!isFormEditable || mutating"
                />
              </div>
            </div>
          </section>

          <!-- 作者与元信息摘要 -->
          <section v-if="!isCreateMode && detail" class="admin-panel ae-side-card">
            <h2 class="ae-card-title">作者与发帖环境</h2>
            <dl class="ae-dl">
              <div class="ae-dl__row">
                <dt>作者账号</dt>
                <dd>
                  <RouterLink :to="`/users/${encodeURIComponent(detail.articleAuthorId)}`">
                    {{ detail.articleAuthorNickname || detail.articleAuthorName }} (@{{ detail.articleAuthorName }})
                  </RouterLink>
                </dd>
              </div>
              <div class="ae-dl__row">
                <dt>创建时间</dt>
                <dd class="admin-mono">{{ formatDateTime(detail.articleCreateTime) }}</dd>
              </div>
              <div class="ae-dl__row">
                <dt>更新时间</dt>
                <dd class="admin-mono">{{ formatDateTime(detail.articleUpdateTime) }}</dd>
              </div>
              <div class="ae-dl__row">
                <dt>发帖 IP</dt>
                <dd class="admin-mono">{{ detail.articleIP || '-' }}</dd>
              </div>
              <div class="ae-dl__row">
                <dt>客户端 UA</dt>
                <dd class="admin-mono ae-ua">{{ detail.articleUA || '-' }}</dd>
              </div>
            </dl>
          </section>

          <div class="ae-submit-bar">
            <button
              type="submit"
              class="admin-btn admin-btn--primary ae-submit-btn"
              :disabled="!isFormEditable || mutating || (!isCreateMode && !isDirty)"
            >
              {{
                mutating
                  ? '提交中...'
                  : isCreateMode
                    ? '立即发布文章'
                    : isDirty
                      ? '保存文章修改'
                      : '暂无未保存改动'
              }}
            </button>
          </div>
        </aside>
      </form>

      <!-- 最近操作审计记录 -->
      <section v-if="!isCreateMode && detail" class="admin-panel" aria-label="针对该文章的最近操作审计">
        <div class="ae-section-head">
          <h2 class="ae-card-title">针对该文章的近期管理审计（最多 15 条）</h2>
          <RouterLink
            :to="{ path: '/system/audit-logs', query: { dataId: detail.oId } }"
            class="admin-btn admin-btn--sm"
          >
            在全站审计中筛选
          </RouterLink>
        </div>
        <div v-if="detail.recentOperations.length" class="admin-table-wrap">
          <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>操作行为</th>
                <th>编码</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="op in detail.recentOperations" :key="op.oId">
                <td class="admin-mono">{{ formatDateTime(op.operationCreated) }}</td>
                <td>{{ op.operationUserName || op.operationUserId }}</td>
                <td>{{ op.operationCodeLabel }}</td>
                <td class="admin-mono">#{{ op.operationCode }}</td>
                <td class="admin-mono">{{ op.operationIP || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="ae-hint">暂无针对该文章的后台管理记录。</p>
      </section>
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
      @confirm="pendingConfirm && executeMutation(pendingConfirm)"
    />
  </div>
</template>

<style scoped>
.ae-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fp-muted);
  margin-bottom: 4px;
}

.ae-banner {
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

.ae-banner__body p {
  margin: 4px 0 0;
}

.ae-banner__actions {
  display: flex;
  gap: 8px;
}

.ae-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.ae-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
}

.ae-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.ae-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: start;
}

.ae-main-col,
.ae-side-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ae-side-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ae-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.ae-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--fp-title);
}

.ae-status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ae-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ae-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--fp-head);
}

.ae-textarea-lg {
  min-height: 280px;
}

.ae-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ae-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ae-checkbox-wrap {
  justify-content: flex-end;
}

.ae-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: var(--fp-control-height);
  cursor: pointer;
}

.ae-hint {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.ae-hint--warning {
  color: var(--fp-warning);
}

.ae-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ae-dl__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  border-bottom: 1px dashed var(--fp-border);
  padding-bottom: 6px;
}

.ae-dl__row dt {
  color: var(--fp-muted);
  white-space: nowrap;
}

.ae-dl__row dd {
  margin: 0;
  text-align: right;
  word-break: break-word;
}

.ae-ua {
  font-size: 12px;
}

.ae-submit-bar {
  display: flex;
}

.ae-submit-btn {
  width: 100%;
}

@media (max-width: 1080px) {
  .ae-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ae-grid-2,
  .ae-grid-3 {
    grid-template-columns: 1fr;
  }
}
</style>
