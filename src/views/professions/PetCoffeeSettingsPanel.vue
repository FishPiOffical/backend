<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import { ApiError } from '@/api/http'
import { fetchPetCoffeeSettings, savePetCoffeeSettings, type PetCoffeeSettings } from '@/api/adminStage4'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const current = ref<PetCoffeeSettings | null>(null)
const enabled = ref(false)
const price = ref<number | string>('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
let read: AbortController | undefined
let disposed = false
const locked = computed(() => loading.value || saving.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
const validPrice = computed(() => typeof price.value === 'number' && Number.isInteger(price.value) && price.value >= 1 && price.value <= 100_000)
const changed = computed(() => current.value && (current.value.enabled !== enabled.value || current.value.price !== price.value))
function message(cause: unknown) { return cause instanceof Error ? cause.message : '宠物咖啡设置暂不可用' }

async function load() {
  read?.abort()
  const controller = new AbortController()
  read = controller
  loading.value = true
  error.value = ''
  try {
    const result = await fetchPetCoffeeSettings(controller.signal)
    if (controller.signal.aborted) return
    current.value = result
    enabled.value = result.enabled
    price.value = result.price
  } catch (cause) {
    if (controller.signal.aborted) return
    current.value = null
    error.value = message(cause)
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}

async function save() {
  if (locked.value || !current.value || !changed.value || !validPrice.value || typeof price.value !== 'number') return
  const epoch = auth.sessionEpoch
  saving.value = true
  error.value = notice.value = ''
  try {
    await savePetCoffeeSettings({ enabled: enabled.value, price: price.value, version: current.value.version })
    if (disposed || auth.sessionEpoch !== epoch) return
    notice.value = '设置已保存'
    await load()
  } catch (cause) {
    if (disposed || auth.sessionEpoch !== epoch) return
    error.value = message(cause)
    if (cause instanceof ApiError && cause.errorCode === 'coffee_price_changed') {
      await load()
      if (!error.value && auth.sessionEpoch === epoch) error.value = message(cause)
    }
  } finally {
    if (!disposed && auth.sessionEpoch === epoch) saving.value = false
  }
}

watch(() => auth.sessionEpoch, () => {
  read?.abort()
  current.value = null
  enabled.value = false
  price.value = ''
  saving.value = loading.value = false
  notice.value = error.value = ''
  void load()
}, { immediate: true, flush: 'sync' })
watch(assetRecoveryReceipt, receipt => {
  if (receipt && typeof receipt === 'object' && 'product' in receipt && receipt.product === 'coffee') {
    notice.value = '设置已确认'
    void load()
  }
})
onScopeDispose(() => { disposed = true; read?.abort() })
</script>

<template>
  <section class="admin-panel coffee-settings" aria-labelledby="coffee-settings-title">
    <h2 id="coffee-settings-title">宠物咖啡</h2>
    <p>恢复 30 点精力。每个账号每天最多使用 3 次，按北京时间重置。</p>
    <form v-if="current" class="coffee-settings-form" @submit.prevent="save">
      <label>售价（积分）<input v-model.number="price" class="admin-input" type="number" required min="1" max="100000" step="1" :disabled="locked"></label>
      <label class="coffee-sale"><input v-model="enabled" type="checkbox" :disabled="locked"> 在售</label>
      <button class="admin-btn admin-btn--primary" type="submit" :disabled="locked || !changed || !validPrice">保存设置</button>
    </form>
    <p v-else-if="loading" role="status">正在读取咖啡设置…</p>
    <button v-else class="admin-btn" type="button" @click="load">重试读取</button>
    <AdminAlertBanner v-if="notice" tone="success" :message="notice" />
    <AdminAlertBanner v-if="error" tone="danger" :message="error" />
  </section>
</template>

<style scoped>
.coffee-settings { padding: 18px; }
.coffee-settings h2 { margin: 0; font-size: 16px; }
.coffee-settings > p { margin: 6px 0 14px; color: var(--admin-muted, currentColor); font-size: 13px; }
.coffee-settings-form { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.coffee-settings-form label { display: grid; gap: 5px; }
.coffee-settings-form .admin-input { width: 140px; }
.coffee-settings-form .coffee-sale { display: flex; align-items: center; min-height: 36px; }
</style>
