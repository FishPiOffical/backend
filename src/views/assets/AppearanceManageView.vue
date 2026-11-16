<script setup lang="ts">
import ManagedBubbleShape from '@/components/common/ManagedBubbleShape.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { adminBubbles, saveAdminBubble, uploadBubbleIcon, type AdminBubble, type BubbleCommand, type BubbleDraft } from '@/api/adminAppearance'
import { getAuthContextVersion } from '@/api/http'
import { assetRecoveryBusy, pendingAssetWrite, assetRecoveryReceipt } from '@/stores/assetRecovery'
import { useAuthStore } from '@/stores/auth'
import { bubbleAttributes, decodeBubbleStyle, isCustomBubbleId, type BubblePalette, type BubbleShape } from '@/utils/bubbleStyle'
import '@/styles/managed-bubbles.css'

const accessLabels = { free: '免费', vip: 'VIP', points: '积分购买' }
const shapeLabels: Record<BubbleShape, string> = {
  'memo-v1': '折角便签', 'lotus-v1': '翘角荷叶', 'cat-v1': '双耳饼干', 'fish-v1': '分叉鱼尾',
}
const colors: { key: keyof BubblePalette; label: string }[] = [
  { key: 'background', label: '收到背景' }, { key: 'ownBackground', label: '发送背景' },
  { key: 'border', label: '边框' }, { key: 'text', label: '正文' }, { key: 'ink', label: '角标' },
]
const modes = [{ key: 'light', label: '浅色' }, { key: 'dark', label: '深色' }] as const
const auth = useAuthStore()
const rows = ref<AdminBubble[]>([])
const pageInfo = ref({ p: 1, size: 20, total: 0, pageCount: 0 })
const loading = ref(false), busy = ref(false), uploading = ref(false)
const error = ref(''), notice = ref('')
const id = ref(''), selected = ref<AdminBubble | null>(null), editor = ref<BubbleDraft | null>(null)
const confirm = ref<'publish' | 'unpublish' | null>(null)
const blocked = computed(() => busy.value || uploading.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
const skin = computed(() => decodeBubbleStyle(editor.value?.style))
const dirty = computed(() => editor.value && JSON.stringify(editor.value) !== JSON.stringify(selected.value?.draft))
let read: AbortController | undefined, upload: AbortController | undefined
let alive = true
const identity = () => `${getAuthContextVersion()}:${auth.capabilities?.userId ?? ''}`

function initialDraft(): BubbleDraft {
  return {
    name: '', access: 'free', price7: 0, price30: 0,
    style: {
      light: { background: '#fff7f0', ownBackground: '#faebde', border: '#caa589', ink: '#986647', text: '#252a27' },
      dark: { background: '#322924', ownBackground: '#3d302a', border: '#967257', ink: '#caa589', text: '#f8f0e9' },
      radius: 14, borderWidth: 1, shadow: true, motif: 'none', image: '',
    },
  }
}

async function load(page = pageInfo.value.p) {
  read?.abort()
  const controller = new AbortController()
  const owner = identity()
  read = controller
  loading.value = true
  error.value = ''
  try {
    const data = await adminBubbles(page, controller.signal)
    if (alive && read === controller && owner === identity()) {
      rows.value = data.list
      pageInfo.value = data.pagination
    }
  } catch (cause) {
    if (!controller.signal.aborted && alive && owner === identity()) error.value = message(cause)
  } finally {
    if (read === controller) loading.value = false
  }
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : '气泡操作失败' }

function edit(row: AdminBubble | null, copy = false) {
  if (blocked.value) return
  selected.value = copy ? null : row
  id.value = copy || !row ? '' : row.id
  editor.value = row ? JSON.parse(JSON.stringify(row.draft)) as BubbleDraft : initialDraft()
  if (copy) editor.value.name = editor.value.name.slice(0, 45) + ' 副本'
  error.value = ''
  notice.value = ''
}
function closeEditor() {
  if (blocked.value) return
  editor.value = null
  selected.value = null
  confirm.value = null
}
function changeAccess() {
  if (!editor.value) return
  const paid = editor.value.access === 'points'
  editor.value.price7 = paid ? 64 : 0
  editor.value.price30 = paid ? 224 : 0
}

async function execute(action: BubbleCommand['action']) {
  const draft = editor.value
  const target = id.value.trim()
  if (!draft || blocked.value) return
  if (!isCustomBubbleId(target) || !draft.name.trim() || !skin.value) {
    error.value = '请检查气泡 ID、名称和样式字段'
    return
  }
  const owner = identity(), revision = selected.value?.revision ?? 0
  const command: BubbleCommand = action === 'save'
    ? { action, revision, draft: { ...draft, name: draft.name.trim(), style: skin.value } }
    : { action, revision }
  error.value = ''
  notice.value = ''
  confirm.value = null
  busy.value = true
  try {
    await saveAdminBubble(target, command, crypto.randomUUID())
    if (!alive || owner !== identity()) return
    editor.value = null
    selected.value = null
    notice.value = { save: '草稿已保存', publish: '气泡已发布', unpublish: '气泡已下架' }[action]
    await load()
  } catch (cause) {
    if (alive && owner === identity()) error.value = message(cause)
  } finally {
    if (alive && owner === identity()) busy.value = false
  }
}

async function uploadIcon(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0], draft = editor.value
  input.value = ''
  if (!file || !draft || blocked.value) return
  const controller = new AbortController(), owner = identity()
  upload = controller
  uploading.value = true
  error.value = ''
  try {
    const url = await uploadBubbleIcon(file, controller.signal)
    if (!controller.signal.aborted && owner === identity() && editor.value === draft) draft.style.image = url
  } catch (cause) {
    if (!controller.signal.aborted && owner === identity()) error.value = message(cause)
  } finally {
    if (upload === controller) uploading.value = false
  }
}

