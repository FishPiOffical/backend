import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { AdminCapabilities } from '@/api/admin'
import { PLACEHOLDER_MODULES } from '@/navigation/menu'
import { useAuthStore } from '@/stores/auth'

/**
 * 管理后台路由表与前置守卫：
 * - 统一挂载在 BASE_URL（默认 /manage/）之下；
 * - 全部业务视图按路由懒加载；
 * - 每次切换均结合 auth.capabilities 校验访问授权，防止通过手输 URL 越权进入无权视图。
 */

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    groupTitle?: string
    requiresAuth?: boolean
    checkAccess?: (caps: AdminCapabilities) => boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/workbench',
      },
      {
        path: 'workbench',
        name: 'workbench',
        component: () => import('@/views/dashboard/WorkbenchView.vue'),
        meta: {
          title: '待办与概览',
          groupTitle: '工作台',
          requiresAuth: true,
          checkAccess: (c) => c.canEnterConsole,
        },
      },
      {
        path: 'review/reports',
        name: 'reports',
        component: () => import('@/views/review/ReportReviewView.vue'),
        meta: {
          title: '举报审核',
          groupTitle: '审核中心',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminReports),
        },
      },
      {
        path: 'review/identity',
        name: 'identity-review',
        component: () => import('@/views/review/IdentityReviewView.vue'),
        meta: {
          title: '企业认证审核',
          groupTitle: '审核中心',
          requiresAuth: true,
          checkAccess: (c) => c.isIdentityReviewer,
        },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/UserListView.vue'),
        meta: {
          title: '用户列表',
          groupTitle: '用户与权限',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminUsers),
        },
      },
      {
        path: 'users/:userId',
        name: 'user-detail',
        component: () => import('@/views/users/UserDetailView.vue'),
        meta: {
          title: '用户详情',
          groupTitle: '用户与权限',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminUsers),
        },
      },
      {
        path: 'oauth/clients',
        name: 'oauth-clients',
        component: () => import('@/views/oauth/OAuthClientView.vue'),
        meta: {
          title: 'OAuth 客户端管理',
          groupTitle: '开放平台',
          requiresAuth: true,
          checkAccess: (c) => c.actions.oauthManage,
        },
      },
      {
        path: 'modules/:moduleId',
        name: 'module-placeholder',
        component: () => import('@/views/common/ModulePlaceholderView.vue'),
        meta: {
          title: '功能建设规划',
          groupTitle: '阶段占位',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin,
        },
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('@/views/common/ForbiddenView.vue'),
        meta: {
          title: '无权限访问',
          groupTitle: '访问控制',
          requiresAuth: true,
        },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/workbench',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    await auth.restoreSession()
  }

  // 动态完善占位模块页标题与面包屑
  if (to.name === 'module-placeholder' && typeof to.params.moduleId === 'string') {
    const spec = PLACEHOLDER_MODULES[to.params.moduleId]
    if (spec) {
      to.meta.title = spec.title
      to.meta.groupTitle = spec.groupLabel
    }
  }

  if (to.meta.requiresAuth === false) {
    if (to.path === '/login' && auth.isLoggedIn && auth.canEnterConsole) {
      return '/workbench'
    }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!auth.capabilities) {
    await auth.refreshCapabilities()
  }

  const caps = auth.capabilities
  if (!caps || !caps.canEnterConsole) {
    return to.path === '/login' ? true : { path: '/login' }
  }

  if (to.name === 'module-placeholder' && typeof to.params.moduleId === 'string') {
    const spec = PLACEHOLDER_MODULES[to.params.moduleId]
    if (!spec || !spec.check(caps)) {
      return '/forbidden'
    }
  }

  if (typeof to.meta.checkAccess === 'function' && !to.meta.checkAccess(caps)) {
    return '/forbidden'
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta?.title ? `${to.meta.title} - Rhythm 管理后台` : 'Rhythm 管理后台'
  document.title = title
})

export default router
