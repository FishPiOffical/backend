<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  fetchMilestones,
  updateMilestone,
  type MilestoneItem,
  type Stage3Pagination,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 大事记审核视图：
 * 与社区运营共用同一大事记数据源，聚焦审核状态流转（1 待审 / 2 通过 / 3 拒绝）。
 */
const auth = useAuthStore()
const viewState = ref<PageViewState>('loading')
const errorMsg = ref('')
const items = ref<MilestoneItem[]>([])
const pagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const statusFilter = ref<'1' | '2' | '3' | 'all'>('1')
const keyword = ref('')
const actingId = ref('')
const toast = ref('')

const canReview = computed(() => Boolean(auth.capabilities?.actions.milestoneReview))

function statusLabel(status: number): string {
  switch (status) {
    case 1:
      return '待审核'
    case 2:
      return '已通过'
    case 3:
      return '已拒绝'
    default:
      return `状态 ${status}`
  }
}

async function load(page = 1) {
  viewState.value = 'loading'
  errorMsg.value = ''
  try {
    const res = await fetchMilestones({
      p: page,
      size: 20,
      status: statusFilter.value === 'all' ? '' : statusFilter.value,
      keyword: keyword.value.trim(),
    })
    items.value = res.items
    pagination.value = res.pagination
    viewState.value = res.items.length === 0 ? 'empty' : 'ready'
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : '加载大事记列表失败'
    viewState.value = 'error'
  }
}

async function changeStatus(row: MilestoneItem, milestoneStatus: number) {
  if (actingId.value) return
  actingId.value = row.oId
  toast.value = ''
  try {
    await updateMilestone(row.oId, { milestoneStatus }, createIdempotencyKey('milestone-review'))
    toast.value = `已将「${row.milestoneTitle}」标记为${statusLabel(milestoneStatus)}`
    await load(pagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新大事记状态失败'
  } finally {
    actingId.value = ''
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
        <h2>大事记审核</h2>
        <p class="admin-muted">
          与 <RouterLink to="/ops/community-records">鱼游与大事记维护</RouterLink> 共用同一数据表，审核中心专注状态核准与驳回。
        </p>
      </div>
      <div class="admin-filter-bar admin-search-bar">
        <select aria-label="状态筛选" v-model="statusFilter" class="admin-select" @change="load(1)">
          <option value="1">待审核</option>
          <option value="2">已通过</option>
          <option value="3">已拒绝</option>
          <option value="all">全部状态</option>
        </select>
        <input aria-label="标题或正文关键词" v-model="keyword" class="admin-input" placeholder="标题或正文关键词" @keyup.enter="load(1)" />
        <button class="admin-btn admin-btn--secondary" type="button" @click="load(1)">查询</button>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <PageStateView :state="viewState" :error-message="errorMsg" empty-text="暂无符合条件的大事记" @retry="load(pagination.page)">
      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>日期</th>
            <th>提交人</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.oId">
            <td>
              <strong>{{ row.milestoneTitle }}</strong>
              <p class="admin-muted">{{ row.milestoneContent || '-' }}</p>
            </td>
            <td>{{ row.milestoneDate }}{{ row.milestoneEndDate ? ` ~ ${row.milestoneEndDate}` : '' }}</td>
            <td>{{ row.authorName || row.milestoneAuthorId || '-' }}</td>
            <td>{{ statusLabel(row.milestoneStatus) }}</td>
            <td>
              <div v-if="canReview" class="btn-row">
                <button class="admin-btn admin-btn--sm admin-btn--primary" :disabled="actingId === row.oId" @click="changeStatus(row, 2)">通过</button>
                <button class="admin-btn admin-btn--sm admin-btn--danger" :disabled="actingId === row.oId" @click="changeStatus(row, 3)">拒绝</button>
                <button class="admin-btn admin-btn--sm" :disabled="actingId === row.oId" @click="changeStatus(row, 1)">退回待审</button>
              </div>
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
.btn-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
</style>
