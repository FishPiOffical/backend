<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
import RecordTable from '@/components/config/RecordTable.vue'
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
const eventFilter = ref('')
const eventResult = ref('')
let monitorSequence = 0
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : []
const events = computed(() => rows(monitorData.value?.events).filter(row => (!eventResult.value || String(row.result) === eventResult.value) && (!eventFilter.value || [row.ip,row.uri,row.reason,row.type].some(v => String(v || '').toLowerCase().includes(eventFilter.value.toLowerCase())))))
const eventResults = computed(() => [...new Set(rows(monitorData.value?.events).map(row => String(row.result || '')))].filter(Boolean))
const counters = computed(() => Object.entries((monitorData.value?.counts || {}) as Record<string, unknown>).map(([name,count]) => ({ name,count })))
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
  const sequence = ++monitorSequence
  const epoch = auth.sessionEpoch
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchSecurityMonitor(crawlerFilter.value.trim())
    if (sequence !== monitorSequence || epoch !== auth.sessionEpoch || !isSecurityOperator.value) return
    monitorData.value = res
    if (res.switches) {
      switchesDraft.firewallEnabled = res.switches.firewallEnabled
      switchesDraft.threshold = res.switches.threshold
      switchesDraft.verificationEnabled = res.switches.verificationEnabled
      switchesDraft.firstVisitCaptchaEnabled = res.switches.firstVisitCaptchaEnabled
    }
  } catch (err) {
    if (sequence === monitorSequence && epoch === auth.sessionEpoch) loadError.value = extractError(err)
  } finally {
    if (sequence === monitorSequence) loading.value = false
  }
}

async function handleSelfCheck() {
  if (!isSecurityOperator.value || busy.value) return
  const epoch = auth.sessionEpoch
  busy.value = true
  actionError.value = ''
  notice.value = ''
  try {
    const result = await runSecuritySelfCheck()
    if (epoch !== auth.sessionEpoch || !isSecurityOperator.value) return
    selfCheckData.value = result
    notice.value = '安全自检执行完成'
  } catch (err) {
    if (epoch === auth.sessionEpoch) actionError.value = extractError(err)
  } finally { busy.value = false }
}

