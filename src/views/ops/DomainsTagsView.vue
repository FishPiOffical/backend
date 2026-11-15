<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  addDomain,
  addTag,
  bindDomainTag,
  fetchDomains,
  fetchTags,
  removeDomain,
  removeUnusedTags,
  unbindDomainTag,
  updateDomain,
  updateTag,
  type DomainItem,
  type Stage3Pagination,
  type TagItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

/**
 * 领域、导航与标签视图：
 * 1. 管理社区领域、导航开关/排序及标签绑定解绑；
 * 2. 管理标签检索、新增、编辑及一键清理未使用标签。
 */
const auth = useAuthStore()
const tab = ref<'domains' | 'tags'>('domains')
const busy = ref(false)
const toast = ref('')

const domains = ref<DomainItem[]>([])
const domainForm = ref({ oId: '', domainTitle: '', domainURI: '', domainDescription: '', domainSort: 10, domainNav: 1, domainStatus: 0 })
const bindTagMap = ref<Record<string, string>>({})

const tags = ref<TagItem[]>([])
const tagPagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const tagKeyword = ref('')
const newTagTitle = ref('')

const canDomains = computed(() => Boolean(auth.capabilities?.actions.domainManage))
const canTags = computed(() => Boolean(auth.capabilities?.actions.tagManage))

async function loadDomains() {
  if (!canDomains.value) return
  const res = await fetchDomains(1, 100)
  domains.value = res.items
}

async function loadTags(page = 1) {
  if (!canTags.value) return
  const res = await fetchTags({ p: page, size: 20, keyword: tagKeyword.value.trim() })
  tags.value = res.items
  tagPagination.value = res.pagination
}

function editDomain(d: DomainItem) {
  domainForm.value = {
    oId: d.oId,
    domainTitle: d.domainTitle,
    domainURI: d.domainURI,
    domainDescription: d.domainDescription || '',
    domainSort: d.domainSort ?? 10,
    domainNav: d.domainNav ?? 1,
    domainStatus: d.domainStatus ?? 0,
  }
}

function resetDomainForm() {
  domainForm.value = { oId: '', domainTitle: '', domainURI: '', domainDescription: '', domainSort: 10, domainNav: 1, domainStatus: 0 }
}

