<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import JsonFields from '@/components/config/JsonFields.vue'
import { clone, mergeBenefits, parseObject, vipLevelPayload, type JsonObject } from '@/utils/configuration'
import { useAuthStore } from '@/stores/auth'
import {
  addCoupon,
  addVipLevel,
  extendUserVip,
  fetchCoupons,
  fetchUserVips,
  fetchVipLevels,
  grantUserVip,
  refundUserVip,
  removeCoupon,
  removeVipLevel,
  updateCouponTimes,
  updateUserVip,
  updateVipLevel,
  type CouponItem,
  type Stage3Pagination,
  type UserVipItem,
  type VipLevelItem,
} from '@/api/admin'
import { ApiError, createIdempotencyKey } from '@/api/http'
import { formatDateTime } from '@/utils/format'

/**
 * VIP 与套餐优惠券管理视图：
 * 1. 分离用户 VIP 实例维护、VIP 等级配置与优惠券管理；
 * 2. 优惠券次数 -1 明确标识为“无限制”；
 * 3. 支持按天数续期及按剩余天数折算积分退订并停用。
 */
const route = useRoute()
const tab = ref<'users' | 'levels' | 'coupons'>('users')
const toast = ref('')
const busy = ref(false)

// 用户 VIP
const userVips = ref<UserVipItem[]>([])
const vipPagination = ref<Stage3Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const filterUserName = ref(typeof route.query.target === 'string' ? route.query.target : '')
const filterLvCode = ref('')
const filterState = ref<'' | '0' | '1'>('')
const grantTarget = ref(typeof route.query.target === 'string' ? route.query.target : '')
const grantLevelOId = ref('')
const extendDaysMap = ref<Record<string, number>>({})
const editUserLvMap = ref<Record<string, string>>({})

// 等级
const levels = ref<VipLevelItem[]>([])
const newLevel = ref<JsonObject>({ lvCode: '', lvName: '', price: 1000, durationType: '', durationValue: 30 })
const levelId = ref('')
const levelBenefits = ref<JsonObject>({})
const userEdit = ref<UserVipItem | null>(null)
const userBenefits = ref<JsonObject>({})
const grantBenefits = ref<JsonObject>({})
const configError = ref('')
const editorDirty = ref(false)
const auth = useAuthStore()
const grantLevel = computed(() => levels.value.find(item => item.oId === grantLevelOId.value))
watch(grantLevel, (level) => {
  try { grantBenefits.value = parseObject(level?.benefits); configError.value = '' }
  catch (error) { grantBenefits.value = {}; configError.value = String(error) }
})
watch([newLevel, levelBenefits, userBenefits], () => { editorDirty.value = true }, { deep: true })
function editLevel(level?: VipLevelItem) {
  if (editorDirty.value && !window.confirm('放弃当前未保存的配置？')) return
  try {
    const benefits = parseObject(level?.benefits)
    levelId.value = level?.oId || ''
    newLevel.value = level ? { lvCode: level.lvCode, lvName: level.lvName, price: level.price, durationType: level.durationType, durationValue: level.durationValue } : { lvCode: '', lvName: '', price: 1000, durationType: '', durationValue: 30 }
    levelBenefits.value = benefits
    void nextTick(() => { editorDirty.value = false })
    configError.value = ''
  } catch (error) { configError.value = String(error) }
}
function editUserBenefits(row: UserVipItem) {
  if (editorDirty.value && !window.confirm('放弃当前未保存的配置？')) return
  try {
    const matching = levels.value.filter(level => level.lvCode === row.lvCode)
    userEdit.value = clone(row)
    // 现有用户配置原样保留；仅唯一模板时补齐缺省值，避免同代码多套餐误匹配。
    userBenefits.value = matching.length === 1 ? mergeBenefits(matching[0]?.benefits, row.configJson) : parseObject(row.configJson)
    configError.value = ''
    void nextTick(() => { editorDirty.value = false })
  } catch (error) { configError.value = String(error); userEdit.value = null }
}
function closeUserEditor() { if (!editorDirty.value || window.confirm('放弃当前未保存的配置？')) { userEdit.value = null; editorDirty.value = false } }
async function saveUserBenefits() {
  if (!userEdit.value || busy.value || !window.confirm('确认保存该用户的会员权益配置？')) return
  busy.value = true
  try {
    const configJson = JSON.stringify(userBenefits.value)
    if (configJson.length > 4096) throw new Error('用户权益配置不能超过 4096 字符')
    await updateUserVip(userEdit.value.userId, { configJson }, createIdempotencyKey('vip-benefits'))
    userEdit.value = null; editorDirty.value = false; toast.value = '用户权益配置已保存'
    await loadUserVips(vipPagination.value.page)
  } catch (error) { toast.value = error instanceof Error ? error.message : '保存失败' }
  finally { busy.value = false }
}
watch(() => auth.sessionEpoch, () => {
  userEdit.value = null; userBenefits.value = {}; grantBenefits.value = {}; levelBenefits.value = {}; levels.value = []; userVips.value = []; coupons.value = []; configError.value = ''; toast.value = ''; editorDirty.value = false
})
onBeforeRouteLeave(() => !editorDirty.value || window.confirm('配置尚未保存，确认离开？'))

