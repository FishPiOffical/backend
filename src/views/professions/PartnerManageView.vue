<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { fetchPartnerLedger, fetchPartnerReport, updatePartnerRate, type PartnerPolicy, type PartnerReport } from '@/api/adminStage4'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import AdminPageHeader from '@/components/common/AdminPageHeader.vue'
import AdminPagination from '@/components/common/AdminPagination.vue'
import { useAuthStore } from '@/stores/auth'
import { assetRecoveryBusy, assetRecoveryReceipt, pendingAssetWrite } from '@/stores/assetRecovery'
import { useDirectoryRows } from '@/views/ops/useDirectoryRows'
import { ApiError } from '@/api/http'

const auth = useAuthStore()
const report = ref<PartnerReport>(), draft = ref<PartnerPolicy>()
const searchUser = ref(''), searchRef = ref(''), userId = ref(''), referenceId = ref('')
const reading = ref(false), saving = ref(false), error = ref(''), message = ref('')
const locked = computed(() => reading.value || saving.value || assetRecoveryBusy.value || !!pendingAssetWrite.value)
let request: AbortController | undefined, disposed = false
const date = (ms: number) => new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const ratio = (a: number, b: number) => b ? (a * 100 / b).toFixed(1) + '%' : '暂无样本'
const metrics = computed(() => {
  if (!report.value) return []
  const { occupancy: o, money: m, pairs: p, policy, from } = report.value
  return [
    ['已加入人数', o.joinedCount, '当前参与搭班的账号'],
    ['满位率', ratio(o.fullCount, o.joinedCount), o.fullCount + ' 人已用完邀请位'],
    ['人均日营业收入', m.earningDays ? (m.income / m.earningDays).toFixed(1) : '暂无样本', '近七日，仅统计有收入的人日'],
    ['游园币净投放', m.netIssued, '近七日营业收入扣除开位费与转手手续费'],
    ['半小时内反向转手率', ratio(p.quickReturns, p.transfers), '自 ' + date(Math.max(from, policy.sinceAt)) + ' 起，' + p.transfers + ' 次转手中有 ' + p.quickReturns + ' 次转回，仅供观察'],
  ]
})
const labels: Record<string,string> = { 'partner-income':'营业收入', 'partner-hire':'邀请搭班', 'partner-return':'返还与结算', 'partner-share':'转手分成', 'partner-slot':'开通邀请位' }
async function refresh() {
  request?.abort()
  const current = new AbortController()
  request = current
  reading.value = true
  error.value = ''
  try {
    const data = await fetchPartnerReport(current.signal)
    if (current.signal.aborted) return
    report.value = data
    const { baseRate, stepRate, version } = data.policy
    draft.value = { baseRate, stepRate, version }
  } catch (e) {
    if (!current.signal.aborted) { report.value = draft.value = undefined; error.value = e instanceof Error ? e.message : '读取失败' }
  } finally { if (!current.signal.aborted) reading.value = false }
}
async function save() {
  if (!draft.value || locked.value) return
  const epoch = auth.sessionEpoch
  saving.value = true
  message.value = error.value = ''
  try {
    await updatePartnerRate({ ...draft.value })
    if (disposed || epoch !== auth.sessionEpoch) return
    message.value = '新费率已保存'
    await refresh()
  } catch (e) {
    if (disposed || epoch !== auth.sessionEpoch) return
    if (e instanceof ApiError && e.errorCode === 'partner_rate_changed') await refresh()
    if (!disposed && epoch === auth.sessionEpoch) error.value = e instanceof Error ? e.message : '保存失败'
  } finally { if (!disposed && epoch === auth.sessionEpoch) saving.value = false }
}
watch(() => auth.sessionEpoch, () => {
  request?.abort()
  report.value = draft.value = undefined
  saving.value = reading.value = false
  searchUser.value = searchRef.value = userId.value = referenceId.value = error.value = message.value = ''
  if (auth.capabilities?.isAdmin) void refresh()
}, { immediate: true, flush: 'sync' })
watch(assetRecoveryReceipt, r => { if (r && typeof r === 'object' && 'partnerRateVersion' in r) void refresh() })
const ledger = useDirectoryRows((page, signal) => fetchPartnerLedger(userId.value, referenceId.value, page, signal))
function filter() {
  userId.value = searchUser.value.trim()
  referenceId.value = searchRef.value.trim()
  void ledger.load(1)
}
onScopeDispose(() => { disposed = true; request?.abort() })
</script>
<template>
  <main class="admin-page">
    <AdminPageHeader title="搭子管理" />
    <section class="admin-panel">
      <header><h2>营业概况</h2><button class="admin-btn" :disabled="locked" @click="refresh">刷新数据</button></header>
      <small v-if="report">{{ date(report.from) }} 至 {{ date(report.asOf) }}（北京时间）</small>
      <dl><div v-for="[label,value,detail] in metrics" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd><small>{{ detail }}</small></div></dl>
      <p v-if="reading">正在读取…</p>
    </section>
    <section class="admin-panel">
      <h2>营业费率</h2><p>新成交的搭班使用新费率，已有搭班继续按成交时的费率结算。</p>
      <form v-if="draft" @submit.prevent="save">
        <label>基础时薪（币）<input class="admin-input" v-model.number="draft.baseRate" required type="number" min="1" max="1000" :disabled="locked"></label>
        <label>身价每涨 20 币的时薪增量<input class="admin-input" v-model.number="draft.stepRate" required type="number" min="0" max="100" :disabled="locked"></label>
        <button class="admin-btn admin-btn--primary" :disabled="locked">保存费率</button>
      </form>
      <AdminAlertBanner v-if="message" tone="success" :message="message" />
      <AdminAlertBanner v-if="error" tone="danger" :message="error" />
    </section>
    <section class="admin-panel">
      <h2>游园币流水</h2>
      <form @submit.prevent="filter">
        <label>用户 UID<input class="admin-input" v-model="searchUser" inputmode="numeric" pattern="[1-9][0-9]{0,18}"></label>
        <label>交易单号<input class="admin-input" v-model="searchRef" inputmode="numeric" pattern="[0-9]{1,32}"></label>
        <button class="admin-btn">查询</button>
      </form>
      <AdminAlertBanner v-if="ledger.error.value" tone="danger" :message="ledger.error.value" />
      <p v-else-if="ledger.loading.value">正在读取…</p>
      <p v-else-if="!ledger.rows.value.length">没有符合条件的流水。</p>
      <div v-else class="table-scroll"><table><thead><tr><th>北京时间</th><th>用户 UID</th><th>操作</th><th>游园币</th><th>交易单号</th></tr></thead>
        <tbody><tr v-for="e in ledger.rows.value" :key="e.oId"><td>{{ date(e.createdAt) }}</td><td>{{ e.userId }}</td><td>{{ labels[e.operation] || e.operation }}</td><td>{{ e.coinDelta > 0 ? '+' : '' }}{{ e.coinDelta }}</td><td>{{ e.referenceId }}</td></tr></tbody></table></div>
      <AdminPagination v-if="ledger.pagination.value.pageCount > 1" :page="ledger.pagination.value.p" :page-count="ledger.pagination.value.pageCount" :page-size="ledger.pagination.value.size" :total="ledger.pagination.value.total" :disabled="ledger.loading.value" @update:page="ledger.load" />
    </section>
  </main>
</template>
<style scoped>
.admin-panel { padding:18px; min-width:0 }
header, form { display:flex; align-items:center; gap:12px; flex-wrap:wrap }
header { justify-content:space-between }
h2 { font-size:17px; margin:0 }
form { align-items:end; margin:12px 0 }
label { display:grid; gap:4px; max-width:100% }
input { max-width:100% }
dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr)); gap:16px }
dd { font-size:23px; font-weight:650; margin:4px 0 }
.table-scroll { overflow:auto }
table { width:100%; border-collapse:collapse }
th,td { text-align:left; padding:8px; white-space:nowrap; border-bottom:1px solid var(--admin-border) }
</style>
