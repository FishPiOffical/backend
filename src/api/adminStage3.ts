import { requestData } from './http'

/**
 * Rhythm V3 管理后台三期运营接口定义与客户端调用封装。
 */

export interface Stage3Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function writeOpts(method: 'POST' | 'PUT' | 'DELETE', idempotencyKey: string, payload?: unknown): RequestInit & { idempotentWrite: boolean } {
  const opts: RequestInit & { idempotentWrite: boolean } = {
    method,
    idempotentWrite: true,
    headers: { 'Idempotency-Key': idempotencyKey },
  }
  if (payload !== undefined) {
    opts.body = JSON.stringify(payload)
  }
  return opts
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v))
    }
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ==================== 角色与权限 ====================

export interface AdminRoleItem {
  oId: string
  roleName: string
  roleDescription: string
  userCount: number
  builtIn: boolean
  removable: boolean
}

export interface RolePermissionItem {
  oId: string
  permissionCategory: number
  categoryLabel: string
  permissionLabel: string
  permissionGrant: boolean
  adminOnly: boolean
}

export async function fetchRoles(p = 1, size = 50): Promise<{ items: AdminRoleItem[]; canManageAdminPerms: boolean; pagination: Stage3Pagination }> {
  return requestData(`/api/v3/admin/roles${qs({ p, size })}`)
}

export async function createRole(payload: { roleName: string; roleDescription?: string }, idempotencyKey: string) {
  return requestData<{ roleName: string; roleDescription: string; createdAt: number }>('/api/v3/admin/roles', writeOpts('POST', idempotencyKey, payload))
}

