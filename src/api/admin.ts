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
    articleCreate: boolean
    articleEdit: boolean
    articleStick: boolean
    articleCancelStick: boolean
    articleRemove: boolean
    commentEdit: boolean
    commentRemove: boolean
    breezemoonEdit: boolean
    breezemoonRemove: boolean
    auditLogView: boolean
    fishGameReview: boolean
    milestoneReview: boolean
    imageReview: boolean
    roleManage: boolean
    invitecodeManage: boolean
    vipManage: boolean
    medalDefine: boolean
    medalGrant: boolean
    medalRevoke: boolean
    medalManage: boolean
    pointAdd: boolean
    pointDeduct: boolean
    pointExchange: boolean
    bagAdjust: boolean
    salaryPay: boolean
    domainManage: boolean
    tagManage: boolean
    reservedWordManage: boolean
    adManage: boolean
    fishGameManage: boolean
    milestoneManage: boolean
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
  operationUserNickname?: string
  operationCode: number
  operationCodeLabel: string
  targetType?: string
  operationDataId: string
  operationCreated: number
  operationIP: string
  operationUA?: string
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

// -----------------------------------------------------------------------------
// 第二阶段：文章与长文专栏、评论、清风明月与全站操作审计 V3 接口
// -----------------------------------------------------------------------------

export interface LongArticleChapterInfo {
  columnId: string
  columnTitle: string
  columnCoverURL: string
  chapterNo: number
}

export interface AuthorColumnOption {
  oId: string
  columnTitle: string
  columnCoverURL: string
  columnArticleCount: number
  columnOrder: number
}

export interface AdminArticleSummary {
  oId: string
  articleTitle: string
  articleTags: string
  articleAuthorId: string
  articleAuthorName: string
  articleAuthorNickname: string
  articleAuthorAvatarURL: string
  articleStatus: number
  articleStatusLabel: string
  articleType: number
  articleTypeLabel: string
  articlePerfect: number
  articleStick: number
  articleCommentCount: number
  articleViewCount: number
  articleGoodCnt: number
  articleBadCnt: number
  articleCollectCnt: number
  articleWatchCnt: number
  articlePermalink: string
  articleShowInList: number
  articleCreateTime: number
  articleUpdateTime: number
  articleLatestCmtTime: number
  longArticleChapter: LongArticleChapterInfo | null
}

export interface AdminArticleDetail extends AdminArticleSummary {
  articleContent: string
  articleRewardContent: string
  articleAnonymous: number
  articleAnonymousView: number
  articleCommentable: boolean
  articleStatement: number
  articleRewardPoint: number
  articleQnAOfferPoint: number
  articlePushOrder: number
  articleThankCnt: number
  articleIP: string
  articleUA: string
  authorColumns: AuthorColumnOption[]
  recentOperations: AdminOperationItem[]
}

export interface ArticleCreatePayload {
  userName: string
  articleTitle: string
  articleContent: string
  articleRewardContent?: string
  articleTags?: string
  articleType?: number
  articleRewardPoint?: number
  articleQnAOfferPoint?: number
  articleShowInList?: number
  articleStatement?: number
  articleCommentable?: boolean
  columnId?: string
  columnTitle?: string
  columnCoverURL?: string
  chapterNo?: number | string
  time?: number
}

export interface ArticleUpdatePayload {
  articleTitle?: string
  articleContent?: string
  articleRewardContent?: string
  articleTags?: string
  articleStatus?: number
  articleType?: number
  articlePerfect?: number
  articleStatement?: number
  articleShowInList?: number
  articleCommentable?: boolean
  articleRewardPoint?: number
  articleQnAOfferPoint?: number
  articlePushOrder?: number
  articleViewCount?: number
  articleGoodCnt?: number
  articleBadCnt?: number
  articleCollectCnt?: number
  articleWatchCnt?: number
  columnId?: string
  columnTitle?: string
  columnCoverURL?: string
  chapterNo?: number | string
}

