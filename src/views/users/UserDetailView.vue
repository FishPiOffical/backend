<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import {
  deactivateAdminUser,
  fetchAdminUserDetail,
  removeAdminUserMfa,
  updateAdminUser,
  type AdminUserDetail,
  type AdminUserProfile,
  type UserUpdatePayload,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminDrawer from '@/components/common/AdminDrawer.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatCount, formatDateTime, getUserStatusMeta } from '@/utils/format'

/**
 * 用户详情与安全处置视图：
 * 1. 全程不展示、不请求登录密码与 MFA 私钥，仅展示脱敏后资料与状态；
 * 2. 资料与角色编辑通过右侧 AdminDrawer 提交，严格按字段权限过滤变更集；
 * 3. 当用户处于永久停用状态（status=4）时锁定常规资料编辑；
 * 4. 移除 MFA 与永久停用（需输入用户名二次确认、禁止停用本人）严格隔离；
 * 5. 全部写操作绑定 IdempotencyTracker 并在未知结果时支持原幂等键恢复确认。
 */
type DetailTab = 'overview' | 'assets' | 'operations'
type UserMutationKind = 'update' | 'remove-mfa' | 'deactivate'

interface EditFormState {
  userNickname: string
  userURL: string
  userIntro: string
  userTags: string
  userEmail: string
  userStatus: number
  userCommentStatus: number
  userPointStatus: number
  userRole: string
}

interface PendingUserMutation {
  kind: UserMutationKind
  userId: string
  userName: string
  payload?: UserUpdatePayload
  title: string
  description: string
  summaryItems: Array<{ label: string; value: string }>
  danger: boolean
  confirmText: string
  requireConfirmPhrase: string
  idempotencyKey: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const userId = computed(() => String(route.params.userId || '').trim())
const activeTab = ref<DetailTab>('overview')

const detail = ref<AdminUserDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const drawerOpen = ref(false)
const confirmDiscardClose = ref(false)
const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')

const pendingConfirm = ref<PendingUserMutation | null>(null)
const unknownRecovery = ref<PendingUserMutation | null>(null)

const userUpdateTracker = new IdempotencyTracker('admin-user-update')
const userActionTracker = new IdempotencyTracker('admin-user-security')

const editSnapshot = ref<EditFormState | null>(null)
const editForm = reactive<EditFormState>({
  userNickname: '',
  userURL: '',
  userIntro: '',
  userTags: '',
  userEmail: '',
  userStatus: 0,
  userCommentStatus: 0,
  userPointStatus: 0,
  userRole: '',
})

const editableStatusOptions = [
  { value: 0, label: '正常 (0)' },
  { value: 1, label: '封禁 (1)' },
  { value: 2, label: '未验证 (2)' },
  { value: 3, label: '登录失效 (3)' },
]

const userProfile = computed<AdminUserProfile | null>(() => detail.value?.user ?? null)
const isPermanentlyDeactivated = computed(() => userProfile.value?.userStatus === 4)

const canEditBasic = computed(() => Boolean(auth.capabilities?.actions.userEditBasic))
const canEditAdvanced = computed(() => Boolean(auth.capabilities?.actions.userEditAdvanced))
const canEditRole = computed(() => Boolean(auth.capabilities?.actions.userEditRole))
const canEditAny = computed(
  () => !isPermanentlyDeactivated.value && (canEditBasic.value || canEditAdvanced.value || canEditRole.value),
)

const changedPayload = computed<UserUpdatePayload>(() => {
  const snap = editSnapshot.value
  if (!snap) {
    return {}
  }
  const diff: UserUpdatePayload = {}
  if (canEditBasic.value) {
    if (editForm.userNickname !== snap.userNickname) diff.userNickname = editForm.userNickname
    if (editForm.userURL !== snap.userURL) diff.userURL = editForm.userURL
    if (editForm.userIntro !== snap.userIntro) diff.userIntro = editForm.userIntro
    if (editForm.userTags !== snap.userTags) diff.userTags = editForm.userTags
  }
  if (canEditAdvanced.value) {
    if (editForm.userEmail !== snap.userEmail) diff.userEmail = editForm.userEmail
    if (editForm.userStatus !== snap.userStatus) diff.userStatus = editForm.userStatus
    if (editForm.userCommentStatus !== snap.userCommentStatus) diff.userCommentStatus = editForm.userCommentStatus
    if (editForm.userPointStatus !== snap.userPointStatus) diff.userPointStatus = editForm.userPointStatus
  }
  if (canEditRole.value && editForm.userRole !== snap.userRole) {
    diff.userRole = editForm.userRole
  }
  return diff
})

const isDrawerDirty = computed(() => drawerOpen.value && Object.keys(changedPayload.value).length > 0)

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && !detail.value) return 'loading'
  if (loadError.value && !detail.value) return 'error'
  return detail.value ? 'ready' : 'loading'
})

