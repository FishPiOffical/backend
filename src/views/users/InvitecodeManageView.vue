<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  fetchInvitecodes,
  generateInvitecodes,
  updateInvitecode,
  type InvitecodeItem,
  type Stage3Pagination,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import { formatDateTime } from '@/utils/format'

/**
 * 邀请码管理视图：
 * 严格遵循旧状态枚举（0 已使用 / 1 未使用 / 2 已停用），支持批量生成与状态/备注维护。
 */
const viewState = ref<PageViewState>('loading')
const errorMsg = ref('')
const items = ref<InvitecodeItem[]>([])
const pagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const statusFilter = ref<'all' | '0' | '1' | '2'>('all')
const keyword = ref('')

const genQuantity = ref(5)
const genMemo = ref('')
const saving = ref(false)
const toast = ref('')

const editingId = ref('')
const editStatus = ref(1)
const editMemo = ref('')

async function load(page = 1) {
  viewState.value = 'loading'
  errorMsg.value = ''
  try {
    const res = await fetchInvitecodes({
      p: page,
      size: 20,
      status: statusFilter.value === 'all' ? '' : statusFilter.value,
      keyword: keyword.value.trim(),
    })
    items.value = res.items
    pagination.value = res.pagination
    viewState.value = res.items.length === 0 ? 'empty' : 'ready'
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : '加载邀请码列表失败'
    viewState.value = 'error'
  }
}

async function handleGenerate() {
  if (saving.value || genQuantity.value < 1 || genQuantity.value > 100) return
  saving.value = true
  toast.value = ''
  try {
    await generateInvitecodes(
      { quantity: genQuantity.value, memo: genMemo.value.trim() },
      createIdempotencyKey('ic-gen'),
    )
    toast.value = `已成功生成 ${genQuantity.value} 枚邀请码`
    genMemo.value = ''
    await load(1)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '批量生成邀请码失败'
  } finally {
    saving.value = false
  }
}

function startEdit(row: InvitecodeItem) {
  editingId.value = row.oId
  editStatus.value = row.status
  editMemo.value = row.memo || ''
}

async function saveEdit(row: InvitecodeItem) {
  if (saving.value) return
  saving.value = true
  toast.value = ''
  try {
    await updateInvitecode(
      row.oId,
      { status: editStatus.value, memo: editMemo.value.trim() },
      createIdempotencyKey('ic-update'),
    )
    editingId.value = ''
    toast.value = `已更新邀请码 ${row.code}`
    await load(pagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新邀请码失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load(1)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>邀请码管理</h2>
        <p class="admin-muted">支持批量生成邀请码及维护状态（0 已使用、1 未使用、2 已停用）与备注。</p>
      </div>
      <form class="admin-filter-bar" @submit.prevent="handleGenerate">
        <input aria-label="生成数量" v-model.number="genQuantity" class="admin-input num-input" type="number" min="1" max="100" />
        <label class="admin-field"><input aria-label="生成备注（可选）" v-model="genMemo" class="admin-input" placeholder="生成备注（可选）" /></label>
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="saving">批量生成</button>
      </form>
    </div>
    <section class="admin-panel">

    <div class="admin-filter-bar toolbar-gap admin-search-bar">
      <select aria-label="状态筛选" v-model="statusFilter" class="admin-select" @change="load(1)">
        <option value="all">全部状态</option>
        <option value="1">1 - 未使用</option>
        <option value="0">0 - 已使用</option>
        <option value="2">2 - 已停用</option>
      </select>
      <input aria-label="邀请码或备注" v-model="keyword" class="admin-input" placeholder="邀请码或备注" @keyup.enter="load(1)" />
      <button class="admin-btn admin-btn--secondary" type="button" @click="load(1)">筛选</button>
    </div>

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <PageStateView :state="viewState" :error-message="errorMsg" empty-text="暂无符合条件的邀请码" @retry="load(pagination.page)">
      <div class="admin-table-wrap"><table class="admin-table admin-table--wide">
        <thead>
          <tr>
            <th>邀请码</th>
            <th>状态</th>
            <th>备注</th>
            <th>生成者 / 使用者</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.oId">
            <td><code>{{ row.code }}</code></td>
            <td>
              <select aria-label="邀请码状态" v-if="editingId === row.oId" v-model.number="editStatus" class="admin-select">
                <option :value="1">1 - 未使用</option>
                <option :value="0">0 - 已使用</option>
                <option :value="2">2 - 已停用</option>
              </select>
              <span v-else>{{ row.status }} - {{ row.statusLabel }}</span>
            </td>
            <td>
              <input aria-label="邀请码备注" v-if="editingId === row.oId" v-model="editMemo" class="admin-input" />
              <span v-else>{{ row.memo || '-' }}</span>
            </td>
            <td>
              <div>生成：{{ row.generatorName || '-' }}</div>
              <div class="admin-muted">使用：{{ row.userName || '-' }}</div>
            </td>
            <td>
              <div>{{ row.time ? formatDateTime(row.time) : '未记录' }}</div>
              <div v-if="row.useTime" class="admin-muted">用：{{ formatDateTime(row.useTime) }}</div>
            </td>
            <td>
              <div v-if="editingId === row.oId" class="btn-row">
                <button class="admin-btn admin-btn--sm admin-btn--primary" :disabled="saving" @click="saveEdit(row)">保存</button>
                <button class="admin-btn admin-btn--sm" @click="editingId = ''">取消</button>
              </div>
              <button v-else class="admin-btn admin-btn--sm" @click="startEdit(row)">编辑</button>
            </td>
          </tr>
        </tbody>
      </table></div>

      <div class="pager-bar">
        <button class="admin-btn admin-btn--sm" :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">上一页</button>
        <span>第 {{ pagination.page }} / {{ pagination.totalPages }} 页（共 {{ pagination.total }} 条）</span>
        <button class="admin-btn admin-btn--sm" :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">下一页</button>
      </div>
    </PageStateView>
      </section>
  </div>
</template>

<style scoped>
.toolbar-gap { margin-bottom: 0.75rem; }
.num-input { width: 90px; }
.btn-row { display: flex; gap: 0.4rem; }
</style>
