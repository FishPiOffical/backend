<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { clientGroups, clientStatuses, listClients, saveClient, type AdminClient, type ClientDraft } from '@/api/adminDirectory'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { useAuthStore } from '@/stores/auth'
import { useDirectoryRows } from './useDirectoryRows'

const auth = useAuthStore()
const { rows, pagination, error, loading, load } = useDirectoryRows(listClients)
const draft = ref<ClientDraft | null>(null)
const revision = ref(0)
const id = ref('')
const down = ref<AdminClient | null>(null)
const busy = ref(false)
const blocked = computed(() => busy.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
const notice = ref('')
const failure = ref('')
let alive = true

function start(row?: AdminClient) {
  if (blocked.value) return
  id.value = row?.id ?? ''
  revision.value = row?.revision ?? 0
  draft.value = row ? fields(row) : {
    name: '', icon: '', group: 'desktop', status: 'active', authors: [],
    links: [{ label: '下载', href: '' }], recommended: false, sortOrder: 1000,
  }
  notice.value = ''
  failure.value = ''
}

function fields(row: AdminClient): ClientDraft {
  const { name, icon, group, status, recommended, authors, links, sortOrder } = row
  return {
    name, icon, group, status, recommended, sortOrder,
    authors: authors.map(author => ({ ...author })),
    links: links.map(link => ({ ...link })),
  }
}

function setStatus() {
  if (draft.value && draft.value.status !== 'active') {
    draft.value.recommended = false
    if (revision.value === 0 && draft.value.links.length === 1
        && draft.value.links[0]?.label === '下载' && !draft.value.links[0]?.href) draft.value.links = []
  }
}

async function persist(clientId: string, version: number, value: ClientDraft, message = '客户端配置已保存') {
  if (blocked.value) return
  const epoch = auth.sessionEpoch
  busy.value = true
  failure.value = ''
  notice.value = ''
  try {
    await saveClient(clientId, version, value)
    if (!alive || epoch !== auth.sessionEpoch) return
    notice.value = message
    draft.value = null
    await load()
  } catch (cause) {
    if (alive && epoch === auth.sessionEpoch) failure.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    if (epoch === auth.sessionEpoch) busy.value = false
  }
}

function save() {
  if (draft.value) void persist(id.value.trim(), revision.value, draft.value)
}

function recommend(row: AdminClient) {
  void persist(row.id, row.revision, { ...fields(row), recommended: !row.recommended },
    row.recommended ? '已取消推荐' : '已设为推荐')
}

function confirmDown() {
  const row = down.value
  down.value = null
  if (row) void persist(row.id, row.revision, { ...fields(row), status: 'retired', recommended: false }, '客户端已下架')
}

watch(assetRecoveryReceipt, receipt => {
  if (receipt && typeof receipt === 'object' && 'clientId' in receipt) {
    draft.value = null
    failure.value = ''
    void load()
  }
})
watch(() => auth.sessionEpoch, () => {
  draft.value = null
  down.value = null
  failure.value = notice.value = ''
  busy.value = false
}, { flush: 'sync' })
onScopeDispose(() => { alive = false })
</script>

<template>
  <section class="directory-page">
    <header class="directory-heading">
      <h2>客户端下载</h2>
      <button class="admin-btn admin-btn--primary" type="button" :disabled="blocked" @click="start()">新增客户端</button>
    </header>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="failure" role="alert">{{ failure }}</p>
    <form v-if="draft" class="admin-card directory-form" aria-labelledby="client-form-title" method="post" :aria-busy="busy" @submit.prevent="save">
      <h3 id="client-form-title">{{ revision ? '编辑客户端' : '新增客户端' }}</h3>
      <div class="directory-edit-fields" :inert="blocked">
        <div class="directory-grid">
          <label>标识 *<input v-model.trim="id" name="client-id" class="admin-input" required maxlength="48"
            pattern="[a-z0-9]+(-[a-z0-9]+)*" :readonly="revision > 0" aria-describedby="client-id-help">
            <small id="client-id-help" class="admin-muted">小写英文字母、数字和连字符</small>
          </label>
          <label>名称 *<input v-model.trim="draft.name" name="client-name" class="admin-input" required maxlength="80"></label>
          <label>分类<select v-model="draft.group" name="group" class="admin-input">
            <option v-for="(label, key) in clientGroups" :key="key" :value="key">{{ label }}</option>
          </select></label>
          <label>状态<select v-model="draft.status" name="status" class="admin-input" @change="setStatus">
            <option v-for="(label, key) in clientStatuses" :key="key" :value="key">{{ label }}</option>
          </select></label>
          <label>图标链接<input v-model.trim="draft.icon" type="url" name="icon" class="admin-input" maxlength="512"
            aria-describedby="client-icon-help">
            <small id="client-icon-help" class="admin-muted">可使用 RhyPic 公开图片，留空使用默认图标</small>
          </label>
          <label>排序<input v-model.number="draft.sortOrder" name="sort-order" class="admin-input" type="number" min="0" max="999999" required></label>
        </div>
        <label class="directory-inline"><input v-model="draft.recommended" name="recommended" type="checkbox"
          :disabled="draft.status !== 'active'">设为推荐</label>
        <fieldset>
          <legend>下载链接</legend>
          <p v-if="!draft.links.length && draft.status === 'active'" class="admin-muted">上架客户端至少需要一个下载链接。</p>
          <div v-for="(link, index) in draft.links" :key="index" class="directory-grid directory-fields">
            <label>链接 {{ index + 1 }} 名称 *<input v-model.trim="link.label" :name="`link-name-${index}`" class="admin-input" required maxlength="64"></label>
            <label>链接 {{ index + 1 }} 地址 *<input v-model.trim="link.href" :name="`link-url-${index}`" class="admin-input" required maxlength="512"
              aria-describedby="client-links-help"></label>
            <button class="admin-btn" type="button" @click="draft.links.splice(index, 1)">移除链接 {{ index + 1 }}</button>
          </div>
          <p id="client-links-help" class="admin-muted">支持 HTTPS 地址或站内帖子路径，例如 /article/1745833503658。</p>
          <button v-if="draft.links.length < 5" class="admin-btn" type="button" @click="draft.links.push({ label: '', href: '' })">添加下载链接</button>
        </fieldset>
        <fieldset>
          <legend>开发者</legend>
          <div v-for="(author, index) in draft.authors" :key="index" class="directory-grid directory-fields">
            <label>开发者 {{ index + 1 }} 昵称 *<input v-model.trim="author.name" :name="`author-name-${index}`" class="admin-input" required maxlength="64"></label>
            <label>开发者 {{ index + 1 }} 用户名 *<input v-model.trim="author.userName" :name="`author-username-${index}`"
              class="admin-input" required maxlength="64" pattern="[A-Za-z0-9_\-]+"></label>
            <button class="admin-btn" type="button" @click="draft.authors.splice(index, 1)">移除开发者 {{ index + 1 }}</button>
          </div>
          <button v-if="draft.authors.length < 4" class="admin-btn" type="button" @click="draft.authors.push({ name: '', userName: '' })">添加开发者</button>
        </fieldset>
      </div>
      <div class="directory-actions">
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="blocked">保存客户端</button>
        <button class="admin-btn" type="button" :disabled="blocked" @click="draft = null">关闭</button>
      </div>
    </form>
    <p v-if="loading" role="status">正在读取客户端…</p>
    <p v-else-if="error" role="alert">{{ error }} <button class="admin-btn" type="button" @click="load()">重试</button></p>
    <p v-else-if="!rows.length">暂无客户端。</p>
    <ul v-if="rows.length" class="directory-list">
      <li v-for="row in rows" :key="row.id" class="admin-card directory-row">
        <div><strong>{{ row.name }}</strong><p class="admin-muted">{{ clientGroups[row.group] }} · {{ clientStatuses[row.status] }}<template v-if="row.recommended"> · 推荐</template></p></div>
        <div class="directory-actions">
          <button class="admin-btn" type="button" :disabled="blocked" @click="start(row)">编辑</button>
          <button v-if="row.status === 'active'" class="admin-btn" type="button" :disabled="blocked || !!draft" @click="recommend(row)">{{ row.recommended ? '取消推荐' : '设为推荐' }}</button>
          <button v-if="row.status !== 'retired'" class="admin-btn" type="button" :disabled="blocked || !!draft" @click="down = row">下架</button>
          <button v-else class="admin-btn" type="button" :disabled="blocked" @click="start({ ...row, status: 'active' })">重新上架</button>
        </div>
      </li>
    </ul>
    <AdminPagination v-if="pagination.pageCount > 1" :page="pagination.p" :page-size="pagination.size"
      :total="pagination.total" :page-count="pagination.pageCount" :disabled="loading || blocked" @update:page="load" />
    <ConfirmDialog v-if="down" open danger title="下架客户端" :description="`下架后，${down.name}会移到已下架区，用户无法通过客户端下载页获取链接。`"
      @cancel="down = null" @confirm="confirmDown" />
  </section>
</template>

<style scoped src="./community-directory.css"></style>
