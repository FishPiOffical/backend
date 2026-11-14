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
        path: 'content/articles',
        name: 'content-articles',
        component: () => import('@/views/content/ArticleListView.vue'),
        meta: {
          title: '文章与专栏管理',
          groupTitle: '内容管理',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminArticles),
        },
      },
      {
        path: 'content/articles/new',
        name: 'content-article-create',
        component: () => import('@/views/content/ArticleEditView.vue'),
        meta: {
          title: '新建文章',
          groupTitle: '内容管理',
          requiresAuth: true,
          checkAccess: (c) => c.actions.articleCreate,
        },
      },
      {
        path: 'content/articles/:articleId',
        name: 'content-article-edit',
        component: () => import('@/views/content/ArticleEditView.vue'),
        meta: {
          title: '文章详情与编辑',
          groupTitle: '内容管理',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminArticles),
        },
      },
      {
        path: 'content/comments',
        name: 'content-comments',
        component: () => import('@/views/content/CommentManageView.vue'),
        meta: {
          title: '评论管理',
          groupTitle: '内容管理',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminComments),
        },
      },
      {
        path: 'content/breezemoons',
        name: 'content-breezemoons',
        component: () => import('@/views/content/BreezemoonManageView.vue'),
        meta: {
          title: '清风明月管理',
          groupTitle: '内容管理',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminBreezemoons),
        },
      },
      {
        path: 'system/audit-logs',
        name: 'system-audit-logs',
        component: () => import('@/views/system/AuditLogView.vue'),
        meta: {
          title: '全站操作审计日志',
          groupTitle: '系统与安全',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin,
        },
      },
      {
        path: 'modules/articles',
        redirect: '/content/articles',
      },
      {
        path: 'modules/comments',
        redirect: '/content/comments',
      },
      {
        path: 'modules/breezemoons',
        redirect: '/content/breezemoons',
      },
      {
        path: 'modules/audit-logs',
        redirect: '/system/audit-logs',
      },
      {
        path: 'review/fish-games',
        name: 'fish-game-review',
        component: () => import('@/views/review/FishGameReviewView.vue'),
        meta: {
          title: '鱼游投稿审核',
          groupTitle: '审核中心',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && (c.isAdmin || Boolean(c.permissions.menuAdminMisc)),
        },
      },
      {
        path: 'review/milestones',
        name: 'milestone-review',
        component: () => import('@/views/review/MilestoneReviewView.vue'),
        meta: {
          title: '大事记审核',
          groupTitle: '审核中心',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && (c.isAdmin || Boolean(c.permissions.menuAdminMilestone)),
        },
      },
      {
        path: 'review/images',
        name: 'image-review',
        component: () => import('@/views/review/ImageReviewView.vue'),
        meta: {
          title: '图片审核',
          groupTitle: '审核中心',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && !c.rhypicEnabled && c.isAdmin,
        },
      },
      {
        path: 'users/roles',
        name: 'roles',
        component: () => import('@/views/users/RoleManageView.vue'),
        meta: {
          title: '角色权限配置',
          groupTitle: '用户与权限',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminRoles),
        },
      },
      {
        path: 'users/invitecodes',
        name: 'invitecodes',
        component: () => import('@/views/users/InvitecodeManageView.vue'),
        meta: {
          title: '邀请码管理',
          groupTitle: '用户与权限',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminIcs),
        },
      },
      {
        path: 'assets/vip',
        name: 'vip',
        component: () => import('@/views/assets/VipManageView.vue'),
        meta: {
          title: 'VIP 与套餐优惠券',
          groupTitle: '会员与资产',
          requiresAuth: true,
          checkAccess: (c) => c.canAccessAdmin && c.isAdmin,
        },
      },
      {
        path: 'assets/medals',
        name: 'medals',
        component: () => import('@/views/assets/MedalManageView.vue'),
        meta: {
          title: '勋章定义与授予',
          groupTitle: '会员与资产',
          requiresAuth: true,
          checkAccess: (c) =>
            c.canAccessAdmin &&
            (c.isAdmin || Boolean(c.permissions.userGiveMetal || c.permissions.userRemoveMetal)),
        },
      },
      {
        path: 'assets/points-bags',
        name: 'points-bags',
        component: () => import('@/views/assets/PointsBagsView.vue'),
        meta: {
          title: '积分、工资与背包',
          groupTitle: '会员与资产',
          requiresAuth: true,
          checkAccess: (c) =>
            c.canAccessAdmin &&
            (c.isAdmin ||
              Boolean(
                c.permissions.userAddPoint ||
                  c.permissions.userDeductPoint ||
                  c.permissions.userExchangePoint ||
                  c.permissions.userAdjustBag,
              )),
        },
      },
      {
        path: 'ops/domains-tags',
        name: 'domains-tags',
        component: () => import('@/views/ops/DomainsTagsView.vue'),
        meta: {
          title: '领域、导航与标签',
          groupTitle: '社区运营',
          requiresAuth: true,
          checkAccess: (c) =>
            c.canAccessAdmin && Boolean(c.permissions.menuAdminDomains || c.permissions.menuAdminTags),
        },
      },
      {
        path: 'ops/reserved-ad',
        name: 'reserved-ad',
        component: () => import('@/views/ops/ReservedAdView.vue'),
        meta: {
          title: '保留词与广告位',
          groupTitle: '社区运营',
          requiresAuth: true,
          checkAccess: (c) =>
            c.canAccessAdmin && Boolean(c.permissions.menuAdminRWs || c.permissions.menuAdminAD),
        },
      },
      {
        path: 'ops/community-records',
        name: 'community-records',
        component: () => import('@/views/ops/CommunityRecordsView.vue'),
        meta: {
          title: '鱼游与大事记维护',
          groupTitle: '社区运营',
          requiresAuth: true,
          checkAccess: (c) =>
            c.canAccessAdmin &&
            (c.isAdmin || Boolean(c.permissions.menuAdminMisc || c.permissions.menuAdminMilestone)),
        },
      },
      { path: 'modules/fish-game-review', redirect: '/review/fish-games' },
      { path: 'modules/milestone-review', redirect: '/review/milestones' },
      { path: 'modules/image-review', redirect: '/review/images' },
      { path: 'modules/roles', redirect: '/users/roles' },
      { path: 'modules/invitecodes', redirect: '/users/invitecodes' },
      { path: 'modules/vip', redirect: '/assets/vip' },
      { path: 'modules/medals', redirect: '/assets/medals' },
      { path: 'modules/points-bags', redirect: '/assets/points-bags' },
      { path: 'modules/domains-tags', redirect: '/ops/domains-tags' },
      { path: 'modules/reserved-ad', redirect: '/ops/reserved-ad' },
      { path: 'modules/community-records', redirect: '/ops/community-records' },
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
