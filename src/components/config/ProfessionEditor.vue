<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { requestData } from '@/api/http'
import { professionLifecycleAction, testProfessionAutomation } from '@/api/adminStage4'
import { parseObject, type JsonObject, type JsonValue } from '@/utils/configuration'
import { newLevel, schemeDraft, schemePayload } from '@/utils/professionConfiguration'
import JsonFields from './JsonFields.vue'
const props = defineProps<{ detail: Record<string, unknown> | null }>()
const emit = defineEmits<{ saved: []; dirty: [value: boolean] }>()
const conditionType = ref('LEAF'), calculatorType = ref('FIXED')
const mode = ref('definition'), sourceId = ref(''), form = ref<JsonObject>({}), dirty = ref(false), busy = ref(false), uncertain = ref(false), message = ref('')
const definitionMeta = ref<JsonObject>({}), automationMeta = ref<JsonObject>({}), testPayload = ref<JsonObject>({}), testResult = ref<unknown>(null)
const revisions = computed(() => (props.detail?.revisions || []) as JsonObject[])
const sources = computed<JsonObject[]>(() => mode.value === 'definition' ? revisions.value : mode.value === 'scheme' ? (props.detail?.schemes || []) as JsonObject[] : ((props.detail?.automations || []) as JsonObject[]).flatMap(a => ((a.revisions || []) as JsonObject[]).map(r => ({ ...r, automationCode: a.automationCode || '' }))))
const levels = computed(() => (form.value.levels || []) as JsonObject[])
const triggers = computed(() => (automationMeta.value.triggers || []) as JsonObject[])
const configuration = computed(() => (form.value.configuration || {}) as JsonObject)
const actions = computed(() => (configuration.value.actions || []) as JsonObject[])
function replace(value: JsonObject) { form.value = value; dirty.value = false; emit('dirty', false) }
function reset() {
  try {
    const source = sources.value.find(s => s.oId === sourceId.value) || {}
    const pid = String(props.detail?.oId || '')
    if (mode.value === 'definition') replace({ professionCode: String(props.detail?.professionCode || ''), displayName: String(source.displayName || props.detail?.displayName || ''), shortName: String(source.shortName || ''), description: String(source.description || ''), defaultPresentation: parseObject(source.defaultPresentationJson) })
    else if (mode.value === 'scheme') replace(schemeDraft(source, pid, String(revisions.value[0]?.oId || '')))
    else replace({ professionId: pid, automationCode: String(source.automationCode || ''), configuration: source.configurationJson ? parseObject(source.configurationJson) : { trigger: { triggerType: triggers.value[0]?.triggerType || '', schemaVersion: triggers.value[0]?.schemaVersion || 1 }, actions: [] } })
    message.value = ''; testResult.value = null
  } catch (error) { message.value = String(error) }
}
function changeMode(value: string) {
  if (dirty.value && !window.confirm('放弃当前未保存的职业配置？')) return
  mode.value = value; sourceId.value = ''; reset()
}
function changeSource(event: Event) {
  const element = event.target as HTMLSelectElement
  if (dirty.value && !window.confirm('放弃当前未保存的职业配置？')) { element.value = sourceId.value; return }
  sourceId.value = element.value; reset()
}
function changed() { dirty.value = true; emit('dirty', true) }
function addLevel() { levels.value.forEach(l => { l.isTopLevel = false }); levels.value.push(newLevel(levels.value.length)); changed() }
function removeLevel(index: number) { levels.value.splice(index, 1); levels.value.forEach((l, i) => { l.sortOrder = i; l.isTopLevel = i === levels.value.length - 1 }); changed() }
function addPresentation(level: JsonObject) { (level.presentations as JsonValue[]).push({ positionCode: 'default', lightConfig: {}, darkConfig: {} }); changed() }
function addReward(level: JsonObject, type: string) { const rewards = level.rewards as JsonValue[]; rewards.push({ rewardCode: `reward${rewards.length + 1}`, rewardType: type, grantPolicy: 'FIRST_REACH', downgradePolicy: 'KEEP', sortOrder: rewards.length, rewardConfig: type === 'POINT' ? { amount: 1, memo: '' } : { medalId: '', durationMillis: 0, data: '' } }); changed() }
function setTrigger(event: Event) { const trigger = triggers.value.find(t => t.triggerType === (event.target as HTMLSelectElement).value); if (trigger) configuration.value.trigger = { triggerType: trigger.triggerType!, schemaVersion: trigger.schemaVersion! }; changed() }
function addCondition() {
  const type = conditionType.value
  configuration.value.condition = type === 'ALL' || type === 'ANY' ? {type,children:[]} : type === 'NOT' ? {type,child:{type:'LEAF',fieldCode:'',operator:'EQ',value:''}} : {type:'LEAF',fieldCode:'',operator:'EQ',value:''}
  changed()
}
function setCalculator(action: JsonObject) {
  const type = calculatorType.value, fixed = () => ({calculatorType:'FIXED',value:1})
  action.calculator = type === 'FIXED' ? fixed() : type === 'FIELD' ? {calculatorType:type,fieldCode:''} : type === 'CLAMP' ? {calculatorType:type,value:fixed(),min:0,max:100} : type === 'TIERED' ? {calculatorType:type,input:fixed(),tiers:[{minInclusive:0,value:1}],defaultValue:0} : type === 'WEIGHTED_SUM' ? {calculatorType:type,items:[{value:fixed(),weight:1}]} : {calculatorType:type,left:fixed(),right:fixed(),...(type === 'DIVIDE' ? {zeroValue:0} : {})}
  delete action.experienceDelta; changed()
}
function addAction(type: string) { actions.value.push({ actionType: type, actionCode: `action${actions.value.length + 1}`, ...(type === 'profession.experience.adjust' ? { calculator: { calculatorType: 'FIXED', value: 1 } } : type === 'profession.system.notify' ? { notificationContent: '', notificationWhen: 'ALWAYS' } : {}) }); changed() }
async function save() {
  if (busy.value || uncertain.value) return
  let sent = false
  try {
    let payload: JsonObject
    if (mode.value === 'definition') { const { defaultPresentation, ...rest } = form.value; payload = { ...rest, defaultPresentationJson: JSON.stringify(defaultPresentation) } }
    else if (mode.value === 'scheme') payload = schemePayload(form.value)
    else payload = { professionId: form.value.professionId!, automationCode: form.value.automationCode!, configurationJson: JSON.stringify(configuration.value) }
    if (!window.confirm('保存为一个新草稿版本？保存后需单独发布才会生效。')) return
    busy.value = true; message.value = ''
    sent = true
    const result = await professionLifecycleAction(`${mode.value}/draft`, payload)
    dirty.value = false; emit('dirty', false); message.value = `草稿已保存：${String(result.id || '')}，请在版本列表中核对后发布。`; emit('saved')
  } catch (error) { message.value = error instanceof Error ? error.message : '保存失败'; if (sent && (!(error instanceof Error) || !('status' in error) || Number(error.status) >= 500 || Number(error.status) === 0)) { uncertain.value = true; message.value += '。结果尚未确认，请刷新版本列表核查，避免重复创建草稿。' } }
  finally { busy.value = false }
}
async function simulate() { try { testResult.value = await testProfessionAutomation(JSON.stringify(configuration.value), JSON.stringify(testPayload.value)) } catch (error) { message.value = String(error) } }
watch(() => props.detail?.oId, () => { sourceId.value = ''; if (!props.detail) mode.value = 'definition'; uncertain.value = false; reset() })
onBeforeRouteLeave(() => !dirty.value || window.confirm('职业草稿尚未保存，确认离开？'))
onMounted(async () => { try { const [d, a] = await Promise.all([requestData<JsonObject>('/api/v3/admin/professions/definition/metadata'), requestData<JsonObject>('/api/v3/admin/professions/automation/metadata')]); definitionMeta.value = d; automationMeta.value = a; if (!dirty.value) reset() } catch (error) { message.value = `元数据加载失败：${String(error)}` } })
reset()
</script>
<template>
  <section class="admin-panel">
    <h3 class="admin-page__title">职业配置编辑</h3><p class="admin-page__subtitle">编辑现有版本会保存为新草稿，发布操作在版本列表中单独执行。</p>
    <div class="admin-filter-bar"><button v-for="[key, label] in [['definition','职业定义'],['scheme','等级方案'],['automation','自动化规则']]" :key="key" class="admin-btn" :class="{ 'admin-btn--primary': mode === key }" :disabled="busy || (key !== 'definition' && !detail)" @click="changeMode(key!)">{{ label }}</button></div>
    <p v-if="message" class="admin-alert" role="status">{{ message }}</p>
    <form @submit.prevent="save" @input="changed" @change="changed">
      <fieldset :disabled="busy || uncertain" class="profession-fieldset">
        <label class="config-label">编辑来源<select :value="sourceId" class="admin-select" @change="changeSource"><option value="">新建草稿</option><option v-for="source in sources" :key="String(source.oId)" :value="String(source.oId)">{{ source.oId }} · {{ source.status }} · {{ source.displayName || source.automationCode }}</option></select></label>
        <template v-if="mode === 'definition'">
          <div class="config-grid"><label v-for="[key,label] in [['professionCode','职业代码'],['displayName','显示名称'],['shortName','简称'],['description','说明']]" :key="key" class="config-label">{{ label }}<input v-model="form[key!]" class="admin-input" :required="key === 'professionCode' || key === 'displayName'" :readonly="key === 'professionCode' && !!detail" :maxlength="key === 'description' ? 1024 : key === 'shortName' ? 32 : 64" /></label></div>
          <JsonFields v-model="form.defaultPresentation!" label="默认外观配置" @update:model-value="changed" />
        </template>
        <template v-else-if="mode === 'scheme'">
          <div class="config-grid"><label class="config-label">关联定义版本<select v-model="form.professionRevisionId" class="admin-select" required><option v-for="rev in revisions" :key="String(rev.oId)" :value="rev.oId">{{ rev.oId }} · {{ rev.status }}</option></select></label>
          <label class="config-label">进度迁移策略<select v-model="form.migrationPolicy" class="admin-select"><option v-for="p in ['NEW_USERS_ONLY','KEEP_EXISTING','MIGRATE_ALL','SCHEDULED_SWITCH']" :key="p">{{ p }}</option></select></label>
          <label class="config-label">奖励迁移策略<select v-model="form.rewardMigrationPolicy" class="admin-select"><option v-for="p in ['NO_GRANT','GRANT_NEW_LEVELS','GRANT_SELECTED']" :key="p">{{ p }}</option></select></label></div>
          <p class="admin-muted">定时迁移填写 scheduledSwitchAt（毫秒时间戳）；指定补发填写 selectedRewardCodes（代码列表）。仅全量／定时迁移允许补发奖励。</p>
          <JsonFields v-model="form.migrationConfig!" label="迁移参数" @update:model-value="changed" />
          <article v-for="(level,index) in levels" :key="index" class="profession-level"><div class="admin-filter-bar"><h4>等级 {{ index + 1 }}</h4><button type="button" class="admin-btn" @click="removeLevel(index)">删除等级</button></div>
            <div class="config-grid"><label v-for="[key,label] in [['levelCode','等级代码'],['displayName','等级名称'],['shortName','简称'],['description','说明'],['achievementDescription','成就说明']]" :key="key" class="config-label">{{ label }}<input v-model="level[key!]" class="admin-input" :required="key === 'levelCode' || key === 'displayName'" /></label><label class="config-label">累计经验门槛<input v-model.number="level.requiredTotalExperience" type="number" min="0" step="1" required class="admin-input" /></label><label class="config-label">排序<input v-model.number="level.sortOrder" type="number" min="0" step="1" required class="admin-input" /></label><label class="admin-choice"><input v-model="level.isTopLevel" type="checkbox" />顶级</label></div>
            <JsonFields v-model="level.presentations!" label="各展示位置的明暗外观" @update:model-value="changed" /><button type="button" class="admin-btn" @click="addPresentation(level)">添加展示位置</button>
            <JsonFields v-model="level.rewards!" label="等级奖励" @update:model-value="changed" /><div class="admin-filter-bar"><button type="button" class="admin-btn" @click="addReward(level,'POINT')">添加积分奖励</button><button type="button" class="admin-btn" @click="addReward(level,'MEDAL')">添加勋章奖励</button></div>
          </article><button type="button" class="admin-btn" @click="addLevel">添加等级</button>
        </template>
        <template v-else>
          <div class="config-grid"><label class="config-label">规则代码<input v-model="form.automationCode" required class="admin-input" pattern="[a-z][a-z0-9._-]{0,63}" /></label><label class="config-label">触发事件<select :value="(configuration.trigger as JsonObject)?.triggerType" class="admin-select" @change="setTrigger"><option v-for="t in triggers" :key="String(t.triggerType)" :value="t.triggerType">{{ t.triggerType }} · v{{ t.schemaVersion }}</option></select></label></div>
          <JsonFields v-model="form.configuration!" label="触发条件与执行动作" @update:model-value="changed" />
          <div class="admin-filter-bar"><button v-for="[type,label] in [['profession.experience.adjust','经验计算'],['profession.system.notify','系统通知'],['profession.contribution.record','贡献记录']]" :key="type" type="button" class="admin-btn" @click="addAction(type!)">添加{{ label }}</button><select v-model="conditionType" class="admin-select" aria-label="条件类型"><option v-for="type in ['LEAF','ALL','ANY','NOT']" :key="type">{{ type }}</option></select><button type="button" class="admin-btn" @click="addCondition">设置条件模板</button></div>
          <div v-for="(action,index) in actions.filter(a => a.actionType === 'profession.experience.adjust')" :key="index" class="admin-filter-bar"><span>{{ action.actionCode }} 计算模板</span><select v-model="calculatorType" class="admin-select" aria-label="计算模板"><option v-for="type in ['FIXED','FIELD','ADD','SUBTRACT','MULTIPLY','DIVIDE','MIN','MAX','CLAMP','TIERED','WEIGHTED_SUM']" :key="type">{{ type }}</option></select><button type="button" class="admin-btn" @click="setCalculator(action)">应用计算模板</button></div>
          <JsonFields v-model="testPayload" label="模拟事件数据" /><button type="button" class="admin-btn" @click="simulate">模拟当前规则</button><pre v-if="testResult" class="config-result">{{ JSON.stringify(testResult,null,2) }}</pre>
        </template>
        <details><summary>查看允许的字段、展示位置与规则元数据</summary><pre class="config-result">{{ JSON.stringify(mode === 'automation' ? automationMeta : definitionMeta,null,2) }}</pre></details>
        <button type="submit" class="admin-btn admin-btn--primary">{{ busy ? '保存中…' : '保存为新草稿' }}</button>
      </fieldset>
    </form>
  </section>
</template>
<style scoped>
.profession-fieldset { border:0; padding:0; margin:16px 0 0; min-width:0; display:grid; gap:16px; }
.config-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:16px; }
.config-label { display:grid; gap:6px; }
.profession-level { border:1px solid var(--fp-border); border-radius:12px; padding:16px; min-width:0; }
.config-result { overflow:auto; max-height:320px; padding:12px; background:var(--fp-elevated); }
</style>
