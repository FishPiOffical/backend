/// <reference types="vite/client" />

// Vue 单文件组件模块类型声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

// 环境变量类型约束
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_LEGACY_ADMIN_BASE?: string
  readonly VITE_FISHPI_OAUTH_ORIGIN?: string
  readonly VITE_ENV_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
