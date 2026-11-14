import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Vite 构建与开发服务器配置。
 * 默认挂载路径为 /manage/，开发环境保留 Origin 以满足 Rhythm 第一方网站可信来源校验。
 */
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8080'
const basePath = process.env.VITE_BASE_PATH || '/manage/'
const devPort = Number(process.env.VITE_DEV_PORT) || 5173
const proxyChangeOrigin = process.env.VITE_PROXY_CHANGE_ORIGIN === 'true'
const fishpiUa = process.env.FISHPI_UA || 'RhythmAdminDev/0.1'

export default defineConfig({
  base: basePath,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: devPort,
    strictPort: false,
    proxy: {
      // 第一方登录/刷新/退出/会话端点保持 changeOrigin: false，确保后端收到真实的本地回环 Origin 与 host-only Cookie 作用域
      '^/api/v3/auth/(?:login|refresh|logout|session)(?:\\?|$)': {
        target: apiTarget,
        changeOrigin: false,
        headers: {
          'User-Agent': fishpiUa,
        },
      },
      // 管理端、认证审核及普通 V3 接口代理
      '/api/v3': {
        target: apiTarget,
        changeOrigin: proxyChangeOrigin,
        headers: {
          'User-Agent': fishpiUa,
        },
      },
    },
  },
})