// 优惠券
const coupons = ref<CouponItem[]>([])
const newCoupon = ref({ couponCode: '', couponType: 0, discount: 90, times: -1 })

async function loadLevels() {
  const epoch = auth.sessionEpoch
  const res = await fetchVipLevels()
  if (epoch !== auth.sessionEpoch) return
  levels.value = res.items
  if (!grantLevelOId.value && res.items.length > 0) {
    grantLevelOId.value = res.items[0].oId
  }
}

async function loadUserVips(page = 1) {
  const epoch = auth.sessionEpoch
  const res = await fetchUserVips({
    p: page,
    size: 20,
    userName: filterUserName.value.trim(),
    lvCode: filterLvCode.value.trim(),
    state: filterState.value,
  })
  if (epoch !== auth.sessionEpoch) return
  userVips.value = res.items
  vipPagination.value = res.pagination
}

async function loadCoupons() {
  const epoch = auth.sessionEpoch
  const res = await fetchCoupons()
  if (epoch !== auth.sessionEpoch) return
  coupons.value = res.items
}

async function refreshAll() {
  try {
    await Promise.all([loadLevels(), loadUserVips(1), loadCoupons()])
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '加载 VIP 数据失败'
  }
}

async function handleGrantVip() {
  if (!grantTarget.value.trim() || !grantLevelOId.value || busy.value || configError.value) return
  if (JSON.stringify(grantBenefits.value).length > 4096) { toast.value = '用户权益配置不能超过 4096 字符'; return }
  busy.value = true
  toast.value = ''
  try {
    await grantUserVip(
      { target: grantTarget.value.trim(), levelOId: grantLevelOId.value, configJson: JSON.stringify(grantBenefits.value) },
      createIdempotencyKey('vip-grant'),
    )
    toast.value = `已为用户 ${grantTarget.value} 开通 VIP 并发放初始礼包`
    await loadUserVips(vipPagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '开通 VIP 失败'
  } finally {
    busy.value = false
  }
}

async function handleExtendVip(row: UserVipItem) {
  const days = extendDaysMap.value[row.userId] || 30
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await extendUserVip(row.userId, days, createIdempotencyKey('vip-extend'))
    toast.value = `已延长用户 ${row.userName || row.userId} ${days} 天 VIP`
    await loadUserVips(vipPagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '延长 VIP 失败'
  } finally {
    busy.value = false
  }
}

async function handleToggleVipState(row: UserVipItem) {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    const nextState = row.state === 1 ? 0 : 1
    await updateUserVip(
      row.userId,
      {
        state: nextState,
        lvCode: editUserLvMap.value[row.userId] || row.lvCode,
      },
      createIdempotencyKey('vip-state'),
    )
    toast.value = `已将 ${row.userName || row.userId} 的 VIP 状态更新为${nextState === 1 ? '有效' : '停用'}`
    await loadUserVips(vipPagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新 VIP 状态失败'
  } finally {
    busy.value = false
  }
}

async function handleRefundVip(row: UserVipItem) {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await refundUserVip(row.userId, createIdempotencyKey('vip-refund'))
    toast.value = `已按剩余天数退订 ${row.userName || row.userId} 的 VIP`
    await loadUserVips(vipPagination.value.page)
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '退订 VIP 失败'
  } finally {
    busy.value = false
  }
}

