<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const notice = ref('')
const actionError = ref('')

// 配置导入/预检面板
const configJsonInput = ref('')
const precheckResult = ref<Record<string, unknown> | null>(null)
const exportedJson = ref('')

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
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchProfessionCatalogSummary({
      keyword: keyword.value.trim(),
      status: statusFilter.value,
      page: targetPage,
      pageSize,
    })
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

async function selectProfession(professionId: string) {
  detailLoading.value = true
  actionError.value = ''
  impactResult.value = null
  try {
    selectedDetail.value = await fetchProfessionDetail(professionId)
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
    precheckResult.value = await precheckProfessionConfig(configJsonInput.value)
    notice.value = '预检完成，请核对差异后再执行导入'
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handleImport() {
  actionError.value = ''
  notice.value = ''
  if (!precheckResult.value) {
    actionError.value = '请先完成导入预检，核对变更后再导入'
    return
  }
  try {
    await importProfessionConfig(configJsonInput.value)
    notice.value = '配置导入成功'
    precheckResult.value = null
    await loadCatalog(page.value)
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function handleReorder() {
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
    await reorderProfessionCatalog(ids)
    notice.value = '目录排序已更新'
    await loadCatalog(page.value)
  } catch (err) {
    actionError.value = extractError(err)
  }
}

async function runLifecycle(path: string, payload: Record<string, unknown>, label: string) {
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
  }
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

onMounted(() => loadCatalog(1))
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <section class="panel">
      <header class="panel-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px">
            <h2 class="panel-title">职业配置工作台</h2>
            <StatusBadge label="仅管理员" tone="warning" />
          </div>
          <p class="panel-desc">支持职业定义/等级方案/自动化规则版本管理、导出导入预检及规则模拟。</p>
        </div>
        <div style="display: flex; gap: 8px">
          <button type="button" class="btn" @click="handleExport()">导出全部配置</button>
          <button type="button" class="btn btn-primary" :disabled="loading" @click="loadCatalog(page)">刷新目录</button>
        </div>
      </header>

      <div v-if="notice" class="alert alert-success">{{ notice }}</div>
      <div v-if="actionError" class="alert alert-danger">{{ actionError }}</div>

      <div class="filter-bar">
        <input v-model="keyword" class="input" placeholder="关键词（名称/编码）" @keyup.enter="loadCatalog(1)" />
        <select v-model="statusFilter" class="select">
          <option value="">全部状态</option>
          <option value="ACTIVE">已发布</option>
          <option value="DRAFT">草稿</option>
          <option value="RETIRED">已停用</option>
        </select>
        <button type="button" class="btn btn-primary" @click="loadCatalog(1)">筛选</button>
      </div>

      <PageStateView
        :state="pageState"
        :error-message="loadError"
        empty-title="暂无职业配置"
        empty-desc="当前条件下未检索到职业记录。"
        @retry="loadCatalog(page)"
      >
        <div class="table-wrap">
          <table class="data-table">
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
                <td>{{ item.oId }}</td>
                <td>{{ item.professionName ?? item.name ?? '-' }}</td>
                <td><code>{{ item.professionCode ?? item.code ?? '-' }}</code></td>
                <td>{{ item.status ?? '-' }}</td>
                <td>{{ item.sortOrder ?? '-' }}</td>
                <td style="display: flex; gap: 6px">
                  <button type="button" class="btn" @click="selectProfession(String(item.oId))">版本树</button>
                  <button type="button" class="btn" @click="handleExport(String(item.oId))">导出</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PageStateView>
    </section>

    <section v-if="selectedDetail || detailLoading" class="panel">
      <header class="panel-header">
        <h3 class="panel-title">职业版本树详情：{{ selectedDetail?.oId }}</h3>
        <button
          v-if="selectedDetail"
          type="button"
          class="btn btn-danger"
          @click="runLifecycle('definition/retire', { professionId: selectedDetail.oId }, '停用职业定义')"
        >
          停用职业
        </button>
      </header>
      <div v-if="detailLoading" style="color: var(--text-muted)">加载版本树中...</div>
      <div v-else-if="selectedDetail" style="display: flex; flex-direction: column; gap: 12px">
        <div v-if="Array.isArray(selectedDetail.revisions)">
          <h4>定义版本（Revisions）</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px">
            <div
              v-for="rev in (selectedDetail.revisions as Array<Record<string, unknown>>)"
              :key="String(rev.oId)"
              style="padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: 8px"
            >
              <div><strong>{{ rev.oId }}</strong> · {{ rev.status }}</div>
              <div style="display: flex; gap: 6px; margin-top: 6px">
                <button type="button" class="btn" @click="runLifecycle('definition/publish', { revisionId: rev.oId }, '发布版本')">发布</button>
                <button type="button" class="btn" @click="runLifecycle('definition/copy', { revisionId: rev.oId }, '复制草稿')">复制</button>
                <button
                  type="button"
                  class="btn"
                  @click="runLifecycle('definition/rollback', { professionId: selectedDetail.oId, revisionId: rev.oId }, '回滚版本')"
                >
                  回滚
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="Array.isArray(selectedDetail.schemes)">
          <h4>等级方案（Schemes）</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px">
            <div
              v-for="scheme in (selectedDetail.schemes as Array<Record<string, unknown>>)"
              :key="String(scheme.oId)"
              style="padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: 8px"
            >
              <div><strong>{{ scheme.oId }}</strong> · {{ scheme.status }}</div>
              <div style="display: flex; gap: 6px; margin-top: 6px">
                <button type="button" class="btn" @click="previewImpact(String(selectedDetail.oId), String(scheme.oId))">影响预估</button>
                <button type="button" class="btn" @click="runLifecycle('scheme/publish', { schemeId: scheme.oId }, '发布方案')">发布</button>
                <button type="button" class="btn" @click="runLifecycle('scheme/copy', { schemeId: scheme.oId }, '复制方案')">复制</button>
                <button type="button" class="btn" @click="runLifecycle('scheme/retire', { schemeId: scheme.oId }, '停用方案')">停用</button>
              </div>
            </div>
          </div>
          <pre v-if="impactResult" style="margin-top: 8px; padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto">{{ JSON.stringify(impactResult, null, 2) }}</pre>
        </div>

        <details>
          <summary style="cursor: pointer; color: var(--text-muted)">查看完整版本树 JSON</summary>
          <pre style="margin-top: 8px; padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto; max-height: 360px">{{ JSON.stringify(selectedDetail, null, 2) }}</pre>
        </details>
      </div>
    </section>

    <section class="panel">
      <header class="panel-header">
        <h3 class="panel-title">配置预检与导入 / 目录排序 / 自动化规则测试</h3>
      </header>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px">
        <div>
          <label style="display: block; font-weight: 600; margin-bottom: 6px">配置 JSON（必须先预检再导入）</label>
          <textarea v-model="configJsonInput" class="input" rows="8" style="width: 100%; font-family: monospace" placeholder="粘贴职业配置 JSON" />
          <div style="display: flex; gap: 8px; margin-top: 8px">
            <button type="button" class="btn" @click="handlePrecheck">1. 导入预检</button>
            <button type="button" class="btn btn-primary" :disabled="!precheckResult" @click="handleImport">2. 确认导入</button>
          </div>
          <pre v-if="precheckResult" style="margin-top: 8px; padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto; max-height: 240px">{{ JSON.stringify(precheckResult, null, 2) }}</pre>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px">
          <div>
            <label style="display: block; font-weight: 600; margin-bottom: 6px">目录排序（按顺序填写职业 ID）</label>
            <textarea v-model="reorderIdsInput" class="input" rows="3" style="width: 100%" placeholder="每行或逗号分隔一个 professionId" />
            <button type="button" class="btn" style="margin-top: 8px" @click="handleReorder">保存排序</button>
          </div>

          <div>
            <label style="display: block; font-weight: 600; margin-bottom: 6px">自动化规则模拟测试</label>
            <textarea v-model="testConfigJson" class="input" rows="3" style="width: 100%; font-family: monospace" placeholder="configurationJson" />
            <textarea v-model="testPayloadJson" class="input" rows="2" style="width: 100%; font-family: monospace; margin-top: 6px" placeholder="payloadJson" />
            <button type="button" class="btn" style="margin-top: 8px" @click="handleTestAutomation">运行模拟</button>
            <pre v-if="testResult" style="margin-top: 8px; padding: 10px; background: var(--bg-subtle); border-radius: 8px; overflow: auto; max-height: 200px">{{ JSON.stringify(testResult, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
