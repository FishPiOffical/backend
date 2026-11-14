# Rhythm 管理后台接口与权限逐项映射契约

本文档依据 [管理后台开发规划](../管理后台开发规划.md) 整理，明确管理前端与 Rhythm `api_v3` 后端之间的权限体系、九大一级入口映射、统一响应包络、分页筛选规范、`Idempotency-Key` 写入恢复契约及批量结果契约。

## 1. 认证与权限能力模型

### 1.1 第一方身份与令牌约束

- 管理前端仅使用第一方 `website_v3` Bearer 认证体系（`POST /api/v3/auth/login`、`POST /api/v3/auth/refresh`、`POST /api/v3/auth/logout`、`GET /api/v3/auth/session`、`GET /api/v3/me`），`accessToken` 仅保存在内存状态中，不写入 `localStorage` / `sessionStorage`。
- 第三方 OAuth 客户端令牌（非 `website_v3`）及普通未授权账号不得用于管理写入或管理能力访问。
- 管理员角色及特殊操作员身份始终在每次后端请求时重新查库校验，前端隐藏菜单或按钮仅作为交互提示，不承担安全边界。

### 1.2 能力聚合接口：`GET /api/v3/admin/capabilities`

登录态下前端路由守卫与侧栏导航统一读取该接口，后端结合当前用户角色、状态、全站权限表及指定身份判定返回能力矩阵：

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "canAccessAdmin": true,
    "userId": "1630399192600",
    "userName": "admin",
    "roleId": "adminRole",
    "roleName": "管理员",
    "isAdmin": true,
    "isSecurityOperator": false,
    "isIdentityReviewer": true,
    "rhypicEnabled": false,
    "permissions": {
      "menuAdmin": true,
      "menuAdminReports": true,
      "menuAdminUsers": true,
      "menuAdminArticles": true,
      "menuAdminComments": true,
      "menuAdminBreezemoons": true,
      "userUpdateUserBasic": true,
      "userUpdateUserAdvanced": true,
      "userRemoveMFA": true,
      "articleAddArticle": true,
      "articleUpdateArticleBasic": true,
      "articleStickArticle": true,
      "articleCancelStickArticle": true,
      "articleRemoveArticle": true,
      "commentUpdateCommentBasic": true,
      "commentRemoveComment": true,
      "breezemoonUpdateBreezemoon": true,
      "breezemoonRemoveBreezemoon": true
    },
    "menus": {
      "workbench": true,
      "review": true,
      "content": true,
      "users": true,
      "membershipAssets": true,
      "communityOps": true,
      "professionsPets": true,
      "openPlatform": true,
      "systemSecurity": true
    },
    "actions": {
      "reportHandle": true,
      "reportIgnore": true,
      "repeaterRemove": true,
      "identityReview": true,
      "userEditBasic": true,
      "userEditAdvanced": true,
      "userEditRole": true,
      "userDeactivate": true,
      "userRemoveMfa": true,
      "oauthManage": true,
      "articleCreate": true,
      "articleEdit": true,
      "articleStick": true,
      "articleCancelStick": true,
      "articleRemove": true,
      "commentEdit": true,
      "commentRemove": true,
      "breezemoonEdit": true,
      "breezemoonRemove": true,
      "auditLogView": true
    },
    "fetchedAt": 1763100000000
  }
}
```

权限隔离原则：

- `menuAdmin` 仅代表具备进入后台的基础能力，不自动赋予 `isAdmin`、`isIdentityReviewer` 或 `isSecurityOperator`。
- 角色、账号状态或令牌权限变更后，后端后续请求返回 HTTP `401` / `403`，前端触发 `capabilities` 重拉并弹出权限变化提示，提供返回安全页入口。
- 退出登录或切换账号时清空内存令牌、能力缓存、草稿和待确认幂等任务。

## 2. 九大一级入口逐项映射表

> 阶段口径：`第一阶段`（基础框架 + 代表页面 + 既有 V3 模块接入）、`第二阶段`（日常管理首版闭环）、`第三阶段`（完整运营功能）、`第四阶段`（专项管理与迁移收尾）。

| 一级入口 | 子模块 / 页面 | 旧后台参考入口 / 方式 | 所需角色 / 权限标识 | V3 目标接口 | 实施阶段 | 必须保留的业务边界 |
| --- | --- | --- | --- | --- | --- | --- |
| 工作台 | 首页概览、待办汇总、快捷入口 | `AdminProcessor#showAdminIndex`（`/admin`） | `menuAdmin` | `GET /api/v3/admin/capabilities`<br>`GET /api/v3/admin/dashboard` | 第一阶段（已提供真实待办与基础统计；历史趋势待四期评估数据源） | 缺少数据源的指标显示“未知”，禁止填零或展示模拟数字 |
| 审核中心 | 举报审核（待处理 / 已处理 / 忽略 / 移除复读机目标） | `AdminProcessor#showReports`（`/admin/reports`）、`/admin/report/{id}`、`/admin/report/ignore/{id}`、`/admin/repeater/{id}/remove` | `menuAdminReports` | `GET /api/v3/admin/reports`<br>`POST /api/v3/admin/reports/{reportId}/handle`<br>`POST /api/v3/admin/reports/{reportId}/ignore`<br>`POST /api/v3/admin/repeater/{id}/remove` | 第一阶段代表页；二期已接入文章/评论/用户与操作审计直达联动 | “标记已处理”“忽略”“删除目标”严格分离；禁止处理自己提交的举报；展示对象上下文与真实最新状态 |
| 审核中心 | 身份／企业认证审核 | 既有 V3 审核接口（`ApiV3IdentityApplicationProcessor`） | 指定审核人 `isIdentityReviewer`（`profile.read` / `settings.write`） | `GET /api/v3/review/identity-applications`<br>`POST /api/v3/review/identity-applications/{applicationId}/material/open`<br>`PUT /api/v3/review/identity-applications/{applicationId}/decision` | 第一阶段直接接入既有 V3 | 材料为一次性读取并删除原图：必须用户主动点击打开，严禁自动预览、预加载或失败重试；仅管理员不等于审核员；先读图再作结论；结论不自动改用户组 |
| 审核中心 | 鱼游投稿及修改审核 | 旧鱼游管理入口（`AdminProcessor` / 对应投稿模块） | `menuAdminMisc` / 待确认专用权限 | 待新增 `/api/v3/admin/fish-games/reviews` 等 | 第三阶段 | 已上线资料与待审修改并存时需前后对照；区分待审 / 通过 / 拒绝 / 停用 |
| 审核中心 | 大事记审核 | 旧大事记入口（`menuAdminMilestone`） | `menuAdminMilestone` | 待新增 `/api/v3/admin/milestones/reviews` 等 | 第三阶段 | 审核动作集中于审核中心，日常维护留在社区运营 |
| 审核中心 | 图片审核 | `macro-admin.ftl` 旧图片入口（受 `rhypicEnabled` 控制） | 管理员 / 图床管理权限（`!rhypicEnabled`） | 待核实图床管理能力后设计 `/api/v3/admin/images/...` | 第三阶段（暂在工作台占位说明） | 启用 RhyPic 时旧图片审核隐藏；接入前核实实际图床管理可用性 |
| 内容管理 | 文章管理（检索、创建、编辑、封禁/锁定、精选、置顶/取消置顶、评论开关、长文专栏章节与强制移除） | `AdminProcessor` 文章管理方法 | 列表/详情：`menuAdminArticles`<br>新建：`articleAddArticle`<br>编辑：`articleUpdateArticleBasic`<br>置顶/取消置顶：`articleStickArticle` / `articleCancelStickArticle`<br>移除：`articleRemoveArticle` | `GET /api/v3/admin/articles`<br>`POST /api/v3/admin/articles`<br>`GET /api/v3/admin/articles/{articleId}`<br>`PUT /api/v3/admin/articles/{articleId}`<br>`POST /api/v3/admin/articles/{articleId}/stick`<br>`POST /api/v3/admin/articles/{articleId}/cancel-stick`<br>`DELETE /api/v3/admin/articles/{articleId}` | 第二阶段（已上线） | 在发布锁与事务缓存边界内执行；不复用用户侧发文/删帖限制（支持强制移除未满 24h 文章）；保留专栏、章节、封面同步及匿名访问字段；编辑离开时保留未保存提示 |
| 内容管理 | 评论管理 | `AdminProcessor` 评论管理方法 | 列表/详情：`menuAdminComments`<br>编辑：`commentUpdateCommentBasic`<br>移除：`commentRemoveComment` | `GET /api/v3/admin/comments`<br>`GET /api/v3/admin/comments/{commentId}`<br>`PUT /api/v3/admin/comments/{commentId}`<br>`DELETE /api/v3/admin/comments/{commentId}` | 第二阶段（已上线） | 支持按正文 / 作者 / 文章 / 状态检索；修改状态与删除独立确认并触发职业事件清理与 `operation` 审计 |
| 内容管理 | 清风明月管理 | `AdminProcessor` 清风明月方法 | 列表/详情：`menuAdminBreezemoons`<br>编辑：`breezemoonUpdateBreezemoon`<br>移除：`breezemoonRemoveBreezemoon` | `GET /api/v3/admin/breezemoons`<br>`GET /api/v3/admin/breezemoons/{breezemoonId}`<br>`PUT /api/v3/admin/breezemoons/{breezemoonId}`<br>`DELETE /api/v3/admin/breezemoons/{breezemoonId}` | 第二阶段（已上线） | 处置结果即时回刷，移除同步触发 `targetRemoved` 与 `operation` 审计 |
| 用户与权限 | 用户列表、用户详情、资料与状态维护、移除 MFA、永久停用 | `AdminProcessor#showUsers`（`/admin/users`）、`showUser`（`/admin/user/{id}`）、`updateUser`、`removeMFA`、`deactivateUser` | 列表/详情：`menuAdminUsers`<br>基础资料：`userUpdateUserBasic`<br>高级字段：`userUpdateUserAdvanced`<br>移除 MFA：`userRemoveMFA`<br>永久停用：仅 `adminRole` | `GET /api/v3/admin/users`<br>`GET /api/v3/admin/users/{userId}`<br>`PUT /api/v3/admin/users/{userId}`<br>`POST /api/v3/admin/users/{userId}/deactivate`<br>`POST /api/v3/admin/users/{userId}/remove-mfa` | 第一阶段代表页；二期已接入名下文章/评论/清风明月与双向审计日志直达 | 绝不返回密码、令牌、MFA 密钥；永久停用独立危险操作，仅 `adminRole` 可用且禁止停用当前操作者本人；普通编辑表单禁止将已永久停用账号（`status = 4`）改回可用 |
| 用户与权限 | 角色权限配置 | `AdminProcessor` 角色管理方法 | `menuAdminRoles` | 待新增 `/api/v3/admin/roles/...` | 第三阶段 | 变更后实时影响能力校验，不得将 OP / 纪律委员批量提升为管理员 |
| 用户与权限 | 邀请码管理 | `AdminProcessor` 邀请码方法（区分旧状态 `0/1/2`） | `menuAdminIcs` | 待新增 `/api/v3/admin/invitecodes/...` | 第三阶段 | 严格映射 `0` 已使用、`1` 未使用、`2` 停用，禁止猜通用启停枚举 |
| 会员与资产 | 用户 VIP 开通 / 维护 / 延期 / 退款、套餐与优惠券 | `vip/admin.ftl`（侧栏之外旧入口） | 管理员 / 资产相关授权 | 待新增 `/api/v3/admin/vip/...` | 第三阶段 | 退款沿用按剩余天数计算并失效规则；优惠券次数 `-1` 表示无限制 |
| 会员与资产 | 勋章定义、预览、授予、撤销、批量授予 | `AdminProcessor` 勋章管理（`userGiveMetal` / `userRemoveMetal`） | `userGiveMetal` / `userRemoveMetal` | 待新增 `/api/v3/admin/medals/...` | 第三阶段 | 到期时间 `0` 表示永久；保留会员到期回填规则；批量发放返回逐项结果 |
| 会员与资产 | 积分增减 / 兑换 / 补初始积分 / 工资、背包调整 | `AdminProcessor` 积分与背包操作 | `userAddPoint` / `userExchangePoint` / `userDeductPoint` / `userAdjustBag` | 待新增 `/api/v3/admin/points/...`、`/api/v3/admin/bags/...` | 第三阶段 | 严格事务与幂等键防重复扣发；提交前展示目标、方向、数量与影响摘要 |
| 社区运营 | 领域与标签、标签绑定、保留词、广告位、鱼游资料与大事记维护 | `AdminProcessor` 领域 / 标签 / RW / AD / 杂项入口 | `menuAdminDomains` / `menuAdminTags` / `menuAdminRWs` / `menuAdminAD` / `menuAdminMilestone` | 待新增 `/api/v3/admin/domains/...` 等 | 第三阶段 | 审核与日常维护职责清晰分离 |
| 职业与宠物 | 职业目录、等级奖励、规则、草稿/发布/停用/回滚、导入预检、模拟、外观资产 | `ProfessionAdminProcessor` | 管理员 / 职业管理授权 | 待新增 `/api/v3/admin/professions/...` | 第四阶段 | 保留独立工作台及草稿/发布/历史/回滚；导入先预检；迁移和补发政策不得简化为单个开关 |
| 职业与宠物 | 宠物活动与风控日志 | 旧宠物风控日志网页入口（仅管理员 Session，拒绝 apiKey） | 仅 `adminRole` | 待新增只读 `/api/v3/admin/pets/logs` | 第四阶段 | 首版严格只读，不提供改币、重置宠物或清零动作 |
| 开放平台 | OAuth 第三方客户端列表、详情、登记、修改、停用 | 既有 V3 接口（`ApiV3ClientManagementProcessor` 等） | 仅网站第一方当前有效 `adminRole`（`profile.read` / `settings.write`） | `GET /api/v3/admin/oauth/clients`<br>`GET /api/v3/admin/oauth/clients/{clientId}`<br>`POST /api/v3/admin/oauth/clients`<br>`PUT /api/v3/admin/oauth/clients/{clientId}`<br>`DELETE /api/v3/admin/oauth/clients/{clientId}` | 第一阶段直接接入既有 V3 | 不含内置 `website_v3`；修改权限或回调集合会吊销已有令牌与授权码；停用后无启用接口 |
| 系统与安全 | 操作审计日志、IP 管理、站点设置、安全状态与维护工具 | `AdminProcessor#showAuditlog`、`ipManage`、`menuAdminMisc`、`isSecurityOperator` | `menuAdmin` / `ipManage` / `menuAdminMisc` / `isSecurityOperator`（仅 `"adlered"`） | `GET /api/v3/admin/audit-logs`（已上线）<br>待新增 `/api/v3/admin/ips`、`/api/v3/admin/settings`、`/api/v3/admin/security/...` | 第二阶段（操作日志已上线）与第四阶段（安全与维护） | 保留 `"adlered"` 等特殊账号限制；连接数不等于去重人数；生产开关只读、开发开关明确标注临时生效；缺失历史值不补造 |
| 可选独立接入 | `website_v3` 需求反馈处理 | `website_v3/feedback-service` | 反馈服务独立管理员鉴权 | 不计入 Rhythm `/api/v3/admin/...` 覆盖范围 | 单独规划后接入 | 需独立规划跨域、签名或服务鉴权 |