function hasMenuPermission(): boolean {
  const caps = auth.capabilities
  return Boolean(caps?.canAccessAdmin && caps.permissions.menuAdminUsers)
}

function syncFormFromUser(user: AdminUserProfile): void {
  const snap: EditFormState = {
    userNickname: user.userNickname || '',
    userURL: user.userURL || '',
    userIntro: user.userIntro || '',
    userTags: user.userTags || '',
    userEmail: user.userEmail || '',
    userStatus: user.userStatus,
    userCommentStatus: user.userCommentStatus,
    userPointStatus: user.userPointStatus,
    userRole: user.userRole || '',
  }
  editSnapshot.value = snap
  Object.assign(editForm, snap)
}

async function loadUserDetail(): Promise<void> {
  if (!userId.value) {
    loadError.value = '缺少有效用户 ID'
    return
  }
  if (!hasMenuPermission()) {
    forbidden.value = true
    detail.value = null
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminUserDetail(userId.value)
    detail.value = res
    if (!drawerOpen.value) {
      syncFormFromUser(res.user)
    }
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
      loadError.value = err instanceof Error ? err.message : '加载用户详情失败'
    }
  } finally {
    loading.value = false
  }
}

function openEditDrawer(): void {
  const u = userProfile.value
  if (!u || !canEditAny.value) {
    return
  }
  syncFormFromUser(u)
  confirmDiscardClose.value = false
  drawerOpen.value = true
}

function requestCloseDrawer(): void {
  if (mutating.value) {
    return
  }
  if (isDrawerDirty.value && !confirmDiscardClose.value) {
    confirmDiscardClose.value = true
    return
  }
  confirmDiscardClose.value = false
  drawerOpen.value = false
  if (userProfile.value) {
    syncFormFromUser(userProfile.value)
  }
}

async function submitEditForm(): Promise<void> {
  const u = userProfile.value
  const diff = changedPayload.value
  if (!u || mutating.value || Object.keys(diff).length === 0) {
    return
  }
  if (unknownRecovery.value) {
    actionError.value = '当前存在结果未知的待核对写入，请先在上方恢复确认或刷新核对后再提交新修改。'
    return
  }

  const key = userUpdateTracker.resolve({ userId: u.oId, diff })
  const op: PendingUserMutation = {
    kind: 'update',
    userId: u.oId,
    userName: u.userName,
    payload: diff,
    title: '确认保存用户信息变更',
    description: '变更仅提交修改过的已授权字段，并计入后台管理操作审计日志。',
    summaryItems: [
      { label: '目标用户', value: `${u.userNickname || u.userName} (@${u.userName})` },
      { label: '变更字段', value: Object.keys(diff).join(', ') },
    ],
    danger: false,
    confirmText: '保存修改',
    requireConfirmPhrase: '',
    idempotencyKey: key,
  }

  await runUserMutation(op)
}

