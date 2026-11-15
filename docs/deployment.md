# 生产部署

2026-11-15 按用户要求部署到 https://new.fishpi.cn/manage/，本次业务代码 e7e54e2。

```sh
VITE_BASE_PATH=/manage/ VITE_API_BASE_URL=https://fishpi.cn npm run build
```

将 dist 作为 website_v3 联合发布目录下的 manage/。Caddy 对 /manage 做308到/manage/；/manage/*去前缀后静态服务，SPA页面回退index.html，assets缺失须404。浏览器直连fishpi.cn既有认证及管理API，不增加API代理或权限。

发布目录 `/opt/fishpi/releases/20261115-94e8a70-admin-e7e54e2`；与前台共用 `/opt/fishpi/current` 原子切换及回滚。后续保留旧哈希assets，HTML使用no-cache，assets一年immutable。首次上线回滚需同时恢复Caddy，详见website_v3的docs/combined-deployment.md。

已验：类型/生产构建、configuration及asset-recovery测试；线上入口和内部路由200、缺失JS404、入口资源字节一致；Chrome登录页与390×844布局。尚未用管理员登录验收真实权限及业务数据，未执行管理写操作；历史接口覆盖限制仍以开发规划为准。

## 2026-11-15 后台增量更新

部署业务提交 `0689d32`（OAuth 回跳与两步验证），当前发布目录 `/opt/fishpi/releases/20261115-94e8a70-admin-0689d32`。从上一联合发布完整复制，只覆盖后台构建产物，保留旧哈希资源；current 原子切换，前台代码与 Caddy 配置不变，无需重启服务。

构建和两项现有回归通过；线上登录、OAuth回跳、首页200，后台入口资源与本地构建一致；浏览器显示新OAuth按钮，无有效state直接访问回跳页明确提示失效。真实OAuth授权、两步验证及管理员数据尚未验证。

回滚：将current原子切回 `/opt/fishpi/releases/20261115-94e8a70-admin-e7e54e2`，本次无需恢复Caddy。

## 2026-11-15 资产恢复与审核交互更新

业务版本 `2ef4c38`，部署至 `/opt/fishpi/releases/20261115-e72f5d1-admin-2ef4c38`。从当前联合发布复制后仅覆盖manage产物并原子切换，旧后台哈希资源保留；前台dist/server/server.js逐文件比较一致，无服务重启或Caddy修改。

生产构建通过；资产恢复旧测试夹具漏导出新增函数，已改为引用真实ApiError/错误分类函数并补验409 operation_outcome_unknown的鱼游导入恢复，测试修订提交066793f。configuration与asset-recovery均通过。线上登录页/后台内部路由/前台首页200，后台入口JS/CSS与本地构建一致，浏览器登录页正常。未执行真实管理写操作，新增审核和配置交互未做登录后浏览器验收。

回滚只需将current原子切回 `/opt/fishpi/releases/20261115-e72f5d1-admin-0689d32`。
