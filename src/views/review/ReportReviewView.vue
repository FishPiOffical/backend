<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  fetchAdminReports,
  handleAdminReport,
  ignoreAdminReport,
  removeAdminRepeater,
  type AdminReportItem,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatDateTime, getReportStatusMeta } from '@/utils/format'

/**
 * 举报审核视图：
 * 1. 支持按状态（待处理/已处理/已忽略/全部）与对象类型筛选，并带分页；
 * 2. 右侧详情面板纯文本展示被举报上下文，禁止 v-html 注入风险；
 * 3. “标记已处理”、“忽略”与“移除复读机内容”彻底独立，且校验本人举报禁止自审；
 * 4. 写入动作绑定 IdempotencyTracker，未知结果失败时保留原幂等键与恢复确认操作。
 */
type StatusFilter = 'pending' | 'handled' | 'ignored' | 'all'
type DataTypeFilter = 'all' | '0' | '1' | '2' | '3' | '4'
type ReportActionKind = 'handle' | 'ignore' | 'remove-repeater'

interface PendingReportOperation {
  kind: ReportActionKind
  reportId: string
  repeaterId: string
  title: string
  description: string
  summaryItems: Array<{ label: string; value: string }>
  danger: boolean
  confirmText: string
  idempotencyKey: string
}

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const statusFilter = ref<StatusFilter>('pending')
const dataTypeFilter = ref<DataTypeFilter>('all')
const page = ref(1)
const pageSize = 20

const list = ref<AdminReportItem[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })
const selectedId = ref('')

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const actionMessage = ref('')
const actionError = ref('')
const mutating = ref(false)

const pendingConfirm = ref<PendingReportOperation | null>(null)
const unknownRecovery = ref<PendingReportOperation | null>(null)

const reportActionTracker = new IdempotencyTracker('admin-report-action')

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'pending', label: '待处理' },
  { value: 'handled', label: '已处理' },
  { value: 'ignored', label: '已忽略' },
  { value: 'all', label: '全部状态' },
]

const dataTypeOptions: Array<{ value: DataTypeFilter; label: string }> = [
  { value: 'all', label: '全部对象类型' },
  { value: '0', label: '文章 (0)' },
  { value: '1', label: '评论 (1)' },
  { value: '2', label: '用户 (2)' },
  { value: '3', label: '清风明月 (3)' },
  { value: '4', label: '复读机内容 (4)' },
]

const selectedItem = computed<AdminReportItem | null>(() => {
  if (!list.value.length) {
    return null
  }
  return list.value.find((item) => item.oId === selectedId.value) ?? list.value[0] ?? null
})

const hasActiveFilter = computed(() => statusFilter.value !== 'pending' || dataTypeFilter.value !== 'all')

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
  return Boolean(caps?.canAccessAdmin && caps.permissions.menuAdminReports)
}

function isSafeLinkUrl(url: string | undefined): boolean {
  if (!url) return false
  return url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')
}

