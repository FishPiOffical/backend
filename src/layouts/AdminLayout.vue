<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AssetRecoveryBanner from '@/components/common/AssetRecoveryBanner.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ADMIN_NAV_GROUPS, type AdminNavItem } from '@/navigation/menu'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { getLegacyAdminUrl } from '@/utils/format'

/**
 * 管理后台全局主框架：
 * - 桌面端左侧 240px 侧栏（支持折叠为 64px）+ 顶部约 60px 顶栏；
 * - 移动端（<= 960px）自动切换为抽屉侧栏与紧凑顶栏；
 * - 按 /api/v3/admin/capabilities 实时裁剪九大一级入口与子菜单，并提示操作期间权限变动。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const collapsed = ref(false)
const mobileMenuOpen = ref(false)
const envLabel = import.meta.env.VITE_ENV_LABEL || (import.meta.env.DEV ? '本地联调' : '生产环境')

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
  },
)

const visibleGroups = computed(() => {
  const caps = auth.capabilities
  if (!caps) {
    return []
  }
  return ADMIN_NAV_GROUPS.map((group) => {
    if (!caps.menus[group.key]) {
      return null
    }
    const items = group.items.filter((item) => {
      if (item.hideWhenRhypic && caps.rhypicEnabled) {
        return false
      }
      return item.check ? item.check(caps) : true
    })
    return items.length ? { ...group, items } : null
  }).filter((g): g is NonNullable<typeof g> => g !== null)
})

const breadcrumbs = computed(() => {
  const crumbs: Array<{ label: string; to?: string }> = [{ label: '管理后台', to: '/workbench' }]
  const groupTitle = route.meta?.groupTitle as string | undefined
  const pageTitle = route.meta?.title as string | undefined
  if (groupTitle && groupTitle !== '工作台') {
    crumbs.push({ label: groupTitle })
  }
  if (pageTitle) {
    crumbs.push({ label: pageTitle })
  }
  return crumbs
})

function isItemActive(item: AdminNavItem): boolean {
  if (item.to === '/users') {
    return route.name === 'users' || route.name === 'user-detail'
  }
  return route.path === item.to
}

async function handleLogout(): Promise<void> {
  await auth.logout()
  await router.replace({ path: '/login' })
}
</script>

<template>
  <div class="admin-shell" :class="{ 'is-collapsed': collapsed, 'is-compact': theme.compactTable }">
    <div v-if="mobileMenuOpen" class="shell-backdrop" @click="mobileMenuOpen = false" />

    <aside class="shell-sidebar" :class="{ 'is-mobile-open': mobileMenuOpen }" aria-label="后台主导航">
      <div class="shell-brand">
        <RouterLink to="/workbench" class="shell-brand__link">
          <span class="shell-brand__logo" aria-hidden="true">R</span>
          <div v-show="!collapsed" class="shell-brand__text">
            <strong>Rhythm 管理</strong>
            <span>Console v3</span>
          </div>
        </RouterLink>
        <button
          type="button"
          class="admin-btn admin-btn--sm shell-collapse-btn"
          :title="collapsed ? '展开导航栏' : '收起导航栏'"
          @click="collapsed = !collapsed"
        >
          {{ collapsed ? '→' : '←' }}
        </button>
      </div>

      <nav class="shell-nav">
        <section v-for="group in visibleGroups" :key="group.key" class="shell-group">
          <div v-show="!collapsed" class="shell-group__title">{{ group.label }}</div>
          <div v-show="collapsed" class="shell-group__short" :title="group.label">{{ group.shortLabel }}</div>
          <ul class="shell-group__list">
            <li v-for="item in group.items" :key="item.id">
              <RouterLink
                :to="item.to"
                class="shell-nav__item"
                :class="{ 'is-active': isItemActive(item) }"
                :title="collapsed ? item.label : undefined"
              >
                <span class="shell-nav__dot" aria-hidden="true" />
                <span v-show="!collapsed" class="shell-nav__label">{{ item.label }}</span>
                <span v-show="!collapsed && item.phase !== '一期V3'" class="shell-nav__phase">
                  {{ item.phase }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </nav>

      <div class="shell-sidebar__foot">
        <a
          v-show="!collapsed"
          :href="getLegacyAdminUrl('/admin')"
          target="_blank"
          rel="noopener noreferrer"
          class="shell-legacy-link"
        >
          打开旧版内置后台 ↗
        </a>
      </div>
    </aside>

    <div class="shell-main">
      <header class="shell-topbar">
        <div class="shell-topbar__left">
          <button
            type="button"
            class="admin-btn admin-btn--sm shell-mobile-btn"
            aria-label="打开导航菜单"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            菜单
          </button>

          <nav class="shell-breadcrumb" aria-label="面包屑">
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.label">
              <span v-if="idx > 0" class="shell-breadcrumb__sep">/</span>
              <RouterLink v-if="crumb.to && idx < breadcrumbs.length - 1" :to="crumb.to">
                {{ crumb.label }}
              </RouterLink>
              <span v-else class="shell-breadcrumb__current">{{ crumb.label }}</span>
            </template>
          </nav>
        </div>

        <div class="shell-topbar__right">
          <StatusBadge :label="envLabel" tone="info" />

          <button
            type="button"
            class="admin-btn admin-btn--sm"
            :title="theme.compactTable ? '切换为标准表格行高' : '切换为紧凑表格密度'"
            @click="theme.toggleCompactTable()"
          >
            {{ theme.compactTable ? '紧凑行' : '标准行' }}
          </button>

          <button type="button" class="admin-btn admin-btn--sm" @click="theme.toggleTheme()">
            {{ theme.theme === 'classic-dark' ? '浅色主题' : '深色主题' }}
          </button>

          <div v-if="auth.capabilities" class="shell-user">
            <img
              v-if="auth.capabilities.avatarUrl"
              :src="auth.capabilities.avatarUrl"
              alt=""
              class="shell-user__avatar"
            />
            <span v-else class="shell-user__avatar shell-user__avatar--fallback" aria-hidden="true">
              {{ (auth.capabilities.userName || 'A').slice(0, 1).toUpperCase() }}
            </span>
            <div class="shell-user__meta">
              <strong>{{ auth.capabilities.userName }}</strong>
              <span>{{ auth.capabilities.roleName }}</span>
            </div>
          </div>

          <button
            type="button"
            class="admin-btn admin-btn--sm admin-btn--ghost"
            title="立即向后端重拉当前角色权限"
            @click="auth.refreshCapabilities()"
          >
            刷新权限
          </button>

          <button type="button" class="admin-btn admin-btn--sm" @click="handleLogout">退出</button>
        </div>
      </header>

      <div v-if="auth.permissionChangedNotice" class="shell-notice" role="alert">
        <div>
          <strong>权限状态已变化：</strong>
          <span>{{ auth.permissionChangedNotice }}</span>
        </div>
        <div class="shell-notice__actions">
          <RouterLink to="/workbench" class="admin-btn admin-btn--sm">返回工作台</RouterLink>
          <button type="button" class="admin-btn admin-btn--sm" @click="auth.dismissPermissionNotice()">
            已知悉
          </button>
        </div>
      </div>

      <main class="shell-content">
        <div class="shell-content__inner">
          <AssetRecoveryBanner />
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--fp-sidebar-w) minmax(0, 1fr);
  background: var(--fp-page-bg);
  transition: grid-template-columns var(--fp-transition-fast);
}

.admin-shell.is-collapsed {
  grid-template-columns: var(--fp-sidebar-collapsed-w) minmax(0, 1fr);
}

.shell-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--fp-sidebar-bg);
  border-right: 1px solid var(--fp-border);
  z-index: 40;
}

.shell-brand {
  height: var(--fp-topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--fp-border);
}

.shell-brand__link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--fp-title);
}

.shell-brand__logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--fp-radius-md);
  background: linear-gradient(135deg, var(--fp-primary) 0%, var(--fp-primary-fill) 100%);
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(54, 117, 46, 0.25);
}

.shell-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}

.shell-brand__text strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--fp-title);
  white-space: nowrap;
}

.shell-brand__text span {
  font-size: 11px;
  color: var(--fp-muted);
}

.shell-collapse-btn {
  padding: 0 8px;
  min-width: 28px;
}

.shell-nav {
  flex: 1;
  overflow-y: auto;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.shell-group__title {
  padding: 2px 10px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--fp-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.shell-group__short {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--fp-muted);
  padding: 4px 0;
  border-top: 1px solid var(--fp-border);
}

.shell-group:first-child .shell-group__short {
  border-top: none;
}

.shell-group__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shell-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: var(--fp-radius-md);
  color: var(--fp-text);
  font-size: 13px;
  transition: background-color var(--fp-transition-fast), color var(--fp-transition-fast);
}

.admin-shell.is-collapsed .shell-nav__item {
  justify-content: center;
  padding: 6px 0;
}

.shell-nav__item:hover {
  background: var(--fp-hover);
  color: var(--fp-title);
}

.shell-nav__item.is-active {
  background: var(--fp-primary-soft);
  color: var(--fp-primary);
  font-weight: 600;
}

.shell-nav__item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--fp-primary);
}

.shell-nav__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.55;
  flex-shrink: 0;
  transition: transform var(--fp-transition-fast), opacity var(--fp-transition-fast);
}

.shell-nav__item.is-active .shell-nav__dot {
  opacity: 1;
  transform: scale(1.2);
}

.shell-nav__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell-nav__phase {
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--fp-surface-subtle);
  border: 1px solid var(--fp-border);
  color: var(--fp-muted);
  flex-shrink: 0;
}

.shell-sidebar__foot {
  padding: 12px 14px;
  border-top: 1px solid var(--fp-border);
}

.shell-legacy-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--fp-muted);
  padding: 4px 6px;
  border-radius: var(--fp-radius-sm);
}

.shell-legacy-link:hover {
  background: var(--fp-hover);
  color: var(--fp-link);
}

.shell-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.shell-topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: var(--fp-topbar-h);
  padding: 8px 24px;
  background: var(--fp-nav);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--fp-border);
  box-shadow: var(--fp-nav-shadow);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}

.shell-topbar__left,
.shell-topbar__right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.shell-mobile-btn {
  display: none;
}

.shell-breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}

.shell-breadcrumb__sep {
  color: var(--fp-muted);
  opacity: 0.65;
}

.shell-breadcrumb__current {
  color: var(--fp-title);
  font-weight: 600;
}

.shell-user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 5px;
  border-radius: 999px;
  background: var(--fp-elevated);
  border: 1px solid var(--fp-border);
}

.shell-user__avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  object-fit: cover;
  flex-shrink: 0;
}

.shell-user__avatar--fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--fp-primary-soft);
  color: var(--fp-primary);
  font-size: 12px;
  font-weight: 700;
}

.shell-user__meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1.2;
}

.shell-user__meta strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--fp-title);
}

.shell-user__meta span {
  font-size: 11px;
  color: var(--fp-muted);
}

.shell-notice {
  width: 100%;
  max-width: none;
  margin: 14px auto 0;
  padding: 12px 16px;
  border-radius: var(--fp-radius-md);
  background: var(--fp-warning-soft);
  border: 1px solid var(--fp-warning);
  color: var(--fp-title);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.shell-notice__actions {
  display: flex;
  gap: 8px;
}

.shell-content {
  flex: 1;
  padding: 22px 24px 32px;
  min-width: 0;
}

.shell-content__inner {
  width: 100%;
  max-width: var(--fp-content-max-w);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--fp-content-gap);
}

.shell-backdrop {
  display: none;
}

@media (max-width: 960px) {
  .admin-shell,
  .admin-shell.is-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .shell-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 45;
    background: var(--fp-mask-bg);
    backdrop-filter: blur(2px);
  }

  .shell-sidebar {
    position: fixed;
    left: 0;
    top: 0;
    width: 268px;
    transform: translateX(-100%);
    transition: transform var(--fp-transition-fast);
    z-index: 50;
  }

  .shell-sidebar.is-mobile-open {
    transform: translateX(0);
  }

  .shell-collapse-btn {
    display: none;
  }

  .shell-mobile-btn {
    display: inline-flex;
  }

  .shell-nav__item {
    min-height: var(--fp-touch-target);
  }

  .shell-topbar {
    padding: 8px 14px;
  }

  .shell-content {
    padding: 14px 14px 24px;
  }

  .shell-notice {
    margin: 12px 14px 0;
    width: auto;
  }
}
</style>