function openRemoveMfaConfirm(): void {
  const u = userProfile.value
  if (!u || !u.hasMfa || !auth.capabilities?.actions.userRemoveMfa) {
    return
  }
  if (unknownRecovery.value) {
    actionError.value = '当前存在待核对写入，请先完成核对。'
    return
  }
  const key = userActionTracker.resolve({ kind: 'remove-mfa', userId: u.oId })
  pendingConfirm.value = {
    kind: 'remove-mfa',
    userId: u.oId,
    userName: u.userName,
    title: '确认移除用户两步验证（MFA）',
    description: '移除后该用户下次登录将不再验证两步动态口令，不会返回或泄露任何历史 MFA 私钥。',
    summaryItems: [
      { label: '执行动作', value: '移除两步验证（MFA）' },
      { label: '目标账号', value: `@${u.userName} (${u.oId})` },
    ],
    danger: true,
    confirmText: '确认移除 MFA',
    requireConfirmPhrase: '',
    idempotencyKey: key,
  }
}

function openDeactivateConfirm(): void {
  const u = userProfile.value
  if (!u || u.isSelf || u.userStatus === 4 || !auth.capabilities?.actions.userDeactivate) {
    return
  }
  if (unknownRecovery.value) {
    actionError.value = '当前存在待核对写入，请先完成核对。'
    return
  }
  const key = userActionTracker.resolve({ kind: 'deactivate', userId: u.oId })
  pendingConfirm.value = {
    kind: 'deactivate',
    userId: u.oId,
    userName: u.userName,
    title: '高危操作：永久停用账号',
    description:
      '账号状态将不可逆转地变更为“永久停用（状态 4）”，同时立即失效全部现有登录会话并禁止后续常规编辑恢复。',
    summaryItems: [
      { label: '目标用户', value: `${u.userNickname || u.userName} (@${u.userName})` },
      { label: '用户 ID', value: u.oId },
      { label: '当前状态', value: getUserStatusMeta(u.userStatus).label },
    ],
    danger: true,
    confirmText: '确认永久停用',
    requireConfirmPhrase: u.userName,
    idempotencyKey: key,
  }
}

async function runUserMutation(op: PendingUserMutation): Promise<void> {
  if (mutating.value) {
    return
  }
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (op.kind === 'update' && op.payload) {
      const res = await updateAdminUser(op.userId, op.payload, op.idempotencyKey)
      detail.value = res.detail
      syncFormFromUser(res.detail.user)
      drawerOpen.value = false
      confirmDiscardClose.value = false
      userUpdateTracker.reset()
      actionMessage.value = `已保存用户 @${op.userName} 的修改（字段：${res.updatedFields.join(', ') || '已同步'}）。`
    } else if (op.kind === 'remove-mfa') {
      const res = await removeAdminUserMfa(op.userId, op.idempotencyKey)
      detail.value = res.detail
      userActionTracker.reset()
      actionMessage.value = `已成功移除用户 @${op.userName} 的两步验证（MFA）。`
    } else if (op.kind === 'deactivate') {
      const res = await deactivateAdminUser(op.userId, op.idempotencyKey)
      detail.value = res.detail
      userActionTracker.reset()
      actionMessage.value = `已永久停用用户 @${res.userName}，该账号不可再通过常规资料编辑恢复。`
    }

    pendingConfirm.value = null
    unknownRecovery.value = null
  } catch (err) {
    pendingConfirm.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = op
      actionError.value =
        err instanceof Error
          ? `${err.message}。已保留原始幂等键与提交参数，请先刷新核对用户状态或按原幂等键恢复确认。`
          : '写入状态未知，已保留原始幂等键等待恢复确认。'
    } else {
      unknownRecovery.value = null
      userUpdateTracker.reset()
      userActionTracker.reset()
      if (err instanceof ApiError) {
        actionError.value = `${err.message}（HTTP ${err.status}）`
        if (err.status === 409) {
          await loadUserDetail()
        }
      } else {
        actionError.value = err instanceof Error ? err.message : '操作执行失败'
      }
    }
  } finally {
    mutating.value = false
  }
}

