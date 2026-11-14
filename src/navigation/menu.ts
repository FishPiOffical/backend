import type { AdminCapabilities, MenuKey } from '@/api/admin'

/**
 * 九大一级导航与二至四阶段模块元数据单一配置源，供侧栏导航、面包屑、工作台快捷入口与占位页共用。
 */

export interface AdminNavItem {
  id: string
  label: string
  to: string
  phase: '一期V3' | '二期V3' | '既有V3' | '二期' | '三期' | '四期'
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
        to: '/modules/fish-game-review',
        phase: '三期',
        check: (c) => c.canAccessAdmin && (c.isAdmin || Boolean(c.permissions.menuAdminMisc)),
      },
      {
        id: 'milestone-review',
        label: '大事记审核',
        to: '/modules/milestone-review',
        phase: '三期',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminMilestone),
      },
      {
        id: 'image-review',
        label: '图片审核',
        to: '/modules/image-review',
        phase: '三期',
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
        to: '/modules/roles',
        phase: '三期',
        check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminRoles),
      },
      {
        id: 'invitecodes',
        label: '邀请码管理',
        to: '/modules/invitecodes',
        phase: '三期',
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
        to: '/modules/vip',
        phase: '三期',
        check: (c) => c.canAccessAdmin && c.isAdmin,
      },
      {
        id: 'medals',
        label: '勋章定义与授予',
        to: '/modules/medals',
        phase: '三期',
        check: (c) =>
          c.canAccessAdmin &&
          (c.isAdmin || Boolean(c.permissions.userGiveMetal || c.permissions.userRemoveMetal)),
      },
      {
        id: 'points-bags',
        label: '积分、工资与背包',
        to: '/modules/points-bags',
        phase: '三期',
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
        to: '/modules/domains-tags',
        phase: '三期',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.menuAdminDomains || c.permissions.menuAdminTags),
      },
      {
        id: 'reserved-ad',
        label: '保留词与广告位',
        to: '/modules/reserved-ad',
        phase: '三期',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.menuAdminRWs || c.permissions.menuAdminAD),
      },
      {
        id: 'community-records',
        label: '鱼游与大事记维护',
        to: '/modules/community-records',
        phase: '三期',
        check: (c) =>
          c.canAccessAdmin && Boolean(c.permissions.menuAdminMisc || c.permissions.menuAdminMilestone),
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
  'fish-game-review': {
    id: 'fish-game-review',
    groupLabel: '审核中心',
    title: '鱼游投稿及修改审核',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminMisc 或管理员审核权限',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '规划用于集中处理鱼游新投稿及已上线资料修改审核，当前一期 V3 接口尚未迁入。',
    constraints: ['需区分布局中的待审、通过、拒绝与停用状态', '已上线资料与待审修改并存时必须提供前后字段对比'],
    check: (c) => c.canAccessAdmin,
  },
  'milestone-review': {
    id: 'milestone-review',
    groupLabel: '审核中心',
    title: '大事记审核',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminMilestone',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '大事记投稿审核将集中放在审核中心处理，日常新增与维护保留在“社区运营”。',
    constraints: ['审核中心与社区运营引用同一大事记记录与状态', '记录操作审计与幂等键保护'],
    check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminMilestone),
  },
  'image-review': {
    id: 'image-review',
    groupLabel: '审核中心',
    title: '图片审核',
    phase: '三期',
    requiredPermissionDesc: '管理员权限（且未启用 RhyPic 时显示）',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '启用 RhyPic 时旧版图片审核入口应隐藏；接入前需先核实实际图床管理接口能力。',
    constraints: ['严禁在启用 RhyPic 后展示失效的旧七牛删图入口'],
    check: (c) => c.canAccessAdmin && !c.rhypicEnabled,
  },
  roles: {
    id: 'roles',
    groupLabel: '用户与权限',
    title: '角色权限配置',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminRoles',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：角色列表查看与权限矩阵维护，严格隔离管理员、OP 与纪律委员权责边界。',
    constraints: ['不可把 OP 或纪律委员隐式扩大为管理员', '权限变更后所有管理员请求实时重新查库鉴权'],
    check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminRoles),
  },
  invitecodes: {
    id: 'invitecodes',
    groupLabel: '用户与权限',
    title: '邀请码管理',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminIcs',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：批量生成邀请码、备注维护、停用与使用追踪。',
    constraints: ['严格映射旧状态枚举：0 已使用、1 未使用、2 停用'],
    check: (c) => c.canAccessAdmin && Boolean(c.permissions.menuAdminIcs),
  },
  vip: {
    id: 'vip',
    groupLabel: '会员与资产',
    title: 'VIP 开通、套餐与优惠券',
    phase: '三期',
    requiredPermissionDesc: '管理员权限',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段整合原侧栏之外的 VIP 套餐/优惠券入口，将用户 VIP 实例维护与套餐配置分离呈现。',
    constraints: ['退款必须沿用按剩余天数计算并同步失效的既有规则', '优惠券可用次数 -1 明确标识为“无限制”'],
    check: (c) => c.canAccessAdmin && c.isAdmin,
  },
  medals: {
    id: 'medals',
    groupLabel: '会员与资产',
    title: '勋章定义、预览与授予撤销',
    phase: '三期',
    requiredPermissionDesc: 'userGiveMetal / userRemoveMetal',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：勋章安全预览、持有者检索、单项授予/撤销与批量发放逐项回执。',
    constraints: ['到期时间 0 表示永久并保留会员到期回填规则', '批量授予需逐项展示成功、失败、未执行与待确认状态'],
    check: (c) => c.canAccessAdmin,
  },
  'points-bags': {
    id: 'points-bags',
    groupLabel: '会员与资产',
    title: '积分操作、工资与背包调整',
    phase: '三期',
    requiredPermissionDesc: 'userAddPoint / userDeductPoint / userExchangePoint / userAdjustBag',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：积分增减、兑换、补发初始积分、工资核算与背包增减。',
    constraints: ['提交前必须展示目标用户、方向、数量与影响摘要', '强制严格事务 + 账本 + Idempotency-Key，避免重复扣发'],
    check: (c) => c.canAccessAdmin,
  },
  'domains-tags': {
    id: 'domains-tags',
    groupLabel: '社区运营',
    title: '领域、导航排序与标签绑定',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminDomains / menuAdminTags',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：社区领域、导航顺序及标签绑定清理工具。',
    constraints: ['保存后实时同步前端导航缓存'],
    check: (c) => c.canAccessAdmin,
  },
  'reserved-ad': {
    id: 'reserved-ad',
    groupLabel: '社区运营',
    title: '保留词与广告位维护',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminRWs / menuAdminAD',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：敏感词/保留词词表管理与侧栏/横幅广告位配置。',
    constraints: ['广告片段输出需保留既有的安全清洗边界'],
    check: (c) => c.canAccessAdmin,
  },
  'community-records': {
    id: 'community-records',
    groupLabel: '社区运营',
    title: '鱼游资料与大事记日常维护',
    phase: '三期',
    requiredPermissionDesc: 'menuAdminMisc / menuAdminMilestone',
    legacyEntry: '/admin',
    legacyLabel: '前往旧版管理后台',
    summary: '第三阶段实现：已上线鱼游与社区大事记记录的日常补充与编辑。',
    constraints: ['与审核中心队列保持同一对象数据源'],
    check: (c) => c.canAccessAdmin,
  },
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