async function handleAddLevel() {
  if (busy.value || configError.value) return
  busy.value = true
  try {
    const payload = vipLevelPayload(newLevel.value, levelBenefits.value)
    if (!window.confirm(`确认${levelId.value ? '更新' : '新增'}套餐「${payload.lvName}」及权益模板？`)) return
    if (levelId.value) await updateVipLevel(levelId.value, payload, createIdempotencyKey('vip-level-edit'))
    else await addVipLevel(payload, createIdempotencyKey('vip-level-add'))
    editorDirty.value = false; toast.value = '会员套餐及权益模板已保存'
    await loadLevels()
  } catch (error) { toast.value = error instanceof Error ? error.message : '保存失败' }
  finally { busy.value = false }
}

async function handleRemoveLevel(lv: VipLevelItem) {
  if (busy.value) return
  busy.value = true
  try {
    await removeVipLevel(lv.oId, createIdempotencyKey('vip-lv-del'))
    toast.value = `已删除等级 ${lv.lvName}`
    await loadLevels()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除等级失败'
  } finally {
    busy.value = false
  }
}

async function handleAddCoupon() {
  if (busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await addCoupon(
      {
        couponCode: newCoupon.value.couponCode.trim() || undefined,
        couponType: newCoupon.value.couponType,
        discount: newCoupon.value.discount,
        times: newCoupon.value.times,
      },
      createIdempotencyKey('coupon-add'),
    )
    newCoupon.value.couponCode = ''
    toast.value = '创建优惠券成功'
    await loadCoupons()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '创建优惠券失败'
  } finally {
    busy.value = false
  }
}