## 3. 统一接口、分页、筛选与写入恢复契约

### 3.1 统一响应包络与错误语义

- **成功响应**（JSON 端点，除一次性材料二进制下载外）：
  ```json
  {
    "code": 0,
    "msg": "",
    "data": {},
    "requestId": "req_..."
  }
  ```
- **失败响应**：HTTP 4xx/5xx + V3 JSON 错误包络（含 `code`、`msg`、`error`、`requestId`）：
  - `401 Unauthorized`：未携带、过期或被吊销的第一方 Bearer 令牌；前端先走单飞 `refreshAccessToken()`，若仍失败则清理登录态跳转登录页。
  - `403 Forbidden`：缺少对应后台权限、非指定审核员或权限在操作过程中发生变更；前端刷新 `capabilities` 并提示权限变更或无权访问，不自动重放。
  - `404 Not Found`：目标对象不存在或不在可管理范围内。
  - `409 Conflict`：对象状态已并发变化（如举报已非待处理、已消费材料冲突）或同一 `Idempotency-Key` 提交了不一致的参数载荷。
  - `410 Gone`：一次性认证证明材料已被消费（`material_consumed`）。
  - `422 Unprocessable Entity`：请求字段格式、长度、取值范围或业务校验未通过（如禁止停用本人、状态 4 账号禁止常规编辑、禁止处理本人举报）。
  - `429 Too Many Requests`：触发限流，保留重试入口并展示冷却提示。

