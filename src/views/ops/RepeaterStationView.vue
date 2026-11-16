<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import { addRepeater, listRepeater, repeaterKinds, type RepeaterDraft } from '@/api/adminDirectory'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { useAuthStore } from '@/stores/auth'
import { useDirectoryRows } from './useDirectoryRows'

const auth = useAuthStore()
const { rows, pagination, error, loading, load } = useDirectoryRows(listRepeater)
const kind = ref<RepeaterDraft['type']>('joke')
const content = ref('')
const busy = ref(false)
const blocked = computed(() => busy.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
const notice = ref('')
const failure = ref('')
let alive = true
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })

async function publish() {
  if (blocked.value) return
  const epoch = auth.sessionEpoch
  busy.value = true
  failure.value = notice.value = ''
  try {
    await addRepeater({ type: kind.value, content: content.value })
    if (!alive || epoch !== auth.sessionEpoch) return
    content.value = ''
    notice.value = '已添加到复读机转录站'
    await load(1)
  } catch (cause) {
    if (alive && epoch === auth.sessionEpoch) failure.value = cause instanceof Error ? cause.message : '发布失败'
  } finally {
    if (epoch === auth.sessionEpoch) busy.value = false
  }
}

watch(assetRecoveryReceipt, receipt => {
  if (receipt && typeof receipt === 'object' && 'repeaterId' in receipt) {
    content.value = ''
    failure.value = ''
    void load(1)
  }
})
watch(() => auth.sessionEpoch, () => {
  kind.value = 'joke'
  content.value = failure.value = notice.value = ''
  busy.value = false
}, { flush: 'sync' })
onScopeDispose(() => { alive = false })
</script>

<template>
  <section class="directory-page">
    <header class="directory-heading"><h2>复读机转录站</h2></header>
    <form class="admin-card directory-form" aria-labelledby="repeater-form-title" method="post" :aria-busy="busy" @submit.prevent="publish">
      <h3 id="repeater-form-title">添加复读内容</h3>
      <fieldset class="directory-options" :disabled="blocked">
        <legend>分类</legend>
        <label v-for="(label, key) in repeaterKinds" :key="key" class="directory-inline">
          <input v-model="kind" type="radio" name="repeater-kind" :value="key"> {{ label }}
        </label>
      </fieldset>
      <label>正文 *<textarea v-model="content" name="repeater-content" class="admin-input" rows="5" required
        minlength="2" maxlength="500" :readonly="blocked" aria-describedby="repeater-length"></textarea></label>
      <small id="repeater-length" class="admin-muted">{{ content.length }} / 500</small>
      <div class="directory-actions">
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="blocked">发布到转录站</button>
      </div>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="failure" role="alert">{{ failure }}</p>
    </form>

    <h3>后台添加记录</h3>
    <p v-if="loading" role="status">正在读取添加记录…</p>
    <p v-else-if="error" role="alert">{{ error }} <button class="admin-btn" type="button" @click="load()">重试</button></p>
    <p v-else-if="!rows.length">还没有后台添加的内容。</p>
    <ul v-if="rows.length" class="directory-list">
      <li v-for="row in rows" :key="row.id" class="admin-card repeater-entry">
        <p class="admin-muted">{{ repeaterKinds[row.type] }} · {{ row.status === 0 ? '已发布' : '已移除' }} · {{ date.format(row.createdTime) }} · #{{ row.id }}</p>
        <p>{{ row.content }}</p>
      </li>
    </ul>
    <AdminPagination v-if="pagination.pageCount > 1" :page="pagination.p" :page-size="pagination.size"
      :total="pagination.total" :page-count="pagination.pageCount" :disabled="loading || blocked" @update:page="load" />
  </section>
</template>

<style scoped src="./community-directory.css"></style>