async function saveDomain() {
  if (!domainForm.value.domainTitle.trim() || !domainForm.value.domainURI.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    const payload = {
      domainTitle: domainForm.value.domainTitle.trim(),
      domainURI: domainForm.value.domainURI.trim(),
      domainDescription: domainForm.value.domainDescription,
      domainSort: domainForm.value.domainSort,
      domainNav: domainForm.value.domainNav,
      domainStatus: domainForm.value.domainStatus,
    }
    if (domainForm.value.oId) {
      await updateDomain(domainForm.value.oId, payload, createIdempotencyKey('domain-upd'))
      toast.value = '已更新领域'
    } else {
      await addDomain(payload, createIdempotencyKey('domain-add'))
      toast.value = '已新增领域'
    }
    resetDomainForm()
    await loadDomains()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '保存领域失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveDomain(d: DomainItem) {
  if (busy.value) return
  busy.value = true
  try {
    await removeDomain(d.oId, createIdempotencyKey('domain-del'))
    toast.value = `已删除领域「${d.domainTitle}」`
    await loadDomains()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除领域失败'
  } finally {
    busy.value = false
  }
}

async function handleBindTag(d: DomainItem) {
  const title = (bindTagMap.value[d.oId] || '').trim()
  if (!title || busy.value) return
  busy.value = true
  try {
    await bindDomainTag(d.oId, title, createIdempotencyKey('domain-bind'))
    bindTagMap.value[d.oId] = ''
    toast.value = `已将标签「${title}」绑定到「${d.domainTitle}」`
    await loadDomains()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '绑定标签失败'
  } finally {
    busy.value = false
  }
}

async function handleUnbindTag(d: DomainItem, tagId: string) {
  if (busy.value) return
  busy.value = true
  try {
    await unbindDomainTag(d.oId, tagId, createIdempotencyKey('domain-unbind'))
    toast.value = '已解绑标签'
    await loadDomains()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '解绑标签失败'
  } finally {
    busy.value = false
  }
}

async function handleAddTag() {
  if (!newTagTitle.value.trim() || busy.value) return
  busy.value = true
  try {
    await addTag(newTagTitle.value.trim(), createIdempotencyKey('tag-add'))
    newTagTitle.value = ''
    toast.value = '新增标签成功'
    await loadTags(1)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '新增标签失败'
  } finally {
    busy.value = false
  }
}

async function handleToggleTagStatus(t: TagItem) {
  if (busy.value) return
  busy.value = true
  try {
    const nextStatus = t.tagStatus === 0 ? 1 : 0
    await updateTag(t.oId, { tagStatus: nextStatus }, createIdempotencyKey('tag-upd'))
    toast.value = `已更新标签「${t.tagTitle}」状态`
    await loadTags(tagPagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新标签失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveUnused() {
  if (busy.value) return
  busy.value = true
  try {
    await removeUnusedTags(createIdempotencyKey('tag-clean'))
    toast.value = '已清理所有未使用标签'
    await loadTags(1)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '清理标签失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  if (!canDomains.value && canTags.value) {
    tab.value = 'tags'
  }
  await Promise.all([loadDomains(), loadTags(1)])
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>领域、导航与标签</h2>
        <p class="admin-muted">维护社区领域导航排序、领域绑定标签及全站标签词库。</p>
      </div>
      <div class="tab-row">
        <button v-if="canDomains" class="admin-btn" :class="{ 'admin-btn--primary': tab === 'domains' }" @click="tab = 'domains'">领域与导航</button>
        <button v-if="canTags" class="admin-btn" :class="{ 'admin-btn--primary': tab === 'tags' }" @click="tab = 'tags'">标签维护</button>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div v-if="tab === 'domains' && canDomains">
      <div class="admin-filter-bar toolbar-gap">
        <input aria-label="领域名称" v-model="domainForm.domainTitle" class="admin-input" placeholder="领域名称" />
        <input aria-label="URI 标识" v-model="domainForm.domainURI" class="admin-input" placeholder="URI 标识" />
        <input aria-label="排序" v-model.number="domainForm.domainSort" class="admin-input num-input" type="number" placeholder="排序" />
        <select aria-label="导航显示" v-model.number="domainForm.domainNav" class="admin-select">
          <option :value="1">显示在导航</option>
          <option :value="0">不在导航显示</option>
        </select>
        <button class="admin-btn admin-btn--primary" :disabled="busy" @click="saveDomain">{{ domainForm.oId ? '保存修改' : '新增领域' }}</button>
        <button v-if="domainForm.oId" class="admin-btn" @click="resetDomainForm">取消编辑</button>
      </div>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>名称 / URI</th>
            <th>排序 / 导航</th>
            <th>已绑定标签</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in domains" :key="d.oId">
            <td>
              <strong>{{ d.domainTitle }}</strong>
              <div class="admin-muted"><code>{{ d.domainURI }}</code></div>
            </td>
            <td>{{ d.domainSort ?? 0 }} / {{ d.domainNav === 1 ? '导航显示' : '隐藏' }}</td>
            <td>
              <div class="tag-pills">
                <span v-for="t in d.tags || []" :key="t.tagId" class="tag-chip">
                  {{ t.tagTitle }}
                  <button class="chip-x" type="button" @click="handleUnbindTag(d, t.tagId)">×</button>
                </span>
              </div>
              <div class="admin-filter-bar" style="margin-top: 0.35rem;">
                <input aria-label="输入标签名绑定" v-model="bindTagMap[d.oId]" class="admin-input" placeholder="输入标签名绑定" />
                <button class="admin-btn admin-btn--sm" @click="handleBindTag(d)">绑定</button>
              </div>
            </td>
            <td>
              <div class="btn-row">
                <button class="admin-btn admin-btn--sm" @click="editDomain(d)">编辑</button>
                <button class="admin-btn admin-btn--sm admin-btn--danger" :disabled="busy" @click="handleRemoveDomain(d)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div v-else-if="canTags">
      <div class="admin-filter-bar toolbar-gap admin-search-bar">
        <input aria-label="新标签名称" v-model="newTagTitle" class="admin-input" placeholder="新标签名称" />
        <button class="admin-btn admin-btn--primary" :disabled="busy" @click="handleAddTag">新增标签</button>
        <input aria-label="搜索标签" v-model="tagKeyword" class="admin-input" placeholder="搜索标签" @keyup.enter="loadTags(1)" />
        <button class="admin-btn admin-btn--secondary" @click="loadTags(1)">检索</button>
        <button class="admin-btn admin-btn--danger" :disabled="busy" @click="handleRemoveUnused">清理未使用标签</button>
      </div>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>标签名称</th>
            <th>URI</th>
            <th>引用次数</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tags" :key="t.oId">
            <td>{{ t.tagTitle }}</td>
            <td><code>{{ t.tagURI }}</code></td>
            <td>{{ t.tagReferenceCount ?? 0 }}</td>
            <td>{{ t.tagStatus === 0 ? '正常' : '停用' }}</td>
            <td>
              <button class="admin-btn admin-btn--sm" :disabled="busy" @click="handleToggleTagStatus(t)">
                {{ t.tagStatus === 0 ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table></div>

      <div class="pager-bar">
        <button class="admin-btn admin-btn--sm" :disabled="tagPagination.page <= 1" @click="loadTags(tagPagination.page - 1)">上一页</button>
        <span>第 {{ tagPagination.page }} / {{ tagPagination.totalPages }} 页（共 {{ tagPagination.total }} 条）</span>
        <button class="admin-btn admin-btn--sm" :disabled="tagPagination.page >= tagPagination.totalPages" @click="loadTags(tagPagination.page + 1)">下一页</button>
      </div>
    </div>
      </section>
  </div>
</template>

<style scoped>
.toolbar-gap { margin-bottom: 0.75rem; }
.num-input { width: 88px; }
.tag-pills { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.tag-chip { display: inline-flex; align-items: center; gap: 0.25rem; background: var(--fp-elevated); color: var(--fp-text); padding: 0.15rem 0.45rem; border-radius: 999px; font-size: 0.8rem; }
.chip-x { border: 0; background: transparent; color: inherit; cursor: pointer; font-weight: 700; }
</style>
