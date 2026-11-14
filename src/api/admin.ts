import { requestBinary, requestData } from './http'

/**
 * Rhythm V3 管理后台核心业务接口定义与客户端调用封装。
 */

export type MenuKey =
  | 'workbench'
  | 'review'
  | 'content'
  | 'users'
  | 'membershipAssets'
  | 'communityOps'
  | 'professionsPets'
  | 'openPlatform'
  | 'systemSecurity'

export interface AdminCapabilities {
  canAccessAdmin: boolean
  canEnterConsole: boolean
  userId: string
  userName: string
  userNickname: string
  avatarUrl: string
  roleId: string
  roleName: string
  isAdmin: boolean
  isSecurityOperator: boolean
  isIdentityReviewer: boolean
  rhypicEnabled: boolean
  permissions: Record<string, boolean>
  menus: Record<MenuKey, boolean>
  actions: {
    reportHandle: boolean
    reportIgnore: boolean
    repeaterRemove: boolean
    identityReview: boolean
    userEditBasic: boolean
    userEditAdvanced: boolean
    userEditRole: boolean
    userDeactivate: boolean
    userRemoveMfa: boolean
    oauthManage: boolean
  }
  fetchedAt: number
}

export interface PaginationInfo {
  p: number
  size: number
  total: number
  pageCount: number
}

export interface AdminOperationItem {
  oId: string
  operationUserId: string
  operationUserName: string
  operationCode: number
  operationCodeLabel: string
  operationDataId: string
  operationCreated: number
  operationIP: string
}

export interface AdminDashboardData {
  capabilities: AdminCapabilities
  todos: {
    pendingReports: number | null
    pendingIdentityApplications: number | null
  }
  communityStats: {
    memberCount: number | null
    articleCount: number | null
    commentCount: number | null
    domainCount: number | null
    tagCount: number | null
    linkCount: number | null
    maxOnlineVisitorCount: number | null
  }
  recentOperations: AdminOperationItem[]
  meta: {
    fetchedAt: number
    source: string
    statsNote: string
  }
}

export interface AdminReportTarget {
  id: string
  dataType: number
  exists: boolean
  title: string
  snippet: string
  url: string
  status: number
  statusLabel: string
  removable: boolean
  revoked: boolean
}

export interface AdminReportItem {
  oId: string
  createdAt: number
  reportUserId: string
  reporterName: string
  reporterNickname: string
  isOwnReport: boolean
  reportDataId: string
  reportDataType: number
  reportDataTypeLabel: string
  reportType: number
  reportTypeLabel: string
  reportMemo: string
  reportHandled: number
  target: AdminReportTarget
}

export interface AdminUserSummary {
  oId: string
  userNo: string
  userName: string
  userNickname: string
  userEmail: string
  userPhoneMasked: string
  userAvatarURL: string
  userRole: string
  roleName: string
  userStatus: number
  userPoint: number
  userUsedPoint: number
  userLatestLoginTime: number
  userLatestLoginIP: string
  createdAt: number
  hasMfa: boolean
  isSelf: boolean
}

export interface AdminUserProfile extends AdminUserSummary {
  userURL: string
  userIntro: string
  userTags: string
  userArticleCount: number
  userCommentCount: number
  userTagCount: number
  onlineMinute: number
  userOnlineFlag: boolean
  userCommentStatus: number
  userPointStatus: number
  userFollowerStatus: number
  userFollowingUserStatus: number
}

export interface RoleOption {
  oId: string
  roleName: string
}

export interface AdminUserDetail {
  user: AdminUserProfile
  recentOperations: AdminOperationItem[]
  roleOptions: RoleOption[]
  bagItems: Array<{ name: string; count: number }>
  medals: Array<{
    id?: string
    name: string
    description?: string
    type?: string
    enabled?: boolean
    expireDate?: string
  }>
}

export interface UserUpdatePayload {
  userNickname?: string
  userURL?: string
  userIntro?: string
  userTags?: string
  userEmail?: string
  userStatus?: number
  userCommentStatus?: number
  userPointStatus?: number
  userRole?: string
}

export interface IdentityApplicationItem {
  id: string
  type: 'enterprise'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  materialReadAt: number
  reviewedAt: number
  note: string
  applicantId?: string
}

export interface OAuthClientSummary {
  clientId: string
  name: string
  scope: string
  status: number
}

export interface OAuthClientDetail extends OAuthClientSummary {
  redirects: {
    list: Array<{ uri: string; status: number }>
    pagination: PaginationInfo
  }
}

export async function fetchAdminCapabilities(): Promise<AdminCapabilities> {
  return requestData<AdminCapabilities>('/api/v3/admin/capabilities')
}

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  return requestData<AdminDashboardData>('/api/v3/admin/dashboard')
}

export async function fetchAdminReports(params: {
  status: 'all' | 'pending' | 'handled' | 'ignored'
  dataType: 'all' | '0' | '1' | '2' | '3' | '4'
  p: number
  size: number
}): Promise<{ list: AdminReportItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams({
    status: params.status,
    dataType: params.dataType,
    p: String(params.p),
    size: String(params.size),
  })
  return requestData(`/api/v3/admin/reports?${qs.toString()}`)
}

