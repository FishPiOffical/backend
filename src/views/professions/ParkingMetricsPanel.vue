<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { fetchParkingMetrics, type ParkingMetrics } from '@/api/adminStage4'
import AdminAlertBanner from '@/components/common/AdminAlertBanner.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const report = ref<ParkingMetrics | null>(null)
const error = ref('')
const reading = ref(false)
let controller: AbortController | undefined
async function read() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  reading.value = true
  error.value = ''
  try {
    const result = await fetchParkingMetrics(request.signal)
    if (!request.signal.aborted) report.value = result
  } catch (e) {
    if (!request.signal.aborted) error.value = e instanceof Error ? e.message : '指标读取失败'
  } finally {
    if (!request.signal.aborted) reading.value = false
  }
}
watch(() => auth.sessionEpoch, () => { report.value = null; void read() }, { immediate: true, flush: 'sync' })
onScopeDispose(() => controller?.abort())
const dates = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
const formatRatio = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })
function ratio(label: string, sample: ParkingMetrics['firstPark'], unit: string) {
  return { label, value: sample.samples ? formatRatio.format(sample.hits / sample.samples) : '暂无样本', detail: sample.hits + ' / ' + sample.samples + ' ' + unit }
}
function duration(ms: number) {
  if (ms < 60000) return '不足 1 分钟'
  if (ms < 3600000) return Math.floor(ms / 60000) + ' 分钟'
  return Number((ms / 3600000).toFixed(1)) + ' 小时'
}
const cards = computed(() => {
  const data = report.value
  if (!data) return []
  return [
    ratio('首次停车成功率', data.firstPark, '位新车主'),
    ratio('找不到车位的比例', data.emptySearch, '次找位'),
    { label: '首辆进阶车购入用时', value: data.upgrade.meanMs == null ? '暂无样本' : duration(data.upgrade.meanMs),
      detail: data.upgrade.samples + ' 位已购车车主的平均值' },
    ratio('被贴条后次日回访率', data.nextDay, '车主人次'),
    ratio('重复互停订单占比', data.repeatPairs, '笔停车单'),
  ]
})
</script>
<template>
  <section class="admin-panel metrics" aria-labelledby="parking-metrics-title">
    <header><div><h2 id="parking-metrics-title">停车运营指标</h2>
      <p v-if="report">北京时间 {{ dates.format(report.from) }} 至 {{ dates.format(report.asOf) }} · 含今天</p></div>
      <button class="admin-btn" :disabled="reading" @click="read">刷新指标</button></header>
    <AdminAlertBanner v-if="error" tone="danger" :message="error" />
    <p v-if="reading && !report" role="status">正在读取指标…</p>
    <dl v-if="report"><div v-for="card in cards" :key="card.label"><dt>{{ card.label }}</dt>
      <dd>{{ card.value }}</dd><dd class="detail">{{ card.detail }}</dd></div></dl>
    <details><summary>统计口径</summary>
      <p>首次停车和进阶购车从本版领取初始车开始记录。找位按每位车主每天在「全部」和「我关注的」各自的首次查询计算。次日回访只计已完整度过次日的样本。两人各停到对方车位至少两次，该组合的订单才计入重复互停。</p>
    </details>
  </section>
</template>
<style scoped>
.metrics { min-width:0; padding:18px; }
header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
h2 { margin:0; font-size:17px; }
p,.detail,details { color:var(--admin-text-muted, inherit); font-size:13px; }
p { margin:4px 0 0; line-height:1.6; }
dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(165px,100%),1fr)); gap:16px; margin:18px 0; }
dl div { border-inline-start:2px solid var(--admin-border); padding-inline-start:12px; }
dt { font-size:13px; }
dd { margin:5px 0 0; font-size:21px; font-weight:650; font-variant-numeric:tabular-nums; }
.detail { font-weight:400; }
summary { cursor:pointer; width:fit-content; }
</style>
