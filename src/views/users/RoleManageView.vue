<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createRole,
  fetchRolePermissions,
  fetchRoles,
  removeRole,
  updateRolePermissions,
  type AdminRoleItem,
  type Stage3Pagination,
  type RolePermissionItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import AdminPagination from '@/components/common/AdminPagination.vue'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'

/**
 * 角色权限配置视图：
 * 1. 支持角色列表查看、新增角色、删除无绑定用户的非内置角色；
 * 2. 右侧展示按分类聚合的权限矩阵，非管理员自动锁定高危管理权限不可越权勾选。
 */
const viewState = ref<PageViewState>('loading')
const errorMsg = ref('')
const roles = ref<AdminRoleItem[]>([])
const pagination = ref<Stage3Pagination>({page:1,pageSize:50,total:0,totalPages:1})
const canManageAdminPerms = ref(false)
const selectedRole = ref<AdminRoleItem | null>(null)
const permissions = ref<RolePermissionItem[]>([])
const grantedSet = ref<Set<string>>(new Set())
const permsLoading = ref(false)

const newRoleName = ref('')
const newRoleDesc = ref('')
const saving = ref(false)
const toast = ref('')

const groupedPermissions = computed(() => {
  const map = new Map<string, RolePermissionItem[]>()
  for (const item of permissions.value) {
    const key = item.categoryLabel || '其他'
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
  }
  return Array.from(map.entries())
})

const isRoleMatrixLocked = computed(() => {
  if (!selectedRole.value) return true
  if (canManageAdminPerms.value) return false
  return selectedRole.value.oId === 'adminRole' || selectedRole.value.oId === '1630552921050'
})

