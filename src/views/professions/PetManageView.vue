<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import { ApiError } from '@/api/http'
import { fetchAdminPets, moderateAdminPetName, type AdminPet } from '@/api/adminStage4'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { useAuthStore } from '@/stores/auth'
import { useDirectoryRows } from '@/views/ops/useDirectoryRows'

const speciesNames: Record<string, string> = { momota: '摸摸獭', hexiaotun: '荷小豚', yubingmiao: '鱼饼喵', paixiaoyu: '派小鱼' }
const auth = useAuthStore()
const search = ref('')
const query = ref('')
const busyId = ref('')
const success = ref('')
const failure = ref('')
watch(() => auth.sessionEpoch, () => {
  search.value = query.value = busyId.value = success.value = failure.value = ''
}, { flush: 'sync' })
const { rows, pagination, error, loading, load } = useDirectoryRows((page, signal) => fetchAdminPets(query.value, page, signal))
const locked = computed(() => loading.value || !!busyId.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
let mounted = true

function applySearch() {
  query.value = search.value.trim()
  success.value = ''
  failure.value = ''
  void load(1)
}

async function refreshAfterWrite() {
  await load()
  if (!rows.value.length && pagination.value.p > 1 && !error.value) {
    await load(Math.max(1, pagination.value.pageCount))
  }
}

async function moderate(pet: AdminPet) {
  if (locked.value || pet.moderated) return
  const epoch = auth.sessionEpoch
  busyId.value = pet.petId
  success.value = ''
  failure.value = ''
  try {
    const result = await moderateAdminPetName(pet)
    if (!mounted || epoch !== auth.sessionEpoch) return
    success.value = `宠物昵称已处理为「${result.moderatedName}」`
    await refreshAfterWrite()
  } catch (cause) {
    if (!mounted || epoch !== auth.sessionEpoch) return
    failure.value = cause instanceof Error ? cause.message : '处理宠物昵称失败'
    if (cause instanceof ApiError && (cause.errorCode === 'pet_name_changed' || cause.status === 404)) {
      await refreshAfterWrite()
    }
  } finally {
    if (mounted && epoch === auth.sessionEpoch) busyId.value = ''
  }
}

watch(assetRecoveryReceipt, receipt => {
  if (!receipt || typeof receipt !== 'object' || !('moderatedName' in receipt) || typeof receipt.moderatedName !== 'string') return
  failure.value = ''
  success.value = `宠物昵称已处理为「${receipt.moderatedName}」`
  void refreshAfterWrite()
})
onScopeDispose(() => { mounted = false })
</script>

<template>
  <section class="pet-manager">
    <h2>宠物管理</h2>
    <form class="admin-card pet-search" role="search" method="get" @submit.prevent="applySearch">
      <label for="pet-filter">搜索宠物</label>
      <div class="pet-search-controls">
        <input id="pet-filter" v-model="search" name="q" type="search" class="admin-input" maxlength="64"
          placeholder="宠物昵称、宠物 ID、主人昵称或 UID">
        <button type="submit" class="admin-btn admin-btn--primary">搜索</button>
      </div>
    </form>

    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="failure" role="alert">{{ failure }}</p>
    <p v-if="loading" role="status">正在读取宠物…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" class="admin-btn" @click="load()">重试</button></p>
    <p v-else-if="!rows.length">没有符合条件的宠物。</p>

    <ul v-if="rows.length && !error" class="pet-list" :aria-busy="loading">
      <li v-for="pet in rows" :key="pet.petId" class="admin-card pet-row">
        <div>
          <b>{{ pet.name }}</b>
          <p class="admin-muted">{{ speciesNames[pet.speciesId] || pet.speciesId }} · #{{ pet.petId }}</p>
        </div>
        <div>
          <span class="admin-muted">主人</span>
          <strong>{{ pet.userNickname || pet.userName || pet.userId }}</strong>
          <p class="admin-muted"><span v-if="pet.userName">@{{ pet.userName }} · </span>UID {{ pet.userId }}</p>
        </div>
        <button type="button" class="admin-btn" :aria-disabled="locked || pet.moderated"
          @click="moderate(pet)">
          {{ pet.moderated ? '已处理' : busyId === pet.petId ? '正在处理…' : '标记违规' }}
        </button>
      </li>
    </ul>
    <AdminPagination v-if="pagination.pageCount > 1" :page="pagination.p" :page-size="pagination.size"
      :total="pagination.total" :page-count="pagination.pageCount" :disabled="locked" @update:page="load" />
  </section>
</template>

<style scoped>
.pet-manager, .pet-list { display: grid; gap: 12px; }
.pet-manager h2, .pet-manager p { margin: 0; }
.pet-search { display: grid; gap: 5px; padding: 14px; }
.pet-search-controls { display: flex; gap: 8px; }
.pet-search .admin-input { flex: 1; min-width: 0; }
.pet-list { list-style: none; margin: 0; padding: 0; }
.pet-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  overflow-wrap: anywhere;
}
.pet-row strong { padding-inline-start: 6px; }
.pet-row p { margin-top: 3px; }
.pet-row button[aria-disabled='true'] { opacity: .55; cursor: default; }
@media (max-width: 600px) {
  .pet-row { grid-template-columns: minmax(0, 1fr) auto; }
  .pet-row > :nth-child(2) { grid-row: 2; }
  .pet-row > button { grid-area: 1 / 2 / span 2; }
  .pet-search .admin-input { font-size: 1rem; }
}
</style>
