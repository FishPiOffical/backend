import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AdminTheme = 'classic-light' | 'classic-dark'

const THEME_STORAGE_KEY = 'rhythm.admin.theme'
const COMPACT_TABLE_KEY = 'rhythm.admin.compact_table'

/**
 * 主题与表格密度状态管理：默认采用经典浅色，支持经典深色实时切换。
 */
export const useThemeStore = defineStore('admin-theme', () => {
  const initialTheme: AdminTheme =
    document.documentElement.dataset.theme === 'classic-dark' ? 'classic-dark' : 'classic-light'
  const theme = ref<AdminTheme>(initialTheme)

  let initialCompact = false
  try {
    initialCompact = localStorage.getItem(COMPACT_TABLE_KEY) === '1'
  } catch {
    initialCompact = false
  }
  const compactTable = ref(initialCompact)

  function applyTheme(next: AdminTheme): void {
    theme.value = next
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 忽略受限存储环境错误
    }
  }

  function toggleTheme(): void {
    applyTheme(theme.value === 'classic-light' ? 'classic-dark' : 'classic-light')
  }

  function toggleCompactTable(): void {
    compactTable.value = !compactTable.value
    try {
      localStorage.setItem(COMPACT_TABLE_KEY, compactTable.value ? '1' : '0')
    } catch {
      // 忽略受限存储环境错误
    }
  }

  return {
    theme,
    compactTable,
    applyTheme,
    toggleTheme,
    toggleCompactTable,
  }
})