async function loadReports(keepSelection = true): Promise<void> {
  if (!hasMenuPermission()) {
    forbidden.value = true
    list.value = []
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  const prevSelected = keepSelection ? selectedId.value : ''

  try {
    const res = await fetchAdminReports({
      status: statusFilter.value,
      dataType: dataTypeFilter.value,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
    if (prevSelected && res.list.some((item) => item.oId === prevSelected)) {
      selectedId.value = prevSelected
    } else {
      selectedId.value = res.list[0]?.oId ?? ''
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
      loadError.value = err instanceof Error ? err.message : '读取举报队列失败'
    }
  } finally {
    loading.value = false
  }
}

function changeStatusTab(next: StatusFilter): void {
  if (statusFilter.value === next) return
  statusFilter.value = next
  page.value = 1
  void loadReports(false)
}

function changeDataType(): void {
  page.value = 1
  void loadReports(false)
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadReports(false)
}

function resetFilters(): void {
  statusFilter.value = 'pending'
  dataTypeFilter.value = 'all'
  page.value = 1
  void loadReports(false)
}

function openActionConfirm(kind: ReportActionKind, item: AdminReportItem): void {
  if (unknownRecovery.value) {
    actionError.value = '存在未确认结果的举报处置操作，请先在上方恢复确认或刷新核对最新状态。'
    return
  }
  actionMessage.value = ''
  actionError.value = ''

  const descriptor =
    kind === 'handle'
      ? {
          title: '确认将举报标记为已处理',
          description: '该操作仅将本条举报记录状态置为“已处理”，不会自动删除被举报的目标内容或封禁用户。',
          danger: false,
          confirmText: '确认标记已处理',
          actionName: '标记已处理',
        }
      : kind === 'ignore'
        ? {
            title: '确认忽略此举报记录',
            description: '忽略后该条举报状态将变为“已忽略”，不会对目标对象造成影响。',
            danger: false,
            confirmText: '确认忽略举报',
            actionName: '忽略举报',
          }
        : {
            title: '确认移除被举报复读机内容',
            description:
              '高风险写操作：仅撤回/删除目标复读机内容本身；移除成功后不会自动关闭当前举报记录，需根据实际处理情况再单独标记。',
            danger: true,
            confirmText: '确认移除复读机内容',
            actionName: '移除复读机内容',
          }

  const key = reportActionTracker.resolve({
    kind,
    reportId: item.oId,
    repeaterId: item.target.id,
  })

  pendingConfirm.value = {
    kind,
    reportId: item.oId,
    repeaterId: item.target.id,
    title: descriptor.title,
    description: descriptor.description,
    summaryItems: [
      { label: '执行动作', value: descriptor.actionName },
      { label: '举报 ID', value: item.oId },
      { label: '对象类型', value: `${item.reportDataTypeLabel} (${item.reportDataType})` },
      { label: '目标 ID', value: item.reportDataId },
      { label: '举报原因', value: item.reportTypeLabel },
    ],
    danger: descriptor.danger,
    confirmText: descriptor.confirmText,
    idempotencyKey: key,
  }
}

async function executeOperation(op: PendingReportOperation): Promise<void> {
  if (mutating.value) {
    return
  }
  mutating.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    if (op.kind === 'handle') {
      await handleAdminReport(op.reportId, op.idempotencyKey)
      actionMessage.value = `举报 #${op.reportId} 已标记为“已处理”。`
    } else if (op.kind === 'ignore') {
      await ignoreAdminReport(op.reportId, op.idempotencyKey)
      actionMessage.value = `举报 #${op.reportId} 已标记为“已忽略”。`
    } else {
      await removeAdminRepeater(op.repeaterId, op.idempotencyKey)
      actionMessage.value = `复读机内容 #${op.repeaterId} 已移除；如需结案请单独对举报记录选择“标记已处理”或“忽略”。`
    }

    pendingConfirm.value = null
    unknownRecovery.value = null
    reportActionTracker.reset()
    await loadReports(true)
  } catch (err) {
    pendingConfirm.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = op
      actionError.value =
        err instanceof Error
          ? `${err.message}。已保留原始幂等键，请勿修改操作类型，建议先刷新查看或按原幂等键恢复确认。`
          : '请求结果未知，已保留原始幂等键等待恢复确认。'
    } else {
      unknownRecovery.value = null
      reportActionTracker.reset()
      if (err instanceof ApiError) {
        actionError.value = `${err.message}（HTTP ${err.status}）`
        if (err.status === 409) {
          await loadReports(true)
        }
      } else {
        actionError.value = err instanceof Error ? err.message : '提交操作失败'
      }
    }
  } finally {
    mutating.value = false
  }
}

async function reloadAfterUnknown(): Promise<void> {
  await loadReports(true)
}

function dismissUnknownRecovery(): void {
  unknownRecovery.value = null
  reportActionTracker.reset()
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/review/reports' } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => auth.sessionEpoch,
  () => {
    pendingConfirm.value = null
    unknownRecovery.value = null
    reportActionTracker.reset()
    list.value = []
    selectedId.value = ''
    actionMessage.value = ''
    actionError.value = ''
    if (auth.isLoggedIn && hasMenuPermission()) {
      void loadReports(false)
    }
  },
)

onMounted(() => {
  void loadReports(false)
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">举报审核</h1>
        <p class="admin-page__subtitle">
          支持待处理队列核验、目标纯文本上下文安全预览与独立处置；严禁自审本人提交的举报。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadReports(true)">
          {{ loading ? '加载中...' : '刷新队列' }}
        </button>
      </div>
    </header>

    <!-- 筛选条 -->
    <section class="admin-panel report-toolbar" aria-label="举报筛选条件">
      <div class="admin-tabs" role="tablist" aria-label="举报状态">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          class="admin-tab"
          :class="{ 'is-active': statusFilter === tab.value }"
          :aria-selected="statusFilter === tab.value"
          @click="changeStatusTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="report-toolbar__right admin-search-bar">
        <label class="report-filter-label">
          <span class="admin-sr-only">对象类型</span>
          <select v-model="dataTypeFilter" class="admin-select report-select" @change="changeDataType">
            <option v-for="opt in dataTypeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <!-- 未知结果幂等键恢复横幅 -->
    <div v-if="unknownRecovery" class="report-banner report-banner--warning" role="alert">
      <div class="report-banner__content">
        <strong>待核对写入结果：{{ unknownRecovery.summaryItems[0]?.value }}</strong>
        <p>
          {{ actionError }}
          <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="report-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="mutating"
          @click="executeOperation(unknownRecovery)"
        >
          {{ mutating ? '核对中...' : '按原幂等键重试确认' }}
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="loading" @click="reloadAfterUnknown">
          重新加载最新状态
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="mutating" @click="dismissUnknownRecovery">
          已知晓结果并清除提示
        </button>
      </div>
    </div>

    <div v-else-if="actionError" class="report-banner report-banner--danger" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionError = ''">关闭</button>
    </div>

    <div v-if="actionMessage" class="report-banner report-banner--success" role="status">
      <span>{{ actionMessage }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionMessage = ''">关闭</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadReports(true)"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="report-layout" :class="{ 'is-single-column': !selectedItem }">
        <!-- 左侧队列 -->
        <div class="report-list-col">
          <div class="admin-table-wrap">
            <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
              <thead>
                <tr>
                  <th>举报状态</th>
                  <th>对象类型</th>
                  <th>举报原因</th>
                  <th>举报人</th>
                  <th>提交时间</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in list"
                  :key="item.oId"
                  class="report-row"
                  :class="{ 'is-selected': selectedItem?.oId === item.oId }"
                  tabindex="0"
                  @click="selectedId = item.oId"
                  @keydown.enter.prevent="selectedId = item.oId"
                >
                  <td>
                    <StatusBadge
                      :tone="getReportStatusMeta(item.reportHandled).tone"
                      :label="getReportStatusMeta(item.reportHandled).label"
                    />
                  </td>
                  <td>{{ item.reportDataTypeLabel }}</td>
                  <td>{{ item.reportTypeLabel }}</td>
                  <td>
                    <span>{{ item.reporterNickname || item.reporterName || item.reportUserId }}</span>
                    <StatusBadge v-if="item.isOwnReport" tone="danger" label="本人" />
                  </td>
                  <td class="admin-mono">{{ formatDateTime(item.createdAt) }}</td>
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
        </div>

        <!-- 右侧详情与处置面板 -->
        <aside v-if="selectedItem" class="admin-panel report-detail" aria-label="举报详情与处置">
          <header class="report-detail__head">
            <div>
              <h2 class="report-detail__title">举报详情 #{{ selectedItem.oId }}</h2>
              <p class="report-detail__time admin-mono">创建于 {{ formatDateTime(selectedItem.createdAt) }}</p>
            </div>
            <StatusBadge
              :tone="getReportStatusMeta(selectedItem.reportHandled).tone"
              :label="getReportStatusMeta(selectedItem.reportHandled).label"
            />
          </header>

          <dl class="report-meta">
            <div class="report-meta__row">
              <dt>举报人</dt>
              <dd>
                {{ selectedItem.reporterNickname || '未命名' }}
                <span class="admin-mono">(@{{ selectedItem.reporterName || selectedItem.reportUserId }})</span>
                <StatusBadge v-if="selectedItem.isOwnReport" tone="danger" label="本人提交" />
              </dd>
            </div>
            <div class="report-meta__row">
              <dt>举报对象</dt>
              <dd>
                {{ selectedItem.reportDataTypeLabel }} · <code class="admin-mono">{{ selectedItem.reportDataId }}</code>
              </dd>
            </div>
            <div class="report-meta__row">
              <dt>举报类型</dt>
              <dd>{{ selectedItem.reportTypeLabel }}</dd>
            </div>
            <div class="report-meta__row">
              <dt>补充说明</dt>
              <dd class="report-plain-text">{{ selectedItem.reportMemo || '举报人未填写补充说明' }}</dd>
            </div>
          </dl>

          <!-- 目标上下文：纯文本渲染，禁止 HTML 注入 -->
          <section class="report-target-box" aria-label="被举报对象上下文">
            <div class="report-target-box__head">
              <strong>被举报对象上下文（纯文本安全视图）</strong>
              <StatusBadge
                :tone="selectedItem.target.exists ? 'info' : 'neutral'"
                :label="selectedItem.target.statusLabel || (selectedItem.target.exists ? '存在' : '目标已不存在')"
              />
            </div>

            <p v-if="selectedItem.target.title" class="report-target-box__title">
              {{ selectedItem.target.title }}
            </p>
            <p class="report-target-box__snippet report-plain-text">
              {{ selectedItem.target.snippet || '暂无可提取的目标文本摘要' }}
            </p>
            <div v-if="selectedItem.target.url" class="report-target-box__url">
              <span>关联链接：</span>
              <a
                v-if="isSafeLinkUrl(selectedItem.target.url)"
                :href="selectedItem.target.url"
                target="_blank"
                rel="noopener noreferrer"
                class="admin-mono"
              >
                {{ selectedItem.target.url }}
              </a>
              <span v-else class="admin-mono">{{ selectedItem.target.url }}</span>
            </div>
            <!-- 按被举报对象类型与操作者权限提供二期管理与审计直达入口 -->
            <div v-if="selectedItem.reportDataId" class="report-target-box__links">
              <RouterLink
                v-if="
                  selectedItem.reportDataType === 0 &&
                  auth.capabilities?.canAccessAdmin &&
                  auth.capabilities?.permissions.menuAdminArticles
                "
                :to="`/content/articles/${encodeURIComponent(selectedItem.reportDataId)}`"
                class="admin-btn admin-btn--sm"
              >
                前往文章详情 / 处置
              </RouterLink>
              <RouterLink
                v-else-if="
                  selectedItem.reportDataType === 1 &&
                  auth.capabilities?.canAccessAdmin &&
                  auth.capabilities?.permissions.menuAdminComments
                "
                :to="`/content/comments?commentId=${encodeURIComponent(selectedItem.reportDataId)}&keyword=${encodeURIComponent(selectedItem.reportDataId)}`"
                class="admin-btn admin-btn--sm"
              >
                定位并处置评论
              </RouterLink>
              <RouterLink
                v-else-if="
                  selectedItem.reportDataType === 2 &&
                  auth.capabilities?.canAccessAdmin &&
                  auth.capabilities?.permissions.menuAdminUsers
                "
                :to="`/users/${encodeURIComponent(selectedItem.reportDataId)}`"
                class="admin-btn admin-btn--sm"
              >
                前往用户详情 / 管控
              </RouterLink>
              <RouterLink
                v-if="auth.capabilities?.canAccessAdmin"
                :to="`/system/audit-logs?dataId=${encodeURIComponent(selectedItem.reportDataId)}`"
                class="admin-btn admin-btn--sm"
              >
                查看对象审计记录
              </RouterLink>
            </div>
          </section>

          <!-- 独立处置操作 -->
          <section class="report-actions-box" aria-label="独立处置操作">
            <p class="report-actions-box__note">
              规则边界：“标记已处理”、“忽略”与“移除复读机内容”相互独立；跳转前往文章/评论/用户管理或移除内容后，均不会自动修改举报工单状态，需返回此处单独结案。
            </p>

            <div v-if="selectedItem.isOwnReport" class="report-guard-note" role="note">
              安全约束：禁止处理自己提交的举报，已锁定“标记已处理”与“忽略”操作。
            </div>

            <div class="report-actions-box__btns">
              <button
                type="button"
                class="admin-btn admin-btn--primary"
                :disabled="
                  mutating ||
                  selectedItem.reportHandled !== 0 ||
                  selectedItem.isOwnReport ||
                  !auth.capabilities?.actions.reportHandle
                "
                @click="openActionConfirm('handle', selectedItem)"
              >
                标记已处理
              </button>

              <button
                type="button"
                class="admin-btn"
                :disabled="
                  mutating ||
                  selectedItem.reportHandled !== 0 ||
                  selectedItem.isOwnReport ||
                  !auth.capabilities?.actions.reportIgnore
                "
                @click="openActionConfirm('ignore', selectedItem)"
              >
                忽略举报
              </button>

              <button
                v-if="selectedItem.reportDataType === 4 && auth.capabilities?.actions.repeaterRemove"
                type="button"
                class="admin-btn admin-btn--danger-outline"
                :disabled="mutating || !selectedItem.target.removable"
                @click="openActionConfirm('remove-repeater', selectedItem)"
              >
                {{ selectedItem.target.removable ? '移除复读机内容' : '复读机内容不可移除/已撤回' }}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </PageStateView>

    <ConfirmDialog
      :open="Boolean(pendingConfirm)"
      :title="pendingConfirm?.title || ''"
      :description="pendingConfirm?.description || ''"
      :summary-items="pendingConfirm?.summaryItems || []"
      :danger="pendingConfirm?.danger || false"
      :confirm-text="pendingConfirm?.confirmText || '确认'"
      :pending="mutating"
      @cancel="pendingConfirm = null"
      @confirm="pendingConfirm && executeOperation(pendingConfirm)"
    />
  </div>
</template>

<style scoped>
.report-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.report-toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.report-filter-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fp-head);
}

.report-select {
  width: auto;
  min-width: 170px;
}

.report-banner {
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

.report-banner__content p {
  margin: 4px 0 0;
  color: var(--fp-text);
}

.report-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.report-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.report-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.report-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.report-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.95fr);
  gap: 16px;
  align-items: start;
}

.report-list-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.report-row {
  cursor: pointer;
}

.report-row.is-selected {
  background: var(--fp-primary-soft);
}

.report-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 76px;
}

