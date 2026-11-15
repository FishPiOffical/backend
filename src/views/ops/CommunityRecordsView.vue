<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  addFishGame,
  exportFishGames,
  fetchFishGames,
  fetchMilestones,
  importFishGames,
  removeMilestone,
  updateFishGame,
  updateMilestone,
  type FishGameItem,
  type MilestoneItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

/**
 * 鱼游资料与大事记日常维护视图：
 * 1. 鱼游支持手工新增、编辑、导出与批量 JSON 导入；
 * 2. 大事记与审核中心共用同一数据表，支持日常编辑与删除。
 */
const auth = useAuthStore()
const tab = ref<'fish' | 'milestones'>('fish')
const busy = ref(false)
const toast = ref('')

const fishGames = ref<FishGameItem[]>([])
const fishForm = ref({ oId: '', fishGameName: '', fishGameUrl: '', fishGameTag: '', fishGameDescription: '', fishGameStatus: 1 })
const importJson = ref('')

const milestones = ref<MilestoneItem[]>([])
const msForm = ref({ oId: '', milestoneTitle: '', milestoneDate: '', milestoneEndDate: '', milestoneContent: '', milestoneLink: '', milestoneStatus: 2 })

const canFish = computed(() => Boolean(auth.capabilities?.actions.fishGameManage))
const canMilestone = computed(() => Boolean(auth.capabilities?.actions.milestoneManage))

async function loadFish() {
  if (!canFish.value) return
  const res = await fetchFishGames({ p: 1, size: 50 })
  fishGames.value = res.items
}

async function loadMilestones() {
  if (!canMilestone.value) return
  const res = await fetchMilestones({ p: 1, size: 50 })
  milestones.value = res.items
}

function editFish(g: FishGameItem) {
  fishForm.value = {
    oId: g.oId,
    fishGameName: g.fishGameName,
    fishGameUrl: g.fishGameUrl,
    fishGameTag: g.fishGameTag || '',
    fishGameDescription: g.fishGameDescription || '',
    fishGameStatus: g.fishGameStatus,
  }
}

function resetFish() {
  fishForm.value = { oId: '', fishGameName: '', fishGameUrl: '', fishGameTag: '', fishGameDescription: '', fishGameStatus: 1 }
}

async function saveFish() {
  if (!fishForm.value.fishGameName.trim() || !fishForm.value.fishGameUrl.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    const payload = {
      fishGameName: fishForm.value.fishGameName.trim(),
      fishGameUrl: fishForm.value.fishGameUrl.trim(),
      fishGameTag: fishForm.value.fishGameTag.trim(),
      fishGameDescription: fishForm.value.fishGameDescription.trim(),
      fishGameStatus: fishForm.value.fishGameStatus,
    }
    if (fishForm.value.oId) {
      await updateFishGame(fishForm.value.oId, payload, createIdempotencyKey('fg-upd'))
      toast.value = '已更新鱼游资料'
    } else {
      await addFishGame(payload, createIdempotencyKey('fg-add'))
      toast.value = '已新增鱼游资料'
    }
    resetFish()
    await loadFish()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '保存鱼游失败'
  } finally {
    busy.value = false
  }
}

async function handleExportFish() {
  try {
    const res = await exportFishGames()
    importJson.value = JSON.stringify(res.items, null, 2)
    toast.value = `已导出 ${res.items.length} 条鱼游配置到下方文本框`
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '导出失败'
  }
}

async function handleImportFish() {
  if (!importJson.value.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    const parsed = JSON.parse(importJson.value)
    if (!Array.isArray(parsed)) {
      toast.value = '导入内容必须是 JSON 数组'
      return
    }
    await importFishGames(parsed, createIdempotencyKey('fg-import'))
    toast.value = `已导入 ${parsed.length} 条鱼游`
    await loadFish()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '导入鱼游失败，请检查 JSON 格式'
  } finally {
    busy.value = false
  }
}

function editMs(m: MilestoneItem) {
  msForm.value = {
    oId: m.oId,
    milestoneTitle: m.milestoneTitle,
    milestoneDate: m.milestoneDate,
    milestoneEndDate: m.milestoneEndDate || '',
    milestoneContent: m.milestoneContent || '',
    milestoneLink: m.milestoneLink || '',
    milestoneStatus: m.milestoneStatus,
  }
}