export async function handleAdminReport(reportId: string, idempotencyKey: string): Promise<{
  reportId: string
  reportHandled: number
  updatedAt: number
}> {
  return requestData(`/api/v3/admin/reports/${encodeURIComponent(reportId)}/handle`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function ignoreAdminReport(reportId: string, idempotencyKey: string): Promise<{
  reportId: string
  reportHandled: number
  updatedAt: number
}> {
  return requestData(`/api/v3/admin/reports/${encodeURIComponent(reportId)}/ignore`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function removeAdminRepeater(repeaterId: string, idempotencyKey: string): Promise<{
  repeaterId: string
  status: number
  removedAt: number
}> {
  return requestData(`/api/v3/admin/repeater/${encodeURIComponent(repeaterId)}/remove`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function fetchAdminUsers(params: {
  keyword?: string
  status?: string
  roleId?: string
  p: number
  size: number
}): Promise<{ list: AdminUserSummary[]; pagination: PaginationInfo; roleOptions: RoleOption[] }> {
  const qs = new URLSearchParams({
    status: params.status || 'all',
    roleId: params.roleId || 'all',
    p: String(params.p),
    size: String(params.size),
  })
  if (params.keyword && params.keyword.trim()) {
    qs.set('keyword', params.keyword.trim())
  }
  return requestData(`/api/v3/admin/users?${qs.toString()}`)
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return requestData<AdminUserDetail>(`/api/v3/admin/users/${encodeURIComponent(userId)}`)
}

export async function updateAdminUser(
  userId: string,
  payload: UserUpdatePayload,
  idempotencyKey: string,
): Promise<{ userId: string; updatedFields: string[]; updatedAt: number; replayed: boolean; detail: AdminUserDetail }> {
  return requestData(`/api/v3/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function deactivateAdminUser(
  userId: string,
  idempotencyKey: string,
): Promise<{ userId: string; userStatus: number; userName: string; deactivatedAt: number; replayed: boolean; detail: AdminUserDetail }> {
  return requestData(`/api/v3/admin/users/${encodeURIComponent(userId)}/deactivate`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function removeAdminUserMfa(
  userId: string,
  idempotencyKey: string,
): Promise<{ userId: string; hasMfa: boolean; updatedAt: number; replayed: boolean; detail: AdminUserDetail }> {
  return requestData(`/api/v3/admin/users/${encodeURIComponent(userId)}/remove-mfa`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

// -----------------------------------------------------------------------------
// 既有 V3 模块接入：企业认证审核 & OAuth 客户端管理
// -----------------------------------------------------------------------------

export async function fetchIdentityReviewApplications(params: {
  status: 'pending' | 'approved' | 'rejected'
  p: number
  size: number
}): Promise<{ list: IdentityApplicationItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams({
    status: params.status,
    p: String(params.p),
    size: String(params.size),
  })
  return requestData(`/api/v3/review/identity-applications?${qs.toString()}`)
}

/**
 * 显式打开一次性企业认证材料：仅由用户主动点击触发，返回 Blob 供安全本地预览。
 */
export async function openIdentityMaterialBinary(applicationId: string): Promise<{
  blob: Blob
  contentType: string
  contentDisposition: string
}> {
  return requestBinary(
    `/api/v3/review/identity-applications/${encodeURIComponent(applicationId)}/material/open`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  )
}

export async function submitIdentityDecision(
  applicationId: string,
  payload: { status: 'approved' | 'rejected'; note: string },
  idempotencyKey: string,
): Promise<{ id: string; status: 'approved' | 'rejected'; reviewedAt: number; note: string }> {
  return requestData(`/api/v3/review/identity-applications/${encodeURIComponent(applicationId)}/decision`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function fetchOAuthClients(p = 1, size = 20): Promise<{
  list: OAuthClientSummary[]
  pagination: PaginationInfo
}> {
  const qs = new URLSearchParams({ p: String(p), size: String(size) })
  return requestData(`/api/v3/admin/oauth/clients?${qs.toString()}`)
}

export async function fetchOAuthClientDetail(clientId: string, p = 1, size = 20): Promise<OAuthClientDetail> {
  const qs = new URLSearchParams({ p: String(p), size: String(size) })
  return requestData(`/api/v3/admin/oauth/clients/${encodeURIComponent(clientId)}?${qs.toString()}`)
}

export async function createOAuthClient(
  payload: { name: string; scope: string; redirectUris: string[] },
  idempotencyKey: string,
): Promise<{ clientId: string; name: string; scope: string; status: number; redirectUris: string[] }> {
  return requestData('/api/v3/admin/oauth/clients', {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function updateOAuthClient(
  clientId: string,
  payload: { name: string; scope: string; redirectUris: string[] },
  idempotencyKey: string,
): Promise<{ clientId: string; name: string; scope: string; status: number; redirectUris: string[] }> {
  return requestData(`/api/v3/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function disableOAuthClient(
  clientId: string,
  idempotencyKey: string,
): Promise<{ clientId: string; status: number }> {
  return requestData(`/api/v3/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}