.report-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.report-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
  word-break: break-all;
}

.report-detail__time {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.report-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-meta__row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 10px;
  font-size: 13px;
}

.report-meta__row dt {
  color: var(--fp-muted);
}

.report-meta__row dd {
  margin: 0;
  color: var(--fp-text);
  word-break: break-word;
}

.report-plain-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.report-target-box {
  padding: 12px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-target-box__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--fp-head);
}

.report-target-box__title {
  margin: 0;
  font-weight: 600;
  color: var(--fp-title);
}

.report-target-box__snippet {
  margin: 0;
  font-size: 13px;
  color: var(--fp-text);
  max-height: 180px;
  overflow-y: auto;
}

.report-target-box__url {
  font-size: 12px;
  color: var(--fp-muted);
  word-break: break-all;
}

.report-target-box__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}

.report-actions-box {
  padding-top: 12px;
  border-top: 1px solid var(--fp-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-actions-box__note {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.report-guard-note {
  padding: 9px 12px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
  font-size: 12px;
  font-weight: 500;
}

.report-actions-box__btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 1024px) {
  .report-layout {
    grid-template-columns: 1fr;
  }

  .report-detail {
    position: static;
  }
}
.report-layout.is-single-column { grid-template-columns: minmax(0, 1fr); }
</style>
