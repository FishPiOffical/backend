<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchReviewImages,
  reviewImage,
  type ReviewImageItem,
  type Stage3Pagination,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 图片审核视图：
 * 严格遵循 rhypicEnabled 开关：启用外置图床审核时不发起内置图片审核请求。
 */
const auth = useAuthStore()
const viewState = ref<PageViewState>('loading')
const errorMsg = ref('')
const items = ref<ReviewImageItem[]>([])
const pagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const actingId = ref('')
const toast = ref('')

const rhypicEnabled = computed(() => Boolean(auth.capabilities?.rhypicEnabled))

async function load(page = 1) {
  if (rhypicEnabled.value) {
    viewState.value = 'empty'
    return
  }
  viewState.value = 'loading'
  errorMsg.value = ''
  try {
    const res = await fetchReviewImages(page, 20)
    items.value = res.items
    pagination.value = res.pagination
    viewState.value = res.items.length === 0 ? 'empty' : 'ready'
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : '加载待审核图片失败'
    viewState.value = 'error'
  }
}

async function mark(row: ReviewImageItem, decision: 'normal' | 'illegal') {
  if (actingId.value || rhypicEnabled.value) return
  actingId.value = row.oId
  toast.value = ''
  try {
    await reviewImage(row.oId, decision, createIdempotencyKey('image-review'))
    toast.value = decision === 'normal' ? '已标记为正常图片' : '已标记为违规图片并隐藏'
    await load(pagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '图片审核操作失败'
  } finally {
    actingId.value = ''
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
        <h2>图片审核</h2>
        <p class="muted">展示 45 天内待审核公开上传图片；若启用了外置 RhyPic 审核，此内置入口自动停用。</p>
      </div>
      <button v-if="!rhypicEnabled" class="btn btn-secondary" type="button" @click="load(1)">刷新队列</button>
    </div>

    <div v-if="rhypicEnabled" class="notice-banner">
      当前站点已启用 RhyPic 图床审核（<code>rhypicEnabled = true</code>），内置图片审核已关闭。
    </div>

    <template v-else>
      <p v-if="toast" class="notice-banner">{{ toast }}</p>

      <PageStateView :state="viewState" :error-message="errorMsg" empty-text="45 天内暂无待审核图片" @retry="load(pagination.page)">
        <div class="image-grid">
          <article v-for="row in items" :key="row.oId" class="image-card">
            <img :src="row.path" :alt="row.md5 || row.oId" class="preview-img" loading="lazy" />
            <div class="card-meta">
              <div><strong>上传者：</strong>{{ row.userName || '-' }}</div>
              <div><strong>IP：</strong>{{ row.ip || '-' }}</div>
              <div class="btn-row">
                <button class="btn btn-sm btn-primary" :disabled="actingId === row.oId" @click="mark(row, 'normal')">正常</button>
                <button class="btn btn-sm btn-danger" :disabled="actingId === row.oId" @click="mark(row, 'illegal')">违规</button>
              </div>
            </div>
          </article>
        </div>

        <div class="pager-bar">
          <button class="btn btn-sm" :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">上一页</button>
          <span>第 {{ pagination.page }} / {{ pagination.totalPages }} 页（共 {{ pagination.total }} 条）</span>
          <button class="btn btn-sm" :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">下一页</button>
        </div>
      </PageStateView>
    </template>
  </section>
</template>

<style scoped>
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
.image-card { border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.preview-img { width: 100%; height: 160px; object-fit: cover; background: #f8fafc; }
.card-meta { padding: 0.75rem; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.35rem; }
.btn-row { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
.pager-bar { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.75rem; }
.notice-banner { padding: 0.5rem 0.75rem; border-radius: 6px; background: #eff6ff; color: #1d4ed8; margin-bottom: 0.75rem; }
</style>