### 3.2 统一分页与筛选参数约定

- 查询参数：`p`（页码，从 `1` 开始，默认 `1`）、`size`（每页条数，默认 `20`，最大 `50`）。
- 响应 `data` 结构：
  - `list`: 数组对象。
  - `pagination`: `{ "p": 1, "size": 20, "total": 120, "pageCount": 6 }`。
- 筛选参数：按资源约定传递规范枚举（例如举报列表：`status` 取 `all | pending | handled | ignored`，`dataType` 取 `-1 | 0 | 1 | 2 | 3 | 4`；用户列表：`keyword`、`status`、`roleId`）。每次筛选变化将页码重置为 `1`。

### 3.3 `Idempotency-Key` 写入与结果未知恢复契约

1. 除一次性消费接口 `POST /api/v3/review/identity-applications/{applicationId}/material/open` 外，所有新管理写接口（`POST` / `PUT` / `DELETE`）均要求请求头携带 `Idempotency-Key`（正则 `^[A-Za-z0-9._:-]{1,128}$`）。
2. **同一操作复用同一键**：用户在表单 / 抽屉 / 审核面板发起写操作时生成一个任务级 `Idempotency-Key`；当表单参数未改动且收到网络断开、超时、`5xx` 或响应中断等“结果不明”状态时，前端保留原 `Idempotency-Key` 与原载荷，进入“写入结果待确认”提示态，仅在用户主动点击“按原操作恢复确认”时携原键原样复查，绝不静默重生成新键或自动连发。
3. **成功 / 并发冲突后切换新键**：一旦某次操作明确返回业务成功，或因修改参数收到 `409` / `422`，或用户编辑改变了提交载荷，前端立即轮换新的 `Idempotency-Key`，并在写后重新拉取目标详情与列表最新状态，绝不以历史回执覆盖服务端最新状态。
4. **普通刷新保留现场**：触发 `accessToken` 静默刷新（同一账号、`actor` 未变）时，保留当前审核草稿与待确认幂等任务状态；仅在退出登录或切换为另一账号时清理全部私有状态。