async function loadRoles(targetPage = pagination.value.page) {
  viewState.value = 'loading'
  errorMsg.value = ''
  try {
    const res = await fetchRoles(targetPage, 50)
    pagination.value = res.pagination
    roles.value = res.items
    canManageAdminPerms.value = res.canManageAdminPerms
    viewState.value = res.items.length === 0 ? 'empty' : 'ready'
    if (selectedRole.value) {
      const matched = res.items.find((r) => r.oId === selectedRole.value?.oId)
      if (matched) {
        await selectRole(matched)
      } else {
        selectedRole.value = null
      }
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : '加载角色列表失败'
    viewState.value = 'error'
  }
}

async function selectRole(role: AdminRoleItem) {
  selectedRole.value = role
  permsLoading.value = true
  try {
    const res = await fetchRolePermissions(role.oId)
    permissions.value = res.items
    grantedSet.value = new Set(res.items.filter((p) => p.permissionGrant).map((p) => p.oId))
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '加载角色权限失败'
  } finally {
    permsLoading.value = false
  }
}

function togglePerm(permId: string) {
  const next = new Set(grantedSet.value)
  if (next.has(permId)) {
    next.delete(permId)
  } else {
    next.add(permId)
  }
  grantedSet.value = next
}

async function handleCreateRole() {
  if (!newRoleName.value.trim() || saving.value) return
  saving.value = true
  toast.value = ''
  try {
    await createRole(
      { roleName: newRoleName.value.trim(), roleDescription: newRoleDesc.value.trim() },
      createIdempotencyKey('role-add'),
    )
    newRoleName.value = ''
    newRoleDesc.value = ''
    toast.value = '新增角色成功'
    await loadRoles()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '新增角色失败'
  } finally {
    saving.value = false
  }
}

async function handleRemoveRole(role: AdminRoleItem) {
  if (!role.removable || saving.value) return
  saving.value = true
  toast.value = ''
  try {
    await removeRole(role.oId, createIdempotencyKey('role-remove'))
    toast.value = `已删除角色「${role.roleName}」`
    if (selectedRole.value?.oId === role.oId) {
      selectedRole.value = null
      permissions.value = []
    }
    await loadRoles()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除角色失败'
  } finally {
    saving.value = false
  }
}

async function handleSavePermissions() {
  if (!selectedRole.value || saving.value || isRoleMatrixLocked.value) return
  saving.value = true
  toast.value = ''
  try {
    await updateRolePermissions(
      selectedRole.value.oId,
      Array.from(grantedSet.value),
      createIdempotencyKey('role-perms'),
    )
    toast.value = `已更新「${selectedRole.value.roleName}」的权限配置`
    await selectRole(selectedRole.value)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '保存角色权限失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadRoles()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>角色权限配置</h2>
        <p class="admin-muted">维护系统角色与精细化权限矩阵；内置角色及绑定用户的角色受删除保护。</p>
      </div>
      <form class="admin-filter-bar" @submit.prevent="handleCreateRole">
        <label class="admin-field"><input aria-label="新角色名称" v-model="newRoleName" class="admin-input" placeholder="新角色名称" required /></label>
        <label class="admin-field"><input aria-label="角色描述（可选）" v-model="newRoleDesc" class="admin-input" placeholder="角色描述（可选）" /></label>
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="saving">新增角色</button>
      </form>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <PageStateView :state="viewState" :error-message="errorMsg" empty-text="暂无角色" @retry="loadRoles">
      <div class="split-layout">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>角色名</th>
                <th>用户数</th>
                <th>属性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="role in roles" :key="role.oId" :class="{ 'row-active': selectedRole?.oId === role.oId }">
                <td>
                  <button type="button" class="admin-btn admin-btn--link" :aria-pressed="selectedRole?.oId === role.oId" @click="selectRole(role)">{{ role.roleName }}</button>
                  <div class="admin-muted">{{ role.roleDescription || role.oId }}</div>
                </td>
                <td>{{ role.userCount }}</td>
                <td>{{ role.builtIn ? '内置' : '自定义' }}</td>
                <td>
                  <div class="btn-row">
                    <button class="admin-btn admin-btn--sm" type="button" @click="selectRole(role)">配置权限</button>
                    <button
                      v-if="role.removable"
                      class="admin-btn admin-btn--sm admin-btn--danger"
                      type="button"
                      :disabled="saving"
                      @click="handleRemoveRole(role)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="detail-pane">
          <template v-if="selectedRole">
            <div class="pane-head">
              <div>
                <h3>{{ selectedRole.roleName }} 权限矩阵</h3>
                <p class="admin-muted">已勾选 {{ grantedSet.size }} 项权限</p>
              </div>
              <button
                class="admin-btn admin-btn--primary"
                type="button"
                :disabled="saving || permsLoading || isRoleMatrixLocked"
                @click="handleSavePermissions"
              >
                保存权限
              </button>
            </div>
            <p v-if="isRoleMatrixLocked" class="admin-muted">当前账号无权修改管理员或 OP 核心角色权限。</p>
            <div v-if="permsLoading" class="admin-muted">加载权限矩阵中...</div>
            <div v-else class="perm-groups">
              <div v-for="[cat, list] in groupedPermissions" :key="cat" class="perm-group">
                <h4>{{ cat }}</h4>
                <label v-for="perm in list" :key="perm.oId" class="perm-item admin-choice">
                  <input
                    type="checkbox"
                    :checked="grantedSet.has(perm.oId)"
                    :disabled="isRoleMatrixLocked || (!canManageAdminPerms && perm.adminOnly)"
                    @change="togglePerm(perm.oId)"
                  />
                  <span class="perm-content"><span>{{ perm.permissionLabel }}</span><code class="admin-muted">{{ perm.oId }}</code></span>
                </label>
              </div>
            </div>
          </template>
          <p v-else class="admin-muted">请点击角色名称或“配置权限”查看并编辑权限矩阵。</p>
        </aside>
      </div>
    </PageStateView>
    <AdminPagination v-if="viewState === 'ready'" :page="pagination.page" :page-size="pagination.pageSize" :total="pagination.total" :page-count="pagination.totalPages" :disabled="saving" @update:page="loadRoles" />
      </section>
  </div>
</template>

<style scoped>
.split-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 1rem; align-items: start; }
.detail-pane { border: 1px solid var(--fp-border); border-radius: 8px; padding: 1rem; }
.pane-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.perm-groups { display: flex; flex-direction: column; gap: 0.75rem; max-height: 600px; overflow-y: auto; }
.perm-group h4 { margin: 0 0 0.35rem; font-size: 0.9rem; }
.perm-item { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; align-items: start; min-height: 44px; padding: 10px 0; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--fp-border); }
.perm-item input { margin-top: 2px; }
.perm-content { display: grid; min-width: 0; gap: 4px; overflow-wrap: anywhere; }
.perm-content code { white-space: normal; font-size: 11px; }
.perm-item:has(input:disabled) { color: var(--fp-muted); cursor: not-allowed; }
.perm-group { min-width: 0; }
@media (max-width: 768px) { .perm-groups { max-height: none; overflow: visible; } }
.btn-row { display: flex; gap: 0.4rem; }
.row-active { background: rgba(59, 130, 246, 0.08); }
@media (max-width: 960px) { .split-layout { grid-template-columns: 1fr; } }
</style>
