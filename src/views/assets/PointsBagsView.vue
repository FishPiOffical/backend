<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  adjustBag,
  chargePoint,
  deductPoint,
  exchangePoint,
  initPoint,
  paySalary,
  type BatchResultItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 积分操作、工资与背包调整视图：
 * 1. 所有积分与背包变更提交前先展示目标、方向、数量与影响摘要确认；
 * 2. 批量工资发放返回逐条成功/失败回执；
 * 3. 写入全部强制携带 Idempotency-Key。
 */
const auth = useAuthStore()
const route = useRoute()
const target = ref(typeof route.query.target === 'string' ? route.query.target : '')
const pointAmount = ref(100)
const pointMemo = ref('')
const chargeMode = ref<'direct' | 'sponsor'>('direct')
const pointAction = ref<'charge' | 'deduct' | 'init' | 'exchange'>('charge')

const bagItem = ref('')
const bagNumber = ref(1)
const bagMaxTake = ref(999999)

const salaryText = ref('')
const salaryResults = ref<BatchResultItem[]>([])
const salarySummary = ref('')

const confirmOpen = ref(false)
const pendingKind = ref<'point' | 'bag' | 'salary'>('point')
const pendingSummary = ref<{ label: string; value: string }[]>([])
const busy = ref(false)
const toast = ref('')

const canPointAdd = computed(() => Boolean(auth.capabilities?.actions.pointAdd))
const canPointDeduct = computed(() => Boolean(auth.capabilities?.actions.pointDeduct))
const canPointExchange = computed(() => Boolean(auth.capabilities?.actions.pointExchange))
const canBagAdjust = computed(() => Boolean(auth.capabilities?.actions.bagAdjust))
const canSalaryPay = computed(() => Boolean(auth.capabilities?.actions.salaryPay))

function openPointConfirm() {
  if (!target.value.trim() || pointAmount.value <= 0) return
  pendingKind.value = 'point'
  const opLabel = {
    charge: chargeMode.value === 'sponsor' ? '赞助充值(RMB折算80分)' : '直接充值积分',
    deduct: '违规扣除积分',
    init: '补发初始积分',
    exchange: '积分兑换扣减',
  }[pointAction.value]
  pendingSummary.value = [
    { label: '操作类型', value: opLabel },
    { label: '目标用户', value: target.value.trim() },
    { label: '数量', value: String(pointAmount.value) },
    { label: '备注', value: pointMemo.value.trim() || '-' },
  ]
  confirmOpen.value = true
}

function openBagConfirm() {
  if (!target.value.trim() || !bagItem.value.trim() || bagNumber.value === 0) return
  pendingKind.value = 'bag'
  pendingSummary.value = [
    { label: '操作类型', value: '调整用户背包道具' },
    { label: '目标用户', value: target.value.trim() },
    { label: '道具标识', value: bagItem.value.trim() },
    { label: '增减数量', value: String(bagNumber.value) },
  ]
  confirmOpen.value = true
}

function parseSalaryItems() {
  return salaryText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [u, amt, ...rest] = line.split(/[,，\s]+/)
      return { target: u || '', amount: Number(amt || 0), memo: rest.join(' ') || '后台工资发放' }
    })
}

function openSalaryConfirm() {
  const rows = parseSalaryItems()
  if (rows.length === 0) return
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)
  pendingKind.value = 'salary'
  pendingSummary.value = [
    { label: '操作类型', value: '批量发放工资' },
    { label: '发放人数', value: `${rows.length} 人` },
    { label: '预计总积分', value: String(total) },
  ]
  confirmOpen.value = true
}