export async function removeRole(roleId: string, idempotencyKey: string) {
  return requestData<{ roleId: string; removed: boolean }>(`/api/v3/admin/roles/${encodeURIComponent(roleId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function fetchRolePermissions(roleId: string): Promise<{
  role: { oId: string; roleName: string; roleDescription: string; isAdminRole: boolean }
  canManageAdminPerms: boolean
  items: RolePermissionItem[]
}> {
  return requestData(`/api/v3/admin/roles/${encodeURIComponent(roleId)}/permissions`)
}

export async function updateRolePermissions(roleId: string, permissionIds: string[], idempotencyKey: string) {
  return requestData<{ roleId: string; grantedCount: number; updatedAt: number }>(
    `/api/v3/admin/roles/${encodeURIComponent(roleId)}/permissions`,
    writeOpts('PUT', idempotencyKey, { permissionIds }),
  )
}

// ==================== 邀请码 ====================

export interface InvitecodeItem {
  oId: string
  code: string
  memo: string
  status: number
  statusLabel: string
  generatorId: string
  generatorName: string
  userId: string
  userName: string
  time: number
  useTime: number
}

export async function fetchInvitecodes(params: { p?: number; size?: number; keyword?: string; status?: string | number }): Promise<{
  items: InvitecodeItem[]
  pagination: Stage3Pagination
}> {
  return requestData(`/api/v3/admin/invitecodes${qs(params)}`)
}

export async function generateInvitecodes(payload: { quantity: number; memo?: string }, idempotencyKey: string) {
  return requestData<{ quantity: number; memo: string; generatedAt: number }>('/api/v3/admin/invitecodes/generate', writeOpts('POST', idempotencyKey, payload))
}

export async function updateInvitecode(invitecodeId: string, payload: { status: number; memo?: string }, idempotencyKey: string) {
  return requestData<{ oId: string; status: number; statusLabel: string; memo: string }>(
    `/api/v3/admin/invitecodes/${encodeURIComponent(invitecodeId)}`,
    writeOpts('PUT', idempotencyKey, payload),
  )
}

// ==================== VIP 与优惠券 ====================

export interface VipLevelItem {
  oId: string
  lvCode: string
  name: string
  description?: string
  price: number
  durationDays: number
  sortOrder?: number
  enabled?: number | boolean
}

export interface UserVipItem {
  oId?: string
  userId: string
  userName?: string
  lvCode: string
  state: number
  expiresAt: number
  configJson?: string
}

export interface CouponItem {
  oId: string
  couponCode: string
  couponType: number
  discount: number
  times: number
  creater?: string
  createTime?: number
}

export async function fetchVipLevels(): Promise<{ items: VipLevelItem[] }> {
  return requestData('/api/v3/admin/vip/levels')
}

export async function addVipLevel(payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData<{ oId: string }>('/api/v3/admin/vip/levels', writeOpts('POST', idempotencyKey, payload))
}

export async function updateVipLevel(levelId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData<{ oId: string; updated: boolean }>(`/api/v3/admin/vip/levels/${encodeURIComponent(levelId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function removeVipLevel(levelId: string, idempotencyKey: string) {
  return requestData<{ oId: string; removed: boolean }>(`/api/v3/admin/vip/levels/${encodeURIComponent(levelId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function fetchUserVips(params: { p?: number; size?: number; userName?: string; lvCode?: string; state?: string | number }): Promise<{
  items: UserVipItem[]
  pagination: Stage3Pagination
}> {
  return requestData(`/api/v3/admin/vip/users${qs(params)}`)
}

export async function grantUserVip(payload: { target: string; levelOId: string; configJson?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/vip/users', writeOpts('POST', idempotencyKey, payload))
}

export async function updateUserVip(userId: string, payload: { lvCode?: string; state?: number; expiresAt?: number; configJson?: string }, idempotencyKey: string) {
  return requestData(`/api/v3/admin/vip/users/${encodeURIComponent(userId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function extendUserVip(userId: string, days: number, idempotencyKey: string) {
  return requestData(`/api/v3/admin/vip/users/${encodeURIComponent(userId)}/extend`, writeOpts('POST', idempotencyKey, { days }))
}

export async function refundUserVip(userId: string, idempotencyKey: string) {
  return requestData(`/api/v3/admin/vip/users/${encodeURIComponent(userId)}/refund`, writeOpts('POST', idempotencyKey))
}

export async function fetchCoupons(): Promise<{ items: CouponItem[] }> {
  return requestData('/api/v3/admin/coupons')
}

export async function addCoupon(payload: { couponCode?: string; couponType: number; discount: number; times: number }, idempotencyKey: string) {
  return requestData<{ oId: string }>('/api/v3/admin/coupons', writeOpts('POST', idempotencyKey, payload))
}

export async function updateCouponTimes(couponId: string, times: number, idempotencyKey: string) {
  return requestData<{ oId: string; times: number }>(`/api/v3/admin/coupons/${encodeURIComponent(couponId)}`, writeOpts('PUT', idempotencyKey, { times }))
}

export async function removeCoupon(couponId: string, idempotencyKey: string) {
  return requestData<{ oId: string; removed: boolean }>(`/api/v3/admin/coupons/${encodeURIComponent(couponId)}`, writeOpts('DELETE', idempotencyKey))
}

// ==================== 勋章 ====================

export interface MedalItem {
  oId: string
  name: string
  type: string
  description: string
  attr: string
}

export interface MedalOwnerItem {
  oId: string
  userId: string
  userName: string
  data: string
  expireTime: number
  permanent: boolean
}

export interface BatchResultItem {
  index?: number
  target: string
  userId?: string
  userName?: string
  amount?: number
  transferId?: string
  ok: boolean
  error?: string
}

export async function fetchMedals(params: { p?: number; size?: number; keyword?: string }): Promise<{ items: MedalItem[]; page: number; pageSize: number }> {
  return requestData(`/api/v3/admin/medals${qs(params)}`)
}

export async function addMedal(payload: { name: string; type: string; description?: string; attr?: string }, idempotencyKey: string) {
  return requestData<{ oId: string }>('/api/v3/admin/medals', writeOpts('POST', idempotencyKey, payload))
}

export async function updateMedal(medalId: string, payload: { name: string; type: string; description?: string; attr?: string }, idempotencyKey: string) {
  return requestData<{ oId: string; updated: boolean }>(`/api/v3/admin/medals/${encodeURIComponent(medalId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function deleteMedal(medalId: string, idempotencyKey: string) {
  return requestData<{ oId: string; removed: boolean }>(`/api/v3/admin/medals/${encodeURIComponent(medalId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function reorderSponsorMedals(idempotencyKey: string) {
  return requestData<{ reordered: boolean }>('/api/v3/admin/medals/sponsor/reorder', writeOpts('POST', idempotencyKey))
}

export async function fetchMedalOwners(medalId: string): Promise<{ items: MedalOwnerItem[] }> {
  return requestData(`/api/v3/admin/medals/${encodeURIComponent(medalId)}/owners`)
}

export async function fetchUserMedals(target: string): Promise<{ userId: string; userName: string; items: Record<string, unknown>[] }> {
  return requestData(`/api/v3/admin/medals/users/${encodeURIComponent(target)}`)
}

export async function checkMedalHoldStatuses(medalId: string, targets: string[]): Promise<{
  items: { target: string; found: boolean; userId?: string; userName?: string; holds?: boolean }[]
}> {
  return requestData('/api/v3/admin/medals/hold-check', {
    method: 'POST',
    body: JSON.stringify({ medalId, targets }),
  })
}

export async function grantMedal(payload: { target: string; medalId: string; expireTime: number; data?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/medals/grant', writeOpts('POST', idempotencyKey, payload))
}

export async function revokeMedal(payload: { target: string; medalId: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/medals/revoke', writeOpts('POST', idempotencyKey, payload))
}

export async function batchGrantMedals(payload: { medalId: string; targets: string[]; expireTime: number; data?: string }, idempotencyKey: string): Promise<{
  medalId: string
  successCount: number
  failureCount: number
  results: BatchResultItem[]
}> {
  return requestData('/api/v3/admin/medals/batch-grant', writeOpts('POST', idempotencyKey, payload))
}

// ==================== 积分、工资与背包 ====================

export async function chargePoint(payload: { target: string; amount: number; mode: 'direct' | 'sponsor'; memo: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/points/charge', writeOpts('POST', idempotencyKey, payload))
}

export async function deductPoint(payload: { target: string; point: number; memo?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/points/deduct', writeOpts('POST', idempotencyKey, payload))
}

export async function initPoint(payload: { target: string; point: number; memo?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/points/init', writeOpts('POST', idempotencyKey, payload))
}

export async function exchangePoint(payload: { target: string; point: number; memo?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/points/exchange', writeOpts('POST', idempotencyKey, payload))
}

export async function paySalary(items: { target: string; amount: number; memo?: string }[], idempotencyKey: string): Promise<{
  successCount: number
  failureCount: number
  totalAmount: number
  results: BatchResultItem[]
}> {
  return requestData('/api/v3/admin/salary/pay', writeOpts('POST', idempotencyKey, { items }))
}

export async function adjustBag(payload: { target: string; item: string; number: number; maxTake?: number }, idempotencyKey: string) {
  return requestData('/api/v3/admin/bags/adjust', writeOpts('POST', idempotencyKey, payload))
}

// ==================== 鱼游、大事记与图片审核 ====================

export interface FishGameItem {
  oId: string
  fishGameName: string
  fishGameUrl: string
  fishGameTag?: string
  fishGameDescription?: string
  fishGameIcon?: string
  fishGameStatus: number
  fishGameEditPending?: number
  fishGamePendingName?: string
  fishGamePendingUrl?: string
  fishGamePendingTag?: string
  fishGamePendingDescription?: string
  fishGamePendingIcon?: string
  fishGameRejectReason?: string
  fishGameAuthorId?: string
  fishGameOrder?: number
}

export interface MilestoneItem {
  oId: string
  milestoneTitle: string
  milestoneDate: string
  milestoneEndDate?: string
  milestoneContent?: string
  milestoneLink?: string
  milestoneStatus: number
  milestoneAuthorId?: string
  authorName?: string
  milestoneCreateTime?: number
}

export interface ReviewImageItem {
  oId: string
  type: string
  userName: string
  ip: string
  time: string
  path: string
  md5: string
  public: boolean | number
  reviewed: number
}

export async function fetchFishGames(params: { p?: number; size?: number; status?: string | number; keyword?: string; editPendingOnly?: boolean }): Promise<{
  items: FishGameItem[]
  pagination: Stage3Pagination
}> {
  return requestData(`/api/v3/admin/fish-games${qs(params)}`)
}

export async function addFishGame(payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData('/api/v3/admin/fish-games', writeOpts('POST', idempotencyKey, payload))
}

export async function updateFishGame(gameId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData(`/api/v3/admin/fish-games/${encodeURIComponent(gameId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function reviewFishGame(gameId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData(`/api/v3/admin/fish-games/${encodeURIComponent(gameId)}/review`, writeOpts('POST', idempotencyKey, payload))
}

export async function exportFishGames(): Promise<{ items: FishGameItem[] }> {
  return requestData('/api/v3/admin/fish-games/export')
}

export async function importFishGames(items: Record<string, unknown>[], idempotencyKey: string) {
  return requestData('/api/v3/admin/fish-games/import', writeOpts('POST', idempotencyKey, { items }))
}

export async function fetchMilestones(params: { p?: number; size?: number; status?: string | number; keyword?: string }): Promise<{
  items: MilestoneItem[]
  pagination: Stage3Pagination
}> {
  return requestData(`/api/v3/admin/milestones${qs(params)}`)
}

export async function updateMilestone(milestoneId: string, payload: Partial<MilestoneItem>, idempotencyKey: string) {
  return requestData(`/api/v3/admin/milestones/${encodeURIComponent(milestoneId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function removeMilestone(milestoneId: string, idempotencyKey: string) {
  return requestData(`/api/v3/admin/milestones/${encodeURIComponent(milestoneId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function fetchReviewImages(p = 1, size = 20): Promise<{ items: ReviewImageItem[]; pagination: Stage3Pagination }> {
  return requestData(`/api/v3/admin/images${qs({ p, size })}`)
}

export async function reviewImage(imageId: string, decision: 'normal' | 'illegal', idempotencyKey: string) {
  return requestData(`/api/v3/admin/images/${encodeURIComponent(imageId)}/review`, writeOpts('POST', idempotencyKey, { decision }))
}

// ==================== 领域、标签、保留词与广告位 ====================

export interface DomainItem {
  oId: string
  domainTitle: string
  domainURI: string
  domainDescription?: string
  domainIconPath?: string
  domainCss?: string
  domainSort?: number
  domainStatus?: number
  domainNav?: number
  tags?: { bindId: string; tagId: string; tagTitle: string; tagURI: string }[]
}

export interface TagItem {
  oId: string
  tagTitle: string
  tagURI: string
  tagDescription?: string
  tagIconPath?: string
  tagReferenceCount?: number
  tagStatus?: number
}

export async function fetchDomains(p = 1, size = 50): Promise<{ items: DomainItem[]; pagination: Stage3Pagination }> {
  return requestData(`/api/v3/admin/domains${qs({ p, size })}`)
}

export async function addDomain(payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData('/api/v3/admin/domains', writeOpts('POST', idempotencyKey, payload))
}

export async function updateDomain(domainId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData(`/api/v3/admin/domains/${encodeURIComponent(domainId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function removeDomain(domainId: string, idempotencyKey: string) {
  return requestData(`/api/v3/admin/domains/${encodeURIComponent(domainId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function bindDomainTag(domainId: string, tagTitle: string, idempotencyKey: string) {
  return requestData(`/api/v3/admin/domains/${encodeURIComponent(domainId)}/tags`, writeOpts('POST', idempotencyKey, { tagTitle }))
}

export async function unbindDomainTag(domainId: string, tagId: string, idempotencyKey: string) {
  return requestData(`/api/v3/admin/domains/${encodeURIComponent(domainId)}/tags/${encodeURIComponent(tagId)}`, writeOpts('DELETE', idempotencyKey))
}

export async function fetchTags(params: { p?: number; size?: number; keyword?: string }): Promise<{ items: TagItem[]; pagination: Stage3Pagination }> {
  return requestData(`/api/v3/admin/tags${qs(params)}`)
}

export async function addTag(tagTitle: string, idempotencyKey: string) {
  return requestData('/api/v3/admin/tags', writeOpts('POST', idempotencyKey, { tagTitle }))
}

export async function updateTag(tagId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return requestData(`/api/v3/admin/tags/${encodeURIComponent(tagId)}`, writeOpts('PUT', idempotencyKey, payload))
}

export async function removeUnusedTags(idempotencyKey: string) {
  return requestData('/api/v3/admin/tags/remove-unused', writeOpts('POST', idempotencyKey))
}

export async function fetchReservedWords(keyword = ''): Promise<{ items: { oId: string; word: string }[] }> {
  return requestData(`/api/v3/admin/reserved-words${qs({ keyword })}`)
}

export async function addReservedWord(word: string, idempotencyKey: string) {
  return requestData('/api/v3/admin/reserved-words', writeOpts('POST', idempotencyKey, { word }))
}

export async function removeReservedWord(word: string, idempotencyKey: string) {
  return requestData('/api/v3/admin/reserved-words/remove', writeOpts('POST', idempotencyKey, { word }))
}

export async function fetchAds(): Promise<{ sideFullAd: string; headerBanner: string }> {
  return requestData('/api/v3/admin/ads')
}

export async function updateAds(payload: { sideFullAd?: string; headerBanner?: string }, idempotencyKey: string) {
  return requestData('/api/v3/admin/ads', writeOpts('PUT', idempotencyKey, payload))
}
