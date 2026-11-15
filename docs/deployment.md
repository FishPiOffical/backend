# 生产部署

2026-11-15 按用户要求部署到 https://new.fishpi.cn/manage/，本次业务代码 e7e54e2。

```sh
VITE_BASE_PATH=/manage/ VITE_API_BASE_URL=https://fishpi.cn npm run build
```

将 dist 作为 website_v3 联合发布目录下的 manage/。Caddy 对 /manage 做308到/manage/；/manage/*去前缀后静态服务，SPA页面回退index.html，assets缺失须404。浏览器直连fishpi.cn既有认证及管理API，不增加API代理或权限。

发布目录 `/opt/fishpi/releases/20261115-94e8a70-admin-e7e54e2`；与前台共用 `/opt/fishpi/current` 原子切换及回滚。后续保留旧哈希assets，HTML使用no-cache，assets一年immutable。首次上线回滚需同时恢复Caddy，详见website_v3的docs/combined-deployment.md。

已验：类型/生产构建、configuration及asset-recovery测试；线上入口和内部路由200、缺失JS404、入口资源字节一致；Chrome登录页与390×844布局。尚未用管理员登录验收真实权限及业务数据，未执行管理写操作；历史接口覆盖限制仍以开发规划为准。