### 3.4 批量操作逐项结果契约（二至四阶段批量接口统一遵守）

批量管理接口（如批量授予勋章、批量处置内容）返回逐项明细，严禁仅返回笼统“部分失败”计数：

```json
{
  "summary": {
    "total": 4,
    "succeeded": 2,
    "failed": 1,
    "skipped": 0,
    "pendingConfirm": 1
  },
  "results": [
    { "targetId": "1001", "status": "succeeded", "code": 0, "message": "操作成功" },
    { "targetId": "1002", "status": "failed", "code": 409, "message": "目标状态已变更，未执行" },
    { "targetId": "1003", "status": "skipped", "code": 0, "message": "前置项中止，未执行" },
    { "targetId": "1004", "status": "pending_confirm", "code": 504, "message": "超时未收到回执，请核对最新状态" }
  ]
}
```

前端统一按“成功 / 失败 / 未执行 / 待确认”四类分组展示明细，并保留针对失败或待确认对象的逐项复核入口。

## 四、第三阶段（完整运营功能）接口与动作映射

| 模块 | 前端路由 | 核心 V3 接口 | 权限 / 动作开关 |
| --- | --- | --- | --- |
| 鱼游投稿审核 | `/review/fish-games` | `GET /api/v3/admin/fish-games`、`POST /api/v3/admin/fish-games/{gameId}/review` | `fishGameReview`（管理员） |
| 大事记审核 | `/review/milestones` | `GET /api/v3/admin/milestones`、`PUT /api/v3/admin/milestones/{milestoneId}`、`DELETE /api/v3/admin/milestones/{milestoneId}` | `milestoneReview`（管理员或 `menuManageMilestone`） |
| 图片审核 | `/review/images` | `GET /api/v3/admin/images`、`POST /api/v3/admin/images/{imageId}/review` | `imageReview`（管理员且 `!rhypicEnabled`） |
| 角色权限配置 | `/users/roles` | `/api/v3/admin/roles*` | `roleManage`（`menuAdminRoles`；非管理员隔离高危权限） |
| 邀请码管理 | `/users/invitecodes` | `/api/v3/admin/invitecodes*` | `invitecodeManage`（`menuAdminIcs`，状态 `0/1/2`） |
| VIP 与优惠券 | `/assets/vip` | `/api/v3/admin/vip/*`、`/api/v3/admin/coupons*` | `vipManage`（管理员，优惠券 `-1` 为无限次） |
| 勋章定义与授予 | `/assets/medals` | `/api/v3/admin/medals*` | `medalDefine` / `medalGrant` / `medalRevoke` |
| 积分、工资与背包 | `/assets/points-bags` | `/api/v3/admin/points/*`、`/api/v3/admin/salary/pay`、`/api/v3/admin/bags/adjust` | `pointAdd` / `pointDeduct` / `pointExchange` / `salaryPay` / `bagAdjust` |
| 领域、导航与标签 | `/ops/domains-tags` | `/api/v3/admin/domains*`、`/api/v3/admin/tags*` | `domainManage` / `tagManage` |
| 保留词与广告位 | `/ops/reserved-ad` | `/api/v3/admin/reserved-words*`、`/api/v3/admin/ads` | `reservedWordManage` / `adManage` |
| 鱼游与大事记维护 | `/ops/community-records` | `/api/v3/admin/fish-games*`、`/api/v3/admin/milestones*` | `fishGameManage` / `milestoneManage` |
