import { requestData } from '@/api/http'
import { assetRequestData } from '@/stores/assetRecovery'
import type { PaginationInfo } from '@/api/admin'

export const clientGroups = {
  desktop: '桌面客户端', mobile: '移动客户端', tools: '插件与效率工具',
  terminal: '命令行客户端', more: '更多选择',
} as const

export const clientStatuses = { active: '已上架', retired: '已下架', comingSoon: '即将推出' } as const
export interface ClientDraft {
  name: string
  icon: string
  group: keyof typeof clientGroups
  status: keyof typeof clientStatuses
  authors: { name: string; userName: string }[]
  links: { label: string; href: string }[]
  recommended: boolean
  sortOrder: number
}
export interface AdminClient extends ClientDraft { id: string; revision: number }
export const repeaterKinds = { joke: '段子', kfc: '疯狂星期四', fish: '鱼类科普' } as const
export interface RepeaterDraft { type: keyof typeof repeaterKinds; content: string }
export interface AdminRepeater extends RepeaterDraft { id: string; status: 0 | 1; createdTime: number }

const clientPath = '/api/v3/admin/client-downloads'
const repeaterPath = '/api/v3/admin/repeater/items'

function read<T>(path: string, page: number, signal: AbortSignal) {
  return requestData<{ list: T[]; pagination: PaginationInfo }>(path + '?p=' + page + '&size=20', {
    cache: 'no-store', signal,
  })
}

export const listClients = (page: number, signal: AbortSignal) => read<AdminClient>(clientPath, page, signal)
export const listRepeater = (page: number, signal: AbortSignal) => read<AdminRepeater>(repeaterPath, page, signal)

export function saveClient(id: string, revision: number, client: ClientDraft) {
  return assetRequestData<{ clientId: string }>(clientPath + '/' + encodeURIComponent(id), {
    method: 'PUT', body: JSON.stringify({ revision, client }),
    headers: { 'Idempotency-Key': crypto.randomUUID() }, idempotentWrite: true,
  })
}

export function addRepeater(draft: RepeaterDraft) {
  return assetRequestData<{ repeaterId: string }>(repeaterPath, {
    method: 'POST', body: JSON.stringify(draft),
    headers: { 'Idempotency-Key': crypto.randomUUID() }, idempotentWrite: true,
  })
}
