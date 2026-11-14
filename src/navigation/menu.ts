import type { AdminCapabilities, MenuKey } from '@/api/admin'

/**
 * 九大一级导航与二至四阶段模块元数据单一配置源，供侧栏导航、面包屑、工作台快捷入口与占位页共用。
 */

export interface AdminNavItem {
  id: string
  label: string
  to: string
  phase: '一期V3' | '二期V3' | '三期V3' | '既有V3' | '二期' | '三期' | '四期'
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
        to: '/modules/professions',
        phase: '四期',
        check: (c) => c.canAccessAdmin && c.isAdmin,
      },
      {
        id: 'pets-logs',
        label: '宠物活动与风控日志',
        to: '/modules/pets-logs',
        phase: '四期',
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
        to: '/modules/site-settings',
        phase: '四期',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.ipManage || c.permissions.menuAdminMisc),
      },
      {
        id: 'security-tools',
        label: '安全状态与维护工具',
        to: '/modules/security-tools',
        phase: '四期',
        check: (c) => c.canAccessAdmin && (c.isAdmin || c.isSecurityOperator),
      },
    ],
  },
]

export const PLACEHOLDER_MODULES: Record<string, PlaceholderModuleSpec> = {
  professions: {
    id: 'professions',
    groupLabel: '职业与宠物',
    title: '职业配置独立编辑工作台',
    phase: '四期',
    requiredPermissionDesc: '管理员权限',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第四阶段实现：职业目录、等级奖励、自动化规则、草稿/发布/停用/复制/历史回滚与导入预检模拟。',
    constraints: ['导入配置必须先经预检对比', '迁移与奖励补发政策不可简化为单个启用开关'],
    check: (c) => c.canAccessAdmin && c.isAdmin,
  },
  'pets-logs': {
    id: 'pets-logs',
    groupLabel: '职业与宠物',
    title: '宠物活动与风控日志（只读）',
    phase: '四期',
    requiredPermissionDesc: '管理员权限',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第四阶段提供严格只读的宠物活动与风控日志检索，对齐原网页 Session 鉴权门槛。',
    constraints: ['首版严格只读，不提供改币、重置宠物或清零操作'],
    check: (c) => c.canAccessAdmin && c.isAdmin,
  },
  'site-settings': {
    id: 'site-settings',
    groupLabel: '系统与安全',
    title: 'IP 管理与站点杂项配置',
    phase: '四期',
    requiredPermissionDesc: 'ipManage / menuAdminMisc',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第四阶段实现：IP 封禁库维护与开放注册、匿名访问、发帖/评论开关等站点配置。',
    constraints: ['高危配置调整须二次确认与幂等保障'],
    check: (c) => c.canAccessAdmin,
  },
  'security-tools': {
    id: 'security-tools',
    groupLabel: '系统与安全',
    title: '安全状态、爬虫观测与维护工具',
    phase: '四期',
    requiredPermissionDesc: '特定安全操作员（如 adlered）或管理员维护授权',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第四阶段实现：安全状态总览、连接统计、爬虫观测与索引维护工具。',
    constraints: [
      '保留特殊账号授权（如安全操作员），不得扩大为所有管理员通用权限',
      '生产开关只读，开发开关需明确标识为重启失效的临时状态',
      '连接数不等于去重人数，运行期有界数据不冒充长期全量审计',
    ],
    check: (c) => c.canAccessAdmin,
  },
}
