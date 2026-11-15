<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchIdentityReviewApplications,
  openIdentityMaterialBinary,
  submitIdentityDecision,
  type IdentityApplicationItem,
  type PaginationInfo,
} from '@/api/admin'
import { ApiError, IdempotencyTracker, isUnknownOutcomeError } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatDateTime, getIdentityStatusMeta } from '@/utils/format'

/**
 * 企业认证审核视图（接入既有 V3 接口）：
 * 1. 列表页绝不返回认证材料二进制数据，且严格禁止自动预拉取或选中自动打开；
 * 2. 点击“打开一次性认证材料”前二次告知原图消费风险，仅用户确认后触发一次请求且永不自动重试；
 * 3. 在组件卸载、切换行或 sessionEpoch 变更时立即回收内存中的 Blob URL；
 * 4. 仅当材料已在服务端打开或本次会话已打开时允许提交审批结论，并绑定幂等键保护。
 */
type StatusFilter = 'pending' | 'approved' | 'rejected'

interface PreviewPayload {
  applicationId: string
  objectUrl: string
  contentType: string
  openedAt: number
}

interface PendingDecisionOp {
  applicationId: string
  status: 'approved' | 'rejected'
  note: string
  idempotencyKey: string
  title: string
  description: string
  summaryItems: Array<{ label: string; value: string }>
  danger: boolean
  confirmText: string
}

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const statusFilter = ref<StatusFilter>('pending')
const page = ref(1)
const pageSize = 20

const list = ref<IdentityApplicationItem[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })
const selectedId = ref('')

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

// 一次性材料预览状态：不持久化，不在切行后保留
const openingMaterial = ref(false)
const materialError = ref('')
const confirmOpenMaterialTarget = ref<IdentityApplicationItem | null>(null)
const currentPreview = ref<PreviewPayload | null>(null)
const sessionOpenedMap = reactive<Record<string, boolean>>({})

// 审批结论表单
const decisionStatus = ref<'approved' | 'rejected'>('approved')
const decisionNote = ref('')
const submitting = ref(false)
const actionMessage = ref('')
const actionError = ref('')

const pendingDecision = ref<PendingDecisionOp | null>(null)
const unknownRecovery = ref<PendingDecisionOp | null>(null)
const decisionTracker = new IdempotencyTracker('identity-review-decision')

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

const selectedItem = computed<IdentityApplicationItem | null>(() => {
  if (!list.value.length) return null
  return list.value.find((item) => item.id === selectedId.value) ?? list.value[0] ?? null
})

const hasOpenedSelectedMaterial = computed(() => {
  const item = selectedItem.value
  if (!item) return false
  return item.materialReadAt > 0 || Boolean(sessionOpenedMap[item.id])
})

const canSubmitDecision = computed(() => {
  const item = selectedItem.value
  if (!item || item.status !== 'pending' || !hasOpenedSelectedMaterial.value) {
    return false
  }
  if (decisionStatus.value === 'rejected' && !decisionNote.value.trim()) {
    return false
  }
  return true
})

const isPreviewImage = computed(() => Boolean(currentPreview.value?.contentType.startsWith('image/')))
const isPreviewPdf = computed(() => Boolean(currentPreview.value?.contentType.includes('pdf')))

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && list.value.length === 0) return 'loading'
  if (loadError.value && list.value.length === 0) return 'error'
  if (!loading.value && list.value.length === 0) {
    return statusFilter.value === 'pending' ? 'empty' : 'filtered-empty'
  }
  return 'ready'
})

function hasReviewerPermission(): boolean {
  return Boolean(auth.capabilities?.isIdentityReviewer)
}

function revokePreview(): void {
  if (currentPreview.value?.objectUrl) {
    URL.revokeObjectURL(currentPreview.value.objectUrl)
  }
  currentPreview.value = null
  materialError.value = ''
}

function selectRow(item: IdentityApplicationItem): void {
  if (selectedId.value !== item.id) {
    revokePreview()
    selectedId.value = item.id
    decisionStatus.value = 'approved'
    decisionNote.value = ''
    actionError.value = ''
  }
}

