<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  addReservedWord,
  fetchAds,
  fetchReservedWords,
  removeReservedWord,
  updateAds,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

/**
 * 保留词与广告位维护视图：
 * 1. 保留词支持关键词检索、新增与移除；
 * 2. 侧边广告与顶栏横幅以纯文本源码编辑，不在后台内联 v-html 执行。
 */
const auth = useAuthStore()
const busy = ref(false)
const toast = ref('')

const rwKeyword = ref('')
const newWord = ref('')
const words = ref<{ oId: string; word: string }[]>([])

const sideFullAd = ref('')
const headerBanner = ref('')

const canRw = computed(() => Boolean(auth.capabilities?.actions.reservedWordManage))
const canAd = computed(() => Boolean(auth.capabilities?.actions.adManage))

async function loadWords() {
  if (!canRw.value) return
  const res = await fetchReservedWords(rwKeyword.value.trim())
  words.value = res.items
}

async function loadAds() {
  if (!canAd.value) return
  const res = await fetchAds()
  sideFullAd.value = res.sideFullAd || ''
  headerBanner.value = res.headerBanner || ''
}

async function handleAddWord() {
  if (!newWord.value.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await addReservedWord(newWord.value.trim(), createIdempotencyKey('rw-add'))
    newWord.value = ''
    toast.value = '已添加保留词'
    await loadWords()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '添加保留词失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveWord(word: string) {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await removeReservedWord(word, createIdempotencyKey('rw-del'))
    toast.value = `已移除保留词「${word}」`
    await loadWords()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '移除保留词失败'
  } finally {
    busy.value = false
  }
}

async function handleSaveAds() {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await updateAds(
      { sideFullAd: sideFullAd.value, headerBanner: headerBanner.value },
      createIdempotencyKey('ad-upd'),
    )
    toast.value = '广告位配置已保存'
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '保存广告位失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadWords(), loadAds()])
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>保留词与广告位维护</h2>
        <p class="admin-muted">维护社区敏感词/保留词词表，以及侧边栏与顶栏广告位片段（源码模式安全编辑）。</p>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div class="split-layout">
      <div v-if="canRw" class="sub-card">
        <h3>保留词管理（{{ words.length }}）</h3>
        <div class="admin-filter-bar toolbar-gap">
          <input aria-label="新增保留词" v-model="newWord" class="admin-input" placeholder="新增保留词" />
          <button class="admin-btn admin-btn--primary" :disabled="busy" @click="handleAddWord">添加</button>
          <input aria-label="过滤保留词" v-model="rwKeyword" class="admin-input" placeholder="过滤保留词" @keyup.enter="loadWords" />
          <button class="admin-btn admin-btn--secondary" @click="loadWords">过滤</button>
        </div>
        <div class="word-list">
          <span v-for="w in words" :key="w.oId || w.word" class="word-chip">
            {{ w.word }}
            <button class="chip-x" type="button" :disabled="busy" @click="handleRemoveWord(w.word)">×</button>
          </span>
        </div>
      </div>

      <div v-if="canAd" class="sub-card">
        <h3>广告位配置</h3>
        <div class="form-grid">
          <label>侧边全幅广告（sideFullAd）</label>
          <textarea id="ad-side" aria-label="侧栏全幅广告" v-model="sideFullAd" class="admin-textarea mono-area" rows="6" />
          <label for="ad-header">顶栏横幅（headerBanner）</label>
          <textarea id="ad-header" v-model="headerBanner" class="admin-textarea mono-area" rows="6" />
          <button class="admin-btn admin-btn--primary" :disabled="busy" @click="handleSaveAds">保存广告位配置</button>
        </div>
      </div>
    </div>
      </section>
  </div>
</template>

<style scoped>
.split-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; }
.sub-card { border: 1px solid var(--fp-border); border-radius: 8px; padding: 0.9rem; }
.toolbar-gap { margin: 0.5rem 0 0.75rem; }
.word-list { display: flex; gap: 0.4rem; flex-wrap: wrap; max-height: 360px; overflow-y: auto; }
.word-chip { display: inline-flex; align-items: center; gap: 0.25rem; background: var(--fp-elevated); padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.85rem; }
.chip-x { border: 0; background: transparent; cursor: pointer; font-weight: 700; }
.form-grid { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.mono-area { font-family: monospace; font-size: 0.82rem; }
@media (max-width: 960px) { .split-layout { grid-template-columns: 1fr; } }
</style>