export interface AdminCommentItem {
  oId: string
  commentContent: string
  commentContentPreview: string
  commentAuthorId: string
  commentAuthorName: string
  commentAuthorNickname: string
  commentAuthorAvatarURL: string
  commentOnArticleId: string
  commentArticleTitle: string
  commentArticlePermalink: string
  commentOriginalCommentId: string
  commentStatus: number
  commentStatusLabel: string
  commentVisible: number
  commentType: number
  commentGoodCnt: number
  commentBadCnt: number
  commentReplyCnt: number
  commentThankCnt: number
  commentCreateTime: number
  commentSharpURL: string
  commentIP: string
}

export interface AdminCommentDetail extends AdminCommentItem {
  commentUA: string
  commentAnonymous: number
  commentQnAOffered: number
  commentParagraphId: string
  commentParagraphIndex: number
  commentParagraphSnapshot: string
  commentParagraphStatus: number
  recentOperations: AdminOperationItem[]
}

export interface CommentUpdatePayload {
  commentContent?: string
  commentStatus?: number
  commentGoodCnt?: number
  commentBadCnt?: number
  commentVisible?: number
}

export interface AdminBreezemoonItem {
  oId: string
  breezemoonContent: string
  breezemoonAuthorId: string
  breezemoonAuthorName: string
  breezemoonAuthorNickname: string
  breezemoonAuthorAvatarURL: string
  breezemoonStatus: number
  breezemoonStatusLabel: string
  breezemoonCity: string
  breezemoonCreated: number
  breezemoonUpdated: number
  breezemoonIP: string
}

export interface AdminBreezemoonDetail extends AdminBreezemoonItem {
  breezemoonUA: string
  recentOperations: AdminOperationItem[]
}

export interface BreezemoonUpdatePayload {
  breezemoonContent?: string
  breezemoonStatus?: number
}

export interface OperationCodeOption {
  code: number
  label: string
  targetType: string
}

export interface AdminAuditLogsResponse {
  list: AdminOperationItem[]
  pagination: PaginationInfo
  codeOptions: OperationCodeOption[]
  auditNote: string
}

