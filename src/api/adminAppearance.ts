import { ApiError, requestData } from '@/api/http'
import { assetRequestData } from '@/stores/assetRecovery'
import { decodeBubbleStyle, isBubbleImage, isCustomBubbleId, type BubbleStyle } from '@/utils/bubbleStyle'

export type BubbleAccess = 'free' | 'vip' | 'points'
export interface BubbleDraft {
  name: string
  access: BubbleAccess
  price7: number
  price30: number
  style: BubbleStyle
}
export interface AdminBubble {
  id: string
  revision: number
  publishedRevision: number
  active: boolean
  hasDraftChanges: boolean
  draft: BubbleDraft
}
export type BubbleCommand =
  | { action: 'save'; revision: number; draft: BubbleDraft }
  | { action: 'publish' | 'unpublish'; revision: number }

const endpoint = '/api/v3/admin/appearance/bubbles'
export async function adminBubbles(page: number, signal: AbortSignal) {
  const result = await requestData<{ list: AdminBubble[]; pagination: { p: number; size: number; total: number; pageCount: number } }>(
    endpoint + '?p=' + page + '&size=20', { signal },
  )
  if (!result?.pagination || !Array.isArray(result.list)) throw new ApiError('后台气泡列表响应无效', 502)
  const list = result.list.map(item => {
    const style = decodeBubbleStyle(item?.draft?.style)
    if (!isCustomBubbleId(item?.id) || !style) throw new ApiError('后台气泡配置响应无效', 502)
    return { ...item, draft: { ...item.draft, style } }
  })
  return { list, pagination: result.pagination }
}
export function saveAdminBubble(id: string, command: BubbleCommand, key: string) {
  return assetRequestData<AdminBubble>(endpoint + '/' + encodeURIComponent(id), {
    method: 'PUT', body: JSON.stringify(command), headers: { 'Idempotency-Key': key }, idempotentWrite: true,
  })
}

const extensions: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/avif': 'avif' }
export async function uploadBubbleIcon(file: File, signal: AbortSignal) {
  const extension = extensions[file.type]
  if (!extension || !file.size || file.size > 512 * 1024) throw new ApiError('请选择 512 KB 以内的 PNG、WebP、JPEG 或 AVIF 图片', 422)
  const grant = await requestData<{ ticket?: string; tokenType?: string; fieldName?: string; uploadURL?: string }>('/api/v3/uploads/tickets', {
    method: 'POST', body: '{}', cache: 'no-store', signal,
  })
  if (!grant.ticket || !/^\S{1,16384}$/.test(grant.ticket) || grant.tokenType !== 'Bearer' || grant.fieldName !== 'file'
      || grant.uploadURL !== 'https://pic.fishpi.cn/api/v1/files') throw new ApiError('图床上传地址或凭据无效', 502)
  const name = 'bubble-icon.' + extension
  const form = new FormData()
  form.append('file', file, name)
  const response = await fetch('/rhypic-upload/api/v1/files', {
    method: 'POST', body: form, headers: { Authorization: 'Bearer ' + grant.ticket },
    credentials: 'omit', redirect: 'error', signal,
  })
  const result = await response.json()
  const url = result?.data?.succMap?.[name]
  if (!response.ok || result?.code !== 0 || !url || !isBubbleImage(url)) throw new ApiError('图床未返回可用的角标图片', 502)
  return url
}
