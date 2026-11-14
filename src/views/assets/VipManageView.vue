<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
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
const newLevel = ref({ lvCode: '', name: '', price: 1000, durationDays: 30, sortOrder: 10, description: '' })

// 优惠券
const coupons = ref<CouponItem[]>([])
const newCoupon = ref({ couponCode: '', couponType: 0, discount: 90, times: -1 })

async function loadLevels() {
  const res = await fetchVipLevels()
  levels.value = res.items
  if (!grantLevelOId.value && res.items.length > 0) {
    grantLevelOId.value = res.items[0].oId
  }
}

async function loadUserVips(page = 1) {
  const res = await fetchUserVips({
    p: page,
    size: 20,
    userName: filterUserName.value.trim(),
    lvCode: filterLvCode.value.trim(),
    state: filterState.value,
  })
  userVips.value = res.items
  vipPagination.value = res.pagination
}

async function loadCoupons() {
  const res = await fetchCoupons()
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
  if (!grantTarget.value.trim() || !grantLevelOId.value || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await grantUserVip(
      { target: grantTarget.value.trim(), levelOId: grantLevelOId.value },
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
  if (!newLevel.value.lvCode.trim() || !newLevel.value.name.trim() || busy.value) return
  busy.value = true
  toast.value = ''
  try {
    await addVipLevel({ ...newLevel.value, enabled: 1 }, createIdempotencyKey('vip-lv-add'))
    newLevel.value = { lvCode: '', name: '', price: 1000, durationDays: 30, sortOrder: 10, description: '' }
    toast.value = '新增 VIP 等级成功'
    await loadLevels()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '新增 VIP 等级失败'
  } finally {
    busy.value = false
  }
}

async function handleBumpLevelPrice(lv: VipLevelItem, delta: number) {
  if (busy.value) return
  busy.value = true
  try {
    await updateVipLevel(lv.oId, { price: Math.max(0, lv.price + delta) }, createIdempotencyKey('vip-lv-upd'))
    toast.value = `已更新 ${lv.name} 价格`
    await loadLevels()
  } catch (err) {
    toast.value = err instanceof ApiError ? err.message : '更新等级失败'
  } finally {
    busy.value = false
  }
}

async function handleRemoveLevel(lv: VipLevelItem) {
  if (busy.value) return
  busy.value = true
  try {
    await removeVipLevel(lv.oId, createIdempotencyKey('vip-lv-del'))
    toast.value = `已删除等级 ${lv.name}`
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
  <section class="panel-card">
    <div class="panel-head">
      <div>
        <h2>VIP 与套餐优惠券</h2>
        <p class="muted">管理用户 VIP 会员实例、VIP 等级配置及优惠券（次数 -1 表示无限制）。</p>
      </div>
      <div class="tab-row">
        <button class="btn" :class="{ 'btn-primary': tab === 'users' }" @click="tab = 'users'">用户 VIP 实例</button>
        <button class="btn" :class="{ 'btn-primary': tab === 'levels' }" @click="tab = 'levels'">VIP 等级配置</button>
        <button class="btn" :class="{ 'btn-primary': tab === 'coupons' }" @click="tab = 'coupons'">优惠券管理</button>
      </div>
    </div>

    <p v-if="toast" class="notice-banner">{{ toast }}</p>

    <div v-if="tab === 'users'">
      <form class="filter-row toolbar-gap" @submit.prevent="handleGrantVip">
        <input v-model="grantTarget" class="input" placeholder="用户名或用户 ID" required />
        <select v-model="grantLevelOId" class="input">
          <option v-for="lv in levels" :key="lv.oId" :value="lv.oId">{{ lv.name }} ({{ lv.lvCode }})</option>
        </select>
        <button class="btn btn-primary" type="submit" :disabled="busy">免费开通 VIP（含初始礼包）</button>
      </form>

      <div class="filter-row toolbar-gap">
        <input v-model="filterUserName" class="input" placeholder="按用户名检索" @keyup.enter="loadUserVips(1)" />
        <input v-model="filterLvCode" class="input" placeholder="等级代码" @keyup.enter="loadUserVips(1)" />
        <select v-model="filterState" class="input" @change="loadUserVips(1)">
          <option value="">全部状态</option>
          <option value="1">有效</option>
          <option value="0">已停用</option>
        </select>
        <button class="btn btn-secondary" @click="loadUserVips(1)">查询</button>
      </div>

      <table class="data-table">
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
                <input v-model.number="extendDaysMap[row.userId]" class="input num-input" type="number" min="1" placeholder="30天" />
                <button class="btn btn-sm btn-primary" :disabled="busy" @click="handleExtendVip(row)">续期</button>
                <button class="btn btn-sm" :disabled="busy" @click="handleToggleVipState(row)">
                  {{ row.state === 1 ? '停用' : '启用' }}
                </button>
                <button v-if="row.state === 1" class="btn btn-sm btn-danger" :disabled="busy" @click="handleRefundVip(row)">
                  折算退订
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="pager-bar">
        <button class="btn btn-sm" :disabled="vipPagination.page <= 1" @click="loadUserVips(vipPagination.page - 1)">上一页</button>
        <span>第 {{ vipPagination.page }} / {{ vipPagination.totalPages }} 页（共 {{ vipPagination.total }} 条）</span>
        <button class="btn btn-sm" :disabled="vipPagination.page >= vipPagination.totalPages" @click="loadUserVips(vipPagination.page + 1)">下一页</button>
      </div>
    </div>

    <div v-else-if="tab === 'levels'">
      <form class="filter-row toolbar-gap" @submit.prevent="handleAddLevel">
        <input v-model="newLevel.lvCode" class="input" placeholder="等级代码 (如 VIP1)" required />
        <input v-model="newLevel.name" class="input" placeholder="等级名称" required />
        <input v-model.number="newLevel.price" class="input num-input" type="number" min="0" placeholder="积分价格" />
        <input v-model.number="newLevel.durationDays" class="input num-input" type="number" min="1" placeholder="天数" />
        <button class="btn btn-primary" type="submit" :disabled="busy">新增等级</button>
      </form>

      <table class="data-table">
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
            <td>{{ lv.name }}</td>
            <td>{{ lv.price }}</td>
            <td>{{ lv.durationDays }}</td>
            <td>
              <div class="btn-row">
                <button class="btn btn-sm" :disabled="busy" @click="handleBumpLevelPrice(lv, 100)">+100分</button>
                <button class="btn btn-sm" :disabled="busy" @click="handleBumpLevelPrice(lv, -100)">-100分</button>
                <button class="btn btn-sm btn-danger" :disabled="busy" @click="handleRemoveLevel(lv)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else>
      <form class="filter-row toolbar-gap" @submit.prevent="handleAddCoupon">
        <input v-model="newCoupon.couponCode" class="input" placeholder="自定义码(8-32位，留空自动生成)" />
        <select v-model.number="newCoupon.couponType" class="input">
          <option :value="0">折扣百分比(1-100)</option>
          <option :value="1">立减积分</option>
        </select>
        <input v-model.number="newCoupon.discount" class="input num-input" type="number" min="1" placeholder="数值" />
        <input v-model.number="newCoupon.times" class="input num-input" type="number" min="-1" placeholder="次数(-1无限)" />
        <button class="btn btn-primary" type="submit" :disabled="busy">创建优惠券</button>
      </form>

      <table class="data-table">
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
                <button class="btn btn-sm" :disabled="busy" @click="handleUpdateCouponTimes(c, -1)">设为无限(-1)</button>
                <button class="btn btn-sm" :disabled="busy" @click="handleUpdateCouponTimes(c, 10)">设为10次</button>
                <button class="btn btn-sm btn-danger" :disabled="busy" @click="handleRemoveCoupon(c)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.panel-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.tab-row, .filter-row, .btn-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.toolbar-gap { margin-bottom: 0.75rem; }
.num-input { width: 96px; }
.pager-bar { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.75rem; }
.notice-banner { padding: 0.5rem 0.75rem; border-radius: 6px; background: #eff6ff; color: #1d4ed8; margin-bottom: 0.75rem; }
</style>
