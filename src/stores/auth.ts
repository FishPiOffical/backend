import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchAdminCapabilities, type AdminCapabilities, type MenuKey } from '@/api/admin'
import { fetchCurrentUser, loginWithPassword, logoutV3, type V3MeAccount } from '@/api/auth'
import {
  ApiError,
  getAccessToken,
  getAuthContextVersion,
  onAccessTokenChange,
  onPermissionDenied,
  refreshAccessToken,
  setAccessToken,
  wasRefreshRejected,
} from '@/api/http'

/**
 * 管理端身份与能力状态库：
 * 1. 访问令牌仅存内存；同账号静默刷新保留草稿与待确认操作；
 * 2. 切换账号或退出登录时增加 sessionEpoch 并清空私有能力缓存；
 * 3. 收到 403 越权响应时主动重拉后端能力矩阵并提示操作者。
 */
export const useAuthStore = defineStore('admin-auth', () => {
  const accessToken = ref<string | null>(getAccessToken())
  const account = ref<V3MeAccount | null>(null)
  const capabilities = ref<AdminCapabilities | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const capabilityError = ref('')
  const permissionChangedNotice = ref('')
  const sessionEpoch = ref(0)

  let restorePromise: Promise<void> | null = null
  let capPromise: Promise<AdminCapabilities | null> | null = null

  const isLoggedIn = computed(() => Boolean(accessToken.value && account.value))
  const canEnterConsole = computed(() => Boolean(capabilities.value?.canEnterConsole))

  function clearPrivateSessionState(): void {
    account.value = null
    capabilities.value = null
    capabilityError.value = ''
    permissionChangedNotice.value = ''
    sessionEpoch.value += 1
  }

  onAccessTokenChange((nextToken) => {
    const previous = accessToken.value
    accessToken.value = nextToken
    if (!nextToken && previous !== nextToken) {
      clearPrivateSessionState()
    }
  })

  // 当已登录期间接口返回 403，主动重拉最新能力矩阵并在界面提示权限发生变化
  onPermissionDenied(async (detail) => {
    if (!accessToken.value) {
      return
    }
    permissionChangedNotice.value = `权限已变化或操作受限（${detail.message}），已同步刷新当前账号后台能力。`
    await refreshCapabilities()
  })

  function dismissPermissionNotice(): void {
    permissionChangedNotice.value = ''
  }

  async function refreshCapabilities(): Promise<AdminCapabilities | null> {
    if (!getAccessToken()) {
      capabilities.value = null
      return null
    }
    if (capPromise) {
      return capPromise
    }

    const startVersion = getAuthContextVersion()
    const run = (async () => {
      try {
        const nextCaps = await fetchAdminCapabilities()
        if (startVersion !== getAuthContextVersion()) {
          return null
        }
        capabilities.value = nextCaps
        capabilityError.value = ''
        return nextCaps
      } catch (err) {
        if (startVersion !== getAuthContextVersion()) {
          return null
        }
        if (err instanceof ApiError && err.status === 401) {
          setAccessToken(null, true)
          return null
        }
        capabilityError.value = err instanceof Error ? err.message : '读取管理权限能力失败'
        return null
      }
    })().finally(() => {
      if (capPromise === run) {
        capPromise = null
      }
    })

    capPromise = run
    return run
  }

  async function restoreSession(): Promise<void> {
    if (restorePromise) {
      return restorePromise
    }
    if (initialized.value && isLoggedIn.value && capabilities.value) {
      return Promise.resolve()
    }

    const run = (async () => {
      loading.value = true
      const startVersion = getAuthContextVersion()
      try {
        if (!getAccessToken()) {
          const ok = await refreshAccessToken()
          if (!ok) {
            initialized.value = wasRefreshRejected()
            return
          }
        }
        if (startVersion !== getAuthContextVersion()) {
          return
        }
        const prevActorId = account.value?.id
        const me = await fetchCurrentUser()
        if (startVersion !== getAuthContextVersion()) {
          return
        }
        if (prevActorId && prevActorId !== me.id) {
          sessionEpoch.value += 1
        }
        account.value = me
        await refreshCapabilities()
        initialized.value = true
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAccessToken(null, true)
          initialized.value = true
        }
      } finally {
        loading.value = false
      }
    })().finally(() => {
      if (restorePromise === run) {
        restorePromise = null
      }
    })

    restorePromise = run
    return run
  }

  async function completeLogin(acceptCredential: () => Promise<unknown>): Promise<AdminCapabilities | null> {
    loading.value = true
    try {
      clearPrivateSessionState()
      await acceptCredential()
      const me = await fetchCurrentUser()
      account.value = me
      const caps = await refreshCapabilities()
      initialized.value = true
      return caps
    } finally {
      loading.value = false
    }
  }

  function login(nameOrEmail: string, password: string, mfaCode?: string): Promise<AdminCapabilities | null> {
    return completeLogin(() => loginWithPassword(nameOrEmail, password, mfaCode))
  }

  async function logout(): Promise<void> {
    loading.value = true
    try {
      await logoutV3()
    } finally {
      clearPrivateSessionState()
      initialized.value = true
      loading.value = false
    }
  }

  function hasMenu(menu: MenuKey): boolean {
    return Boolean(capabilities.value?.menus?.[menu])
  }

  function hasPermission(permissionId: string): boolean {
    return Boolean(capabilities.value?.permissions?.[permissionId])
  }

  return {
    accessToken,
    account,
    capabilities,
    initialized,
    loading,
    capabilityError,
    permissionChangedNotice,
    sessionEpoch,
    isLoggedIn,
    canEnterConsole,
    restoreSession,
    refreshCapabilities,
    login,
    completeLogin,
    logout,
    hasMenu,
    hasPermission,
    dismissPermissionNotice,
  }
})
