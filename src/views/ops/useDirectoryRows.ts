import { onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { PaginationInfo } from '@/api/admin'

export function useDirectoryRows<T>(read: (page: number, signal: AbortSignal) =>
  Promise<{ list: T[]; pagination: PaginationInfo }>) {
  const auth = useAuthStore()
  const rows = shallowRef<T[]>([])
  const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 0 })
  const error = ref('')
  const loading = ref(false)
  let request: AbortController | undefined

  async function load(page = pagination.value.p) {
    request?.abort()
    const controller = new AbortController()
    request = controller
    error.value = ''
    loading.value = true
    try {
      const result = await read(page, controller.signal)
      if (!controller.signal.aborted) {
        rows.value = result.list
        pagination.value = result.pagination
      }
    } catch (cause) {
      if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : '读取列表失败'
    } finally {
      if (request === controller) loading.value = false
    }
  }

  onMounted(load)
  watch(() => auth.sessionEpoch, () => {
    request?.abort()
    rows.value = []
    error.value = ''
    if (auth.capabilities?.isAdmin) void load(1)
  }, { flush: 'sync' })
  onScopeDispose(() => request?.abort())

  return { rows, pagination, error, loading, load }
}
