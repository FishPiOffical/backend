<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchPetLogs, type PetLogsResponse } from '@/api/adminStage4'
import { ApiError } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 宠物活动与风控日志（严格只读）：
 * 1. 仅管理员可访问，对齐原网页端 Session 鉴权门槛；
 * 2. 支持活动日志（activity）与风控日志（risk）双标签及用户/日期/操作类型筛选；
 * 3. 首版严格只读，不提供改币、重置宠物或清零等危险操作。
 */
const auth = useAuthStore()

const tab = ref<'activity' | 'risk'>('activity')
const userFilter = ref('')
const fromDate = ref('')
const toDate = ref('')
const operationFilter = ref('')
const page = ref(1)

const data = ref<PetLogsResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const unauthenticated = ref(false)

const canAccess = computed(() => Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.isAdmin))
const rows = computed(() => data.value?.rows ?? [])
const columns = computed(() => (rows.value.length > 0 ? Object.keys(rows.value[0]) : []))
const operationOptions = computed(() => Object.entries(data.value?.operations ?? {}))

const hasActiveFilter = computed(
  () => userFilter.value.trim() !== '' || fromDate.value !== '' || toDate.value !== '' || operationFilter.value !== '',
)

const pageState = computed<PageViewState>(() => {
  if (!canAccess.value || forbidden.value) return 'forbidden'
  if (unauthenticated.value) return 'unauthenticated'
  if (loading.value && !data.value) return 'loading'
  if (loadError.value && !data.value) return 'error'
  if (!loading.value && rows.value.length === 0) {
    return hasActiveFilter.value ? 'filtered-empty' : 'empty'
  }
  return 'ready'
})

async function load(targetPage = 1) {
  if (!canAccess.value) {
    forbidden.value = true
    return
  }
  loading.value = true
  loadError.value = ''
  forbidden.value = false
  unauthenticated.value = false
  try {
    const res = await fetchPetLogs({
      tab: tab.value,
      user: userFilter.value.trim(),
      from: fromDate.value,
      to: toDate.value,
      operation: operationFilter.value,
      p: targetPage,
    })
    data.value = res
    page.value = res.page
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) unauthenticated.value = true
      else if (err.status === 403) forbidden.value = true
      else loadError.value = err.message
    } else {
      loadError.value = '读取宠物日志失败'
    }
  } finally {
    loading.value = false
  }
}

function switchTab(nextTab: 'activity' | 'risk') {
  tab.value = nextTab
  operationFilter.value = ''
  load(1)
}

function resetFilters() {
  userFilter.value = ''
  fromDate.value = ''
  toDate.value = ''
  operationFilter.value = ''
  load(1)
}

onMounted(() => load(1))
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <div class="admin-panel__title-row">
          <h1 class="admin-page__title">宠物活动与风控日志</h1>
          <StatusBadge label="严格只读" tone="info" />
        </div>
        <p class="admin-page__subtitle">仅管理员可检索宠物活动与风控流水，不提供改币、重置宠物或清零等写入入口。</p>
      </div>
      <div class="admin-tabs" role="tablist" aria-label="日志类型切换">
        <button
          type="button"
          class="admin-tab"
          :class="{ 'is-active': tab === 'activity' }"
          @click="switchTab('activity')"
        >
          活动日志
        </button>
        <button
          type="button"
          class="admin-tab"
          :class="{ 'is-active': tab === 'risk' }"
          @click="switchTab('risk')"
        >
          风控日志
        </button>
      </div>
    </header>

    <section class="admin-panel admin-stack">
      <div class="admin-filter-bar" style="margin: 0">
        <input v-model="userFilter" class="admin-input" placeholder="用户名 / 用户 ID" @keyup.enter="load(1)" />
        <input v-model="fromDate" class="admin-input" type="date" aria-label="开始日期" />
        <input v-model="toDate" class="admin-input" type="date" aria-label="结束日期" />
        <select v-model="operationFilter" class="admin-select">
          <option value="">全部操作类型</option>
          <option v-for="[k, label] in operationOptions" :key="k" :value="k">{{ label }}</option>
        </select>
        <button type="button" class="admin-btn admin-btn--primary" :disabled="loading" @click="load(1)">查询</button>
        <button v-if="hasActiveFilter" type="button" class="admin-btn" @click="resetFilters">重置</button>
      </div>

      <PageStateView
        :state="pageState"
        :error-message="loadError"
        empty-title="暂无匹配日志"
        empty-desc="当前筛选条件下没有宠物活动或风控记录。"
        @retry="load(page)"
      >
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th v-for="col in columns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in rows" :key="idx">
                <td v-for="col in columns" :key="col">{{ row[col] ?? '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="admin-row" style="justify-content: space-between">
          <span class="admin-muted admin-mono" style="font-size: 12px">第 {{ page }} 页</span>
          <div class="admin-row">
            <button type="button" class="admin-btn admin-btn--sm" :disabled="loading || page <= 1" @click="load(page - 1)">上一页</button>
            <button type="button" class="admin-btn admin-btn--sm" :disabled="loading || !data?.hasNext" @click="load(page + 1)">下一页</button>
          </div>
        </div>
      </PageStateView>
    </section>
  </div>
</template>
