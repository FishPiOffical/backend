<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  exportProfessionConfig,
  fetchProfessionCatalogSummary,
  fetchProfessionDetail,
  fetchProfessionSchemeImpact,
  importProfessionConfig,
  precheckProfessionConfig,
  professionLifecycleAction,
  reorderProfessionCatalog,
  testProfessionAutomation,
} from '@/api/adminStage4'
import { ApiError } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import ProfessionEditor from '@/components/config/ProfessionEditor.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 职业配置独立编辑工作台：
 * 1. 分页查看职业目录摘要与单职业完整版本树（定义修订/等级方案/自动化规则）；
 * 2. 支持配置导出、导入前预检对比与确认导入；
 * 3. 支持草稿发布、停用、复制、回滚、方案影响人数预估及自动化规则模拟测试。
 */
const auth = useAuthStore()

const keyword = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 20

const items = ref<Array<Record<string, unknown>>>([])
const total = ref(0)
const selectedDetail = ref<Record<string, unknown> | null>(null)
const detailLoading = ref(false)
const editorDirty = ref(false)
let detailSequence = 0
const writeBusy = ref(false)
const writeUncertain = ref(false)

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const notice = ref('')
const actionError = ref('')

// 配置导入/预检面板
const configJsonInput = ref('')
const precheckResult = ref<Record<string, unknown> | null>(null)
const exportedJson = ref('')
watch(configJsonInput, () => { precheckResult.value = null })

// 自动化规则测试
const testConfigJson = ref('')
const testPayloadJson = ref('{}')
const testResult = ref<Record<string, unknown> | null>(null)

// 方案影响预估
const impactResult = ref<Record<string, unknown> | null>(null)

// 目录重排
const reorderIdsInput = ref('')

const canAccess = computed(() => Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.isAdmin))
const pageState = computed<PageViewState>(() => {
  if (!canAccess.value || forbidden.value) return 'forbidden'
  if (loading.value && items.value.length === 0) return 'loading'
  if (loadError.value && items.value.length === 0) return 'error'
  if (!loading.value && items.value.length === 0) return 'empty'
  return 'ready'
})

function extractError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : '操作失败'
}

async function loadCatalog(targetPage = 1) {
  if (!canAccess.value) {
    forbidden.value = true
    return
  }
  const epoch = auth.sessionEpoch
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchProfessionCatalogSummary({
      keyword: keyword.value.trim(),
      status: statusFilter.value,
      page: targetPage,
      pageSize,
    })
    if (epoch !== auth.sessionEpoch || !canAccess.value) return
    items.value = res.items ?? []
    total.value = res.total ?? 0
    page.value = res.page ?? targetPage
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) forbidden.value = true
    else loadError.value = extractError(err)
  } finally {
    loading.value = false
  }
}

function clearSelection() { if (!editorDirty.value || window.confirm('放弃未保存的职业草稿？')) { selectedDetail.value = null; editorDirty.value = false } }
async function selectProfession(professionId: string) {
  if (editorDirty.value && selectedDetail.value?.oId !== professionId && !window.confirm('放弃未保存的职业草稿？')) return
  const sequence = ++detailSequence
  const epoch = auth.sessionEpoch
  detailLoading.value = true
  actionError.value = ''
  impactResult.value = null
  try {
    const detail = await fetchProfessionDetail(professionId)
    if (sequence === detailSequence && epoch === auth.sessionEpoch) selectedDetail.value = detail
  } catch (err) {
    actionError.value = extractError(err)
  } finally {
    detailLoading.value = false
  }
}