watch(assetRecoveryReceipt, receipt => {
  if (!receipt || typeof receipt !== 'object' || !('id' in receipt) || !isCustomBubbleId(receipt.id)) return
  closeEditor()
  void load()
})
watch(identity, () => {
  read?.abort(); upload?.abort()
  busy.value = uploading.value = false
  rows.value = []; editor.value = selected.value = null; confirm.value = null; notice.value = ''
  if (auth.capabilities?.isAdmin) void load(1)
})
onMounted(() => void load())
onBeforeUnmount(() => { alive = false; read?.abort(); upload?.abort() })
</script>

<template>
  <div class="appearance-page">
    <header class="appearance-heading">
      <div><h2>外观管理</h2><p class="admin-muted">聊天气泡</p></div>
      <button type="button" class="admin-btn admin-btn--primary" :disabled="blocked" @click="edit(null)">新建气泡</button>
    </header>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="appearance-error" role="alert">{{ error }}</p>

    <form v-if="editor" class="admin-card bubble-editor" @submit.prevent="execute('save')">
      <div class="bubble-fields">
        <h3>{{ selected ? '编辑气泡' : '新建气泡' }}</h3>
        <fieldset :disabled="blocked">
          <label>气泡 ID <input v-model="id" class="admin-input" required maxlength="32" :readonly="!!selected" placeholder="bubble-custom-example"></label>
          <label>名称 <input v-model="editor.name" class="admin-input" required maxlength="48"></label>
          <label>获取方式
            <select v-model="editor.access" class="admin-input" :disabled="!!selected?.publishedRevision" @change="changeAccess">
              <option value="free">免费</option><option value="vip">VIP</option><option value="points">积分购买</option>
            </select>
          </label>
          <div v-if="editor.access === 'points'" class="field-row">
            <label>7 天积分 <input v-model.number="editor.price7" class="admin-input" type="number" required min="1" max="100000000"></label>
            <label>30 天积分 <input v-model.number="editor.price30" class="admin-input" type="number" required min="0" max="100000000"><small>填 0 时仅提供 7 天档</small></label>
          </div>
          <fieldset v-for="mode in modes" :key="mode.key" class="color-field">
            <legend>{{ mode.label }}</legend>
            <label v-for="color in colors" :key="color.key">
              <input v-model="editor.style[mode.key][color.key]" type="color"> {{ color.label }}
            </label>
          </fieldset>
          <div class="field-row">
            <label>圆角 <input v-model.number="editor.style.radius" class="admin-input" type="number" required min="6" max="24"></label>
            <label>边线 <input v-model.number="editor.style.borderWidth" class="admin-input" type="number" required min="0" max="2"></label>
          </div>
          <label class="inline-field"><input v-model="editor.style.shadow" type="checkbox"> 底部阴影</label>
          <label>气泡轮廓
            <select v-model="editor.style.shape" class="admin-input">
              <option :value="undefined">经典圆角</option>
              <option v-for="(label, shape) in shapeLabels" :key="shape" :value="shape">{{ label }}</option>
            </select>
          </label>
          <label v-if="!editor.style.shape">角标
            <select v-model="editor.style.motif" class="admin-input">
              <option value="none">无角标</option><option value="paw">爪印</option><option value="leaf">荷叶</option>
              <option value="bell">铃铛</option><option value="fish">小鱼尾</option>
            </select>
          </label>
          <label>RhyPic 装饰图地址 <input v-model.trim="editor.style.image" class="admin-input" type="url" maxlength="512" placeholder="可选，优先使用图片"></label>
          <label>上传装饰图 <input class="admin-input" type="file" accept="image/png,image/webp,image/jpeg,image/avif" @change="uploadIcon"></label>
          <p v-if="uploading" role="status">正在上传角标…</p>
        </fieldset>
        <div class="appearance-actions">
          <button type="submit" class="admin-btn admin-btn--primary" :disabled="blocked || !dirty">保存草稿</button>
          <button v-if="selected" type="button" class="admin-btn" :disabled="blocked || !!dirty || selected.active && !selected.hasDraftChanges"
            @click="confirm = 'publish'">{{ selected.active ? '发布新版本' : '发布' }}</button>
          <button v-if="selected?.active" type="button" class="admin-btn" :disabled="blocked || !!dirty" @click="confirm = 'unpublish'">下架</button>
          <button type="button" class="admin-btn" :disabled="blocked" @click="closeEditor">关闭</button>
        </div>
      </div>
      <aside class="bubble-previews" aria-label="聊天气泡预览">
        <h3>实时预览</h3>
        <section v-for="mode in modes" :key="mode.key" :data-bubble-preview="mode.key" class="preview">
          <span>{{ mode.label }}</span>
          <div v-for="own in [false, true]" :key="String(own)" class="preview-message" :class="{ own }">
            <span>{{ own ? '自己发出' : '收到消息' }}</span>
            <div class="fp-bubble preview-fallback" v-bind="bubbleAttributes(skin, own)">
              {{ own ? '来了，晚点聊天室见！' : '今天也来摸鱼吗？' }}
              <ManagedBubbleShape v-if="skin?.shape" :shape="skin.shape" />
              <img v-if="skin?.image" class="managed-bubble-mark" :src="skin.image" alt="">
            </div>
          </div>
        </section>
      </aside>
    </form>

    <p v-if="loading" role="status">正在读取气泡…</p>
    <p v-else-if="!rows.length && !error">还没有气泡。</p>
    <div v-if="rows.length" class="bubble-list">
      <article v-for="row in rows" :key="row.id" class="admin-card bubble-row">
        <div class="fp-bubble sample" v-bind="bubbleAttributes(row.draft.style)">摸鱼
          <ManagedBubbleShape v-if="row.draft.style.shape" :shape="row.draft.style.shape" />
          <img v-if="row.draft.style.image" class="managed-bubble-mark" :src="row.draft.style.image" alt="">
        </div>
        <div class="bubble-description">
          <h3>{{ row.draft.name }}</h3>
          <span>{{ accessLabels[row.draft.access] }}<template v-if="row.draft.access === 'points'"> · {{ row.draft.price7 }} 积分 / 7 天</template> · {{ row.active ? `已发布 v${row.publishedRevision}` : row.publishedRevision ? '已下架' : '草稿' }}<template v-if="row.active && row.hasDraftChanges"> · 有未发布修改</template></span>
        </div>
        <div class="appearance-actions">
          <button type="button" class="admin-btn" :disabled="blocked" @click="edit(row)">编辑</button>
          <button type="button" class="admin-btn" :disabled="blocked" @click="edit(row, true)">复制</button>
        </div>
      </article>
    </div>
    <AdminPagination v-if="pageInfo.total > pageInfo.size" :page="pageInfo.p" :page-size="pageInfo.size"
      :total="pageInfo.total" :page-count="pageInfo.pageCount" :disabled="loading || blocked" @update:page="load" />
    <ConfirmDialog v-if="confirm" open :title="confirm === 'publish' ? '发布聊天气泡' : '下架聊天气泡'"
      :description="confirm === 'publish' ? '发布后，用户可按配置获取这个气泡。历史消息保持发送时的样式。' : '下架后停止新获取，已有积分权益按原有效期使用。'"
      :danger="confirm === 'unpublish'" @cancel="confirm = null" @confirm="execute(confirm)" />
  </div>
