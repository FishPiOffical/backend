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

/**
 * 文章状态枚举（对应 Article.java）：0 正常、1 已封禁、2 已锁定。
 */
export function getArticleStatusMeta(status: number): StatusMeta {
  switch (status) {
    case 0:
      return { label: '正常', tone: 'success' }
    case 1:
      return { label: '已封禁', tone: 'danger' }
    case 2:
      return { label: '已锁定', tone: 'warning' }
    default:
      return { label: '未知状态', tone: 'neutral' }
  }
}

/**
 * 文章类型枚举（对应 Article.java）：0 普通帖、1 站内讨论、2 同城广播、3 思绪、5 问答、6 长文专栏。
 */
export function getArticleTypeMeta(type: number): StatusMeta {
  switch (type) {
    case 0:
      return { label: '普通帖', tone: 'neutral' }
    case 1:
      return { label: '站内讨论', tone: 'info' }
    case 2:
      return { label: '同城广播', tone: 'info' }
    case 3:
      return { label: '思绪', tone: 'neutral' }
    case 5:
      return { label: '问答', tone: 'warning' }
    case 6:
      return { label: '长文专栏', tone: 'success' }
    default:
      return { label: `类型 #${type}`, tone: 'neutral' }
  }
}

/**
 * 评论与清风明月通用二态状态枚举：0 正常、1 已封禁。
 */
export function getBinaryContentStatusMeta(status: number): StatusMeta {
  switch (status) {
    case 0:
      return { label: '正常', tone: 'success' }
    case 1:
      return { label: '已封禁', tone: 'danger' }
    default:
      return { label: '未知状态', tone: 'neutral' }
  }
}
