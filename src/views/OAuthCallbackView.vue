<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { exchangeWebsiteOAuthCode, takeWebsiteOAuthCallback } from '@/api/websiteOAuth'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const errorMessage = ref('')

onMounted(async () => {
  try {
    const { code, attempt } = takeWebsiteOAuthCallback()
    const caps = await auth.completeLogin(() => exchangeWebsiteOAuthCode(code, attempt))
    if (!caps) {
      errorMessage.value = auth.capabilityError || '暂时无法确认后台访问权限，请返回登录页重试。'
      return
    }
    if (!caps.canEnterConsole) {
      await router.replace({ name: 'login' })
      return
    }
    const { target } = attempt
    const validTarget = typeof target === 'string' && /^\/(?!\/)[^\\\x00-\x1F]*$/.test(target)
      && router.resolve(target).meta.requiresAuth === true
    await router.replace(validTarget ? target : '/workbench')
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '登录失败，请稍后重试。'
  }
})
</script>

<template>
  <main class="oauth-callback">
    <h1>摸鱼派授权登录</h1>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <p v-else role="status">正在核验授权和后台访问权限…</p>
    <RouterLink v-if="errorMessage" class="admin-btn" :to="{ name: 'login' }">返回后台登录</RouterLink>
  </main>
</template>

<style scoped>
.oauth-callback {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1rem;
  padding: 1.5rem;
  text-align: center;
}
</style>
