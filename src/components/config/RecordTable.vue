<script setup lang="ts">
defineProps<{ rows: Record<string, unknown>[]; columns: [string,string][]; empty?: string }>()
function display(value: unknown): string { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'boolean') return value ? '是' : '否'; if (Array.isArray(value)) return value.map(display).join('、'); if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${k}: ${display(v)}`).join('；'); return String(value) }
</script>
<template><div class="admin-table-wrap"><table class="admin-table" :style="{ minWidth: columns.length > 5 ? `${columns.length * 110}px` : '100%' }"><thead><tr><th v-for="[key,label] in columns" :key="key">{{ label }}</th></tr></thead><tbody><tr v-for="(row,index) in rows" :key="index"><td v-for="[key] in columns" :key="key">{{ display(row[key]) }}</td></tr><tr v-if="!rows.length"><td :colspan="columns.length">{{ empty || '当前快照暂无记录' }}</td></tr></tbody></table></div></template>
<style scoped>table { table-layout: fixed; } th,td { min-width:100px; } td { max-width:400px; white-space:normal; overflow-wrap:anywhere; vertical-align:top; }</style>