async function loadApplications(keepSelection = true): Promise<void> {
  if (!hasReviewerPermission()) {
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
    const res = await fetchIdentityReviewApplications({
      status: statusFilter.value,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
    if (prevId && res.list.some((item) => item.id === prevId)) {
      selectedId.value = prevId
    } else {
      if (currentPreview.value && currentPreview.value.applicationId !== res.list[0]?.id) {
        revokePreview()
      }
      selectedId.value = res.list[0]?.id ?? ''
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
      loadError.value = err instanceof Error ? err.message : '加载企业认证队列失败'
    }
  } finally {
    loading.value = false
  }
}

function changeTab(next: StatusFilter): void {
  if (statusFilter.value === next) return
  revokePreview()
  statusFilter.value = next
  page.value = 1
  void loadApplications(false)
}

function handlePageChange(nextPage: number): void {
  revokePreview()
  page.value = nextPage
  void loadApplications(false)
}

function requestOpenMaterial(item: IdentityApplicationItem): void {
  if (openingMaterial.value) return
  materialError.value = ''
  confirmOpenMaterialTarget.value = item
}

async function confirmAndFetchMaterial(): Promise<void> {
  const target = confirmOpenMaterialTarget.value
  if (!target || openingMaterial.value) return

  openingMaterial.value = true
  materialError.value = ''
  confirmOpenMaterialTarget.value = null

  try {
    const result = await openIdentityMaterialBinary(target.id)
    revokePreview()
    const objectUrl = URL.createObjectURL(result.blob)
    currentPreview.value = {
      applicationId: target.id,
      objectUrl,
      contentType: result.contentType || result.blob.type || 'application/octet-stream',
      openedAt: Date.now(),
    }
    sessionOpenedMap[target.id] = true
    await loadApplications(true)
  } catch (err) {
    // 一次性材料打开失败时严禁自动重试
    if (err instanceof ApiError) {
      materialError.value = `打开一次性材料失败：${err.message}（HTTP ${err.status}，已禁止自动重试）。`
      if (err.status === 409) {
        await loadApplications(true)
      }
    } else {
      materialError.value =
        err instanceof Error ? `打开一次性材料失败：${err.message}` : '打开一次性材料失败，请手动核实后操作。'
    }
  } finally {
    openingMaterial.value = false
  }
}

function openDecisionConfirm(): void {
  const item = selectedItem.value
  if (!item || !canSubmitDecision.value) {
    return
  }
  if (unknownRecovery.value) {
    actionError.value = '存在结果未知的待核对审核结论，请先在上方完成核对。'
    return
  }

  const trimmedNote = decisionNote.value.trim()
  const key = decisionTracker.resolve({
    id: item.id,
    status: decisionStatus.value,
    note: trimmedNote,
  })

  pendingDecision.value = {
    applicationId: item.id,
    status: decisionStatus.value,
    note: trimmedNote,
    idempotencyKey: key,
    title: decisionStatus.value === 'approved' ? '确认通过企业认证申请' : '确认驳回企业认证申请',
    description:
      decisionStatus.value === 'approved'
        ? '提交通过后该申请将进入已通过归档状态。'
        : '提交驳回后请确保审核备注准确清晰地说明驳回原因。',
    summaryItems: [
      { label: '申请 ID', value: item.id },
      { label: '审批结论', value: decisionStatus.value === 'approved' ? '通过' : '驳回' },
      { label: '审核备注', value: trimmedNote || '无' },
    ],
    danger: decisionStatus.value === 'rejected',
    confirmText: decisionStatus.value === 'approved' ? '确认通过' : '确认驳回',
  }
}

async function executeDecision(op: PendingDecisionOp): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    const res = await submitIdentityDecision(
      op.applicationId,
      { status: op.status, note: op.note },
      op.idempotencyKey,
    )
    pendingDecision.value = null
    unknownRecovery.value = null
    decisionTracker.reset()
    decisionNote.value = ''
    revokePreview()
    actionMessage.value = `申请 #${res.id} 已完成${res.status === 'approved' ? '通过' : '驳回'}审核。`
    await loadApplications(false)
  } catch (err) {
    pendingDecision.value = null
    if (isUnknownOutcomeError(err)) {
      unknownRecovery.value = op
      actionError.value =
        err instanceof Error
          ? `${err.message}。已保留原幂等键与审批结论，可点击按原幂等键恢复确认或重新加载列表。`
          : '审批提交结果未知，已保留原幂等键。'
    } else {
      unknownRecovery.value = null
      decisionTracker.reset()
      if (err instanceof ApiError) {
        actionError.value = `${err.message}（HTTP ${err.status}）`
        if (err.status === 409) {
          await loadApplications(true)
        }
      } else {
        actionError.value = err instanceof Error ? err.message : '提交审核结论失败'
      }
    }
  } finally {
    submitting.value = false
  }
}

