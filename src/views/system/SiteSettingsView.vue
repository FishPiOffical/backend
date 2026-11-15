<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchIpPolicyStatus,
  fetchMiscSettings,
  mutateIpPolicy,
  updateMiscSettings,
  type IpPolicyStatus,
  type MiscOptionItem,
} from '@/api/adminStage4'
import { ApiError, createIdempotencyKey } from '@/api/http'
import PageStateView, { type PageViewState } from '@/components/common/PageStateView.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * IP 封禁库与站点杂项配置：
 * 1. 按 `ipManage` 与 `menuAdminMisc` 分别控制 IP 封禁/解封与杂项设置读写；
 * 2. IP 封禁/解封保留验证码盾与防火墙调用顺序；
 * 3. 所有写入携带 Idempotency-Key 并提示二次确认。
 */
const auth = useAuthStore()

const canIpManage = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.ipManage),
)
const canMiscManage = computed(() =>
  Boolean(auth.capabilities?.canAccessAdmin && auth.capabilities?.permissions.menuAdminMisc),
)

const ipStatus = ref<IpPolicyStatus | null>(null)
const ipAction = ref<'ban' | 'unban'>('ban')
const ipListText = ref('')
const ipBusy = ref(false)
const ipNotice = ref('')
const ipError = ref('')

const miscOptions = ref<MiscOptionItem[]>([])
const miscDraft = reactive<Record<string, string>>({})
const miscBusy = ref(false)
const miscNotice = ref('')
const miscError = ref('')

const loading = ref(false)
const loadError = ref('')

const pageState = computed<PageViewState>(() => {
  if (!canIpManage.value && !canMiscManage.value) return 'forbidden'
  if (loading.value && !ipStatus.value && miscOptions.value.length === 0) return 'loading'
  if (loadError.value && !ipStatus.value && miscOptions.value.length === 0) return 'error'
  return 'ready'
})

function extractError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : '操作失败'
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const tasks: Promise<void>[] = []
    if (canIpManage.value) {
      tasks.push(
        fetchIpPolicyStatus().then((res) => {
          ipStatus.value = res
        }),
      )
    }
    if (canMiscManage.value) {
      tasks.push(
        fetchMiscSettings().then((res) => {
          miscOptions.value = res.options ?? []
          for (const item of miscOptions.value) {
            miscDraft[item.oId] = String(item.optionValue ?? '')
          }
        }),
      )
    }
    await Promise.all(tasks)
  } catch (err) {
    loadError.value = extractError(err)
  } finally {
    loading.value = false
  }
}

async function submitIpAction() {
  ipError.value = ''
  ipNotice.value = ''
  const ips = ipListText.value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ips.length === 0) {
    ipError.value = '请至少输入一个有效 IP'
    return
  }
  const verb = ipAction.value === 'ban' ? '封禁' : '解封'
  if (!window.confirm(`确认对 ${ips.length} 个 IP 执行「${verb}」操作？`)) {
    return
  }
  ipBusy.value = true
  try {
    const res = await mutateIpPolicy({ action: ipAction.value, ipList: ips }, createIdempotencyKey('ip'))
    ipNotice.value = `已完成 ${res.count} 个 IP 的${verb}操作${res.replayed ? '（幂等重放）' : ''}`
    ipListText.value = ''
  } catch (err) {
    ipError.value = extractError(err)
  } finally {
    ipBusy.value = false
  }
}

