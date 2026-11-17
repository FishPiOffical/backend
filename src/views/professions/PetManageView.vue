<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import AdminPageHeader from '@/components/common/AdminPageHeader.vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
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
  <div class="admin-page">
    <AdminPageHeader
      title="宠物管理"
      subtitle="检索社区宠物与主人信息，支持对违规宠物昵称执行合规重置处理。"
    >
      <template #actions>
        <button type="button" class="admin-btn" :disabled="locked" @click="load()">刷新列表</button>
      </template>
    </AdminPageHeader>

    <form class="admin-panel pet-search" role="search" method="get" @submit.prevent="applySearch">
      <div class="admin-filters">
        <input
          id="pet-filter"
          v-model="search"
          name="q"
          type="search"
          class="admin-input pet-search__input"
          maxlength="64"
          aria-label="搜索宠物"
          placeholder="搜索宠物昵称、宠物 ID、主人昵称或 UID..."
        >
        <button type="submit" class="admin-btn admin-btn--primary" :disabled="locked">搜索</button>
      </div>
    </form>

    <AdminAlertBanner v-if="success" tone="success" :message="success" />
    <AdminAlertBanner v-if="failure" tone="danger" :message="failure" />

    <div v-if="loading && !rows.length" class="admin-panel pet-state" role="status">正在读取宠物…</div>
    <div v-else-if="error" class="admin-panel pet-state pet-state--error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="load()">重试</button>
    </div>
    <div v-else-if="!rows.length" class="admin-panel pet-state">没有符合条件的宠物。</div>

    <ul v-else class="pet-list" :aria-busy="loading">
      <li v-for="pet in rows" :key="pet.petId" class="admin-panel pet-row">
        <div class="pet-row__identity">
          <div class="pet-row__title">
            <strong>{{ pet.name }}</strong>
            <StatusBadge
              :tone="pet.moderated ? 'neutral' : 'success'"
              :label="pet.moderated ? '已处理' : '正常'"
            />
          </div>
          <p class="pet-row__meta admin-mono">
            {{ speciesNames[pet.speciesId] || pet.speciesId }} · #{{ pet.petId }}
          </p>
        </div>
        <div class="pet-row__owner">
          <span class="pet-row__owner-label">主人</span>
          <strong>{{ pet.userNickname || pet.userName || pet.userId }}</strong>
          <p class="pet-row__meta admin-mono">
            <span v-if="pet.userName">@{{ pet.userName }} · </span>UID {{ pet.userId }}
          </p>
        </div>
        <div class="pet-row__actions">
          <button
            type="button"
            class="admin-btn admin-btn--sm"
            :class="pet.moderated ? '' : 'admin-btn--danger-outline'"
            :disabled="locked || pet.moderated"
            @click="moderate(pet)"
          >
            {{ pet.moderated ? '已处理' : busyId === pet.petId ? '正在处理…' : '标记违规' }}
          </button>
        </div>
      </li>
    </ul>

    <AdminPagination
      v-if="pagination.pageCount > 1"
      :page="pagination.p"
      :page-size="pagination.size"
      :total="pagination.total"
      :page-count="pagination.pageCount"
      :disabled="locked"
      @update:page="load"
    />
  </div>
</template>

<style scoped>
.pet-search {
  padding: 16px 18px;
}

.pet-search__input {
  flex: 1 1 260px;
}

.pet-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  color: var(--fp-muted);
  text-align: center;
}

.pet-state--error {
  color: var(--fp-danger-ink);
}

.pet-list {
  display: grid;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.pet-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 18px;
  padding: 14px 18px;
  overflow-wrap: anywhere;
}

.pet-row + .pet-row {
  margin-top: 0;
}

.pet-row__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: var(--fp-title);
}

.pet-row__owner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--fp-title);
}

.pet-row__owner-label {
  font-size: 11px;
  color: var(--fp-muted);
}

.pet-row__meta {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}

.pet-row__actions {
  display: flex;
  align-items: center;
}

@media (max-width: 680px) {
  .pet-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .pet-row__owner {
    grid-row: 2;
  }

  .pet-row__actions {
    grid-area: 1 / 2 / span 2;
  }
}
</style>
