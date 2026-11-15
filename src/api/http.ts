/**
 * 管理后台统一 HTTP 客户端与第一方 Bearer 认证请求层。
 * 访问令牌仅保存在当前运行时内存中，不落盘；支持单飞静默刷新、串行凭证队列、
 * 认证上下文版本防串号及 Idempotency-Key 幂等键生命周期管理。
 */

export interface ApiEnvelope<T = unknown> {
  code: number
  msg?: string
  error?: string
  data?: T
  requestId?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errorCode?: string
  readonly requestId?: string
  readonly unknownOutcome: boolean

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    requestId?: string,
    unknownOutcome = false,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
    this.requestId = requestId
    this.unknownOutcome = unknownOutcome
  }
}

export interface RequestOptions extends RequestInit {
  /** 是否跳过自动附加 Bearer 令牌，默认 false */
  skipAuth?: boolean
  /** 遇到 401 时是否禁止自动静默刷新并重试，默认 false */
  skipRefreshRetry?: boolean
  /** 是否在本次请求超时或断网后标记为“结果待确认”，用于写操作保护 */
  idempotentWrite?: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

// 内存中保留短期访问令牌，页面刷新后通过 同域 HttpOnly Refresh Cookie 静默恢复
let accessToken: string | null = null
let refreshFlight: Promise<boolean> | null = null
let refreshRejected = false
let authContextVersion = 0
let credentialQueue: Promise<unknown> = Promise.resolve()

type TokenListener = (token: string | null) => void
type PermissionDeniedListener = (detail: { path: string; code?: string; message: string }) => void

const tokenListeners = new Set<TokenListener>()
const permissionListeners = new Set<PermissionDeniedListener>()

export function getApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalized = path.startsWith('/') ? path : `/${path}`
  return API_BASE ? `${API_BASE}${normalized}` : normalized
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getAuthContextVersion(): number {
  return authContextVersion
}

export function bumpAuthContextVersion(): number {
  authContextVersion += 1
  return authContextVersion
}

export function setAccessToken(token: string | null, bumpContext = true): void {
  accessToken = token
  if (token) {
    refreshRejected = false
  }
  if (bumpContext) {
    authContextVersion += 1
  }
  tokenListeners.forEach((listener) => listener(token))
}

export function onAccessTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

export function onPermissionDenied(listener: PermissionDeniedListener): () => void {
  permissionListeners.add(listener)
  return () => permissionListeners.delete(listener)
}

export function wasRefreshRejected(): boolean {
  return refreshRejected
}

/**
 * 串行化登录、刷新与退出等凭证变更请求，防止并发刷新 Cookie 旋转冲突。
 */
export function queueCredentialRequest<T>(task: () => Promise<T>): Promise<T> {
  const next = credentialQueue.then(task, task)
  credentialQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function parseErrorPayload(res: Response): Promise<{ message: string; code?: string; requestId?: string }> {
  let message = `请求失败（HTTP ${res.status}）`
  let code: string | undefined
  let requestId: string | undefined

  try {
    const text = await res.text()
    if (text) {
      const parsed: unknown = JSON.parse(text)
      if (isRecord(parsed)) {
        if (typeof parsed.msg === 'string' && parsed.msg.trim()) {
          message = parsed.msg.trim()
        } else if (typeof parsed.message === 'string' && parsed.message.trim()) {
          message = parsed.message.trim()
        }
        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          code = parsed.error.trim()
        } else if (typeof parsed.code === 'string' && parsed.code.trim()) {
          code = parsed.code.trim()
        }
        if (typeof parsed.requestId === 'string' && parsed.requestId.trim()) {
          requestId = parsed.requestId.trim()
        }
      }
    }
  } catch {
    // 非 JSON 响应沿用 HTTP 状态码默认提示
  }

  return { message, code, requestId }
}

/**
 * 单飞刷新访问令牌；注意不能传递旧 Bearer 令牌，刷新靠同域 HttpOnly Cookie 授权。
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshFlight) {
    return refreshFlight
  }

  const run = queueCredentialRequest(async () => {
    const startVersion = authContextVersion
    try {
      const res = await fetch(getApiUrl('/api/v3/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })

      if (startVersion !== authContextVersion) {
        return false
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          refreshRejected = true
          setAccessToken(null)
        }
        return false
      }

      const payload = (await res.json()) as ApiEnvelope<{ accessToken?: string }>
      const nextToken = payload?.data?.accessToken
      if (payload.code !== 0 || typeof nextToken !== 'string' || !nextToken) {
        refreshRejected = true
        setAccessToken(null)
        return false
      }

      // 同一账号静默刷新时保留 authContextVersion，以便未保存草稿与待确认写操作现场不被误清空
      refreshRejected = false
      setAccessToken(nextToken, false)
      return true
    } catch {
      // 网络波动不标记 refreshRejected，保留后续页面切换恢复机会
      return false
    }
  }).finally(() => {
    if (refreshFlight === run) {
      refreshFlight = null
    }
  })

  refreshFlight = run
  return run
}

/**
 * 发起 JSON API 请求，自动携带第一方 Bearer 令牌并在 401 时尝试单次刷新重试。
 */
export async function request<T = ApiEnvelope<unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuth = false, skipRefreshRetry = false, idempotentWrite = false, headers: rawHeaders, ...init } = options
  const startVersion = authContextVersion

  const buildHeaders = (): Headers => {
    const headers = new Headers(rawHeaders)
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (!skipAuth && accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return headers
  }

  const execute = async (allowRetry: boolean): Promise<T> => {
    let res: Response
    try {
      res = await fetch(getApiUrl(path), {
        credentials: 'include',
        cache: 'no-store',
        ...init,
        headers: buildHeaders(),
      })
    } catch {
      throw new ApiError(
        idempotentWrite
          ? '网络连接中断，无法确认服务端是否已执行本次写入，请核对最新状态或按原操作恢复确认'
          : '网络请求失败，请检查网络连接与服务端状态',
        0,
        'network_error',
        undefined,
        idempotentWrite,
      )
    }

    if (startVersion !== authContextVersion) {
      throw new ApiError('登录账号或会话已切换，已丢弃过期响应', 401, 'stale_session')
    }

    if (res.status === 401 && allowRetry && !skipAuth && !skipRefreshRetry) {
      const refreshed = await refreshAccessToken()
      if (refreshed && startVersion === authContextVersion) {
        return execute(false)
      }
    }

    if (!res.ok) {
      const parsed = await parseErrorPayload(res)
      const isUnknown = idempotentWrite && (res.status >= 500 || res.status === 408)
      if (res.status === 403 && !skipAuth) {
        permissionListeners.forEach((listener) =>
          listener({ path, code: parsed.code, message: parsed.message }),
        )
      }
      throw new ApiError(parsed.message, res.status, parsed.code, parsed.requestId, isUnknown)
    }

    let json: ApiEnvelope<unknown>
    try {
      json = await res.json()
      if (!json || typeof json !== 'object' || typeof json.code !== 'number') throw new Error('invalid envelope')
    } catch {
      throw new ApiError('响应中断或格式异常，请恢复原操作确认结果', 502, 'invalid_response', undefined, idempotentWrite)
    }
    if (startVersion !== authContextVersion) {
      throw new ApiError('登录账号或会话已切换，已丢弃过期响应', 401, 'stale_session')
    }

    if (typeof json.code === 'number' && json.code !== 0) {
      throw new ApiError(json.msg || '操作失败', res.status || 400, json.error, json.requestId, false)
    }

    return json as T
  }

  return execute(true)
}

