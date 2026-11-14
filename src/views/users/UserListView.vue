<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  fetchAdminUsers,
  type AdminUserSummary,
  type PaginationInfo,
  type RoleOption,
} from '@/api/admin'
import { ApiError } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { formatCount, formatDateTime, getUserStatusMeta } from '@/utils/format'

/**
 * 用户列表管理视图：
 * 支持按关键字、账号状态、角色组合筛选并分页浏览，仅展示脱敏后的联系信息。
 */
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const keywordInput = ref('')
const appliedKeyword = ref('')
const statusFilter = ref('all')
const roleFilter = ref('all')
const page = ref(1)
const pageSize = 20

const list = ref<AdminUserSummary[]>([])
const roleOptions = ref<RoleOption[]>([])
const pagination = ref<PaginationInfo>({ p: 1, size: 20, total: 0, pageCount: 1 })

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: '0', label: '正常 (0)' },
  { value: '1', label: '封禁 (1)' },
  { value: '2', label: '未验证 (2)' },
  { value: '3', label: '登录失效 (3)' },
  { value: '4', label: '永久停用 (4)' },
]

const hasActiveFilter = computed(
  () => appliedKeyword.value !== '' || statusFilter.value !== 'all' || roleFilter.value !== 'all',
)

const pageState = computed<PageViewState>(() => {
  if (unauthenticated.value) return 'unauthenticated'
  if (forbidden.value) return 'forbidden'
  if (loading.value && list.value.length === 0) return 'loading'
  if (loadError.value && list.value.length === 0) return 'error'
  if (!loading.value && list.value.length === 0) {
    return hasActiveFilter.value ? 'filtered-empty' : 'empty'
  }
  return 'ready'
})

function hasMenuPermission(): boolean {
  const caps = auth.capabilities
  return Boolean(caps?.canAccessAdmin && caps.permissions.menuAdminUsers)
}

async function loadUsers(): Promise<void> {
  if (!hasMenuPermission()) {
    forbidden.value = true
    list.value = []
    return
  }

  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false

  try {
    const res = await fetchAdminUsers({
      keyword: appliedKeyword.value,
      status: statusFilter.value,
      roleId: roleFilter.value,
      p: page.value,
      size: pageSize,
    })
    list.value = res.list
    pagination.value = res.pagination
    roleOptions.value = res.roleOptions
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        unauthenticated.value = true
        return
      }
      if (err.status === 403) {
        forbidden.value = true
        return
      }
      loadError.value = err.message
    } else {
      loadError.value = err instanceof Error ? err.message : '加载用户列表失败'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch(): void {
  appliedKeyword.value = keywordInput.value.trim()
  page.value = 1
  void loadUsers()
}

function handleFilterChange(): void {
  page.value = 1
  void loadUsers()
}

function resetFilters(): void {
  keywordInput.value = ''
  appliedKeyword.value = ''
  statusFilter.value = 'all'
  roleFilter.value = 'all'
  page.value = 1
  void loadUsers()
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadUsers()
}

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/users' } })
}

function goHome(): void {
  void router.push('/workbench')
}

watch(
  () => auth.sessionEpoch,
  () => {
    list.value = []
    roleOptions.value = []
    loadError.value = ''
    if (auth.isLoggedIn && hasMenuPermission()) {
      void loadUsers()
    }
  },
)

