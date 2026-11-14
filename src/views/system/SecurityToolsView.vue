<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchSecurityMonitor,
  reindexAllArticles,
  reindexOneArticle,
  runSecuritySelfCheck,
  saveSecuritySwitches,
  type SecurityMonitorResponse,
} from '@/api/adminStage4'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 安全状态、爬虫观测与维护工具：
 * 1. 安全监控、自检与临时开关保留仅安全操作员（adlered）可见可用；
 * 2. 生产模式下临时安全开关严格只读，仅开发模式可写入（重启失效）；
 * 3. 文章搜索索引维护工具按 articleReindexArticleIndex / articleReindexArticlesIndex 授权。
 */
const auth = useAuthStore()

const isSecurityOperator = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.isSecurityOperator),
)
const canReindexOne = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.articleReindexArticleIndex),
)
const canReindexAll = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.articleReindexArticlesIndex),
)

const crawlerFilter = ref('')
const monitorData = ref<SecurityMonitorResponse | null>(null)
const selfCheckData = ref<Record<string, unknown> | null>(null)
const switchesDraft = reactive({
  firewallEnabled: false,
  threshold: 120,
  verificationEnabled: false,
  firstVisitCaptchaEnabled: false,
})

const articleIdInput = ref('')
const loading = ref(false)
const loadError = ref('')
const notice = ref('')
const actionError = ref('')
const busy = ref(false)

const pageState = computed<PageViewState>(() => {
  if (!isSecurityOperator.value && !canReindexOne.value && !canReindexAll.value) return 'forbidden'
  if (loading.value && isSecurityOperator.value && !monitorData.value) return 'loading'
  if (loadError.value && isSecurityOperator.value && !monitorData.value) return 'error'
  return 'ready'
})

function extractError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : '操作失败'
}

async function loadMonitor() {
  if (!isSecurityOperator.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchSecurityMonitor(crawlerFilter.value.trim())
    monitorData.value = res
    if (res.switches) {
      switchesDraft.firewallEnabled = res.switches.firewallEnabled
      switchesDraft.threshold = res.switches.threshold
      switchesDraft.verificationEnabled = res.switches.verificationEnabled
      switchesDraft.firstVisitCaptchaEnabled = res.switches.firstVisitCaptchaEnabled
    }
  } catch (err) {
    loadError.value = extractError(err)
  } finally {
    loading.value = false
  }
}

async function handleSelfCheck() {
  actionError.value = ''
  notice.value = ''
  try {
    selfCheckData.value = await runSecuritySelfCheck()
    notice.value = '安全自检执行完成'
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handleSaveSwitches() {
  actionError.value = ''
  notice.value = ''
  busy.value = true
  try {
    const res = await saveSecuritySwitches({ ...switchesDraft }, createIdempotencyKey('sec-sw'))
    notice.value = `临时安全开关已更新（当前模式：${res.runtimeMode}）`
    await loadMonitor()
  } catch (err) {
    actionError.value = extractError(err)
  } finally {
    busy.value = false
  }
}

async function handleReindexOne() {
  actionError.value = ''
  notice.value = ''
  const id = articleIdInput.value.trim()
  if (!id) {
    actionError.value = '请输入文章 ID'
    return
  }
  busy.value = true
  try {
    const res = await reindexOneArticle(id, createIdempotencyKey('reindex-one'))
    notice.value = `文章 ${res.articleId} 搜索索引已触发更新`
    articleIdInput.value = ''
  } catch (err) {
    actionError.value = extractError(err)
  } finally {
    busy.value = false
  }
}

async function handleReindexAll() {
  actionError.value = ''
  notice.value = ''
  if (!window.confirm('确认异步重建全站文章搜索索引？该操作将在后台分批刷新 ES/Algolia 索引。')) {
    return
  }
  busy.value = true
  try {
    const res = await reindexAllArticles(createIdempotencyKey('reindex-all'))
    notice.value = res.replayed ? '全站索引重建任务已触发（幂等重放）' : '全站文章索引异步重建任务已启动'
  } catch (err) {
    actionError.value = extractError(err)
  } finally {
    busy.value = false
  }
}

onMounted(loadMonitor)
</script>

<template>
  <PageStateView :state="pageState" :error-message="loadError" @retry="loadMonitor">
    <div style="display: flex; flex-direction: column; gap: 16px">
      <div v-if="notice" class="alert alert-success">{{ notice }}</div>
      <div v-if="actionError" class="alert alert-danger">{{ actionError }}</div>

      <section v-if="isSecurityOperator" class="panel">
        <header class="panel-header">
          <div>
            <div style="display: flex; align-items: center; gap: 10px">
              <h2 class="panel-title">安全监控与临时开关</h2>
              <StatusBadge label="仅安全操作员 adlered" tone="danger" />
              <StatusBadge
                v-if="monitorData?.switches"
                :label="monitorData.switches.editable ? '开发模式可写（重启失效）' : '生产模式只读'"
                :tone="monitorData.switches.editable ? 'warning' : 'neutral'"
              />
            </div>
            <p class="panel-desc">运行期连接数不等于去重在线人数，安全监控事件为内存有界快照。</p>
          </div>
          <div style="display: flex; gap: 8px">
            <button type="button" class="btn" @click="handleSelfCheck">执行安全自检</button>
            <button type="button" class="btn btn-primary" :disabled="loading" @click="loadMonitor">刷新监控</button>
          </div>
        </header>

        <div class="filter-bar">
          <input v-model="crawlerFilter" class="input" placeholder="按爬虫名称过滤" @keyup.enter="loadMonitor" />
          <button type="button" class="btn" @click="loadMonitor">应用过滤</button>
        </div>

        <div v-if="monitorData?.switches" style="display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 12px">
          <label><input v-model="switchesDraft.firewallEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> CC 防火墙</label>
          <label>
            阈值(次/分)
            <input v-model.number="switchesDraft.threshold" type="number" min="1" class="input" style="width: 100px; margin-left: 6px" :disabled="!monitorData.switches.editable" />
          </label>
          <label><input v-model="switchesDraft.verificationEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> 匿名验证盾</label>
          <label><input v-model="switchesDraft.firstVisitCaptchaEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> 首访验证码</label>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !monitorData.switches.editable"
            @click="handleSaveSwitches"
          >
            保存临时开关
          </button>
        </div>

        <pre v-if="selfCheckData" style="margin-bottom: 12px; padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto; max-height: 240px">{{ JSON.stringify(selfCheckData, null, 2) }}</pre>
        <pre v-if="monitorData" style="padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto; max-height: 360px">{{ JSON.stringify(monitorData, null, 2) }}</pre>
      </section>

      <section v-if="canReindexOne || canReindexAll" class="panel">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">搜索索引维护工具</h2>
            <p class="panel-desc">支持单篇文章与全站文章 ES / Algolia 索引重建，操作自动写入审计日志。</p>
          </div>
        </header>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
          <template v-if="canReindexOne">
            <input v-model="articleIdInput" class="input" placeholder="输入文章 oId" />
            <button type="button" class="btn btn-primary" :disabled="busy" @click="handleReindexOne">重建单篇索引</button>
          </template>
          <button v-if="canReindexAll" type="button" class="btn btn-danger" :disabled="busy" @click="handleReindexAll">
            异步重建全站文章索引
          </button>
        </div>
      </section>
    </div>
  </PageStateView>
</template>
