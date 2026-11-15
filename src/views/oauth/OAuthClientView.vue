<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  createOAuthClient,
  disableOAuthClient,
  fetchOAuthClientDetail,
  fetchOAuthClients,
  updateOAuthClient,
  type OAuthClientDetail,
  type OAuthClientSummary,
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

/**
 * OAuth 客户端管理视图（接入既有 V3 接口）：
 * 1. 支持分页列表、详情与分页回调 URI 展示；
 * 2. 新增与编辑使用右侧抽屉，提示 Scope 或回调地址变更可能使已有授权令牌失效；
 * 3. 停用客户端为不可逆删除动作，需输入完整 clientId 二次确认；
 * 4. 所有写操作均受 Idempotency-Key 追踪器保护，未知结果支持恢复确认。
 */
type PendingOAuthOp =
  | {
      kind: 'create' | 'update'
      clientId?: string
      payload: { name: string; scope: string; redirectUris: string[] }
      idempotencyKey: string
      title: string
    }
  | {
      kind: 'disable'
      clientId: string
      name: string
      idempotencyKey: string
      title: string
    }

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const page = ref(1)
const pageSize = 20
const list = ref<OAuthClientSummary[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })
const selectedId = ref('')

const detailPage = ref(1)
const detail = ref<OAuthClientDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const confirmDiscardClose = ref(false)
const mutating = ref(false)
const actionMessage = ref('')
const actionError = ref('')

const formState = reactive({
  name: '',
  scope: '',
  redirectUrisText: '',
})
const formSnapshot = ref({ name: '', scope: '', redirectUrisText: '' })

const confirmDisableTarget = ref<OAuthClientDetail | null>(null)
const unknownRecovery = ref<PendingOAuthOp | null>(null)

const formTracker = new IdempotencyTracker('oauth-client-form')
const disableTracker = new IdempotencyTracker('oauth-client-disable')

const parsedRedirectUris = computed(() =>
  formState.redirectUrisText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
)

const isDrawerDirty = computed(
  () =>
    drawerOpen.value &&
    (formState.name !== formSnapshot.value.name ||
      formState.scope !== formSnapshot.value.scope ||
      formState.redirectUrisText !== formSnapshot.value.redirectUrisText),
)

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && list.value.length === 0) return 'loading'
  if (loadError.value && list.value.length === 0) return 'error'
  if (!loading.value && list.value.length === 0) return 'empty'
  return 'ready'
})

function hasOAuthPermission(): boolean {
  return Boolean(auth.capabilities?.actions.oauthManage)
}

