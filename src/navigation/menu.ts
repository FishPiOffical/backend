import type { AdminCapabilities, MenuKey } from '@/api/admin'

/**
 * 九大一级导航与二至四阶段模块元数据单一配置源，供侧栏导航、面包屑、工作台快捷入口与占位页共用。
 */

export interface AdminNavItem {
  id: string
  label: string
  to: string
  phase: '一期V3' | '二期V3' | '三期V3' | '四期V3' | '既有V3' | '二期' | '三期' | '四期'
  check?: (caps: AdminCapabilities) => boolean
  hideWhenRhypic?: boolean
}

export interface AdminNavGroup {
  key: MenuKey
  label: string
  shortLabel: string
  items: AdminNavItem[]
}

export interface PlaceholderModuleSpec {
  id: string
  groupLabel: string
  title: string
  phase: '二期' | '三期' | '四期'
  requiredPermissionDesc: string
  legacyEntry: string
  legacyLabel: string
  summary: string
  constraints: string[]
  check: (caps: AdminCapabilities) => boolean
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    key: 'workbench',
    label: '工作台',
    shortLabel: '台',
    items: [
      { id: 'workbench', label: '待办与概览', to: '/workbench', phase: '一期V3' },
    ],
  },
  {
    key: 'review',
    label: '审核中心',
    shortLabel: '审',
    items: [
      {
        id: 'reports',
        label: '举报审核',
        to: '/review/reports',
        phase: '一期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminReports),
      },
      {
        id: 'identity',
        label: '企业认证审核',
        to: '/review/identity',
        phase: '既有V3',
        check: (c) => c.isIdentityReviewer,
      },
      {
        id: 'fish-game-review',
        label: '鱼游投稿审核',
        to: '/review/fish-games',
        phase: '三期V3',
        check: (c) => c.canAccessAdmin && (c.isAdmin || Boolean(c.permissions.menuAdminMisc)),
      },
      {
        id: 'milestone-review',
        label: '大事记审核',
        to: '/review/milestones',
        phase: '三期V3',
        check: (c) => c.canAccessAdmin && (c.isAdmin || Boolean(c.permissions.menuAdminMilestone)),
      },
      {
        id: 'image-review',
        label: '图片审核',
        to: '/review/images',
        phase: '三期V3',
        hideWhenRhypic: true,
        check: (c) => c.canAccessAdmin && !c.rhypicEnabled && c.isAdmin,
      },
    ],
  },
  {
    key: 'content',
    label: '内容管理',
    shortLabel: '文',
    items: [
      {
        id: 'articles',
        label: '文章与专栏',
        to: '/content/articles',
        phase: '二期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminArticles),
      },
      {
        id: 'comments',
        label: '评论管理',
        to: '/content/comments',
        phase: '二期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminComments),
      },
      {
        id: 'breezemoons',
        label: '清风明月',
        to: '/content/breezemoons',
        phase: '二期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminBreezemoons),
      },
    ],
  },
  {
    key: 'users',
    label: '用户与权限',
    shortLabel: '户',
    items: [
      {
        id: 'users-list',
        label: '用户列表与详情',
        to: '/users',
        phase: '一期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminUsers),
      },
      {
        id: 'roles',
        label: '角色权限配置',
        to: '/users/roles',
        phase: '三期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminRoles),
      },
      {
        id: 'invitecodes',
        label: '邀请码管理',
        to: '/users/invitecodes',
        phase: '三期V3',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminIcs),
      },
    ],
  },
  {
    key: 'membershipAssets',
    label: '会员与资产',
    shortLabel: '资',
    items: [
      {
        id: 'vip',
        label: 'VIP 与套餐优惠券',
        to: '/assets/vip',
        phase: '三期V3',
        check: (c) => c.canAccessAdmin && c.isAdmin,
      },
      {
        id: 'medals',
        label: '勋章定义与授予',
        to: '/assets/medals',
        phase: '三期V3',
        check: (c) =>
          c.canAccessAdmin &&
          (c.isAdmin || Boolean(c.permissions.userGiveMetal || c.permissions.userRemoveMetal)),
      },
      {
        id: 'points-bags',
        label: '积分、工资与背包',
        to: '/assets/points-bags',
        phase: '三期V3',
        check: (c) =>
          c.canAccessAdmin &&
          (c.isAdmin ||
            Boolean(
              c.permissions.userAddPoint ||
                c.permissions.userDeductPoint ||
                c.permissions.userExchangePoint ||
                c.permissions.userAdjustBag,
            )),
      },
    ],
  },
  {
    key: 'communityOps',
    label: '社区运营',
    shortLabel: '营',
    items: [
      {
        id: 'domains-tags',
        label: '领域、导航与标签',
        to: '/ops/domains-tags',
        phase: '三期V3',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.menuAdminDomains || c.permissions.menuAdminTags),
      },
      {
        id: 'reserved-ad',
        label: '保留词与广告位',
        to: '/ops/reserved-ad',
        phase: '三期V3',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.menuAdminRWs || c.permissions.menuAdminAD),
      },
      {
        id: 'community-records',
        label: '鱼游与大事记维护',
        to: '/ops/community-records',
        phase: '三期V3',
        check: (c) =>
          c.canAccessAdmin &&
          (c.isAdmin || Boolean(c.permissions.menuAdminMisc || c.permissions.menuAdminMilestone)),
      },
    ],
  },
  {
    key: 'professionsPets',
    label: '职业与宠物',
    shortLabel: '职',
    items: [
      {
        id: 'professions',
        label: '职业配置工作台',
        to: '/professions',
        phase: '四期V3',
        check: (c) => c.canAccessAdmin && c.isAdmin,
      },
      {
        id: 'pets-logs',
        label: '宠物活动与风控日志',
        to: '/professions/pet-logs',
        phase: '四期V3',
        check: (c) => c.canAccessAdmin && c.isAdmin,
      },
    ],
  },
  {
    key: 'openPlatform',
    label: '开放平台',
    shortLabel: '开',
    items: [
      {
        id: 'oauth-clients',
        label: 'OAuth 客户端管理',
        to: '/oauth/clients',
        phase: '既有V3',
        check: (c) => c.actions.oauthManage,
      },
    ],
  },
  {
    key: 'systemSecurity',
    label: '系统与安全',
    shortLabel: '安',
    items: [
      {
        id: 'audit-logs',
        label: '操作审计日志',
        to: '/system/audit-logs',
        phase: '二期V3',
        check: (c) => c.canAccessAdmin,
      },
      {
        id: 'site-settings',
        label: 'IP 与站点配置',
        to: '/system/site-settings',
        phase: '四期V3',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.ipManage || c.permissions.menuAdminMisc),
      },
      {
        id: 'security-tools',
        label: '安全状态与维护工具',
        to: '/system/security-tools',
        phase: '四期V3',
        check: (c) =>
          c.canAccessAdmin &&
          (c.isSecurityOperator ||
            Boolean(
              c.permissions.articleReindexArticleIndex || c.permissions.articleReindexArticlesIndex,
            )),
      },
    ],
  },
]

export const PLACEHOLDER_MODULES: Record<string, PlaceholderModuleSpec> = {}
