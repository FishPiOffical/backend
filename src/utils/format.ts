/**
 * 管理后台公共格式化、枚举映射及旧后台兼容链接工具函数。
 */

export function formatDateTime(ts: number | undefined | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) {
    return '未知'
  }
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) {
    return '未知'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '未知'
  }
  return value.toLocaleString('zh-CN')
}

export function getLegacyAdminUrl(path: string): string {
  const base = (import.meta.env.VITE_LEGACY_ADMIN_BASE || '').replace(/\/+$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalized}` : normalized
}

export interface StatusMeta {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
}

export function getUserStatusMeta(status: number): StatusMeta {
  switch (status) {
    case 0:
      return { label: '正常', tone: 'success' }
    case 1:
      return { label: '封禁', tone: 'danger' }
    case 2:
      return { label: '未验证', tone: 'warning' }
    case 3:
      return { label: '登录失效', tone: 'warning' }
    case 4:
      return { label: '永久停用', tone: 'danger' }
    default:
      return { label: '未知状态', tone: 'neutral' }
  }
}

export function getReportStatusMeta(handled: number): StatusMeta {
  switch (handled) {
    case 0:
      return { label: '待处理', tone: 'warning' }
    case 1:
      return { label: '已处理', tone: 'success' }
    case 2:
      return { label: '已忽略', tone: 'neutral' }
    default:
      return { label: '未知', tone: 'neutral' }
  }
}

export function getIdentityStatusMeta(status: string): StatusMeta {
  switch (status) {
    case 'pending':
      return { label: '待审核', tone: 'warning' }
    case 'approved':
      return { label: '已通过', tone: 'success' }
    case 'rejected':
      return { label: '已驳回', tone: 'danger' }
    default:
      return { label: '未知', tone: 'neutral' }
  }
}