async function handleSaveSwitches() {
  if (busy.value || !isSecurityOperator.value || !monitorData.value?.switches.editable) return
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

watch([() => auth.sessionEpoch, isSecurityOperator], () => { monitorSequence++; monitorData.value = null; selfCheckData.value = null; loadError.value = ''; notice.value = ''; actionError.value = ''; loading.value = false; if (isSecurityOperator.value) void loadMonitor() })
onMounted(loadMonitor)
</script>

<template>
  <PageStateView :state="pageState" :error-message="loadError" @retry="loadMonitor">
    <div class="admin-page">
      <header class="admin-page__header">
        <div>
          <h1 class="admin-page__title">安全监控与搜索维护</h1>
          <p class="admin-page__subtitle">查看运行期安全监控快照、调整开发模式临时开关，或触发文章搜索索引重建。</p>
        </div>
      </header>

      <div v-if="notice" class="admin-alert admin-alert--success">{{ notice }}</div>
      <div v-if="actionError" class="admin-alert admin-alert--danger">{{ actionError }}</div>

      <section v-if="isSecurityOperator" class="admin-panel admin-stack">
        <header class="admin-panel__header">
          <div>
            <div class="admin-panel__title-row">
              <h2 class="admin-panel__title">安全监控与临时开关</h2>
              <StatusBadge label="仅安全操作员 adlered" tone="danger" />
              <StatusBadge
                v-if="monitorData?.switches"
                :label="monitorData.switches.editable ? '开发模式可写（重启失效）' : '生产模式只读'"
                :tone="monitorData.switches.editable ? 'warning' : 'neutral'"
              />
            </div>
            <p class="admin-panel__desc">运行期连接数不等于去重在线人数，安全监控事件为内存有界快照。</p>
          </div>
          <div class="admin-row">
            <button type="button" class="admin-btn" :disabled="busy" @click="handleSelfCheck">执行安全自检</button>
            <button type="button" class="admin-btn admin-btn--primary" :disabled="loading" @click="loadMonitor">刷新监控</button>
          </div>
        </header>

        <div class="admin-filter-bar" style="margin: 0">
          <label class="admin-row">
            <span class="admin-muted">爬虫分组</span>
            <select v-model="crawlerFilter" class="admin-select" style="width: auto; min-width: 180px">
              <option value="">默认分组</option>
              <option v-for="group in rows(monitorData?.crawlers?.groups)" :key="String(group.key)" :value="String(group.key)">
                {{ group.name }}（{{ group.count }}）
              </option>
            </select>
          </label>
          <button type="button" class="admin-btn" @click="loadMonitor">应用过滤</button>
        </div>

        <div v-if="monitorData?.switches" class="admin-panel admin-panel--subtle admin-row" style="padding: 12px 16px; gap: 16px">
          <label class="admin-row" style="gap: 6px"><input v-model="switchesDraft.firewallEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> CC 防火墙</label>
          <label class="admin-row" style="gap: 6px">
            阈值(次/分)
            <input v-model.number="switchesDraft.threshold" type="number" min="1" class="admin-input" style="width: 100px" :disabled="!monitorData.switches.editable" />
          </label>
          <label class="admin-row" style="gap: 6px"><input v-model="switchesDraft.verificationEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> 匿名验证盾</label>
          <label class="admin-row" style="gap: 6px"><input v-model="switchesDraft.firstVisitCaptchaEnabled" type="checkbox" :disabled="!monitorData.switches.editable" /> 首访验证码</label>
          <button
            type="button"
            class="admin-btn admin-btn--primary admin-btn--sm"
            :disabled="busy || !monitorData.switches.editable"
            @click="handleSaveSwitches"
          >
            保存临时开关
          </button>
        </div>

        <p v-if="loadError" class="admin-alert admin-alert--danger">{{ loadError }}（下方保留上次快照）</p>
        <div v-if="selfCheckData" class="security-block">
          <h3>安全自检 · {{ selfCheckData.status === 'PASS' ? '通过' : '需要复核' }}</h3><p>{{ selfCheckData.checkedAt }} · {{ selfCheckData.runtimeMode }}</p>
          <RecordTable :rows="rows(selfCheckData.checks)" :columns="[['name','检查项'],['passed','通过'],['detail','说明']]" />
          <p class="admin-muted">{{ selfCheckData.note }}</p>
        </div>
        <template v-if="monitorData">
          <div class="security-metrics"><div><strong>{{ monitorData.total ?? 0 }}</strong><span>累计事件</span></div><div><strong>{{ monitorData.last10Minutes ?? 0 }}</strong><span>最近 10 分钟</span></div><div><strong class="retention-text">{{ monitorData.retention ?? '—' }}</strong><span>内存保留上限</span></div><div><strong>{{ monitorData.observationDiscarded ?? 0 }}</strong><span>丢弃的链路观测</span></div></div>
          <div class="security-block"><h3>事件类型统计</h3><RecordTable :rows="counters" :columns="[['name','事件类型'],['count','数量']]" /></div>
          <div class="security-block"><h3>请求事件</h3><div class="admin-filter-bar"><input v-model="eventFilter" class="admin-input" placeholder="筛选当前快照的 IP、路径、原因" aria-label="事件关键词" /><select v-model="eventResult" class="admin-select" aria-label="事件结果"><option value="">全部结果</option><option v-for="result in eventResults" :key="result">{{ result }}</option></select><span>{{ events.length }} 条</span></div><RecordTable :rows="events" :columns="[['time','时间'],['ip','来源 IP'],['userStatus','用户状态'],['method','方法'],['uri','路径'],['handler','处理器'],['flow','流程'],['type','类型'],['result','结果'],['reason','原因']]" /></div>
          <div class="security-block"><h3>链路观测</h3><RecordTable :rows="rows(monitorData.observations)" :columns="[['time','时间'],['ip','来源 IP'],['kind','类型'],['state','状态'],['detail','详情'],['failure','失败信息']]" /></div>
          <div class="security-block"><h3>爬虫分组</h3><p class="admin-muted">未验证表示尚未完成可信身份验证，不等同于伪造爬虫。统计随服务重启重置，省略记录数不代表请求总数。</p><RecordTable :rows="rows(monitorData.crawlers?.groups)" :columns="[['name','分组'],['verified','已验证'],['count','请求数'],['lastSeen','最近出现'],['pathCount','路径数'],['omitted','省略路径'],['sourceCount','来源数'],['sourceOmitted','省略来源']]" /></div>
          <div class="security-block"><h3>访问路径 · {{ monitorData.crawlers?.selectedGroup || '默认分组' }}</h3><RecordTable :rows="rows(monitorData.crawlers?.paths)" :columns="[['path','路径'],['count','次数'],['lastSeen','最近访问']]" /></div>
          <div class="security-block"><h3>来源验证 · 省略 {{ monitorData.crawlers?.sourceOmitted ?? 0 }} 条</h3><RecordTable :rows="rows(monitorData.crawlers?.sources)" :columns="[['ip','IP'],['count','请求数'],['lastSeen','最近出现'],['reason','验证说明'],['ptr','反向解析'],['forward','正向解析'],['checkedAt','检查时间'],['cached','缓存结果'],['subsequentStatus','后续状态'],['recoveredAt','恢复时间']]" /></div>
          <details><summary class="admin-muted" style="cursor: pointer">原始快照（排查用）</summary><pre class="admin-code-block">{{ JSON.stringify(monitorData,null,2) }}</pre></details>
        </template>
      </section>

      <section v-if="canReindexOne || canReindexAll" class="admin-panel admin-stack">
        <header class="admin-panel__header">
          <div>
            <h2 class="admin-panel__title">搜索索引维护工具</h2>
            <p class="admin-panel__desc">支持单篇文章与全站文章 ES / Algolia 索引重建，操作自动写入审计日志。</p>
          </div>
        </header>
        <div class="admin-row">
          <template v-if="canReindexOne">
            <input v-model="articleIdInput" class="admin-input" style="max-width: 280px" placeholder="输入文章 oId" />
            <button type="button" class="admin-btn admin-btn--primary" :disabled="busy" @click="handleReindexOne">重建单篇索引</button>
          </template>
          <button v-if="canReindexAll" type="button" class="admin-btn admin-btn--danger" :disabled="busy" @click="handleReindexAll">
            异步重建全站文章索引
          </button>
        </div>
      </section>
    </div>
  </PageStateView>
</template>

<style scoped>
.security-block { margin-top: 8px; min-width: 0; }
.security-block h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: var(--fp-title); }
.security-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.security-metrics > div {
  background: var(--fp-elevated);
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius-md);
  padding: 14px 16px;
  display: grid;
  gap: 4px;
}
.security-metrics strong { font-size: 24px; font-variant-numeric: tabular-nums; color: var(--fp-title); }
.security-metrics .retention-text { font-size: 14px; line-height: 1.5; }
.security-metrics span { font-size: 12px; color: var(--fp-muted); }
</style>