</template>

<style scoped>
.appearance-page { display: grid; gap: 16px; min-width: 0; }
.appearance-heading, .bubble-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
h2, h3, p { margin: 0; }
.appearance-heading p { margin-top: 4px; }
.appearance-error { color: var(--fp-error, #b23f34); }
.bubble-editor { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr); gap: 22px; padding: 20px; }
.bubble-fields, fieldset, .bubble-previews, .bubble-list { display: grid; gap: 12px; min-width: 0; }
fieldset { padding: 0; margin: 0; border: 0; }
label { display: grid; gap: 4px; font-size: 12px; }
label .admin-input { min-width: 0; width: 100%; }
.field-row, .color-field { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.field-row label { flex: 1 1 100px; }
.color-field { border: 1px solid var(--fp-border); border-radius: 8px; padding: 8px; }
.color-field legend { padding: 0 5px; font-size: 12px; }
.color-field label, .inline-field { display: flex; align-items: center; gap: 5px; }
.color-field input { width: 27px; height: 24px; border: 0; padding: 0; background: transparent; }
.appearance-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.bubble-previews { align-content: start; }
.preview { display: grid; gap: 10px; padding: 12px; border: 1px solid #dce5e0; border-radius: 10px; background: #f5f8f6; color: #343d39; font-size: 12px; }
.preview[data-bubble-preview='dark'] { background: #202525; color: #e2eae5; border-color: #424a46; }
.preview-message { display: grid; justify-items: start; gap: 3px; }
.preview-message.own { justify-items: end; }
.preview-fallback { width: fit-content; }
.bubble-row { justify-content: start; padding: 10px 14px; }
.bubble-description { flex: 1; min-width: 130px; }
.bubble-description span { color: var(--fp-muted); font-size: 12px; }
.sample { min-width: 60px; }
@media (max-width: 820px) { .bubble-editor { grid-template-columns: minmax(0, 1fr); } }
</style>