function dismissUnknownRecovery(): void {
  unknownRecovery.value = null
  userUpdateTracker.reset()
  userActionTracker.reset()
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function goHome(): void {
  void router.push('/users')
}

onBeforeRouteLeave(() => {
  if (isDrawerDirty.value || unknownRecovery.value) {
    return window.confirm('当前存在未保存的编辑草稿或待核对的写入操作，确认离开此页面吗？')
  }
  return true
})

watch(
  () => auth.sessionEpoch,
  () => {
    drawerOpen.value = false
    confirmDiscardClose.value = false
    pendingConfirm.value = null
    unknownRecovery.value = null
    userUpdateTracker.reset()
    userActionTracker.reset()
    detail.value = null
    actionMessage.value = ''
    actionError.value = ''
    if (auth.isLoggedIn && hasMenuPermission()) {
      void loadUserDetail()
    }
  },
)

watch(userId, () => {
  drawerOpen.value = false
  confirmDiscardClose.value = false
  pendingConfirm.value = null
  unknownRecovery.value = null
  detail.value = null
  void loadUserDetail()
})

onMounted(() => {
  void loadUserDetail()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <div class="ud-breadcrumb">
          <RouterLink to="/users">用户管理</RouterLink>
          <span>/</span>
          <span class="admin-mono">{{ userId }}</span>
        </div>
        <h1 class="admin-page__title">
          {{ userProfile ? `${userProfile.userNickname || userProfile.userName} (@${userProfile.userName})` : '用户详情' }}
        </h1>
        <p class="admin-page__subtitle">
          敏感凭证与 MFA 私钥已严格脱敏隔离；常规编辑、移除 MFA 与永久停用按权限分别管控。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadUserDetail">
          {{ loading ? '加载中...' : '刷新详情' }}
        </button>
        <button
          v-if="userProfile"
          type="button"
          class="admin-btn admin-btn--primary"
          :disabled="!canEditAny || mutating"
          @click="openEditDrawer"
        >
          {{ isPermanentlyDeactivated ? '已停用不可编辑' : canEditAny ? '编辑资料与角色' : '无编辑权限' }}
        </button>
      </div>
    </header>

    <!-- 未知结果幂等键恢复提示 -->
    <div v-if="unknownRecovery" class="ud-banner ud-banner--warning" role="alert">
      <div class="ud-banner__content">
        <strong>待核对写入结果：{{ unknownRecovery.title }}</strong>
        <p>
          {{ actionError }}
          <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="ud-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="runUserMutation(unknownRecovery)"
        >
          {{ mutating ? '核对中...' : '按原幂等键重试确认' }}
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="loading" @click="loadUserDetail">
          重新加载用户详情
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="mutating" @click="dismissUnknownRecovery">
          已知晓并清除提示
        </button>
      </div>
    </div>

    <div v-else-if="actionError" class="ud-banner ud-banner--danger" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionError = ''">关闭</button>
    </div>

    <div v-if="actionMessage" class="ud-banner ud-banner--success" role="status">
      <span>{{ actionMessage }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionMessage = ''">关闭</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadUserDetail"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <template v-if="detail && userProfile">
        <!-- 永久停用锁与身份提醒 -->
        <div v-if="isPermanentlyDeactivated" class="ud-banner ud-banner--danger" role="note">
          该用户已永久停用（状态 4）：不可再执行常规资料/状态恢复，且现有登录态已清空。
        </div>

        <section class="admin-panel ud-summary">
          <div class="ud-summary__identity">
            <div>
              <div class="ud-summary__badges">
                <StatusBadge
                  :tone="getUserStatusMeta(userProfile.userStatus).tone"
                  :label="getUserStatusMeta(userProfile.userStatus).label"
                />
                <StatusBadge tone="info" :label="userProfile.roleName || userProfile.userRole" />
                <StatusBadge :tone="userProfile.hasMfa ? 'success' : 'neutral'" :label="userProfile.hasMfa ? 'MFA 已启用' : '未启用 MFA'" />
                <StatusBadge v-if="userProfile.isSelf" tone="warning" label="当前登录操作者本人" />
              </div>
              <p class="ud-summary__ids admin-mono">
                oId: {{ userProfile.oId }} · 会员序号: #{{ userProfile.userNo || '-' }} · 注册时间: {{ formatDateTime(userProfile.createdAt) }}
              </p>
              <!-- 联动跳转至二期内容管理与全站操作审计 -->
              <div class="ud-quick-links">
                <RouterLink
                  v-if="auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminArticles"
                  :to="`/content/articles?keyword=${encodeURIComponent(userProfile.userName)}`"
                  class="admin-btn admin-btn--sm"
                >
                  TA 的文章
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminComments"
                  :to="`/content/comments?keyword=${encodeURIComponent(userProfile.userName)}`"
                  class="admin-btn admin-btn--sm"
                >
                  TA 的评论
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminBreezemoons"
                  :to="`/content/breezemoons?authorId=${encodeURIComponent(userProfile.oId)}`"
                  class="admin-btn admin-btn--sm"
                >
                  TA 的清风明月
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.canAccessAdmin"
                  :to="`/system/audit-logs?dataId=${encodeURIComponent(userProfile.oId)}`"
                  class="admin-btn admin-btn--sm"
                >
                  针对该用户的审计
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.canAccessAdmin"
                  :to="`/system/audit-logs?operator=${encodeURIComponent(userProfile.oId)}`"
                  class="admin-btn admin-btn--sm"
                >
                  该用户执行的操作
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.actions.vipManage"
                  :to="`/assets/vip?target=${encodeURIComponent(userProfile.userName)}`"
                  class="admin-btn admin-btn--sm"
                >
                  VIP 管理
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.actions.medalManage"
                  :to="`/assets/medals?target=${encodeURIComponent(userProfile.userName)}`"
                  class="admin-btn admin-btn--sm"
                >
                  勋章授予
                </RouterLink>
                <RouterLink
                  v-if="auth.capabilities?.actions.pointAdd || auth.capabilities?.actions.pointDeduct || auth.capabilities?.actions.bagAdjust"
                  :to="`/assets/points-bags?target=${encodeURIComponent(userProfile.userName)}`"
                  class="admin-btn admin-btn--sm"
                >
                  积分与背包
                </RouterLink>
              </div>
            </div>
          </div>

          <div class="admin-tabs" role="tablist" aria-label="用户详情分栏">
            <button
              type="button"
              class="admin-tab"
              :class="{ 'is-active': activeTab === 'overview' }"
              @click="activeTab = 'overview'"
            >
              资料概览与风控状态
            </button>
            <button
              type="button"
              class="admin-tab"
              :class="{ 'is-active': activeTab === 'assets' }"
              @click="activeTab = 'assets'"
            >
              背包与勋章摘要 ({{ detail.bagItems.length }} / {{ detail.medals.length }})
            </button>
            <button
              type="button"
              class="admin-tab"
              :class="{ 'is-active': activeTab === 'operations' }"
              @click="activeTab = 'operations'"
            >
              近期管理记录 ({{ detail.recentOperations.length }})
            </button>
          </div>
        </section>

        <!-- Tab 1: 资料概览与独立高危处置 -->
        <div v-if="activeTab === 'overview'" class="ud-grid">
          <section class="admin-panel">
            <h2 class="ud-card-title">基础资料与社区指标</h2>
            <dl class="ud-dl">
              <div class="ud-dl__row">
                <dt>用户名 / 昵称</dt>
                <dd>@{{ userProfile.userName }} / {{ userProfile.userNickname || '-' }}</dd>
              </div>
              <div class="ud-dl__row">
                <dt>联系邮箱 / 手机</dt>
                <dd>{{ userProfile.userEmail || '未填写' }} · <span class="admin-mono">{{ userProfile.userPhoneMasked || '未绑定' }}</span></dd>
              </div>
              <div class="ud-dl__row">
                <dt>个人主页</dt>
                <dd class="admin-mono">{{ userProfile.userURL || '-' }}</dd>
              </div>
              <div class="ud-dl__row">
                <dt>个人标签</dt>
                <dd>{{ userProfile.userTags || '-' }}</dd>
              </div>
              <div class="ud-dl__row">
                <dt>个人简介</dt>
                <dd class="ud-pre">{{ userProfile.userIntro || '暂无简介' }}</dd>
              </div>
              <div class="ud-dl__row">
                <dt>内容统计</dt>
                <dd class="admin-mono">
                  文章 {{ formatCount(userProfile.userArticleCount) }} · 评论 {{ formatCount(userProfile.userCommentCount) }} · 积分 {{ formatCount(userProfile.userPoint) }}
                </dd>
              </div>
              <div class="ud-dl__row">
                <dt>最近登录</dt>
                <dd class="admin-mono">
                  {{ formatDateTime(userProfile.userLatestLoginTime) }} ({{ userProfile.userLatestLoginIP || '-' }})
                </dd>
              </div>
              <div class="ud-dl__row">
                <dt>评论 / 积分状态</dt>
                <dd>
                  评论：{{ userProfile.userCommentStatus === 0 ? '正常' : `受限 (${userProfile.userCommentStatus})` }} ·
                  积分：{{ userProfile.userPointStatus === 0 ? '正常' : `受限 (${userProfile.userPointStatus})` }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="ud-side-col">
            <!-- 独立安全维护区：移除 MFA -->
            <article class="admin-panel">
              <h2 class="ud-card-title">两步验证（MFA）管理</h2>
              <p class="ud-card-desc">
                当前状态：<strong>{{ userProfile.hasMfa ? '已绑定两步验证' : '未启用两步验证' }}</strong>。
                为保障账号凭证安全，后台永不显示密码及 MFA 密钥明文。
              </p>
              <button
                type="button"
                class="admin-btn admin-btn--warning-outline"
                :disabled="!userProfile.hasMfa || !auth.capabilities?.actions.userRemoveMfa || mutating"
                @click="openRemoveMfaConfirm"
              >
                {{ userProfile.hasMfa ? '移除两步验证（MFA）' : '未启用无需移除' }}
              </button>
            </article>

            <!-- 隔离高危处置区：永久停用 -->
            <article class="admin-panel ud-danger-zone">
              <h2 class="ud-card-title ud-card-title--danger">高危处置区 · 永久停用账号</h2>
              <p class="ud-card-desc">
                此操作不可逆，将把账号永久置为状态 4 并立刻清退其登录态；为防止误操作，禁止停用当前登录账号自身。
              </p>
              <p v-if="userProfile.isSelf" class="ud-guard-note">
                当前查看的是您本人登录的账号，已锁定“永久停用”按钮。
              </p>
              <button
                type="button"
                class="admin-btn admin-btn--danger"
                :disabled="
                  userProfile.isSelf ||
                  isPermanentlyDeactivated ||
                  !auth.capabilities?.actions.userDeactivate ||
                  mutating
                "
                @click="openDeactivateConfirm"
              >
                {{
                  isPermanentlyDeactivated
                    ? '账号已永久停用'
                    : userProfile.isSelf
                      ? '禁止停用当前账号'
                      : '永久停用该账号'
                }}
              </button>
            </article>
          </section>
        </div>

        <!-- Tab 2: 背包与勋章只读摘要 -->
        <section v-else-if="activeTab === 'assets'" class="ud-grid">
          <article class="admin-panel">
            <h2 class="ud-card-title">背包道具摘要（只读）</h2>
            <div v-if="detail.bagItems.length" class="admin-table-wrap">
              <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
                <thead>
                  <tr>
                    <th>道具名称</th>
                    <th>持有数量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in detail.bagItems" :key="item.name">
                    <td>{{ item.name }}</td>
                    <td class="admin-mono">{{ formatCount(item.count) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="ud-empty-hint">暂无背包道具记录（积分与背包主动调整规划于第三阶段接入）。</p>
          </article>

          <article class="admin-panel">
            <h2 class="ud-card-title">持有勋章摘要（只读）</h2>
            <div v-if="detail.medals.length" class="admin-table-wrap">
              <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
                <thead>
                  <tr>
                    <th>勋章名称</th>
                    <th>状态</th>
                    <th>说明 / 到期</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(medal, idx) in detail.medals" :key="medal.id || `${medal.name}-${idx}`">
                    <td>{{ medal.name }}</td>
                    <td>
                      <StatusBadge
                        :tone="medal.enabled === false ? 'neutral' : 'success'"
                        :label="medal.enabled === false ? '未佩戴' : '有效'"
                      />
                    </td>
                    <td>{{ medal.description || medal.expireDate || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="ud-empty-hint">该用户暂无勋章记录。</p>
          </article>
        </section>

        <!-- Tab 3: 针对该用户的近期操作记录 -->
        <section v-else class="admin-panel">
          <h2 class="ud-card-title">与该用户相关的近期管理记录</h2>
          <div v-if="detail.recentOperations.length" class="admin-table-wrap">
            <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
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
                <tr v-for="op in detail.recentOperations" :key="op.oId">
                  <td class="admin-mono">{{ formatDateTime(op.operationCreated) }}</td>
                  <td>{{ op.operationUserName || op.operationUserId }}</td>
                  <td>{{ op.operationCodeLabel }}</td>
                  <td class="admin-mono">#{{ op.operationCode }}</td>
                  <td class="admin-mono">{{ op.operationDataId }}</td>
                  <td class="admin-mono">{{ op.operationIP || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="ud-empty-hint">暂无与该用户直接关联的管理审计记录。</p>
        </section>
      </template>
    </PageStateView>

    <!-- 资料与角色编辑右侧抽屉 -->
    <AdminDrawer
      :open="drawerOpen"
      title="编辑用户资料与角色"
      :subtitle="userProfile ? `@${userProfile.userName} · 仅提交实际修改且当前账号有权编辑的字段` : ''"
      :close-on-backdrop="!isDrawerDirty"
      @close="requestCloseDrawer"
    >
      <form id="user-edit-form" class="ud-form" @submit.prevent="submitEditForm">
        <fieldset v-if="canEditBasic" class="ud-fieldset">
          <legend>基础资料字段（需 userUpdateBasic）</legend>
          <div class="ud-field">
            <label for="ue-nickname">用户昵称</label>
            <input id="ue-nickname" v-model="editForm.userNickname" type="text" class="admin-input" :disabled="mutating" />
          </div>
          <div class="ud-field">
            <label for="ue-url">个人主页 URL</label>
            <input id="ue-url" v-model="editForm.userURL" type="text" class="admin-input" :disabled="mutating" />
          </div>
          <div class="ud-field">
            <label for="ue-tags">个人标签（逗号分隔）</label>
            <input id="ue-tags" v-model="editForm.userTags" type="text" class="admin-input" :disabled="mutating" />
          </div>
          <div class="ud-field">
            <label for="ue-intro">个人简介</label>
            <textarea id="ue-intro" v-model="editForm.userIntro" class="admin-textarea" :disabled="mutating" />
          </div>
        </fieldset>

        <fieldset v-if="canEditAdvanced" class="ud-fieldset">
          <legend>高级与状态控制字段（需 userUpdate）</legend>
          <div class="ud-field">
            <label for="ue-email">联系邮箱</label>
            <input id="ue-email" v-model="editForm.userEmail" type="email" class="admin-input" :disabled="mutating" />
          </div>
          <div class="ud-field">
            <label for="ue-status">账号常规状态（永久停用请走独立高危区）</label>
            <select id="ue-status" v-model.number="editForm.userStatus" class="admin-select" :disabled="mutating">
              <option v-for="opt in editableStatusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="ud-field-row">
            <div class="ud-field">
              <label for="ue-comment-status">评论状态</label>
              <select
                id="ue-comment-status"
                v-model.number="editForm.userCommentStatus"
                class="admin-select"
                :disabled="mutating"
              >
                <option :value="0">允许评论 (0)</option>
                <option :value="1">禁止评论 (1)</option>
              </select>
            </div>
            <div class="ud-field">
              <label for="ue-point-status">积分状态</label>
              <select
                id="ue-point-status"
                v-model.number="editForm.userPointStatus"
                class="admin-select"
                :disabled="mutating"
              >
                <option :value="0">正常积分 (0)</option>
                <option :value="1">冻结变动 (1)</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset v-if="canEditRole && detail" class="ud-fieldset">
          <legend>角色指派（需 userUpdateRole）</legend>
          <div class="ud-field">
            <label for="ue-role">所属角色</label>
            <select id="ue-role" v-model="editForm.userRole" class="admin-select" :disabled="mutating">
              <option v-for="role in detail.roleOptions" :key="role.oId" :value="role.oId">
                {{ role.roleName }} ({{ role.oId }})
              </option>
            </select>
          </div>
        </fieldset>
      </form>

      <template #footer>
        <div v-if="confirmDiscardClose" class="ud-discard-hint">
          检测到未保存修改，再次点击“放弃并关闭”将丢弃本次编辑草稿。
        </div>
        <button type="button" class="admin-btn" :disabled="mutating" @click="requestCloseDrawer">
          {{ confirmDiscardClose ? '放弃并关闭' : '取消' }}
        </button>
        <button
          type="submit"
          form="user-edit-form"
          class="admin-btn admin-btn--primary"
          :disabled="mutating || !isDrawerDirty"
        >
          {{ mutating ? '保存中...' : isDrawerDirty ? '保存变更' : '暂无字段变更' }}
        </button>
      </template>
    </AdminDrawer>

    <!-- 高危动作二次确认弹窗 -->
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
      @confirm="pendingConfirm && runUserMutation(pendingConfirm)"
    />
  </div>
</template>

<style scoped>
.ud-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fp-muted);
  margin-bottom: 4px;
}

.ud-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  font-size: 13px;
}

.ud-banner__content p {
  margin: 4px 0 0;
}

.ud-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ud-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.ud-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.ud-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.ud-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ud-summary__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ud-summary__ids {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.ud-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.85fr);
  gap: 16px;
  align-items: start;
}

.ud-side-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ud-card-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
}

.ud-card-title--danger {
  color: var(--fp-danger-ink);
}

.ud-card-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--fp-muted);
}

.ud-danger-zone {
  border-color: var(--fp-danger);
}

.ud-guard-note {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-warning-soft);
  font-size: 12px;
  color: var(--fp-title);
}

.ud-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ud-dl__row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  font-size: 13px;
}

.ud-dl__row dt {
  color: var(--fp-muted);
}

.ud-dl__row dd {
  margin: 0;
  color: var(--fp-text);
  word-break: break-word;
}

.ud-pre {
  white-space: pre-wrap;
}

.ud-empty-hint {
  margin: 0;
  padding: 18px 12px;
  border-radius: var(--fp-radius-md);
  border: 1px dashed var(--fp-border-strong);
  color: var(--fp-muted);
  font-size: 13px;
  text-align: center;
}

.ud-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ud-fieldset {
  margin: 0;
  padding: 14px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ud-fieldset legend {
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fp-head);
}

.ud-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ud-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-head);
}

.ud-field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ud-discard-hint {
  width: 100%;
  font-size: 12px;
  color: var(--fp-danger-ink);
}

.ud-quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 1024px) {
  .ud-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ud-dl__row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .ud-field-row {
    grid-template-columns: 1fr;
  }
}
</style>
