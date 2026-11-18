import { ref, shallowRef } from 'vue'
import { ApiError, getAuthContextVersion, isUnknownOutcomeError, onAccessTokenChange, requestData, type RequestOptions } from '@/api/http'

// 仅内存保留冻结请求；跨页面保持，退出或切换身份后清除，普通令牌刷新不清除。
interface PendingAssetWrite { path: string; options: RequestOptions; epoch: number }
export const pendingAssetWrite = shallowRef<PendingAssetWrite | null>(null)
export const assetRecoveryBusy = ref(false)
export const assetRecoveryMessage = ref('')
export const assetRecoveryReceipt = shallowRef<unknown>(null)
let epoch = getAuthContextVersion()
onAccessTokenChange(() => {
  const next = getAuthContextVersion()
  if (next !== epoch) {
    pendingAssetWrite.value = null
    assetRecoveryBusy.value = false
    assetRecoveryMessage.value = ''
    assetRecoveryReceipt.value = null
    epoch = next
  }
})

async function execute<T>(task: PendingAssetWrite): Promise<T> {
  assetRecoveryBusy.value = true
  try {
    const result = await requestData<T>(task.path, task.options)
    if (task.epoch !== getAuthContextVersion()) throw new ApiError('账号已变化', 401, 'stale_session')
    pendingAssetWrite.value = null
    return result
  } catch (error) {
    if (task.epoch === getAuthContextVersion()) {
      // 已有未知结果时，权限/业务拒绝也不能证明上次未提交，保留原任务供核实。
      assetRecoveryMessage.value = error instanceof Error ? error.message : '操作结果待确认'
      if (!(error instanceof ApiError) || isUnknownOutcomeError(error)) pendingAssetWrite.value = task
    }
    throw error
  } finally {
    if (task.epoch === getAuthContextVersion()) assetRecoveryBusy.value = false
  }
}

export async function assetRequestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const recoverable = /^\/api\/v3\/admin\/(vip|coupons|medals|points|bags|salary|appearance|client-downloads)(\/|$)/.test(path)
    || path === '/api/v3/admin/fish-games/import' || path === '/api/v3/admin/repeater/items'
    || path === '/api/v3/admin/pets/coffee'
    || /^\/api\/v3\/admin\/pets\/\d{1,19}\/moderate-name$/.test(path)
  if (!options.idempotentWrite || !recoverable) {
    return requestData<T>(path, options)
  }
  if (pendingAssetWrite.value || assetRecoveryBusy.value) {
    throw new ApiError('请先恢复待确认的后台操作，再提交新的操作', 409, 'asset_recovery_required')
  }
  assetRecoveryMessage.value = ''
  assetRecoveryReceipt.value = null
  return execute<T>({ path, options: { ...options, headers: new Headers(options.headers) }, epoch: getAuthContextVersion() })
}

export async function recoverAssetWrite(): Promise<void> {
  const task = pendingAssetWrite.value
  if (!task || assetRecoveryBusy.value) return
  try {
    const result = await execute<unknown>(task)
    assetRecoveryReceipt.value = result
    const legacy = typeof result === 'object' && result !== null && 'legacyReceipt' in result && result.legacyReceipt === true
    assetRecoveryMessage.value = legacy
      ? '已找到历史回执。旧版没有记录完整请求内容，请对照当前业务状态核对。'
      : '原操作已确认。请刷新当前列表查看最新状态；批量结果见下方回执。'
  } catch { /* 错误已写入恢复提示，继续保留原请求。 */ }
}

// 刷新会清空内存回执，存在未决请求时提示操作者先完成确认。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (pendingAssetWrite.value || assetRecoveryBusy.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}
