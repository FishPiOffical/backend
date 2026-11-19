import { requestData } from './http'
import type { PaginationInfo } from './admin'
import { assetRequestData } from '@/stores/assetRecovery'

/**
 * Rhythm V3 管理后台四期专项与迁移收尾接口客户端封装。
 */

function writeOpts(
  method: 'POST' | 'PUT',
  idempotencyKey?: string,
  payload?: unknown,
): RequestInit & { idempotentWrite?: boolean; skipRefreshRetry?: boolean } {
  const opts: RequestInit & { idempotentWrite?: boolean; skipRefreshRetry?: boolean } = { method, skipRefreshRetry: !idempotencyKey }
  if (idempotencyKey) {
    opts.idempotentWrite = true
    opts.headers = { 'Idempotency-Key': idempotencyKey }
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

// ==================== 宠物风控日志（严格只读） ====================

export interface PetLogsResponse {
  tab: 'activity' | 'risk'
  user: string
  from: string
  to: string
  operation: string
  operations: Record<string, string>
  page: number
  hasNext: boolean
  rows: Array<Record<string, string>>
}

export async function fetchPetLogs(params: {
  tab?: 'activity' | 'risk'
  user?: string
  from?: string
  to?: string
  operation?: string
  p?: number
}): Promise<PetLogsResponse> {
  return requestData(`/api/v3/admin/pets/logs${qs(params)}`)
}

export interface AdminPet {
  petId: string
  name: string
  speciesId: string
  userId: string
  userName: string
  userNickname: string
  moderated: boolean
}

export function fetchAdminPets(query: string, p: number, signal: AbortSignal) {
  return requestData<{ list: AdminPet[]; pagination: PaginationInfo }>(
    `/api/v3/admin/pets${qs({ q: query, p, size: 20 })}`, { signal, cache: 'no-store' },
  )
}

export function moderateAdminPetName(pet: AdminPet) {
  return assetRequestData<{ petId: string; moderatedName: string }>(
    `/api/v3/admin/pets/${encodeURIComponent(pet.petId)}/moderate-name`,
    writeOpts('PUT', crypto.randomUUID(), { expectedName: pet.name }),
  )
}

export interface PetCoffeeSettings {
  enabled: boolean
  price: number
  version: number
}

export function fetchPetCoffeeSettings(signal: AbortSignal) {
  return requestData<PetCoffeeSettings>('/api/v3/admin/pets/coffee', { signal, cache: 'no-store' })
}

export function savePetCoffeeSettings(settings: PetCoffeeSettings) {
  return assetRequestData<PetCoffeeSettings>('/api/v3/admin/pets/coffee', writeOpts('PUT', crypto.randomUUID(), settings))
}

// ==================== IP 管理与站点杂项设置 ====================

export interface IpPolicyStatus {
  firewallEnabled: boolean
  threshold: number
  defaultThreshold: number
  verificationEnabled: boolean
  firstVisitCaptchaEnabled: boolean
}

export async function fetchIpPolicyStatus(): Promise<IpPolicyStatus> {
  return requestData('/api/v3/admin/ips')
}

export async function mutateIpPolicy(
  payload: { action: 'ban' | 'unban'; ipList: string[] },
  idempotencyKey: string,
): Promise<{ action: string; count: number; processedAt: number; replayed?: boolean }> {
  return requestData('/api/v3/admin/ips', writeOpts('POST', idempotencyKey, payload))
}

export interface MiscOptionItem {
  oId: string
  optionValue: string
  optionCategory?: string
  writable?: boolean
  allowedValues?: string[]
  [key: string]: unknown
}

export async function fetchMiscSettings(): Promise<{ options: MiscOptionItem[] }> {
  return requestData('/api/v3/admin/settings')
}

export async function updateMiscSettings(
  options: Record<string, string>,
  idempotencyKey: string,
): Promise<{ updatedCount: number; updatedAt: number; options: MiscOptionItem[]; replayed?: boolean }> {
  return requestData('/api/v3/admin/settings', writeOpts('PUT', idempotencyKey, { options }))
}

// ==================== 安全监控、自检与索引维护 ====================

export interface SecuritySwitchesState {
  firewallEnabled: boolean
  threshold: number
  verificationEnabled: boolean
  firstVisitCaptchaEnabled: boolean
  runtimeMode: string
  editable: boolean
}

export interface SecurityMonitorResponse {
  crawlers?: Record<string, unknown>
  events?: unknown[]
  switches: SecuritySwitchesState
  [key: string]: unknown
}

export async function fetchSecurityMonitor(crawler?: string): Promise<SecurityMonitorResponse> {
  return requestData(`/api/v3/admin/security/monitor${qs({ crawler })}`)
}

export async function runSecuritySelfCheck(): Promise<Record<string, unknown>> {
  return requestData('/api/v3/admin/security/self-check')
}

export async function saveSecuritySwitches(
  payload: {
    firewallEnabled: boolean
    threshold: number
    verificationEnabled: boolean
    firstVisitCaptchaEnabled: boolean
  },
  idempotencyKey: string,
): Promise<SecuritySwitchesState & { updatedAt: number; replayed?: boolean }> {
  return requestData('/api/v3/admin/security/switches', writeOpts('POST', idempotencyKey, payload))
}

export async function reindexAllArticles(
  idempotencyKey: string,
): Promise<{ accepted: boolean; triggeredAt: number; replayed?: boolean }> {
  return requestData('/api/v3/admin/articles/reindex', writeOpts('POST', idempotencyKey, {}))
}

export async function reindexOneArticle(
  articleId: string,
  idempotencyKey: string,
): Promise<{ articleId: string; accepted: boolean; triggeredAt: number; replayed?: boolean }> {
  return requestData(`/api/v3/admin/articles/${encodeURIComponent(articleId)}/reindex`, writeOpts('POST', idempotencyKey, {}))
}

// ==================== 职业配置工作台 ====================

export async function fetchProfessionCatalogSummary(params: {
  keyword?: string
  status?: string
  sort?: string
  page?: number
  pageSize?: number
}): Promise<{ items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }> {
  return requestData(`/api/v3/admin/professions/catalog-summary${qs(params)}`)
}

export async function fetchProfessionDetail(professionId: string): Promise<Record<string, unknown>> {
  return requestData(`/api/v3/admin/professions/${encodeURIComponent(professionId)}`)
}

export async function fetchProfessionSchemeImpact(
  professionId: string,
  schemeId: string,
): Promise<Record<string, unknown>> {
  return requestData(
    `/api/v3/admin/professions/${encodeURIComponent(professionId)}/schemes/${encodeURIComponent(schemeId)}/impact`,
  )
}

export async function exportProfessionConfig(professionId?: string): Promise<Record<string, unknown>> {
  return requestData(`/api/v3/admin/professions/config/export${qs({ professionId })}`)
}

export async function precheckProfessionConfig(configJson: string): Promise<Record<string, unknown>> {
  return requestData('/api/v3/admin/professions/config/precheck', writeOpts('POST', undefined, { configJson }))
}

export async function importProfessionConfig(configJson: string): Promise<Record<string, unknown>> {
  return requestData('/api/v3/admin/professions/config/import', writeOpts('POST', undefined, { configJson }))
}

export async function reorderProfessionCatalog(professionIds: string[]): Promise<{ reordered: boolean }> {
  return requestData('/api/v3/admin/professions/catalog/order', writeOpts('POST', undefined, { professionIds }))
}

export async function professionLifecycleAction(
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requestData(`/api/v3/admin/professions/${path}`, writeOpts('POST', undefined, payload))
}

export async function testProfessionAutomation(
  configurationJson: string,
  payloadJson: string,
): Promise<Record<string, unknown>> {
  return requestData(
    '/api/v3/admin/professions/automation/test',
    writeOpts('POST', undefined, { configurationJson, payloadJson }),
  )
}

export interface ParkingModel {
  id: string; name: string; starter: boolean; price: number; rate: number; enabled: boolean
}
export interface ParkingLedgerEntry {
  oId: string; userId: string; operation: string; referenceId: string; coinDelta: number; createdAt: number
}
export function fetchParkingModels(signal: AbortSignal) {
  return requestData<{ models: ParkingModel[]; version: number }>('/api/v3/admin/parking/models', { signal, cache: 'no-store' })
}
export function updateParkingModel(model: ParkingModel, version: number) {
  const { price, rate, enabled } = model
  return assetRequestData('/api/v3/admin/parking/models/' + encodeURIComponent(model.id),
    writeOpts('PUT', crypto.randomUUID(), { price, rate, enabled, version }))
}
export function fetchParkingLedger(userId: string, page: number, signal: AbortSignal) {
  return requestData<{ list: ParkingLedgerEntry[]; pagination: PaginationInfo }>(
    '/api/v3/admin/parking/ledger' + qs({ userId, p: page, size: 20 }), { signal, cache: 'no-store' })
}

interface ParkingSample { hits: number; samples: number }
export interface ParkingMetrics {
  from: number
  asOf: number
  firstPark: ParkingSample
  emptySearch: ParkingSample
  nextDay: ParkingSample
  repeatPairs: ParkingSample
  upgrade: { samples: number; meanMs: number | null }
}
export function fetchParkingMetrics(signal: AbortSignal) {
  return requestData<ParkingMetrics>('/api/v3/admin/parking/metrics', { signal, cache: 'no-store' })
}

export interface PartnerPolicy { baseRate: number; stepRate: number; version: number }
export interface PartnerReport {
  from: number; asOf: number; policy: PartnerPolicy & { sinceAt: number }
  occupancy: { joinedCount: number; fullCount: number }
  money: { income: number; earningDays: number; netIssued: number }
  pairs: { transfers: number; quickReturns: number }
}
export function fetchPartnerReport(signal: AbortSignal) {
  return requestData<PartnerReport>('/api/v3/admin/partners/report', { signal, cache: 'no-store' })
}
export function fetchPartnerLedger(userId: string, referenceId: string, page: number, signal: AbortSignal) {
  return requestData<{ list: ParkingLedgerEntry[]; pagination: PaginationInfo }>(
    '/api/v3/admin/partners/ledger' + qs({ userId, referenceId, p: page, size: 20 }), { signal, cache: 'no-store' })
}
export function updatePartnerRate(policy: PartnerPolicy) {
  return assetRequestData('/api/v3/admin/partners/rate', writeOpts('PUT', crypto.randomUUID(), policy))
}