async function handleExport(professionId?: string) {
  actionError.value = ''
  notice.value = ''
  try {
    const res = await exportProfessionConfig(professionId)
    exportedJson.value = JSON.stringify(res, null, 2)
    configJsonInput.value = exportedJson.value
    notice.value = professionId ? `已导出职业 ${professionId} 配置` : '已导出全部职业配置'
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handlePrecheck() {
  actionError.value = ''
  notice.value = ''
  precheckResult.value = null
  if (!configJsonInput.value.trim()) {
    actionError.value = '请先粘贴配置 JSON'
    return
  }
  try {
    const input = configJsonInput.value
    const result = await precheckProfessionConfig(input)
    if (input !== configJsonInput.value) return
    precheckResult.value = result
    notice.value = '预检完成，请核对差异后再执行导入'
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handleImport() {
  actionError.value = ''
  notice.value = ''
  if (writeBusy.value || writeUncertain.value) return
  if (!precheckResult.value?.valid || (Array.isArray(precheckResult.value.conflicts) && precheckResult.value.conflicts.length > 0)) {
    actionError.value = '请先完成导入预检，核对变更后再导入'
    return
  }
  try {
    if (!window.confirm('确认导入已预检的职业配置？')) return
    writeBusy.value = true
    await importProfessionConfig(configJsonInput.value)
    notice.value = '配置导入成功'
    precheckResult.value = null
    await loadCatalog(page.value)
  } catch (err) {
    actionError.value = extractError(err)
    if (writeBusy.value && (!(err instanceof ApiError) || err.status >= 500 || !err.status)) { writeUncertain.value = true; actionError.value += '；结果未知，请核查服务端状态，勿重复提交。' }
  } finally { writeBusy.value = false }
}

async function handleReorder() {
  if (writeBusy.value || writeUncertain.value) return
  actionError.value = ''
  notice.value = ''
  const ids = reorderIdsInput.value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) {
    actionError.value = '请输入按目标顺序排列的职业 ID（逗号或换行分隔）'
    return
  }
  try {
    if (new Set(ids).size !== ids.length) throw new Error('排序 ID 不能重复')
    if (!window.confirm('确认按输入的全部职业 ID 保存目录顺序？')) return
    writeBusy.value = true
    await reorderProfessionCatalog(ids)
    notice.value = '目录排序已更新'
    await loadCatalog(page.value)
  } catch (err) {
    actionError.value = extractError(err)
    if (writeBusy.value && (!(err instanceof ApiError) || err.status >= 500 || !err.status)) { writeUncertain.value = true; actionError.value += '；结果未知，请核查服务端状态，勿重复提交。' }
  } finally { writeBusy.value = false }
}

async function runLifecycle(path: string, payload: Record<string, unknown>, label: string) {
  if (writeBusy.value || writeUncertain.value || !window.confirm(`确认${label}？请先核对版本和方案影响预估。`)) return
  writeBusy.value = true
  actionError.value = ''
  notice.value = ''
  try {
    await professionLifecycleAction(path, payload)
    notice.value = `${label}成功`
    const pid = String(selectedDetail.value?.oId ?? '')
    await loadCatalog(page.value)
    if (pid) await selectProfession(pid)
  } catch (err) {
    actionError.value = extractError(err)
    if (!(err instanceof ApiError) || err.status >= 500 || !err.status) { writeUncertain.value = true; actionError.value += '；结果未知，请核对服务端版本状态，勿重复提交。' }
  } finally { writeBusy.value = false }
}

async function previewImpact(professionId: string, schemeId: string) {
  actionError.value = ''
  try {
    impactResult.value = await fetchProfessionSchemeImpact(professionId, schemeId)
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handleTestAutomation() {
  actionError.value = ''
  testResult.value = null
  try {
    testResult.value = await testProfessionAutomation(testConfigJson.value, testPayloadJson.value)
  } catch (err) {
    actionError.value = extractError(err)
  }
}

watch([() => auth.sessionEpoch, canAccess], () => { detailSequence++; selectedDetail.value = null; items.value = []; precheckResult.value = null; configJsonInput.value = ''; exportedJson.value = ''; testConfigJson.value = ''; testPayloadJson.value = '{}'; testResult.value = null; impactResult.value = null; notice.value = ''; actionError.value = ''; if (canAccess.value) void loadCatalog(1) })
onMounted(() => loadCatalog(1))
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div>
        <div class="admin-panel__title-row">
          <h1 class="admin-page__title">职业配置工作台</h1>
          <StatusBadge label="仅管理员" tone="warning" />
        </div>
        <p class="admin-page__subtitle">支持职业定义/等级方案/自动化规则版本管理、导出导入预检及规则模拟。</p>
      </div>
      <div class="admin-page__actions">
        <button type="button" class="admin-btn" @click="handleExport()">导出全部配置</button>
        <button type="button" class="admin-btn admin-btn--primary" :disabled="loading" @click="loadCatalog(page)">刷新目录</button>
      </div>
    </header>

    <section class="admin-panel admin-stack">
      <div v-if="notice" class="admin-alert admin-alert--success">{{ notice }}</div>
      <div v-if="actionError" class="admin-alert admin-alert--danger">{{ actionError }}</div>

      <div class="admin-filter-bar" style="margin: 0">
        <input v-model="keyword" class="admin-input" placeholder="关键词（名称/编码）" @keyup.enter="loadCatalog(1)" />
        <select v-model="statusFilter" class="admin-select">
          <option value="">全部状态</option>
          <option value="PUBLISHED">已发布</option>
          <option value="DRAFT">草稿</option>
          <option value="RETIRED">已停用</option>
        </select>
        <button type="button" class="admin-btn admin-btn--primary" @click="loadCatalog(1)">筛选</button>
      </div>

      <PageStateView
        :state="pageState"
        :error-message="loadError"
        empty-title="暂无职业配置"
        empty-desc="当前条件下未检索到职业记录。"
        @retry="loadCatalog(page)"
      >
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>编码</th>
                <th>状态</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="String(item.oId)">
                <td class="admin-mono">{{ item.oId }}</td>
                <td>{{ item.displayName ?? '-' }}</td>
                <td><code class="admin-mono">{{ item.professionCode ?? item.code ?? '-' }}</code></td>
                <td>{{ item.status ?? '-' }}</td>
                <td class="admin-mono">{{ item.sortOrder ?? '-' }}</td>
                <td>
                  <div class="admin-table__actions">
                    <button type="button" class="admin-btn admin-btn--sm" @click="selectProfession(String(item.oId))">版本树</button>
                    <button type="button" class="admin-btn admin-btn--sm" @click="handleExport(String(item.oId))">导出</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PageStateView>

      <div class="admin-row" style="justify-content: space-between">
        <div class="admin-row">
          <button class="admin-btn admin-btn--sm" :disabled="page <= 1 || loading" @click="loadCatalog(page - 1)">上一页</button>
          <span class="admin-muted admin-mono" style="font-size: 12px">第 {{ page }} 页 · 共 {{ total }} 条</span>
          <button class="admin-btn admin-btn--sm" :disabled="page * pageSize >= total || loading" @click="loadCatalog(page + 1)">下一页</button>
        </div>
        <button class="admin-btn admin-btn--sm" @click="clearSelection">新建职业</button>
      </div>
    </section>

    <ProfessionEditor v-if="canAccess" :key="auth.sessionEpoch" :detail="selectedDetail" @dirty="editorDirty = $event" @saved="loadCatalog(page); selectedDetail && selectProfession(String(selectedDetail.oId))" />
    <section v-if="selectedDetail || detailLoading" class="admin-panel admin-stack">
      <header class="admin-panel__header">
        <h2 class="admin-panel__title">职业版本树详情：<span class="admin-mono">{{ selectedDetail?.oId }}</span></h2>
        <button
          v-if="selectedDetail"
          type="button"
          class="admin-btn admin-btn--danger admin-btn--sm"
          @click="runLifecycle('definition/retire', { professionId: selectedDetail.oId }, '停用职业定义')"
        >
          停用职业
        </button>
      </header>
      <div v-if="detailLoading" class="admin-muted">加载版本树中...</div>
      <div v-else-if="selectedDetail" class="admin-stack">
        <div v-if="Array.isArray(selectedDetail.revisions)">
          <h4 style="margin: 0 0 8px">定义版本（Revisions）</h4>
          <div class="admin-row">
            <div
              v-for="rev in (selectedDetail.revisions as Array<Record<string, unknown>>)"
              :key="String(rev.oId)"
              class="admin-panel admin-panel--subtle"
              style="padding: 10px 12px"
            >
              <div><strong class="admin-mono">{{ rev.oId }}</strong> · {{ rev.status }}</div>
              <div class="admin-row" style="gap: 6px; margin-top: 8px">
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('definition/publish', { revisionId: rev.oId }, '发布版本')">发布</button>
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('definition/copy', { revisionId: rev.oId }, '复制草稿')">复制</button>
                <button
                  type="button"
                  class="admin-btn admin-btn--sm"
                  @click="runLifecycle('definition/rollback', { professionId: selectedDetail.oId, revisionId: rev.oId }, '回滚版本')"
                >
                  回滚
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="Array.isArray(selectedDetail.schemes)">
          <h4 style="margin: 0 0 8px">等级方案（Schemes）</h4>
          <div class="admin-row">
            <div
              v-for="scheme in (selectedDetail.schemes as Array<Record<string, unknown>>)"
              :key="String(scheme.oId)"
              class="admin-panel admin-panel--subtle"
              style="padding: 10px 12px"
            >
              <div><strong class="admin-mono">{{ scheme.oId }}</strong> · {{ scheme.status }}</div>
              <div class="admin-row" style="gap: 6px; margin-top: 8px">
                <button type="button" class="admin-btn admin-btn--sm" @click="previewImpact(String(selectedDetail.oId), String(scheme.oId))">影响预估</button>
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('scheme/publish', { schemeId: scheme.oId }, '发布方案')">发布</button>
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('scheme/rollback', { professionId: selectedDetail.oId, schemeId: scheme.oId }, '回滚方案')">回滚</button>
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('scheme/copy', { schemeId: scheme.oId }, '复制方案')">复制</button>
                <button type="button" class="admin-btn admin-btn--sm" @click="runLifecycle('scheme/retire', { schemeId: scheme.oId }, '停用方案')">停用</button>
              </div>
            </div>
          </div>
          <pre v-if="impactResult" class="admin-code-block">{{ JSON.stringify(impactResult, null, 2) }}</pre>
        </div>

        <div v-if="Array.isArray(selectedDetail.automations)">
          <h4 style="margin: 0 0 8px">自动化规则版本</h4>
          <div v-for="automation in (selectedDetail.automations as Array<Record<string, unknown>>)" :key="String(automation.oId)" class="admin-stack admin-stack--sm">
            <div class="admin-row">
              <strong class="admin-mono">{{ automation.automationCode }}</strong>
              <span class="admin-muted">{{ automation.status }}</span>
              <button class="admin-btn admin-btn--sm" :disabled="writeBusy || writeUncertain" @click="runLifecycle('automation/retire', { automationId: automation.oId }, '停用规则')">停用规则</button>
            </div>
            <div v-for="revision in (automation.revisions as Array<Record<string, unknown>>)" :key="String(revision.oId)" class="admin-filter-bar" style="margin: 4px 0">
              <span class="admin-mono">{{ revision.oId }} · {{ revision.status }}</span>
              <button class="admin-btn admin-btn--sm" :disabled="writeBusy || writeUncertain" @click="runLifecycle('automation/publish', { revisionId: revision.oId }, '发布规则')">发布</button>
              <button class="admin-btn admin-btn--sm" :disabled="writeBusy || writeUncertain" @click="runLifecycle('automation/copy', { revisionId: revision.oId }, '复制规则')">复制</button>
              <button class="admin-btn admin-btn--sm" :disabled="writeBusy || writeUncertain" @click="runLifecycle('automation/rollback', { automationId: automation.oId, revisionId: revision.oId }, '回滚规则')">回滚</button>
            </div>
          </div>
        </div>
        <details>
          <summary class="admin-muted" style="cursor: pointer">查看完整版本树 JSON</summary>
          <pre class="admin-code-block">{{ JSON.stringify(selectedDetail, null, 2) }}</pre>
        </details>
      </div>
    </section>

    <section class="admin-panel admin-stack">
      <header class="admin-panel__header">
        <h2 class="admin-panel__title">配置预检与导入 / 目录排序 / 自动化规则测试</h2>
      </header>
      <div class="admin-grid-auto">
        <div class="admin-field">
          <label class="admin-field__label">配置 JSON（必须先预检再导入）</label>
          <textarea v-model="configJsonInput" class="admin-textarea admin-mono" rows="8" placeholder="粘贴职业配置 JSON" />
          <div class="admin-row">
            <button type="button" class="admin-btn" @click="handlePrecheck">1. 导入预检</button>
            <button type="button" class="admin-btn admin-btn--primary" :disabled="!precheckResult?.valid || (Array.isArray(precheckResult.conflicts) && precheckResult.conflicts.length > 0) || writeBusy || writeUncertain" @click="handleImport">2. 确认导入</button>
          </div>
          <pre v-if="precheckResult" class="admin-code-block">{{ JSON.stringify(precheckResult, null, 2) }}</pre>
        </div>

        <div class="admin-stack">
          <div class="admin-field">
            <label class="admin-field__label">目录排序（按顺序填写职业 ID）</label>
            <textarea v-model="reorderIdsInput" class="admin-textarea" rows="3" placeholder="每行或逗号分隔一个 professionId" />
            <div>
              <button type="button" class="admin-btn" @click="handleReorder">保存排序</button>
            </div>
          </div>

          <div class="admin-field">
            <label class="admin-field__label">自动化规则模拟测试</label>
            <textarea v-model="testConfigJson" class="admin-textarea admin-mono" rows="3" placeholder="configurationJson" />
            <textarea v-model="testPayloadJson" class="admin-textarea admin-mono" rows="2" placeholder="payloadJson" />
            <div>
              <button type="button" class="admin-btn" @click="handleTestAutomation">运行模拟</button>
            </div>
            <pre v-if="testResult" class="admin-code-block">{{ JSON.stringify(testResult, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