function dismissUnknownRecovery(): void {
  unknownRecovery.value = null
  decisionTracker.reset()
}

function resetToPending(): void {
  statusFilter.value = 'pending'
  page.value = 1
  revokePreview()
  void loadApplications(false)
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/review/identity' } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => auth.sessionEpoch,
  () => {
    revokePreview()
    confirmOpenMaterialTarget.value = null
    pendingDecision.value = null
    unknownRecovery.value = null
    decisionTracker.reset()
    list.value = []
    selectedId.value = ''
    Object.keys(sessionOpenedMap).forEach((k) => delete sessionOpenedMap[k])
    actionMessage.value = ''
    actionError.value = ''
    if (auth.isLoggedIn && hasReviewerPermission()) {
      void loadApplications(false)
    }
  },
)

onBeforeUnmount(() => {
  revokePreview()
})

onMounted(() => {
  void loadApplications(false)
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">企业认证审核</h1>
        <p class="admin-page__subtitle">
          严守一次性阅读协议：仅人工主动点击确认后拉取认证原图；切行或退出将立即销毁本地临时预览。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadApplications(true)">
          {{ loading ? '加载中...' : '刷新队列' }}
        </button>
      </div>
    </header>

    <section class="admin-panel">
      <div class="admin-tabs" role="tablist" aria-label="认证申请状态">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          class="admin-tab"
          :class="{ 'is-active': statusFilter === tab.value }"
          :aria-selected="statusFilter === tab.value"
          @click="changeTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <div v-if="unknownRecovery" class="id-banner id-banner--warning" role="alert">
      <div>
        <strong>待核对审核结论：申请 #{{ unknownRecovery.applicationId }}</strong>
        <p>
          {{ actionError }} <br />
          <span class="admin-mono">Idempotency-Key: {{ unknownRecovery.idempotencyKey }}</span>
        </p>
      </div>
      <div class="id-banner__actions">
        <button
          type="button"
          class="admin-btn admin-btn--sm admin-btn--primary"
          :disabled="submitting"
          @click="executeDecision(unknownRecovery)"
        >
          {{ submitting ? '核对中...' : '按原幂等键重试确认' }}
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="loading" @click="loadApplications(true)">
          刷新申请列表
        </button>
        <button type="button" class="admin-btn admin-btn--sm" :disabled="submitting" @click="dismissUnknownRecovery">
          已知晓并清除提示
        </button>
      </div>
    </div>

    <div v-else-if="actionError" class="id-banner id-banner--danger" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionError = ''">关闭</button>
    </div>

    <div v-if="actionMessage" class="id-banner id-banner--success" role="status">
      <span>{{ actionMessage }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="actionMessage = ''">关闭</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadApplications(true)"
      @reset-filters="resetToPending"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="id-layout" :class="{ 'is-single-column': !selectedItem }">
        <div class="id-list-col">
          <div class="admin-table-wrap">
            <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>申请 ID</th>
                  <th>认证类型</th>
                  <th>提交时间</th>
                  <th>材料查阅</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in list"
                  :key="item.id"
                  class="id-row"
                  :class="{ 'is-selected': selectedItem?.id === item.id }"
                  tabindex="0"
                  @click="selectRow(item)"
                  @keydown.enter.prevent="selectRow(item)"
                >
                  <td>
                    <StatusBadge
                      :tone="getIdentityStatusMeta(item.status).tone"
                      :label="getIdentityStatusMeta(item.status).label"
                    />
                  </td>
                  <td class="admin-mono">{{ item.id }}</td>
                  <td>{{ item.type === 'enterprise' ? '企业认证' : item.type }}</td>
                  <td class="admin-mono">{{ formatDateTime(item.createdAt) }}</td>
                  <td>
                    <StatusBadge
                      :tone="item.materialReadAt > 0 || sessionOpenedMap[item.id] ? 'info' : 'neutral'"
                      :label="item.materialReadAt > 0 || sessionOpenedMap[item.id] ? '已查看' : '未打开'"
                    />
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
        </div>

        <aside v-if="selectedItem" class="admin-panel id-detail">
          <header class="id-detail__head">
            <div>
              <h2 class="id-detail__title">申请 #{{ selectedItem.id }}</h2>
              <p class="id-detail__sub admin-mono">提交时间：{{ formatDateTime(selectedItem.createdAt) }}</p>
            </div>
            <StatusBadge
              :tone="getIdentityStatusMeta(selectedItem.status).tone"
              :label="getIdentityStatusMeta(selectedItem.status).label"
            />
          </header>

          <dl class="id-meta">
            <div class="id-meta__row">
              <dt>申请人 ID</dt>
              <dd class="admin-mono">{{ selectedItem.applicantId || '-' }}</dd>
            </div>
            <div class="id-meta__row">
              <dt>材料查阅时间</dt>
              <dd class="admin-mono">{{ selectedItem.materialReadAt > 0 ? formatDateTime(selectedItem.materialReadAt) : '尚未查看' }}</dd>
            </div>
            <div class="id-meta__row">
              <dt>审批时间</dt>
              <dd class="admin-mono">{{ selectedItem.reviewedAt > 0 ? formatDateTime(selectedItem.reviewedAt) : '待审批' }}</dd>
            </div>
            <div v-if="selectedItem.note" class="id-meta__row">
              <dt>历史备注</dt>
              <dd>{{ selectedItem.note }}</dd>
            </div>
          </dl>

          <!-- 一次性材料安全查看面板 -->
          <section class="id-material-box" aria-label="一次性材料核验区">
            <div class="id-material-box__head">
              <strong>认证证明材料（一次性查看）</strong>
            </div>

            <p class="id-material-box__warn">
              安全提醒：原图文件仅允许打开一次；服务端返回二进制流后将立刻销毁原件，请勿在未准备好审核时误触。
            </p>

            <div v-if="materialError" class="id-material-err" role="alert">
              {{ materialError }}
            </div>

            <!-- 当前内存预览 -->
            <div v-if="currentPreview && currentPreview.applicationId === selectedItem.id" class="id-preview">
              <div class="id-preview__meta">
                <span>本次预览已加载（{{ currentPreview.contentType }}），离开当前申请或刷新页面将失效。</span>
                <button type="button" class="admin-btn admin-btn--sm" @click="revokePreview">收起本地预览</button>
              </div>
              <img
                v-if="isPreviewImage"
                :src="currentPreview.objectUrl"
                alt="企业认证一次性材料预览"
                class="id-preview__img"
              />
              <iframe
                v-else-if="isPreviewPdf"
                :src="currentPreview.objectUrl"
                title="企业认证材料 PDF 预览"
                class="id-preview__frame"
              />
              <a
                v-else
                :href="currentPreview.objectUrl"
                :download="`identity-material-${selectedItem.id}`"
                class="admin-btn admin-btn--sm"
              >
                下载临时预览文件
              </a>
            </div>

            <!-- 显式打开按钮：仅待审核且未消费过才显示打开入口 -->
            <div v-else-if="selectedItem.status === 'pending' && !hasOpenedSelectedMaterial">
              <button
                type="button"
                class="admin-btn admin-btn--warning-outline"
                :disabled="openingMaterial"
                @click="requestOpenMaterial(selectedItem)"
              >
                {{ openingMaterial ? '正在安全拉取原图...' : '打开一次性认证材料' }}
              </button>
            </div>

            <div v-else class="id-material-consumed">
              {{
                selectedItem.materialReadAt > 0
                  ? `服务端原图已于 ${formatDateTime(selectedItem.materialReadAt)} 被消费销毁，无法再次拉取。`
                  : '该申请已归档，无一次性材料可预览。'
              }}
            </div>
          </section>

          <!-- 审批结论表单 -->
          <section v-if="selectedItem.status === 'pending'" class="id-decision-box" aria-label="审批结论">
            <h3 class="id-decision-box__title">提交审核结论</h3>
            <p v-if="!hasOpenedSelectedMaterial" class="id-decision-box__lock">
              必须先打开查看认证材料后，方可执行“通过”或“驳回”。
            </p>

            <fieldset class="admin-choice-group"><legend>审核结论</legend>
              <label class="admin-choice">
                <input v-model="decisionStatus" type="radio" name="identity-decision" value="approved" :disabled="!hasOpenedSelectedMaterial || submitting" />
                <span>通过申请</span>
              </label>
              <label class="admin-choice">
                <input v-model="decisionStatus" type="radio" name="identity-decision" value="rejected" :disabled="!hasOpenedSelectedMaterial || submitting" />
                <span>驳回申请</span>
              </label>
            </fieldset>

            <div class="id-decision-field">
              <label for="id-note-input">审核备注{{ decisionStatus === 'rejected' ? '（驳回必填）' : '（可选）' }}</label>
              <textarea
                id="id-note-input"
                v-model="decisionNote"
                class="admin-textarea"
                :disabled="!hasOpenedSelectedMaterial || submitting"
                placeholder="填写核验说明或驳回理由..."
              />
            </div>

            <button
              type="button"
              class="admin-btn"
              :class="decisionStatus === 'rejected' ? 'admin-btn--danger' : 'admin-btn--primary'"
              :disabled="!canSubmitDecision || submitting"
              @click="openDecisionConfirm"
            >
              {{ submitting ? '提交中...' : decisionStatus === 'approved' ? '提交通过结论' : '提交驳回结论' }}
            </button>
          </section>
        </aside>
      </div>
    </PageStateView>

    <!-- 一次性查看前二次提醒弹窗 -->
    <ConfirmDialog
      :open="Boolean(confirmOpenMaterialTarget)"
      title="确认打开一次性认证材料"
      description="认证材料属于高敏感一次阅读凭证：请求成功后服务端将立即永久销毁该文件，后续刷新页面或切换账号均无法再次拉取。确认现在拉取并开始审批吗？"
      :summary-items="
        confirmOpenMaterialTarget
          ? [
              { label: '申请 ID', value: confirmOpenMaterialTarget.id },
              { label: '提交时间', value: formatDateTime(confirmOpenMaterialTarget.createdAt) },
            ]
          : []
      "
      danger
      confirm-text="我已知晓风险，立即打开"
      :pending="openingMaterial"
      @cancel="confirmOpenMaterialTarget = null"
      @confirm="confirmAndFetchMaterial"
    />

    <!-- 提交审批结论确认弹窗 -->
    <ConfirmDialog
      :open="Boolean(pendingDecision)"
      :title="pendingDecision?.title || ''"
      :description="pendingDecision?.description || ''"
      :summary-items="pendingDecision?.summaryItems || []"
      :danger="pendingDecision?.danger || false"
      :confirm-text="pendingDecision?.confirmText || '确认提交'"
      :pending="submitting"
      @cancel="pendingDecision = null"
      @confirm="pendingDecision && executeDecision(pendingDecision)"
    />
  </div>
</template>

<style scoped>
.id-banner {
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

.id-banner p {
  margin: 4px 0 0;
}

.id-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.id-banner--warning {
  border-color: var(--fp-warning);
  background: var(--fp-warning-soft);
}

.id-banner--danger {
  border-color: var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
}

.id-banner--success {
  border-color: var(--fp-primary);
  background: var(--fp-primary-soft);
  color: var(--fp-title);
}

.id-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}

.id-list-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.id-row {
  cursor: pointer;
}

.id-row.is-selected {
  background: var(--fp-primary-soft);
}

.id-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.id-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.id-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fp-title);
}

.id-detail__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.id-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.id-meta__row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
}