async function handleUpdateCouponTimes(coupon: CouponItem, times: number) {
  if (busy.value) return
  busy.value = true
  try {
    await updateCouponTimes(coupon.oId, times, createIdempotencyKey('coupon-upd'))
    toast.value = `已更新优惠券 ${coupon.couponCode} 可用次数`
    await loadCoupons()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新优惠券失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveCoupon(coupon: CouponItem) {
  if (busy.value) return
  busy.value = true
  try {
    await removeCoupon(coupon.oId, createIdempotencyKey('coupon-del'))
    toast.value = `已删除优惠券 ${coupon.couponCode}`
    await loadCoupons()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '删除优惠券失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h2>VIP 与套餐优惠券</h2>
        <p class="admin-muted">管理用户 VIP 会员实例、VIP 等级配置及优惠券（次数 -1 表示无限制）。</p>
      </div>
      <div class="tab-row">
        <button class="admin-btn" :class="{ 'admin-btn--primary': tab === 'users' }" @click="tab = 'users'">用户 VIP 实例</button>
        <button class="admin-btn" :class="{ 'admin-btn--primary': tab === 'levels' }" @click="tab = 'levels'">VIP 等级配置</button>
        <button class="admin-btn" :class="{ 'admin-btn--primary': tab === 'coupons' }" @click="tab = 'coupons'">优惠券管理</button>
      </div>
    </div>
    <section class="admin-panel">

    <p v-if="configError" class="admin-alert admin-alert--danger" role="alert">{{ configError }}</p>
    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div v-if="tab === 'users'">
      <form class="admin-filter-bar toolbar-gap" @submit.prevent="handleGrantVip">
        <label class="admin-field"><input aria-label="用户名或用户 ID" v-model="grantTarget" class="admin-input" placeholder="用户名或用户 ID" required /></label>
        <label class="admin-field"><span class="admin-field__label">会员套餐</span><select aria-label="会员套餐" v-model="grantLevelOId" class="admin-select">
          <option v-for="lv in levels" :key="lv.oId" :value="lv.oId">{{ lv.lvName }} ({{ lv.lvCode }})</option>
        </select></label>
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="busy || !!configError">免费开通 VIP（含初始礼包）</button>
        <JsonFields v-model="grantBenefits" label="开通权益（按所选套餐模板）" :disabled="busy || !!configError" fixed-keys style="flex-basis:100%" />
      </form>

      <div class="admin-filter-bar toolbar-gap admin-search-bar">
        <input aria-label="按用户名检索" v-model="filterUserName" class="admin-input" placeholder="按用户名检索" @keyup.enter="loadUserVips(1)" />
        <input aria-label="等级代码" v-model="filterLvCode" class="admin-input" placeholder="等级代码" @keyup.enter="loadUserVips(1)" />
        <select aria-label="会员状态" v-model="filterState" class="admin-select" @change="loadUserVips(1)">
          <option value="">全部状态</option>
          <option value="1">有效</option>
          <option value="0">已停用</option>
        </select>
        <button class="admin-btn admin-btn--secondary" @click="loadUserVips(1)">查询</button>
      </div>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>等级</th>
            <th>状态</th>
            <th>到期时间</th>
            <th>续期 / 运维</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in userVips" :key="row.userId">
            <td>{{ row.userName || row.userId }}</td>
            <td>{{ row.lvCode }}</td>
            <td>{{ row.state === 1 ? '有效' : '已停用' }}</td>
            <td>{{ row.expiresAt ? formatDateTime(row.expiresAt) : '-' }}</td>
            <td>
              <div class="btn-row">
                <button class="admin-btn admin-btn--sm" :disabled="busy" @click="editUserBenefits(row)">编辑权益</button>
                <input aria-label="30天" v-model.number="extendDaysMap[row.userId]" class="admin-input num-input" type="number" min="1" placeholder="30天" />
                <button class="admin-btn admin-btn--sm admin-btn--primary" :disabled="busy" @click="handleExtendVip(row)">续期</button>
                <button class="admin-btn admin-btn--sm" :disabled="busy" @click="handleToggleVipState(row)">
                  {{ row.state === 1 ? '停用' : '启用' }}
                </button>
                <button v-if="row.state === 1" class="admin-btn admin-btn--sm admin-btn--danger" :disabled="busy" @click="handleRefundVip(row)">
                  折算退订
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table></div>

      <form v-if="userEdit" class="editor-form" @submit.prevent="saveUserBenefits">
        <h3>用户 {{ userEdit.userName || userEdit.userId }} 的会员权益</h3>
        <JsonFields v-model="userBenefits" label="用户权益" :disabled="busy" fixed-keys />
        <button class="admin-btn admin-btn--primary" :disabled="busy">保存用户权益</button>
        <button class="admin-btn" type="button" :disabled="busy" @click="closeUserEditor">关闭编辑</button>
      </form>
      <div class="pager-bar">
        <button class="admin-btn admin-btn--sm" :disabled="vipPagination.page <= 1" @click="loadUserVips(vipPagination.page - 1)">上一页</button>
        <span>第 {{ vipPagination.page }} / {{ vipPagination.totalPages }} 页（共 {{ vipPagination.total }} 条）</span>
        <button class="admin-btn admin-btn--sm" :disabled="vipPagination.page >= vipPagination.totalPages" @click="loadUserVips(vipPagination.page + 1)">下一页</button>
      </div>
    </div>

    <div v-else-if="tab === 'levels'">
      <form class="editor-form" @submit.prevent="handleAddLevel">
        <h3>{{ levelId ? '编辑套餐' : '新增套餐' }}</h3>
        <div class="editor-grid">
          <label>等级代码<input v-model="newLevel.lvCode" class="admin-input" required maxlength="64" /></label>
          <label>等级名称<input v-model="newLevel.lvName" class="admin-input" required maxlength="64" /></label>
          <label>积分价格<input v-model.number="newLevel.price" class="admin-input" type="number" min="0" required /></label>
          <label>周期类型<input v-model="newLevel.durationType" class="admin-input" list="vip-duration-types" required placeholder="沿用已有套餐类型" /></label>
          <datalist id="vip-duration-types"><option v-for="value in [...new Set(levels.map(item => item.durationType))]" :key="value" :value="value" /></datalist>
          <label>有效天数<input v-model.number="newLevel.durationValue" class="admin-input" type="number" min="1" step="1" required /></label>
        </div>
        <JsonFields v-model="levelBenefits" label="权益模板" :disabled="busy || !!configError" />
        <button class="admin-btn admin-btn--primary" :disabled="busy || !!configError">保存套餐与权益</button>
        <button type="button" class="admin-btn" :disabled="busy" @click="editLevel()">新建套餐</button>
      </form>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>价格(积分)</th>
            <th>周期(天)</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lv in levels" :key="lv.oId">
            <td><code>{{ lv.lvCode }}</code></td>
            <td>{{ lv.lvName }}</td>
            <td>{{ lv.price }}</td>
            <td>{{ lv.durationValue }} 天（{{ lv.durationType }}）</td>
            <td>
              <div class="btn-row">
                <button class="admin-btn admin-btn--sm" :disabled="busy" @click="editLevel(lv)">编辑套餐与权益</button>
                <button class="admin-btn admin-btn--sm admin-btn--danger" :disabled="busy" @click="handleRemoveLevel(lv)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div v-else>
      <form class="admin-filter-bar toolbar-gap" @submit.prevent="handleAddCoupon">
        <label class="admin-field"><input aria-label="自定义码(8-32位，留空自动生成)" v-model="newCoupon.couponCode" class="admin-input" placeholder="自定义码(8-32位，留空自动生成)" /></label>
        <select aria-label="优惠券类型" v-model.number="newCoupon.couponType" class="admin-select">
          <option :value="0">折扣百分比(1-100)</option>
          <option :value="1">立减积分</option>
        </select>
        <label class="admin-field"><input aria-label="数值" v-model.number="newCoupon.discount" class="admin-input num-input" type="number" min="1" placeholder="数值" /></label>
        <label class="admin-field"><input aria-label="次数(-1无限)" v-model.number="newCoupon.times" class="admin-input num-input" type="number" min="-1" placeholder="次数(-1无限)" /></label>
        <button class="admin-btn admin-btn--primary" type="submit" :disabled="busy">创建优惠券</button>
      </form>

      <div class="admin-table-wrap"><table class="admin-table">
        <thead>
          <tr>
            <th>优惠券码</th>
            <th>类型</th>
            <th>优惠值</th>
            <th>剩余次数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in coupons" :key="c.oId">
            <td><code>{{ c.couponCode }}</code></td>
            <td>{{ c.couponType === 0 ? '折扣%' : '直减积分' }}</td>
            <td>{{ c.discount }}</td>
            <td>{{ c.times === -1 ? '无限制 (-1)' : c.times }}</td>
            <td>
              <div class="btn-row">
                <button class="admin-btn admin-btn--sm" :disabled="busy" @click="handleUpdateCouponTimes(c, -1)">设为无限(-1)</button>
                <button class="admin-btn admin-btn--sm" :disabled="busy" @click="handleUpdateCouponTimes(c, 10)">设为10次</button>
                <button class="admin-btn admin-btn--sm admin-btn--danger" :disabled="busy" @click="handleRemoveCoupon(c)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table></div>
    </div>
      </section>
  </div>
</template>

<style scoped>
.toolbar-gap { margin-bottom: 0.75rem; }
.num-input { width: 96px; }
</style>
