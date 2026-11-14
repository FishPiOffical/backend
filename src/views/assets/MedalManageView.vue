<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  addMedal,
  batchGrantMedals,
  checkMedalHoldStatuses,
  deleteMedal,
  fetchMedalOwners,
  fetchMedals,
  fetchUserMedals,
  grantMedal,
  reorderSponsorMedals,
  revokeMedal,
  updateMedal,
  type BatchResultItem,
  type MedalItem,
  type MedalOwnerItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

/**
 * 勋章定义、预览与授予撤销视图：
 * 1. 到期时间 0 明确标识为“永久”；
 * 2. 批量授予前支持持有状态预检，执行后按逐条结果明细展示成功/失败；
 * 3. 安全预览仅渲染受控字段（禁止 v-html 注入原始脚本）。
 */
const auth = useAuthStore()
const route = useRoute()
const medals = ref<MedalItem[]>([])
const keyword = ref('')
const selectedMedal = ref<MedalItem | null>(null)
const owners = ref<MedalOwnerItem[]>([])
const busy = ref(false)
const toast = ref('')

const medalForm = ref({ oId: '', name: '', type: 'normal', description: '', attr: '{}' })
const singleTarget = ref(typeof route.query.target === 'string' ? route.query.target : '')
const singleExpireTime = ref(0)
const singleData = ref('')

const batchTargetsText = ref('')
const batchExpireTime = ref(0)
const batchData = ref('')
const holdCheckResults = ref<{ target: string; found: boolean; userName?: string; holds?: boolean }[]>([])
const batchResults = ref<BatchResultItem[]>([])

const lookupUser = ref(typeof route.query.target === 'string' ? route.query.target : '')
const lookupMedals = ref<Record<string, unknown>[]>([])

const canDefine = computed(() => Boolean(auth.capabilities?.actions.medalDefine))
const canGrant = computed(() => Boolean(auth.capabilities?.actions.medalGrant))
const canRevoke = computed(() => Boolean(auth.capabilities?.actions.medalRevoke))

async function loadMedals() {
  try {
    const res = await fetchMedals({ p: 1, size: 100, keyword: keyword.value.trim() })
    medals.value = res.items
    if (!selectedMedal.value && res.items.length > 0) {
      await selectMedal(res.items[0])
    }
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '加载勋章列表失败'
  }
}

async function selectMedal(m: MedalItem) {
  selectedMedal.value = m
  medalForm.value = {
    oId: m.oId,
    name: m.name,
    type: m.type,
    description: m.description || '',
    attr: m.attr || '{}',
  }
  try {
    const res = await fetchMedalOwners(m.oId)
    owners.value = res.items
  } catch {
    owners.value = []
  }
}

function resetMedalForm() {
  medalForm.value = { oId: '', name: '', type: 'normal', description: '', attr: '{}' }
}

async function saveMedalDef() {
  if (!medalForm.value.name.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    const payload = {
      name: medalForm.value.name.trim(),
      type: medalForm.value.type.trim() || 'normal',
      description: medalForm.value.description,
      attr: medalForm.value.attr,
    }
    if (medalForm.value.oId) {
      await updateMedal(medalForm.value.oId, payload, createIdempotencyKey('medal-upd'))
      toast.value = '已更新勋章定义'
    } else {
      await addMedal(payload, createIdempotencyKey('medal-add'))
      toast.value = '已新增勋章定义'
    }
    await loadMedals()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '保存勋章定义失败'
  } finally {
    busy.value = false
  }
}

async function handleDeleteMedal(m: MedalItem) {
  if (busy.value) return
  busy.value = true
  try {
    await deleteMedal(m.oId, createIdempotencyKey('medal-del'))
    toast.value = `已删除勋章 ${m.name}`
    selectedMedal.value = null
    await loadMedals()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除勋章失败'
  } finally {
    busy.value = false
  }
}

async function handleReorderSponsor() {
  if (busy.value) return
  busy.value = true
  try {
    await reorderSponsorMedals(createIdempotencyKey('medal-reorder'))
    toast.value = '已重排赞助勋章顺序'
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '重排失败'
  } finally {
    busy.value = false
  }
}

