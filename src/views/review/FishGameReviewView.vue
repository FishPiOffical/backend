<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchFishGames,
  reviewFishGame,
  type FishGameItem,
  type Stage3Pagination,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 鱼游投稿及修改审核视图：
 * 1. 支持按状态（0 待审 / 1 通过 / 2 拒绝 / 3 停用）、待审修改标记及关键词筛选；
 * 2. 当存在待审修改（fishGameEditPending === 1）时并排展示现网字段与待审字段差异；
 * 3. 审核动作使用 Idempotency-Key 幂等保护。
 */
const auth = useAuthStore()
const viewState = ref<PageViewState>('loading')
const errorMsg = ref('')
const items = ref<FishGameItem[]>([])
const pagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const statusFilter = ref<'all' | '0' | '1' | '2' | '3'>('0')
const editPendingOnly = ref(false)
const keyword = ref('')
const selected = ref<FishGameItem | null>(null)
const rejectReason = ref('')
const acting = ref(false)
const toast = ref('')

const canReview = computed(() => Boolean(auth.capabilities?.actions.fishGameReview))

function statusText(status: number): string {
  switch (status) {
    case 0:
      return '待审核'
    case 1:
      return '已通过'
    case 2:
      return '已拒绝'
    case 3:
      return '已停用'
    default:
      return `状态 ${status}`
  }
}

async function load(page = 1) {
  viewState.value = 'loading'
  errorMsg.value = ''
  try {
    const res = await fetchFishGames({
      p: page,
      size: 20,
      status: statusFilter.value === 'all' ? '' : statusFilter.value,
      keyword: keyword.value.trim(),
      editPendingOnly: editPendingOnly.value,
    })
    items.value = res.items
    pagination.value = res.pagination
    viewState.value = res.items.length === 0 ? 'empty' : 'ready'
    if (selected.value) {
      const updated = res.items.find((i) => i.oId === selected.value?.oId) || null
      selected.value = updated
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : '加载鱼游投稿列表失败'
    viewState.value = 'error'
  }
}

async function submitReview(status: number) {
  if (!selected.value || acting.value) return
  acting.value = true
  toast.value = ''
  try {
    await reviewFishGame(
      selected.value.oId,
      {
        status,
        fishGameRejectReason: status === 2 ? rejectReason.value.trim() : '',
      },
      createIdempotencyKey('fish-review'),
    )
    toast.value = `已完成审核：${statusText(status)}`
    rejectReason.value = ''
    await load(pagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '审核提交失败'
  } finally {
    acting.value = false
  }
}

onMounted(() => {
  load(1)
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-head">
      <div>
        <h2>鱼游投稿及修改审核</h2>
        <p class="muted">集中审核新投稿与已上线鱼游的待审资料变更，支持现网与待审字段对比。</p>
      </div>
      <div class="filter-row">
        <select v-model="statusFilter" class="input" @change="load(1)">
          <option value="0">待审核</option>
          <option value="1">已通过</option>
          <option value="2">已拒绝</option>
          <option value="3">已停用</option>
          <option value="all">全部状态</option>
        </select>
        <label class="checkbox-inline">
          <input v-model="editPendingOnly" type="checkbox" @change="load(1)" />
          仅看有待审修改
        </label>
        <input v-model="keyword" class="input" placeholder="名称或标签" @keyup.enter="load(1)" />
        <button class="btn btn-secondary" type="button" @click="load(1)">查询</button>
      </div>
    </div>

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <PageStateView :state="viewState" :error-message="errorMsg" empty-text="当前筛选条件下暂无鱼游记录" @retry="load(pagination.page)">
      <div class="split-layout">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>标签</th>
                <th>状态</th>
                <th>修改标记</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.oId" :class="{ 'row-active': selected?.oId === row.oId }">
                <td>{{ row.fishGameName }}</td>
                <td>{{ row.fishGameTag || '-' }}</td>
                <td>{{ statusText(row.fishGameStatus) }}</td>
                <td>
                  <span v-if="row.fishGameEditPending === 1" class="badge badge-warn">有待审修改</span>
                  <span v-else class="muted">-</span>
                </td>
                <td>
                  <button class="btn btn-sm" type="button" @click="selected = row">查看 / 审核</button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="pager-bar">
            <button class="btn btn-sm" :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">上一页</button>
            <span>第 {{ pagination.page }} / {{ pagination.totalPages }} 页（共 {{ pagination.total }} 条）</span>
            <button class="btn btn-sm" :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">下一页</button>
          </div>
        </div>

        <aside v-if="selected" class="detail-pane">
          <h3>{{ selected.fishGameName }}</h3>
          <p class="muted">ID：{{ selected.oId }} ｜ 当前状态：{{ statusText(selected.fishGameStatus) }}</p>

          <div class="diff-box">
            <h4>{{ selected.fishGameEditPending === 1 ? '现网字段 vs 待审修改对比' : '投稿详情' }}</h4>
            <dl class="kv-list">
              <dt>名称</dt>
              <dd>
                <span>{{ selected.fishGameName }}</span>
                <span v-if="selected.fishGameEditPending === 1 && selected.fishGamePendingName" class="diff-new">
                  → {{ selected.fishGamePendingName }}
                </span>
              </dd>
              <dt>链接</dt>
              <dd>
                <span>{{ selected.fishGameUrl }}</span>
                <span v-if="selected.fishGameEditPending === 1 && selected.fishGamePendingUrl" class="diff-new">
                  → {{ selected.fishGamePendingUrl }}
                </span>
              </dd>
              <dt>标签</dt>
              <dd>
                <span>{{ selected.fishGameTag || '-' }}</span>
                <span v-if="selected.fishGameEditPending === 1 && selected.fishGamePendingTag" class="diff-new">
                  → {{ selected.fishGamePendingTag }}
                </span>
              </dd>
              <dt>简介</dt>
              <dd>
                <span>{{ selected.fishGameDescription || '-' }}</span>
                <span v-if="selected.fishGameEditPending === 1 && selected.fishGamePendingDescription" class="diff-new">
                  → {{ selected.fishGamePendingDescription }}
                </span>
              </dd>
            </dl>
          </div>

          <div v-if="canReview" class="action-stack">
            <label>拒绝原因（拒绝时可选填）</label>
            <textarea v-model="rejectReason" class="input" rows="2" placeholder="说明拒绝原因" />
            <div class="btn-row">
              <button class="btn btn-primary" :disabled="acting" @click="submitReview(1)">审核通过</button>
              <button class="btn btn-danger" :disabled="acting" @click="submitReview(2)">拒绝</button>
              <button class="btn btn-secondary" :disabled="acting" @click="submitReview(3)">停用</button>
            </div>
          </div>
        </aside>
      </div>
    </PageStateView>
  </section>
</template>

<style scoped>
.panel-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.filter-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.checkbox-inline { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.875rem; }
.split-layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; align-items: start; }
.detail-pane { border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 1rem; }
.diff-new { display: block; color: #b45309; font-weight: 600; margin-top: 0.25rem; }
.kv-list dt { font-weight: 600; margin-top: 0.5rem; }
.kv-list dd { margin: 0.2rem 0 0; word-break: break-all; }
.btn-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }
.pager-bar { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.75rem; }
.notice-banner { padding: 0.5rem 0.75rem; border-radius: 6px; background: #eff6ff; color: #1d4ed8; margin-bottom: 0.75rem; }
.row-active { background: rgba(59, 130, 246, 0.08); }
@media (max-width: 960px) { .split-layout { grid-template-columns: 1fr; } }
</style>
