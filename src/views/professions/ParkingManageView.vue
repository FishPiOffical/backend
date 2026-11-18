<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import AdminPageHeader from '@/components/common/AdminPageHeader.vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import { fetchParkingModels, fetchParkingLedger, updateParkingModel, type ParkingModel } from '@/api/adminStage4'
import { useDirectoryRows } from '@/views/ops/useDirectoryRows'
import { useAuthStore } from '@/stores/auth'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { ApiError } from '@/api/http'

const auth = useAuthStore()
const catalog = ref<ParkingModel[]>([]), version = ref(0), selected = ref(''), draft = ref<ParkingModel | null>(null)
const search = ref(''), userId = ref(''), message = ref(''), error = ref(''), reading = ref(false), saving = ref(false)
const locked = computed(() => reading.value || saving.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
let controller: AbortController | undefined, disposed = false
function select() {
  const car = catalog.value.find(c => c.id === selected.value)
  draft.value = car ? { ...car } : null
}
async function loadCatalog() {
  controller?.abort()
  const request = new AbortController()
  controller = request; reading.value = true; error.value = ''
  try {
    const result = await fetchParkingModels(request.signal)
    if (request.signal.aborted) return
    catalog.value = result.models; version.value = result.version
    if (!result.models.some(c => c.id === selected.value)) selected.value = result.models[0]?.id || ''
    select()
  } catch (cause) {
    if (!request.signal.aborted) { error.value = cause instanceof Error ? cause.message : '车行读取失败'; draft.value = null }
  } finally { if (!request.signal.aborted) reading.value = false }
}
async function save() {
  if (locked.value || !draft.value) return
  const epoch = auth.sessionEpoch
  saving.value = true; error.value = message.value = ''
  try {
    await updateParkingModel({ ...draft.value }, version.value)
    if (disposed || auth.sessionEpoch !== epoch) return
    message.value = '车行设置已保存'
    await loadCatalog()
  } catch (cause) {
    if (disposed || auth.sessionEpoch !== epoch) return
    if (cause instanceof ApiError && cause.errorCode === 'parking_catalog_changed') await loadCatalog()
    if (!disposed && auth.sessionEpoch === epoch) error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally { if (!disposed && auth.sessionEpoch === epoch) saving.value = false }
}
watch(() => auth.sessionEpoch, () => {
  controller?.abort(); catalog.value = []; draft.value = null; selected.value = userId.value = search.value = message.value = error.value = ''
  saving.value = false
  void loadCatalog()
}, { immediate: true, flush: 'sync' })
watch(assetRecoveryReceipt, receipt => {
  if (receipt && typeof receipt === 'object' && 'parkingModel' in receipt) void loadCatalog()
})
const ledger = useDirectoryRows((page, signal) => fetchParkingLedger(userId.value, page, signal))
function filter() { userId.value = search.value.trim(); void ledger.load(1) }
onScopeDispose(() => { disposed = true; controller?.abort() })
</script>
<template>
  <main class="admin-page parking-admin">
    <AdminPageHeader title="抢车位管理" />
    <section class="admin-panel">
      <header><h2>车行设置</h2><button class="admin-btn" :disabled="locked" @click="loadCatalog">刷新车行</button></header>
      <p>费率在出车时锁定。下架后，已购车辆仍可停放。</p>
      <form v-if="draft" @submit.prevent="save">
        <label>车型<select v-model="selected" class="admin-input" :disabled="locked" @change="select"><option v-for="car in catalog" :key="car.id" :value="car.id">{{ car.name }}</option></select></label>
        <label>售价（游园币）<input v-model.number="draft.price" required type="number" step="1" min="1" max="1000000" class="admin-input" :disabled="locked"></label>
        <label>每小时收益<input v-model.number="draft.rate" required type="number" step="1" min="1" max="10000" class="admin-input" :disabled="locked"></label>
        <label class="toggle"><input v-model="draft.enabled" type="checkbox" :disabled="locked">在售</label>
        <button class="admin-btn admin-btn--primary" :disabled="locked">保存设置</button>
      </form>
      <AdminAlertBanner v-if="message" tone="success" :message="message" />
      <AdminAlertBanner v-if="error" tone="danger" :message="error" />
    </section>
    <section class="admin-panel">
      <h2>游园币流水</h2>
      <form @submit.prevent="filter"><label>用户编号（UID）<input v-model="search" class="admin-input" inputmode="numeric" pattern="[1-9][0-9]{0,18}" placeholder="全部用户"></label><button class="admin-btn">查询</button></form>
      <AdminAlertBanner v-if="ledger.error.value" tone="danger" :message="ledger.error.value" />
      <p v-else-if="ledger.loading.value">正在读取…</p>
      <p v-else-if="!ledger.rows.value.length">没有符合条件的流水。</p>
      <div v-else class="table-scroll"><table><thead><tr><th>时间</th><th>用户 UID</th><th>操作</th><th>游园币</th><th>关联单号 / 车型</th></tr></thead>
        <tbody><tr v-for="entry in ledger.rows.value" :key="entry.oId"><td>{{ new Date(entry.createdAt).toLocaleString() }}</td><td>{{ entry.userId }}</td>
          <td>{{ entry.operation === 'parking-buy' ? '购车' : '停车结算' }}</td><td>{{ entry.coinDelta > 0 ? '+' : '' }}{{ entry.coinDelta }}</td><td>{{ entry.referenceId }}</td></tr></tbody></table></div>
      <AdminPagination v-if="ledger.pagination.value.pageCount > 1" :page="ledger.pagination.value.p" :page-count="ledger.pagination.value.pageCount"
        :page-size="ledger.pagination.value.size" :total="ledger.pagination.value.total" :disabled="ledger.loading.value" @update:page="ledger.load" />
    </section>
  </main>
</template>
<style scoped>
.admin-panel { padding:18px; min-width:0; }
h2 { font-size:17px; margin:0; }
header,form { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
header { justify-content:space-between; }
form { align-items:end; margin:14px 0; }
label { display:grid; gap:4px; }
.toggle { display:flex; align-items:center; min-height:36px; }
.table-scroll { overflow:auto; }
table { width:100%; border-collapse:collapse; }
td,th { text-align:left; padding:8px; white-space:nowrap; border-bottom:1px solid var(--admin-border); }
</style>