onMounted(() => {
  void loadUsers()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <h1 class="admin-page__title">用户管理</h1>
        <p class="admin-page__subtitle">
          检索全站用户账号、查看脱敏联系与登录状态，进入详情执行分层授权的资料修改或高危处置。
        </p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" :disabled="loading" @click="loadUsers">
          {{ loading ? '加载中...' : '刷新列表' }}
        </button>
      </div>
    </header>

    <!-- 检索与筛选条 -->
    <form class="admin-panel users-filter-form" @submit.prevent="submitSearch">
      <div class="users-filter-form__field users-filter-form__field--grow">
        <label class="users-filter-label" for="users-keyword">关键字检索</label>
        <input
          id="users-keyword"
          v-model="keywordInput"
          type="search"
          class="admin-input"
          placeholder="用户名、昵称、邮箱、用户 ID..."
        />
      </div>

      <div class="users-filter-form__field">
        <label class="users-filter-label" for="users-status">账号状态</label>
        <select id="users-status" v-model="statusFilter" class="admin-select" @change="handleFilterChange">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="users-filter-form__field">
        <label class="users-filter-label" for="users-role">所属角色</label>
        <select id="users-role" v-model="roleFilter" class="admin-select" @change="handleFilterChange">
          <option value="all">全部角色</option>
          <option v-for="role in roleOptions" :key="role.oId" :value="role.oId">
            {{ role.roleName }} ({{ role.oId }})
          </option>
        </select>
      </div>

      <div class="users-filter-form__btns">
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="loading">查询</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" :disabled="loading" @click="resetFilters">
          重置
        </button>
      </div>
    </form>

    <div v-if="loadError && list.length" class="users-alert" role="alert">
      <span>刷新失败：{{ loadError }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="loadUsers">重试</button>
    </div>

    <PageStateView
      :state="pageState"
      :error-message="loadError"
      @retry="loadUsers"
      @reset-filters="resetFilters"
      @go-login="goLogin"
      @go-home="goHome"
    >
      <div class="admin-table-wrap">
        <table class="admin-table" :class="{ 'admin-table--compact': theme.compactTable }">
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>联系信息（脱敏）</th>
              <th>MFA</th>
              <th>积分 / 已用</th>
              <th>最近登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in list" :key="u.oId">
              <td>
                <div class="user-cell">
                  <div class="user-cell__main">
                    <strong>{{ u.userNickname || u.userName }}</strong>
                    <StatusBadge v-if="u.isSelf" tone="info" label="当前操作者" />
                  </div>
                  <div class="user-cell__sub admin-mono">
                    @{{ u.userName }} · #{{ u.userNo || u.oId }}
                  </div>
                </div>
              </td>
              <td>{{ u.roleName || u.userRole }}</td>
              <td>
                <StatusBadge :tone="getUserStatusMeta(u.userStatus).tone" :label="getUserStatusMeta(u.userStatus).label" />
              </td>
              <td>
                <div class="user-contact">
                  <span>{{ u.userEmail || '未填邮箱' }}</span>
                  <span class="user-contact__phone admin-mono">{{ u.userPhoneMasked || '未绑定手机' }}</span>
                </div>
              </td>
              <td>
                <StatusBadge :tone="u.hasMfa ? 'success' : 'neutral'" :label="u.hasMfa ? '已绑定' : '未启用'" />
              </td>
              <td class="admin-mono">
                {{ formatCount(u.userPoint) }} / {{ formatCount(u.userUsedPoint) }}
              </td>
              <td>
                <div class="user-contact">
                  <span class="admin-mono">{{ formatDateTime(u.userLatestLoginTime) }}</span>
                  <span class="user-contact__phone admin-mono">{{ u.userLatestLoginIP || '-' }}</span>
                </div>
              </td>
              <td>
                <RouterLink :to="`/users/${encodeURIComponent(u.oId)}`" class="admin-btn admin-btn--sm">
                  管理详情
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AdminPagination
        :page="pagination.p"
        :page-size="pagination.size"
        :total="pagination.total"
        :page-count="pagination.pageCount"
        :disabled="loading"
        @update:page="handlePageChange"
      />
    </PageStateView>
  </div>
</template>

<style scoped>
.users-filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.users-filter-form__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 160px;
}

.users-filter-form__field--grow {
  flex: 1 1 240px;
}

.users-filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-head);
}

.users-filter-form__btns {
  display: flex;
  gap: 8px;
}

.users-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--fp-radius-md);
  border: 1px solid var(--fp-danger);
  background: var(--fp-danger-soft);
  color: var(--fp-danger-ink);
  font-size: 13px;
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-cell__main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-cell__sub {
  font-size: 11px;
  color: var(--fp-muted);
}

.user-contact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.user-contact__phone {
  color: var(--fp-muted);
}
</style>