export async function fetchAdminArticles(params: {
  keyword?: string
  status?: string
  type?: string
  p: number
  size: number
}): Promise<{ list: AdminArticleSummary[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams({
    status: params.status || 'all',
    type: params.type || 'all',
    p: String(params.p),
    size: String(params.size),
  })
  if (params.keyword && params.keyword.trim()) {
    qs.set('keyword', params.keyword.trim())
  }
  return requestData(`/api/v3/admin/articles?${qs.toString()}`)
}

export async function fetchAdminArticleDetail(articleId: string): Promise<AdminArticleDetail> {
  return requestData<AdminArticleDetail>(`/api/v3/admin/articles/${encodeURIComponent(articleId)}`)
}

export async function createAdminArticle(
  payload: ArticleCreatePayload,
  idempotencyKey: string,
): Promise<{
  oId: string
  articleId: string
  articlePermalink: string
  createdAt: number
  replayed: boolean
  detail: AdminArticleDetail
}> {
  return requestData('/api/v3/admin/articles', {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function updateAdminArticle(
  articleId: string,
  payload: ArticleUpdatePayload,
  idempotencyKey: string,
): Promise<{ oId: string; articleId: string; updatedAt: number; replayed: boolean; detail: AdminArticleDetail }> {
  return requestData(`/api/v3/admin/articles/${encodeURIComponent(articleId)}`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function stickAdminArticle(
  articleId: string,
  idempotencyKey: string,
): Promise<{
  oId: string
  articleId: string
  articleStick: number
  updatedAt: number
  replayed: boolean
  detail: AdminArticleDetail
}> {
  return requestData(`/api/v3/admin/articles/${encodeURIComponent(articleId)}/stick`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function cancelStickAdminArticle(
  articleId: string,
  idempotencyKey: string,
): Promise<{
  oId: string
  articleId: string
  articleStick: number
  updatedAt: number
  replayed: boolean
  detail: AdminArticleDetail
}> {
  return requestData(`/api/v3/admin/articles/${encodeURIComponent(articleId)}/cancel-stick`, {
    method: 'POST',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function removeAdminArticle(
  articleId: string,
  idempotencyKey: string,
): Promise<{ oId: string; articleId: string; deleted: boolean; removedAt: number; replayed: boolean }> {
  return requestData(`/api/v3/admin/articles/${encodeURIComponent(articleId)}`, {
    method: 'DELETE',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function fetchAdminComments(params: {
  keyword?: string
  status?: string
  articleId?: string
  p: number
  size: number
}): Promise<{ list: AdminCommentItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams({
    status: params.status || 'all',
    p: String(params.p),
    size: String(params.size),
  })
  if (params.keyword && params.keyword.trim()) {
    qs.set('keyword', params.keyword.trim())
  }
  if (params.articleId && params.articleId.trim()) {
    qs.set('articleId', params.articleId.trim())
  }
  return requestData(`/api/v3/admin/comments?${qs.toString()}`)
}

export async function fetchAdminCommentDetail(commentId: string): Promise<AdminCommentDetail> {
  return requestData<AdminCommentDetail>(`/api/v3/admin/comments/${encodeURIComponent(commentId)}`)
}

export async function updateAdminComment(
  commentId: string,
  payload: CommentUpdatePayload,
  idempotencyKey: string,
): Promise<{ oId: string; commentId: string; updatedAt: number; replayed: boolean; detail: AdminCommentDetail }> {
  return requestData(`/api/v3/admin/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function removeAdminComment(
  commentId: string,
  idempotencyKey: string,
): Promise<{ oId: string; commentId: string; deleted: boolean; removedAt: number; replayed: boolean }> {
  return requestData(`/api/v3/admin/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function fetchAdminBreezemoons(params: {
  keyword?: string
  status?: string
  authorId?: string
  p: number
  size: number
}): Promise<{ list: AdminBreezemoonItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams({
    status: params.status || 'all',
    p: String(params.p),
    size: String(params.size),
  })
  if (params.keyword && params.keyword.trim()) {
    qs.set('keyword', params.keyword.trim())
  }
  if (params.authorId && params.authorId.trim()) {
    qs.set('authorId', params.authorId.trim())
  }
  return requestData(`/api/v3/admin/breezemoons?${qs.toString()}`)
}

export async function fetchAdminBreezemoonDetail(breezemoonId: string): Promise<AdminBreezemoonDetail> {
  return requestData<AdminBreezemoonDetail>(`/api/v3/admin/breezemoons/${encodeURIComponent(breezemoonId)}`)
}

export async function updateAdminBreezemoon(
  breezemoonId: string,
  payload: BreezemoonUpdatePayload,
  idempotencyKey: string,
): Promise<{ oId: string; breezemoonId: string; updatedAt: number; replayed: boolean; detail: AdminBreezemoonDetail }> {
  return requestData(`/api/v3/admin/breezemoons/${encodeURIComponent(breezemoonId)}`, {
    method: 'PUT',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  })
}

export async function removeAdminBreezemoon(
  breezemoonId: string,
  idempotencyKey: string,
): Promise<{ oId: string; breezemoonId: string; deleted: boolean; removedAt: number; replayed: boolean }> {
  return requestData(`/api/v3/admin/breezemoons/${encodeURIComponent(breezemoonId)}`, {
    method: 'DELETE',
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: '{}',
  })
}

export async function fetchAdminAuditLogs(params: {
  operator?: string
  code?: string
  dataId?: string
  p: number
  size: number
}): Promise<AdminAuditLogsResponse> {
  const qs = new URLSearchParams({
    code: params.code || 'all',
    p: String(params.p),
    size: String(params.size),
  })
  if (params.operator && params.operator.trim()) {
    qs.set('operator', params.operator.trim())
  }
  if (params.dataId && params.dataId.trim()) {
    qs.set('dataId', params.dataId.trim())
  }
  return requestData(`/api/v3/admin/audit-logs?${qs.toString()}`)
}

export * from './adminStage3'
