<script setup lang="ts">
import { computed, ref } from 'vue'
import type { JsonValue, JsonObject } from '@/utils/configuration'
defineOptions({ name: 'JsonFields' })
const props = withDefaults(defineProps<{ modelValue: JsonValue; label?: string; disabled?: boolean; fixedKeys?: boolean; depth?: number }>(), { label: '配置', depth: 0 })
const emit = defineEmits<{ 'update:modelValue': [value: JsonValue] }>()
const newKey = ref('')
const newType = ref('text')
const error = ref('')
const labels: Record<string, string> = { rewardCode:'奖励代码',rewardType:'奖励类型',grantPolicy:'发放策略',downgradePolicy:'降级策略',sortOrder:'排序',rewardConfig:'奖励参数',amount:'积分数量',memo:'备注',medalId:'勋章代码',durationMillis:'有效期（毫秒，0 为永久）',data:'勋章数据',positionCode:'展示位置',lightConfig:'浅色外观',darkConfig:'深色外观',actionType:'动作类型',actionCode:'动作代码',notificationContent:'通知正文',notificationWhen:'通知时机',trigger:'触发事件',triggerType:'事件类型',schemaVersion:'事件版本',condition:'条件',actions:'动作列表',calculator:'经验计算',experienceDelta:'经验变化',primaryColor:'主色',backgroundColor:'背景色',textColor:'文字颜色',scheduledSwitchAt:'定时切换（毫秒时间戳）',selectedRewardCodes:'指定补发奖励代码', bold: '昵称加粗', underline: '昵称下划线', color: '颜色 / 特效', autoCheckin: '自动签到', checkinCard: '免签卡数量', metal: 'DIY 动态勋章', jointVip: '联合会员', type: '条件类型', children: '子条件', child: '取反条件', fieldCode: '字段', operator: '操作符', value: '值', min: '最小值', max: '最大值', calculatorType: '计算方式', left: '左侧表达式', right: '右侧表达式', zeroValue: '除零结果', items: '项目', tiers: '阶梯', weight: '权重', minInclusive: '起始值', defaultValue: '默认值' }
const entries = computed(() => props.modelValue && typeof props.modelValue === 'object' ? Object.entries(props.modelValue) : [])
function change(key: string, value: JsonValue) {
  if (Array.isArray(props.modelValue)) { const next = [...props.modelValue]; next[Number(key)] = value; emit('update:modelValue', next) }
  else emit('update:modelValue', { ...(props.modelValue as JsonObject), [key]: value })
}
function remove(key: string) {
  if (Array.isArray(props.modelValue)) emit('update:modelValue', props.modelValue.filter((_, i) => i !== Number(key)))
  else { const next = { ...(props.modelValue as JsonObject) }; delete next[key]; emit('update:modelValue', next) }
}
function add() {
  error.value = ''
  const value: JsonValue = ({ text: '', number: 0, boolean: false, object: {}, array: [], null: null } as Record<string, JsonValue>)[newType.value]!
  if (Array.isArray(props.modelValue)) emit('update:modelValue', [...props.modelValue, value])
  else {
    const key = newKey.value.trim()
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(props.modelValue as object, key)) { error.value = '字段名为空、重复或不可用'; return }
    change(key, value); newKey.value = ''
  }
}
function numberChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (input.value === '' || !Number.isFinite(value)) { input.setCustomValidity('请输入有效数字'); return }
  input.setCustomValidity(''); emit('update:modelValue', value)
}
</script>
<template>
  <div class="config-field">
    <template v-if="modelValue !== null && typeof modelValue === 'object'">
      <details open class="config-section">
        <summary>{{ label }} <span class="admin-muted">{{ entries.length }} 项</span></summary>
      <fieldset :disabled="disabled" class="config-group">
        <legend class="admin-sr-only">{{ label }}</legend>
        <div v-if="depth < 24" :class="{ 'config-simple-grid': !Array.isArray(modelValue) && entries.every(([,v]) => v === null || typeof v !== 'object') }">
          <div v-for="[key, value] in entries" :key="key" class="config-entry">
            <JsonFields :model-value="value" :label="labels[key] ? `${labels[key]}（${key}）` : key" :depth="depth + 1" :disabled="disabled" :fixed-keys="fixedKeys" @update:model-value="change(key, $event)" />
            <button v-if="!fixedKeys" type="button" class="admin-btn admin-btn--sm" :aria-label="`删除 ${key}`" @click="remove(key)">删除</button>
          </div>
          <p v-if="!entries.length" class="admin-muted">暂无配置项</p>
          <div v-if="!fixedKeys" class="admin-filter-bar">
            <input v-if="!Array.isArray(modelValue)" v-model="newKey" class="admin-input" aria-label="新字段名称" placeholder="字段名称" />
            <select v-model="newType" class="admin-select" aria-label="新字段类型"><option value="text">文本</option><option value="number">数值</option><option value="boolean">开关</option><option value="object">对象</option><option value="array">列表</option><option value="null">空值</option></select>
            <button type="button" class="admin-btn" @click="add">添加{{ Array.isArray(modelValue) ? '项目' : '字段' }}</button>
          </div>
        </div>
        <p v-else>嵌套层级过深，请通过配置导入维护。</p>
        <p v-if="error" role="alert">{{ error }}</p>
      </fieldset>
      </details>
    </template>
    <label v-else-if="typeof modelValue === 'boolean'" class="admin-choice config-choice">
      <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" /><span>{{ label }}</span>
    </label>
    <label v-else class="config-label"><span>{{ label }}</span>
      <input v-if="typeof modelValue === 'number'" class="admin-input" type="number" step="any" :value="modelValue" :disabled="disabled" required @input="numberChange" />
      <span v-else-if="modelValue === null">空值</span>
      <input v-else class="admin-input" :value="modelValue" :disabled="disabled" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    </label>
  </div>
</template>
<style scoped>
.config-section { min-width: 0; }
.config-section > summary { cursor: pointer; padding: 8px 0; font-weight: 600; overflow-wrap: anywhere; }
.config-section > summary span { margin-left: 8px; font-size: 12px; font-weight: 400; }
.config-group { border: 0; border-left: 2px solid var(--fp-border); padding: 10px 0 10px 16px; min-width: 0; margin: 0; }
.config-simple-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:12px; }
.config-simple-grid > .admin-filter-bar { grid-column:1 / -1; }
.config-group legend { font-weight: 600; padding: 0 8px; }
.config-entry { display: flex; align-items: flex-start; gap: 12px; margin: 10px 0; }
.config-field { flex: 1; min-width: 0; }
.config-choice { width: 100%; }
.config-label { display: grid; gap: 6px; overflow-wrap: anywhere; }
@media(max-width:600px) {
  .config-group { padding-left: 6px; }
  .config-group .config-group { border-left: 0; padding-left: 0; }
  .config-entry { flex-wrap: wrap; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--fp-border); }
  .config-entry > .config-field { flex-basis: 100%; }
  .config-entry > button { margin-left: auto; }
}
</style>
