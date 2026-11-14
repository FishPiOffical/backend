<script setup lang="ts">
import { useRouter } from 'vue-router'
import PageStateView from '@/components/common/PageStateView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 无权限访问兜底页面：支持刷新能力矩阵或回到允许进入的首个可用页面。
 */
const router = useRouter()
const auth = useAuthStore()

async function handleBackHome(): Promise<void> {
  await auth.refreshCapabilities()
  if (auth.capabilities?.canEnterConsole) {
    await router.replace('/workbench')
  } else {
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="admin-page">
    <PageStateView
      state="forbidden"
      title="当前账号没有访问该页面的权限"
      description="操作与菜单权限均按后端实时角色、权限位及指定审核人资格分别校验，如需开通请联系全站管理员。"
      @go-home="handleBackHome"
    />
  </div>
</template>