async function submitMiscSettings() {
  miscError.value = ''
  miscNotice.value = ''
  if (!window.confirm('确认保存站点杂项配置变更？高危开关将即时生效并写入审计日志。')) {
    return
  }
  miscBusy.value = true
  try {
    const payload: Record<string, string> = {}
    for (const item of miscOptions.value) {
      payload[item.oId] = miscDraft[item.oId] ?? ''
    }
    const res = await updateMiscSettings(payload, createIdempotencyKey('misc'))
    miscOptions.value = res.options ?? miscOptions.value
    miscNotice.value = `已保存 ${res.updatedCount} 项站点配置${res.replayed ? '（幂等重放）' : ''}`
  } catch (err) {
    miscError.value = extractError(err)
  } finally {
    miscBusy.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <PageStateView :state="pageState" :error-message="loadError" @retry="loadAll">
    <div class="admin-page">
      <header class="admin-page__header">
        <div>
          <h1 class="admin-page__title">IP 与站点杂项配置</h1>
          <p class="admin-page__subtitle">统一管理 IP 封禁策略、防火墙/验证码盾状态与全站杂项参数开关。</p>
        </div>
        <div class="admin-page__actions">
          <button type="button" class="admin-btn" :disabled="loading" @click="loadAll">刷新状态</button>
        </div>
      </header>

      <section v-if="canIpManage" class="admin-panel admin-stack">
        <header class="admin-panel__header">
          <div>
            <div class="admin-panel__title-row">
              <h2 class="admin-panel__title">IP 封禁与白名单管理</h2>
              <StatusBadge label="ipManage" tone="info" />
            </div>
            <p class="admin-panel__desc">批量封禁/解封 IP，自动同步防火墙与验证码盾策略并写入操作日志。</p>
          </div>
        </header>

        <div v-if="ipStatus" class="admin-row">
          <StatusBadge :label="`CC 防火墙: ${ipStatus.firewallEnabled ? '开启' : '关闭'}`" :tone="ipStatus.firewallEnabled ? 'success' : 'neutral'" />
          <StatusBadge :label="`阈值: ${ipStatus.threshold}/分`" tone="info" />
          <StatusBadge :label="`验证盾: ${ipStatus.verificationEnabled ? '开启' : '关闭'}`" :tone="ipStatus.verificationEnabled ? 'success' : 'neutral'" />
          <StatusBadge :label="`首访验证码: ${ipStatus.firstVisitCaptchaEnabled ? '开启' : '关闭'}`" :tone="ipStatus.firstVisitCaptchaEnabled ? 'warning' : 'neutral'" />
        </div>

        <div v-if="ipNotice" class="admin-alert admin-alert--success">{{ ipNotice }}</div>
        <div v-if="ipError" class="admin-alert admin-alert--danger">{{ ipError }}</div>

        <div class="admin-stack admin-stack--sm" style="max-width: 640px">
          <div class="admin-field">
            <label class="admin-field__label">操作类型</label>
            <select v-model="ipAction" class="admin-select" style="max-width: 260px">
              <option value="ban">批量封禁 IP（撤销验证码豁免）</option>
              <option value="unban">批量解封 IP（同步解除验证码盾）</option>
            </select>
          </div>
          <div class="admin-field">
            <label class="admin-field__label">IP 列表</label>
            <textarea
              v-model="ipListText"
              class="admin-textarea"
              rows="4"
              placeholder="每行或逗号分隔输入 IP 地址（单次最多 500 条）"
            />
          </div>
          <div class="admin-row">
            <button
              type="button"
              class="admin-btn"
              :class="ipAction === 'ban' ? 'admin-btn--danger' : 'admin-btn--primary'"
              :disabled="ipBusy"
              @click="submitIpAction"
            >
              {{ ipBusy ? '处理中...' : ipAction === 'ban' ? '执行封禁' : '执行解封' }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="canMiscManage" class="admin-panel admin-stack">
        <header class="admin-panel__header">
          <div>
            <div class="admin-panel__title-row">
              <h2 class="admin-panel__title">站点杂项配置</h2>
              <StatusBadge label="menuAdminMisc" tone="warning" />
            </div>
            <p class="admin-panel__desc">维护开放注册、发帖/评论、匿名浏览等杂项参数。</p>
          </div>
          <button type="button" class="admin-btn admin-btn--primary" :disabled="miscBusy" @click="submitMiscSettings">
            {{ miscBusy ? '保存中...' : '保存全部配置' }}
          </button>
        </header>

        <div v-if="miscNotice" class="admin-alert admin-alert--success">{{ miscNotice }}</div>
        <div v-if="miscError" class="admin-alert admin-alert--danger">{{ miscError }}</div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width: 280px">配置项 ID</th>
                <th>配置值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="opt in miscOptions" :key="opt.oId">
                <td><code class="admin-mono">{{ opt.oId }}</code></td>
                <td>
                  <input v-model="miscDraft[opt.oId]" class="admin-input" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </PageStateView>
</template>
