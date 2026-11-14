<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

/**
 * 第一方管理登录页：
 * - 复用 /api/v3/auth/login，访问令牌仅存放内存，刷新令牌依赖同域 HttpOnly Cookie；
 * - 若账号启用了 MFA 两步验证，检测到 mfa_required 后展开一次性动态码输入框；
 * - 登录后校验当前账号是否具备进入后台或认证审核台资格。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const nameOrEmail = ref('')
const password = ref('')
const mfaCode = ref('')
const mfaRequired = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

const blockedNonAdmin = computed(
  () => auth.isLoggedIn && auth.capabilities !== null && !auth.capabilities.canEnterConsole,
)

async function handleSubmit(): Promise<void> {
  if (!nameOrEmail.value.trim() || !password.value) {
    errorMessage.value = '请输入用户名/邮箱与密码'
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const caps = await auth.login(
      nameOrEmail.value,
      password.value,
      mfaRequired.value ? mfaCode.value : undefined,
    )
    if (!caps?.canEnterConsole) {
      errorMessage.value = '当前账号已登录，但没有管理后台访问权限或指定审核员资格。'
      return
    }
    const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/workbench'
    await router.replace(target)
  } catch (err) {
    if (err instanceof ApiError && err.errorCode === 'mfa_required') {
      mfaRequired.value = true
      errorMessage.value = '该账号已开启两步验证（MFA），请输入 6 位动态验证码后再次提交。'
      return
    }
    errorMessage.value = err instanceof Error ? err.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

async function handleSwitchAccount(): Promise<void> {
  await auth.logout()
  password.value = ''
  mfaCode.value = ''
  mfaRequired.value = false
  errorMessage.value = ''
}
</script>

<template>
  <div class="login-page">
    <header class="login-page__bar">
      <div class="login-brand">
        <span class="login-brand__dot">R</span>
        <span>Rhythm 管理后台</span>
      </div>
      <button type="button" class="admin-btn admin-btn--sm" @click="theme.toggleTheme()">
        {{ theme.theme === 'classic-dark' ? '切换浅色主题' : '切换深色主题' }}
      </button>
    </header>

    <main class="login-page__main">
      <section class="admin-panel login-card">
        <h1 class="login-card__title">管理端登录</h1>
        <p class="login-card__subtitle">
          使用第一方社区管理员、运营或指定审核员账号登录。访问令牌仅驻留内存，不写入浏览器持久化存储。
        </p>

        <div v-if="blockedNonAdmin" class="login-alert login-alert--warn">
          <p>
            当前已登录账号
            <strong>{{ auth.account?.userName }}</strong>
            （{{ auth.capabilities?.roleName }}）未获授管理后台入口或认证审核资格。
          </p>
          <button type="button" class="admin-btn admin-btn--sm" @click="handleSwitchAccount">
            退出并切换管理账号
          </button>
        </div>

        <form v-else class="login-form" @submit.prevent="handleSubmit">
          <div class="login-field">
            <label for="login-account">用户名或邮箱</label>
            <input
              id="login-account"
              v-model="nameOrEmail"
              type="text"
              class="admin-input"
              autocomplete="username"
              placeholder="输入用户名或绑定邮箱"
              :disabled="submitting"
            />
          </div>

          <div class="login-field">
            <label for="login-password">密码</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="admin-input"
              autocomplete="current-password"
              placeholder="输入登录密码（本地 MD5 后提交）"
              :disabled="submitting"
            />
          </div>

          <div v-if="mfaRequired" class="login-field">
            <label for="login-mfa">两步验证码（MFA）</label>
            <input
              id="login-mfa"
              v-model="mfaCode"
              type="text"
              inputmode="numeric"
              maxlength="12"
              class="admin-input admin-mono"
              autocomplete="one-time-code"
              placeholder="请输入 6 位动态验证码"
              :disabled="submitting"
            />
          </div>

          <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>

          <button type="submit" class="admin-btn admin-btn--primary login-submit" :disabled="submitting">
            {{ submitting ? '正在核验身份...' : '登录管理后台' }}
          </button>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--fp-page-bg);
}

.login-page__bar {
  height: var(--fp-topbar-h);
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--fp-nav);
  border-bottom: 1px solid var(--fp-border);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: var(--fp-title);
}

.login-brand__dot {
  width: 28px;
  height: 28px;
  border-radius: var(--fp-radius-md);
  background: var(--fp-primary-fill);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.login-page__main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 26px 24px;
}

.login-card__title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--fp-title);
}

.login-card__subtitle {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--fp-muted);
  line-height: 1.6;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--fp-head);
}

.login-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--fp-radius-sm);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
  font-size: 13px;
}

.login-alert {
  padding: 14px;
  border-radius: var(--fp-radius-md);
  background: var(--fp-warning-soft);
  border: 1px solid var(--fp-warning);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.login-alert p {
  margin: 0;
}

.login-submit {
  width: 100%;
  margin-top: 4px;
  min-height: 40px;
}
</style>