/**
 * 提取 `{ code: 0, data }` 中的 data 字段。
 */
export async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request<ApiEnvelope<T>>(path, options)
  if (res.data === undefined) {
    throw new ApiError('响应缺少数据载荷', 502, 'invalid_response', res.requestId, Boolean(options.idempotentWrite))
  }
  return res.data
}

/**
 * 请求原始二进制内容（如企业认证一次性材料读取）。
 * 除请求前 401 令牌过期可刷新一次重发外，绝不在 5xx 或断网后自动重试，避免误消费或掩盖消费状态。
 */
export async function requestBinary(
  path: string,
  options: Omit<RequestOptions, 'idempotentWrite'> = {},
): Promise<{ blob: Blob; contentType: string; contentDisposition: string }> {
  const startVersion = authContextVersion

  const execute = async (allowAuthRetry: boolean): Promise<{ blob: Blob; contentType: string; contentDisposition: string }> => {
    const headers = new Headers(options.headers)
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    if (typeof options.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    let res: Response
    try {
      res = await fetch(getApiUrl(path), {
        credentials: 'include',
        cache: 'no-store',
        ...options,
        headers,
      })
    } catch {
      throw new ApiError('读取文件时网络中断，请先刷新列表核对材料是否已被读取消费', 0, 'network_error', undefined, true)
    }

    if (startVersion !== authContextVersion) {
      throw new ApiError('登录状态已切换，请重新操作', 401, 'stale_session')
    }

    if (res.status === 401 && allowAuthRetry) {
      const refreshed = await refreshAccessToken()
      if (refreshed && startVersion === authContextVersion) {
        return execute(false)
      }
    }

    if (!res.ok) {
      const parsed = await parseErrorPayload(res)
      if (res.status === 403) {
        permissionListeners.forEach((listener) =>
          listener({ path, code: parsed.code, message: parsed.message }),
        )
      }
      throw new ApiError(parsed.message, res.status, parsed.code, parsed.requestId, res.status >= 500)
    }

    const blob = await res.blob()
    return {
      blob,
      contentType: res.headers.get('Content-Type') || 'application/octet-stream',
      contentDisposition: res.headers.get('Content-Disposition') || '',
    }
  }

  return execute(true)
}

/**
 * 生成符合 V3 接口规范 `[A-Za-z0-9._:-]{1,128}` 的幂等键。
 */
export function createIdempotencyKey(prefix: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 40) || 'adm'
  const ts = Date.now().toString(36)
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14)
  return `${safePrefix}-${ts}-${rand}`.slice(0, 128)
}

/**
 * 判断错误是否属于“写操作提交结果未知”状态（断网、超时或 5xx 服务端异常）。
 */
export function isUnknownOutcomeError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.unknownOutcome || error.status === 0 || error.status === 408 || error.status >= 500
  }
  return false
}

/**
 * 管理单个业务表单的幂等键复用与轮换状态：
 * 同一次命令在结果不明重试期间保留原键；明确成功、校验失败或参数更改时切换新键。
 */
export class IdempotencyTracker {
  private readonly prefix: string
  private currentKey: string | null = null
  private currentDigest: string | null = null

  constructor(prefix: string) {
    this.prefix = prefix
  }

  /**
   * 为指定规范化载荷获取或复用幂等键；若载荷变化则自动分配新键。
   */
  resolve(payload: unknown): string {
    const digest = JSON.stringify(payload ?? {})
    if (!this.currentKey || this.currentDigest !== digest) {
      this.currentKey = createIdempotencyKey(this.prefix)
      this.currentDigest = digest
    }
    return this.currentKey
  }

  get activeKey(): string | null {
    return this.currentKey
  }

  /**
   * 写入明确完成或明确被业务校验拒绝后调用，释放当前键。
   */
  reset(): void {
    this.currentKey = null
    this.currentDigest = null
  }
}