async function saveMs() {
  if (!msForm.value.oId || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await updateMilestone(
      msForm.value.oId,
      {
        milestoneTitle: msForm.value.milestoneTitle.trim(),
        milestoneDate: msForm.value.milestoneDate.trim(),
        milestoneEndDate: msForm.value.milestoneEndDate.trim(),
        milestoneContent: msForm.value.milestoneContent.trim(),
        milestoneLink: msForm.value.milestoneLink.trim(),
        milestoneStatus: msForm.value.milestoneStatus,
      },
      createIdempotencyKey('ms-upd'),
    )
    toast.value = '已更新大事记'
    msForm.value.oId = ''
    await loadMilestones()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新大事记失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveMs(m: MilestoneItem) {
  if (busy.value) return
  busy.value = true
  try {
    await removeMilestone(m.oId, createIdempotencyKey('ms-del'))
    toast.value = `已删除大事记「${m.milestoneTitle}」`
    await loadMilestones()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除大事记失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  if (!canFish.value && canMilestone.value) {
    tab.value = 'milestones'
  }
  await Promise.all([loadFish(), loadMilestones()])
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>鱼游与大事记日常维护</h2>
        <p class="admin-muted">
          日常维护入口；待审队列可在 <RouterLink to="/review/fish-games">鱼游审核</RouterLink> /
          <RouterLink to="/review/milestones">大事记审核</RouterLink> 处理。
        </p>
      </div>
      <div class="tab-row">
        <button v-if="canFish" class="admin-btn" :class="{ 'admin-btn--primary': tab === 'fish' }" @click="tab = 'fish'">鱼游维护</button>
        <button v-if="canMilestone" class="admin-btn" :class="{ 'admin-btn--primary': tab === 'milestones' }" @click="tab = 'milestones'">大事记维护</button>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div v-if="tab === 'fish' && canFish">
      <div class="admin-filter-bar toolbar-gap">
        <input aria-label="游戏名称" v-model="fishForm.fishGameName" class="admin-input" placeholder="游戏名称" />
        <input aria-label="游戏链接" v-model="fishForm.fishGameUrl" class="admin-input" placeholder="游戏链接" />
        <input aria-label="标签" v-model="fishForm.fishGameTag" class="admin-input" placeholder="标签" />
        <select aria-label="鱼游状态" v-model.number="fishForm.fishGameStatus" class="admin-select">
          <option :value="1">已通过</option>
          <option :value="0">待审核</option>
          <option :value="3">已停用</option>
        </select>
        <button class="admin-btn admin-btn--primary" :disabled="busy" @click="saveFish">{{ fishForm.oId ? '保存修改' : '手工新增' }}</button>
        <button v-if="fishForm.oId" class="admin-btn" @click="resetFish">取消</button>
      </div>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr><th>名称</th><th>链接</th><th>标签</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in fishGames" :key="g.oId">
            <td>{{ g.fishGameName }}</td>
            <td><code>{{ g.fishGameUrl }}</code></td>
            <td>{{ g.fishGameTag || '-' }}</td>
            <td>{{ g.fishGameStatus }}</td>
            <td><button class="admin-btn admin-btn--sm" @click="editFish(g)">编辑</button></td>
          </tr>
        </tbody>
      </table></div>

      <div class="sub-card" style="margin-top: 1rem;">
        <div class="admin-page__header">
          <h4>批量导出 / 导入 JSON</h4>
          <div class="btn-row">
            <button class="admin-btn admin-btn--secondary" @click="handleExportFish">导出全部</button>
            <button class="admin-btn admin-btn--primary" :disabled="busy" @click="handleImportFish">执行导入</button>
          </div>
        </div>
        <textarea aria-label="粘贴鱼游 JSON 数组..." v-model="importJson" class="admin-textarea mono-area" rows="5" placeholder="粘贴鱼游 JSON 数组..." />
      </div>
    </div>

    <div v-else-if="canMilestone">
      <div v-if="msForm.oId" class="sub-card toolbar-gap">
        <h4>编辑大事记</h4>
        <div class="admin-filter-bar">
          <input aria-label="标题" v-model="msForm.milestoneTitle" class="admin-input" placeholder="标题" />
          <input aria-label="日期" v-model="msForm.milestoneDate" class="admin-input" placeholder="日期" />
          <select aria-label="大事记状态" v-model.number="msForm.milestoneStatus" class="admin-select">
            <option :value="2">已通过</option>
            <option :value="1">待审核</option>
            <option :value="3">已拒绝</option>
          </select>
          <button class="admin-btn admin-btn--primary" :disabled="busy" @click="saveMs">保存</button>
          <button class="admin-btn" @click="msForm.oId = ''">取消</button>
        </div>
        <textarea aria-label="正文内容" v-model="msForm.milestoneContent" class="admin-textarea" rows="2" style="margin-top: 0.5rem; width: 100%;" placeholder="正文内容" />
      </div>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr><th>标题</th><th>日期</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in milestones" :key="m.oId">
            <td>{{ m.milestoneTitle }}</td>
            <td>{{ m.milestoneDate }}</td>
            <td>{{ m.milestoneStatus }}</td>
            <td>
              <div class="btn-row">
                <button class="admin-btn admin-btn--sm" @click="editMs(m)">编辑</button>
                <button class="admin-btn admin-btn--sm admin-btn--danger" :disabled="busy" @click="handleRemoveMs(m)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table></div>
    </div>
      </section>
  </div>
</template>

<style scoped>
.toolbar-gap { margin-bottom: 0.75rem; }
.sub-card { border: 1px solid var(--fp-border); border-radius: 8px; padding: 0.9rem; }
.mono-area { width: 100%; font-family: monospace; font-size: 0.82rem; }
</style>