.id-meta__row dt {
  color: var(--fp-muted);
}

.id-meta__row dd {
  margin: 0;
  color: var(--fp-text);
  word-break: break-word;
}

.id-material-box {
  padding: 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-border);
  background: var(--fp-elevated);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.id-material-box__warn {
  margin: 0;
  font-size: 12px;
  color: var(--fp-warning);
}

.id-material-err {
  padding: 8px 10px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
  font-size: 12px;
}

.id-material-consumed {
  font-size: 12px;
  color: var(--fp-muted);
}

.id-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.id-preview__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--fp-muted);
}

.id-preview__img {
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: var(--fp-radius-sm);
  border: 1px solid var(--fp-border);
  background: var(--fp-bg);
}

.id-preview__frame {
  width: 100%;
  height: 420px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius-sm);
}

.id-decision-box {
  padding-top: 12px;
  border-top: 1px solid var(--fp-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.id-decision-box__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fp-title);
}

.id-decision-box__lock {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-warning-soft);
  font-size: 12px;
  color: var(--fp-title);
}

.id-decision-radios {
  display: flex;
  gap: 18px;
}

.id-radio-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.id-decision-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.id-decision-field label {
  font-size: 12px;
  color: var(--fp-head);
}

@media (max-width: 1024px) {
  .id-layout {
    grid-template-columns: 1fr;
  }
}
.id-layout.is-single-column { grid-template-columns: minmax(0, 1fr); }
</style>