async function loadClients(keepSelection = true): Promise<void> {
  if (!hasOAuthPermission()) {
    forbidden.value = true
    list.value = []
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false
  const prevId = keepSelection ? selectedId.value : ''

  try {
    const res = await fetchOAuthClients(page.value, pageSize)
    list.value = res.list
    pagination.value = res.pagination
    if (prevId && res.list.some((item) => item.clientId === prevId)) {
      selectedId.value = prevId
    } else {
      selectedId.value = res.list[0]?.clientId ?? ''
      detailPage.value = 1
    }
    if (selectedId.value) {
      await loadClientDetail(selectedId.value, detailPage.value)
    } else {
      detail.value = null
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
      loadError.value = err instanceof Error ? err.message : '加载 OAuth 客户端列表失败'
    }
  } finally {
    loading.value = false
  }
}

async function loadClientDetail(clientId: string, p = 1): Promise<void> {
  if (!clientId) {
    detail.value = null
    return
  }
  detailLoading.value = true
  detailError.value = ''
  try {
    detail.value = await fetchOAuthClientDetail(clientId, p, 20)
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : '加载客户端详情失败'
  } finally {
    detailLoading.value = false
  }
}

function selectClient(clientId: string): void {
  if (selectedId.value === clientId) return
  selectedId.value = clientId
  detailPage.value = 1
  void loadClientDetail(clientId, 1)
}

function handleListPageChange(nextPage: number): void {
  page.value = nextPage
  void loadClients(false)
}

function handleDetailPageChange(nextPage: number): void {
  detailPage.value = nextPage
  if (selectedId.value) {
    void loadClientDetail(selectedId.value, nextPage)
  }
}

function openCreateDrawer(): void {
  drawerMode.value = 'create'
  const empty = { name: '', scope: 'read', redirectUrisText: '' }
  formSnapshot.value = { ...empty }
  Object.assign(formState, empty)
  confirmDiscardClose.value = false
  drawerOpen.value = true
}

function openEditDrawer(): void {
  const current = detail.value
  if (!current) return
  drawerMode.value = 'edit'
  const snap = {
    name: current.name,
    scope: current.scope,
    redirectUrisText: current.redirects.list.map((r) => r.uri).join('\n'),
  }
  formSnapshot.value = { ...snap }
  Object.assign(formState, snap)
  confirmDiscardClose.value = false
  drawerOpen.value = true
}

function requestCloseDrawer(): void {
  if (mutating.value) return
  if (isDrawerDirty.value && !confirmDiscardClose.value) {
    confirmDiscardClose.value = true
    return
  }
  confirmDiscardClose.value = false
  drawerOpen.value = false
}

async function submitDrawerForm(): Promise<void> {
  if (mutating.value) return
  if (unknownRecovery.value) {
    actionError.value = '当前存在待核对写入操作，请先完成核对。'
    return
  }
  const name = formState.name.trim()
  const scope = formState.scope.trim()
  const redirectUris = parsedRedirectUris.value
  if (!name || !scope || redirectUris.length === 0) {
    actionError.value = '客户端名称、Scope 与至少一条回调 URI 不能为空。'
    return
  }

  const payload = { name, scope, redirectUris }
  const mode = drawerMode.value
  const targetClientId = mode === 'edit' ? detail.value?.clientId : undefined
  const key = formTracker.resolve({ mode, targetClientId, payload })

  await executeOp({
    kind: mode === 'create' ? 'create' : 'update',
    clientId: targetClientId,
    payload,
    idempotencyKey: key,
    title: mode === 'create' ? `新建客户端 ${name}` : `更新客户端 ${name}`,
  })
}

function requestDisableClient(): void {
  if (!detail.value || detail.value.status !== 0) return
  if (unknownRecovery.value) {
    actionError.value = '当前存在待核对写入操作，请先完成核对。'
    return
  }
  confirmDisableTarget.value = detail.value
}

async function confirmDisable(): Promise<void> {
  const target = confirmDisableTarget.value
  if (!target || mutating.value) return
  const key = disableTracker.resolve({ clientId: target.clientId })
  await executeOp({
    kind: 'disable',
    clientId: target.clientId,
    name: target.name,
    idempotencyKey: key,
    title: `永久停用客户端 ${target.name}`,
  })
}

async function executeOp(op: PendingOAuthOp): Promise<void> {
  if (mutating.value) return
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (op.kind === 'create') {
      const created = await createOAuthClient(op.payload, op.idempotencyKey)
      drawerOpen.value = false
      confirmDiscardClose.value = false
      formTracker.reset()
      selectedId.value = created.clientId
      actionMessage.value = `已创建 OAuth 客户端「${created.name}」（clientId: ${created.clientId}）。`
      await loadClients(true)
    } else if (op.kind === 'update' && op.clientId) {
      const updated = await updateOAuthClient(op.clientId, op.payload, op.idempotencyKey)
      drawerOpen.value = false
      confirmDiscardClose.value = false
      formTracker.reset()
      actionMessage.value = `已保存 OAuth 客户端「${updated.name}」配置变更。`
      await loadClients(true)
    } else if (op.kind === 'disable') {
      const disabled = await disableOAuthClient(op.clientId, op.idempotencyKey)
      confirmDisableTarget.value = null
      disableTracker.reset()
      actionMessage.value = `已永久停用客户端 #${disabled.clientId}。`
      await loadClients(true)
    }
    unknownRecovery.value = null
  } catch (err) {
    confirmDisableTarget.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = op
      actionError.value =
        err instanceof Error
          ? `${err.message}。已保留原始幂等键，请先刷新核对或按原幂等键重试确认。`
          : '写入状态未知，已保留原始幂等键。'
    } else {
      unknownRecovery.value = null
      formTracker.reset()
      disableTracker.reset()
      if (err instanceof ApiError) {
        actionError.value = `${err.message}（HTTP ${err.status}）`
        if (err.status === 409) {
          await loadClients(true)
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
  formTracker.reset()
  disableTracker.reset()
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/oauth/clients' } })
}

function goHome(): void {
  void router.push('/workbench')
}

onBeforeRouteLeave(() => {
  if (isDrawerDirty.value || unknownRecovery.value) {
    return window.confirm('存在未保存的客户端编辑或待核对写入操作，确定离开吗？')
  }
  return true
})

watch(
  () => auth.sessionEpoch,
  () => {
    drawerOpen.value = false
    confirmDiscardClose.value = false
    confirmDisableTarget.value = null
    unknownRecovery.value = null
    formTracker.reset()
    disableTracker.reset()
    list.value = []
    detail.value = null
    selectedId.value = ''
    actionMessage.value = ''
    actionError.value = ''
    if (auth.isLoggedIn && hasOAuthPermission()) {
      void loadClients(false)
    }
  },
)

onMounted(() => {
  void loadClients(false)
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">OAuth 客户端管理</h1>
        <p class="admin-page__subtitle">
          集中维护第三方接入客户端标识、授权 Scope 与合法回调地址（Redirect URIs）。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadClients(true)">
          {{ loading ? '加载中...' : '刷新列表' }}
        </button>
        <button
          v-if="hasOAuthPermission()"
          type="button"
          class="admin-btn admin-btn--primary"
          :disabled="mutating"
          @click="openCreateDrawer"
        >
          新增 OAuth 客户端
        </button>
      </div>
    </header>

    <div v-if="unknownRecovery" class="oa-banner oa-banner--warning" role="alert">
      <div>
        <strong>待核对写入结果：{{ unknownRecovery.title }}</strong>
        <p>
          {{ actionError }} <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="oa-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="executeOp(unknownRecovery)"
        >
          {{ mutating ? '核对中...' : '按原幂等键重试确认' }}
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="loading" @click="loadClients(true)">
          刷新列表
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="mutating" @click="dismissUnknownRecovery">
          已知晓并清除提示
        </button>
      </div>
    </div>

    <div v-else-if="actionError" class="oa-banner oa-banner--danger" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionError = ''">关闭</button>
    </div>

    <div v-if="actionMessage" class="oa-banner oa-banner--success" role="status">
      <span>{{ actionMessage }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionMessage = ''">关闭</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadClients(true)"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="oa-layout" :class="{ 'is-single-column': !detail }">
        <div class="oa-list-col">
          <div class="admin-table-wrap">
            <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>名称</th>
                  <th>Client ID</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in list"
                  :key="item.clientId"
                  class="oa-row"
                  :class="{ 'is-selected': selectedId === item.clientId }"
                  tabindex="0"
                  @click="selectClient(item.clientId)"
                  @keydown.enter.prevent="selectClient(item.clientId)"
                >
                  <td>
                    <StatusBadge
                      :tone="item.status === 0 ? 'success' : 'danger'"
                      :label="item.status === 0 ? '正常' : '已停用'"
                    />
                  </td>
                  <td><strong>{{ item.name }}</strong></td>
                  <td class="admin-mono">{{ item.clientId }}</td>
                  <td class="admin-mono">{{ item.scope }}</td>
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
            @update:page="handleListPageChange"
          />
        </div>

        <aside v-if="detail" class="admin-panel oa-detail">
          <header class="oa-detail__head">
            <div>
              <h2 class="oa-detail__title">{{ detail.name }}</h2>
              <p class="oa-detail__id admin-mono">{{ detail.clientId }}</p>
            </div>
            <StatusBadge
              :tone="detail.status === 0 ? 'success' : 'danger'"
              :label="detail.status === 0 ? '运行中' : '已停用'"
            />
          </header>

          <div v-if="detailError" class="oa-banner oa-banner--danger">{{ detailError }}</div>

          <dl class="oa-meta">
            <div class="oa-meta__row">
              <dt>授权 Scope</dt>
              <dd class="admin-mono">{{ detail.scope }}</dd>
            </div>
          </dl>

          <section class="oa-redirects">
            <div class="oa-redirects__head">
              <strong>合法回调地址（Redirect URIs）</strong>
              <span v-if="detailLoading" class="oa-muted">刷新中...</span>
            </div>

            <div v-if="detail.redirects.list.length" class="admin-table-wrap">
              <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
                <thead>
                  <tr>
                    <th>回调 URI</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in detail.redirects.list" :key="r.uri">
                    <td class="admin-mono oa-uri-cell">{{ r.uri }}</td>
                    <td>
                      <StatusBadge
                        :tone="r.status === 0 ? 'success' : 'neutral'"
                        :label="r.status === 0 ? '启用' : `状态 ${r.status}`"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="oa-muted">当前客户端暂无回调 URI 记录。</p>

            <AdminPagination
              v-if="detail.redirects.pagination.pageCount > 1"
              :page="detail.redirects.pagination.p"
              :page-size="detail.redirects.pagination.size"
              :total="detail.redirects.pagination.total"
              :page-count="detail.redirects.pagination.pageCount"
              :disabled="detailLoading"
              @update:page="handleDetailPageChange"
            />
          </section>

          <div class="oa-detail__actions">
            <button
              type="button"
              class="admin-btn admin-btn--primary"
              :disabled="detail.status !== 0 || mutating"
              @click="openEditDrawer"
            >
              编辑配置
            </button>
            <button
              type="button"
              class="admin-btn admin-btn--danger-outline"
              :disabled="detail.status !== 0 || mutating"
              @click="requestDisableClient"
            >
              {{ detail.status === 0 ? '永久停用客户端' : '客户端已停用' }}
            </button>
          </div>
        </aside>
      </div>
    </PageStateView>

    <!-- 新建与编辑抽屉 -->
    <AdminDrawer
      :open="drawerOpen"
      :title="drawerMode === 'create' ? '新增 OAuth 客户端' : '编辑 OAuth 客户端'"
      subtitle="请注意：变更 Scope 或回调地址可能触发已有授权令牌失效。"
      :close-on-backdrop="!isDrawerDirty"
      @close="requestCloseDrawer"
    >
      <form id="oauth-client-form" class="oa-form" @submit.prevent="submitDrawerForm">
        <div class="oa-warn-box">
          影响提示：若修改现有客户端的 Scope 或回调地址列表，请确保与接入方应用同步变更，避免线上授权中断。
        </div>

        <div class="oa-field">
          <label for="oa-name">客户端名称</label>
          <input id="oa-name" v-model="formState.name" type="text" class="admin-input" :disabled="mutating" required />
        </div>

        <div class="oa-field">
          <label for="oa-scope">授权范围（Scope，空格或逗号分隔）</label>
          <input id="oa-scope" v-model="formState.scope" type="text" class="admin-input admin-mono" :disabled="mutating" required />
        </div>

        <div class="oa-field">
          <label for="oa-uris">回调 URI 列表（每行一个完整地址）</label>
          <textarea
            id="oa-uris"
            v-model="formState.redirectUrisText"
            class="admin-textarea admin-mono"
            :disabled="mutating"
            placeholder="https://example.com/oauth/callback"
            required
          />
          <span class="oa-muted">当前已解析 {{ parsedRedirectUris.length }} 条回调地址。</span>
        </div>
      </form>

      <template #footer>
        <div v-if="confirmDiscardClose" class="oa-discard-hint">
          存在未保存内容，再次点击“放弃并关闭”将丢弃修改。
        </div>
        <button type="button" class="admin-btn" :disabled="mutating" @click="requestCloseDrawer">
          {{ confirmDiscardClose ? '放弃并关闭' : '取消' }}
        </button>
        <button
          type="submit"
          form="oauth-client-form"
          class="admin-btn admin-btn--primary"
          :disabled="mutating || (drawerMode === 'edit' && !isDrawerDirty)"
        >
          {{ mutating ? '提交中...' : drawerMode === 'create' ? '创建客户端' : '保存变更' }}
        </button>
      </template>
    </AdminDrawer>

    <!-- 停用客户端确认弹窗 -->
    <ConfirmDialog
      :open="Boolean(confirmDisableTarget)"
      title="高危操作：永久停用 OAuth 客户端"
      description="停用操作将撤回并拒绝该客户端后续全部授权与令牌刷新请求，请核对 Client ID 后输入确认。"
      :summary-items="
        confirmDisableTarget
          ? [
              { label: '客户端名称', value: confirmDisableTarget.name },
              { label: 'Client ID', value: confirmDisableTarget.clientId },
            ]
          : []
      "
      danger
      confirm-text="确认停用"
      :require-confirm-phrase="confirmDisableTarget?.clientId || ''"
      :pending="mutating"
      @cancel="confirmDisableTarget = null"
      @confirm="confirmDisable"
    />
  </div>
</template>

<style scoped>
.oa-banner {
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

.oa-banner p {
  margin: 4px 0 0;
}

.oa-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.oa-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.oa-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.oa-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.oa-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}

.oa-list-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.oa-row {
  cursor: pointer;
}

.oa-row.is-selected {
  background: var(--fp-primary-soft);
}

.oa-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.oa-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.oa-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
}

.oa-detail__id {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.oa-meta {
  margin: 0;
}

.oa-meta__row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
}

.oa-meta__row dt {
  color: var(--fp-muted);
}

.oa-meta__row dd {
  margin: 0;
  word-break: break-all;
}

.oa-redirects {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.oa-redirects__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.oa-uri-cell {
  word-break: break-all;
}

.oa-muted {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.oa-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--fp-border);
}

.oa-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.oa-warn-box {
  padding: 10px 12px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-warning-soft);
  font-size: 12px;
  color: var(--fp-title);
}

.oa-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oa-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-head);
}

.oa-discard-hint {
  width: 100%;
  font-size: 12px;
  color: var(--fp-danger-ink);
}

@media (max-width: 1024px) {
  .oa-layout {
    grid-template-columns: 1fr;
  }
}
.oa-layout.is-single-column { grid-template-columns: minmax(0, 1fr); }
</style>