async function executeConfirmed() {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    if (pendingKind.value === 'point') {
      const t = target.value.trim()
      const m = pointMemo.value.trim()
      if (pointAction.value === 'charge') {
        await chargePoint({ target: t, amount: pointAmount.value, mode: chargeMode.value, memo: m || '后台充值' }, createIdempotencyKey('pt-charge'))
      } else if (pointAction.value === 'deduct') {
        await deductPoint({ target: t, point: pointAmount.value, memo: m }, createIdempotencyKey('pt-deduct'))
      } else if (pointAction.value === 'init') {
        await initPoint({ target: t, point: pointAmount.value, memo: m }, createIdempotencyKey('pt-init'))
      } else {
        await exchangePoint({ target: t, point: pointAmount.value, memo: m }, createIdempotencyKey('pt-exchange'))
      }
      toast.value = '积分操作执行成功'
    } else if (pendingKind.value === 'bag') {
      await adjustBag(
        { target: target.value.trim(), item: bagItem.value.trim(), number: bagNumber.value, maxTake: bagMaxTake.value },
        createIdempotencyKey('bag-adj'),
      )
      toast.value = '背包调整执行成功'
    } else {
      const res = await paySalary(parseSalaryItems(), createIdempotencyKey('salary-pay'))
      salaryResults.value = res.results
      salarySummary.value = `发放完成：成功 ${res.successCount} 笔，失败 ${res.failureCount} 笔，实发总积分 ${res.totalAmount}`
      toast.value = salarySummary.value
    }
    confirmOpen.value = false
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '操作执行失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>积分、工资与背包调整</h2>
        <p class="admin-muted">受严格事务与幂等键保护；所有资金与道具变动均在确认摘要后执行。</p>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div class="grid-3">
      <div class="sub-card">
        <h3>积分操作</h3>
        <div class="form-grid">
          <label class="admin-field"><input aria-label="目标用户名或 ID" v-model="target" class="admin-input" placeholder="目标用户名或 ID" /></label>
          <select aria-label="积分操作" v-model="pointAction" class="admin-select">
            <option v-if="canPointAdd" value="charge">充值积分</option>
            <option v-if="canPointDeduct" value="deduct">扣除违规积分</option>
            <option v-if="canPointAdd" value="init">补发初始积分</option>
            <option v-if="canPointExchange" value="exchange">积分兑换扣减</option>
          </select>
          <select aria-label="充值方式" v-if="pointAction === 'charge'" v-model="chargeMode" class="admin-select">
            <option value="direct">direct（直接增加积分）</option>
            <option value="sponsor">sponsor（RMB 金额 × 80 折算）</option>
          </select>
          <label class="admin-field"><input aria-label="数量" v-model.number="pointAmount" class="admin-input" type="number" min="1" placeholder="数量" /></label>
          <label class="admin-field"><input aria-label="备注说明" v-model="pointMemo" class="admin-input" placeholder="备注说明" /></label>
          <button class="admin-btn admin-btn--primary" type="button" @click="openPointConfirm">核对摘要并提交</button>
        </div>
      </div>

      <div v-if="canBagAdjust" class="sub-card">
        <h3>背包道具调整</h3>
        <div class="form-grid">
          <label class="admin-field"><input aria-label="目标用户名或 ID" v-model="target" class="admin-input" placeholder="目标用户名或 ID" /></label>
          <label class="admin-field"><input aria-label="道具 ID / 标识" v-model="bagItem" class="admin-input" placeholder="道具 ID / 标识" /></label>
          <label class="admin-field"><input aria-label="增减数量（正增负减）" v-model.number="bagNumber" class="admin-input" type="number" placeholder="增减数量（正增负减）" /></label>
          <label class="admin-field"><input aria-label="携带上限" v-model.number="bagMaxTake" class="admin-input" type="number" min="0" placeholder="携带上限" /></label>
          <button class="admin-btn admin-btn--primary" type="button" @click="openBagConfirm">核对摘要并调整</button>
        </div>
      </div>

      <div v-if="canSalaryPay" class="sub-card">
        <h3>批量发放工资</h3>
        <p class="admin-muted">每行格式：<code>用户名,金额,备注</code></p>
        <div class="form-grid">
          <label class="admin-field"><textarea aria-label="alice,500,四月版主补贴" v-model="salaryText" class="admin-textarea" rows="5" placeholder="alice,500,四月版主补贴" /></label>
          <button class="admin-btn admin-btn--primary" type="button" @click="openSalaryConfirm">核对总额并发放</button>
        </div>
      </div>
    </div>

    <div v-if="salaryResults.length" class="sub-card" style="margin-top: 1rem;">
      <h4>{{ salarySummary }}</h4>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr><th>目标</th><th>金额</th><th>结果</th><th>流水 / 错误</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, idx) in salaryResults" :key="idx">
            <td>{{ r.userName || r.target }}</td>
            <td>{{ r.amount ?? '-' }}</td>
            <td>{{ r.ok ? '成功' : '失败' }}</td>
            <td>{{ r.ok ? r.transferId : r.error }}</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      title="确认执行资产操作"
      description="请核对以下目标、方向与数量摘要："
      :summary-items="pendingSummary"
      :loading="busy"
      @cancel="confirmOpen = false"
      @confirm="executeConfirmed"
    />
      </section>
  </div>
</template>

<style scoped>
.grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 1rem; }
.sub-card { border: 1px solid var(--fp-border); border-radius: 8px; padding: 0.9rem; }
.form-grid { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
</style>
