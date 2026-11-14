import { md5 } from 'js-md5'
import {
  bumpAuthContextVersion,
  queueCredentialRequest,
  request,
  requestData,
  setAccessToken,
  type ApiEnvelope,
} from './http'

/**
 * 第一方 V3 登录与会话接口封装。
 */

export interface LoginTokenResult {
  accessToken: string
  tokenType: string
  expiresIn: number
  refreshExpiresIn: number
  scope: string
}

export interface V3MeAccount {
  id: string
  userName: string
  userNickname: string
  userAvatarURL: string
  userRole: string
  userPoint?: number
  [key: string]: unknown
}

export async function loginWithPassword(
  nameOrEmail: string,
  plainPassword: string,
  mfaCode?: string,
): Promise<LoginTokenResult> {
  return queueCredentialRequest(async () => {
    const body: Record<string, string> = {
      nameOrEmail: nameOrEmail.trim(),
      userPassword: md5(plainPassword),
    }
    if (mfaCode && mfaCode.trim()) {
      body.mfaCode = mfaCode.trim()
    }

    const res = await request<ApiEnvelope<LoginTokenResult>>('/api/v3/auth/login', {
      method: 'POST',
      skipAuth: true,
      skipRefreshRetry: true,
      body: JSON.stringify(body),
    })

    const data = res.data
    if (!data?.accessToken) {
      throw new Error('登录响应缺少访问令牌')
    }

    // 登录成功切换当前上下文并写入内存令牌
    bumpAuthContextVersion()
    setAccessToken(data.accessToken, false)
    return data
  })
}

export async function logoutV3(): Promise<void> {
  await queueCredentialRequest(async () => {
    try {
      await request('/api/v3/auth/logout', {
        method: 'POST',
        skipAuth: true,
        skipRefreshRetry: true,
        body: '{}',
      })
    } finally {
      setAccessToken(null, true)
    }
  })
}

export async function fetchCurrentUser(): Promise<V3MeAccount> {
  return requestData<V3MeAccount>('/api/v3/me', {
    method: 'GET',
  })
}