async function handleSingleGrant() {
  if (!selectedMedal.value || !singleTarget.value.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await grantMedal(
      {
        target: singleTarget.value.trim(),
        medalId: selectedMedal.value.oId,
        expireTime: singleExpireTime.value,
        data: singleData.value.trim(),
      },
      createIdempotencyKey('medal-grant'),
    )
    toast.value = `已授予 ${singleTarget.value} 勋章「${selectedMedal.value.name}」`
    await selectMedal(selectedMedal.value)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '授予勋章失败'
  } finally {
    busy.value = false
  }
}

async function handleRevoke(target: string) {
  if (!selectedMedal.value || !target || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await revokeMedal(
      { target, medalId: selectedMedal.value.oId },
      createIdempotencyKey('medal-revoke'),
    )
    toast.value = `已回收 ${target} 的勋章`
    await selectMedal(selectedMedal.value)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '回收勋章失败'
  } finally {
    busy.value = false
  }
}

function parseBatchTargets(): string[] {
  return batchTargetsText.value
    .split(/[\n,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function handleHoldCheck() {
  if (!selectedMedal.value) return
  const targets = parseBatchTargets()
  if (targets.length === 0) return
  try {
    const res = await checkMedalHoldStatuses(selectedMedal.value.oId, targets)
    holdCheckResults.value = res.items
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '持有预检失败'
  }
}

async function handleBatchGrant() {
  if (!selectedMedal.value || busy.value) return
  const targets = parseBatchTargets()
  if (targets.length === 0) return
  busy.value = true
  toast.value = ''
  try {
    const res = await batchGrantMedals(
      {
        medalId: selectedMedal.value.oId,
        targets,
        expireTime: batchExpireTime.value,
        data: batchData.value.trim(),
      },
      createIdempotencyKey('medal-batch'),
    )
    batchResults.value = res.results
    toast.value = `批量发放完成：成功 ${res.successCount}，失败 ${res.failureCount}`
    await selectMedal(selectedMedal.value)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '批量发放勋章失败'
  } finally {
    busy.value = false
  }
}

async function handleLookupUserMedals() {
  if (!lookupUser.value.trim()) return
  try {
    const res = await fetchUserMedals(lookupUser.value.trim())
    lookupMedals.value = res.items
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '查询用户勋章失败'
  }
}

onMounted(() => {
  loadMedals()
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-head">
      <div>
        <h2>勋章定义、预览与授予撤销</h2>
        <p class="muted">支持安全预览、持有者检索、单项授/撤及批量发放逐项回执（expireTime = 0 为永久）。</p>
      </div>
      <div class="filter-row">
        <input v-model="keyword" class="input" placeholder="搜索勋章名称" @keyup.enter="loadMedals" />
        <button class="btn btn-secondary" @click="loadMedals">检索</button>
        <button v-if="canDefine" class="btn btn-secondary" :disabled="busy" @click="handleReorderSponsor">重排赞助勋章</button>
      </div>
    </div>

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div class="split-layout">
      <div>
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in medals" :key="m.oId" :class="{ 'row-active': selectedMedal?.oId === m.oId }">
              <td>
                <strong>{{ m.name }}</strong>
                <div class="muted">{{ m.description || m.oId }}</div>
              </td>
              <td>{{ m.type }}</td>
              <td>
                <div class="btn-row">
                  <button class="btn btn-sm" @click="selectMedal(m)">选择</button>
                  <button v-if="canDefine" class="btn btn-sm btn-danger" :disabled="busy" @click="handleDeleteMedal(m)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="right-stack">
        <div v-if="canDefine" class="sub-card">
          <div class="pane-head">
            <h3>{{ medalForm.oId ? '编辑勋章定义' : '新增勋章定义' }}</h3>
            <button class="btn btn-sm" type="button" @click="resetMedalForm">新建</button>
          </div>
          <div class="form-grid">
            <input v-model="medalForm.name" class="input" placeholder="勋章名称" />
            <input v-model="medalForm.type" class="input" placeholder="类型 (如 normal / sponsor)" />
            <input v-model="medalForm.description" class="input" placeholder="描述（支持 {var1}）" />
            <textarea v-model="medalForm.attr" class="input" rows="2" placeholder="样式属性 JSON" />
            <button class="btn btn-primary" :disabled="busy" @click="saveMedalDef">保存勋章定义</button>
          </div>
        </div>

        <div v-if="selectedMedal" class="sub-card">
          <h3>当前勋章：{{ selectedMedal.name }}（安全预览）</h3>
          <div class="safe-preview">
            <span class="badge">{{ selectedMedal.type }}</span>
            <strong>{{ selectedMedal.name }}</strong>
            <span class="muted">{{ selectedMedal.description }}</span>
          </div>

          <div v-if="canGrant || canRevoke" class="form-grid" style="margin-top: 0.75rem;">
            <input v-model="singleTarget" class="input" placeholder="目标用户名或 ID" />
            <input v-model.number="singleExpireTime" class="input" type="number" min="0" placeholder="到期时间戳(0=永久)" />
            <input v-model="singleData" class="input" placeholder="附带数据（可选）" />
            <div class="btn-row">
              <button v-if="canGrant" class="btn btn-primary" :disabled="busy" @click="handleSingleGrant">单项授予</button>
              <button v-if="canRevoke" class="btn btn-danger" :disabled="busy" @click="handleRevoke(singleTarget)">单项回收</button>
            </div>
          </div>

          <div v-if="canGrant" class="form-grid" style="margin-top: 1rem;">
            <h4>批量授予（每行或逗号分隔用户名/ID）</h4>
            <textarea v-model="batchTargetsText" class="input" rows="3" placeholder="user1, user2" />
            <div class="btn-row">
              <input v-model.number="batchExpireTime" class="input num-input" type="number" min="0" placeholder="0=永久" />
              <input v-model="batchData" class="input" placeholder="变量数据（可选）" />
              <button class="btn btn-secondary" type="button" @click="handleHoldCheck">持有预检</button>
              <button class="btn btn-primary" type="button" :disabled="busy" @click="handleBatchGrant">执行批量授予</button>
            </div>

            <ul v-if="holdCheckResults.length" class="plain-list">
              <li v-for="h in holdCheckResults" :key="h.target">
                {{ h.target }}：{{ !h.found ? '用户不存在' : h.holds ? '已持有' : '未持有' }}
              </li>
            </ul>

            <table v-if="batchResults.length" class="data-table">
              <thead>
                <tr><th>目标</th><th>结果</th><th>说明</th></tr>
              </thead>
              <tbody>
                <tr v-for="(r, idx) in batchResults" :key="idx">
                  <td>{{ r.userName || r.target }}</td>
                  <td>{{ r.ok ? '成功' : '失败' }}</td>
                  <td>{{ r.ok ? '已授予' : r.error }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 style="margin-top: 1rem;">当前持有者（{{ owners.length }}）</h4>
          <ul class="plain-list">
            <li v-for="o in owners" :key="o.oId">
              <span>{{ o.userName || o.userId }}（{{ o.permanent ? '永久' : o.expireTime }}）</span>
              <button v-if="canRevoke" class="btn btn-sm btn-danger" :disabled="busy" @click="handleRevoke(o.userId)">回收</button>
            </li>
          </ul>
        </div>

        <div class="sub-card">
          <h4>按用户检索已持有勋章</h4>
          <div class="btn-row">
            <input v-model="lookupUser" class="input" placeholder="用户名或 ID" @keyup.enter="handleLookupUserMedals" />
            <button class="btn btn-secondary" @click="handleLookupUserMedals">查询</button>
          </div>
          <pre v-if="lookupMedals.length" class="code-box">{{ JSON.stringify(lookupMedals, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-head, .pane-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.filter-row, .btn-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.split-layout { display: grid; grid-template-columns: 1fr 1.3fr; gap: 1rem; align-items: start; }
.right-stack { display: flex; flex-direction: column; gap: 1rem; }
.sub-card { border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 0.9rem; }
.form-grid { display: flex; flex-direction: column; gap: 0.5rem; }
.safe-preview { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem; background: #f8fafc; border-radius: 6px; }
.plain-list { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-direction: column; gap: 0.35rem; }
.plain-list li { display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; }
.num-input { width: 110px; }
.code-box { max-height: 180px; overflow: auto; background: #f8fafc; padding: 0.5rem; border-radius: 6px; font-size: 0.75rem; }
.notice-banner { padding: 0.5rem 0.75rem; border-radius: 6px; background: #eff6ff; color: #1d4ed8; margin-bottom: 0.75rem; }
.row-active { background: rgba(59, 130, 246, 0.08); }
@media (max-width: 960px) { .split-layout { grid-template-columns: 1fr; } }
</style>
