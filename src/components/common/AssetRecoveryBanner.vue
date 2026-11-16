<script setup lang="ts">
import { pendingAssetWrite, assetRecoveryBusy, assetRecoveryMessage, assetRecoveryReceipt, recoverAssetWrite } from '@/stores/assetRecovery'
</script>

<template>
  <section v-if="pendingAssetWrite || assetRecoveryReceipt != null" class="admin-panel" role="status" aria-live="polite">
    <strong>{{ pendingAssetWrite ? '后台操作结果待确认' : '后台操作恢复结果' }}</strong>
    <p>{{ assetRecoveryMessage }}</p>
    <template v-if="pendingAssetWrite">
      <p>已保留原操作及提交内容。请保持此页面打开，并先确认原操作。</p>
      <button class="admin-btn admin-btn--primary" :disabled="assetRecoveryBusy" @click="recoverAssetWrite">
        {{ assetRecoveryBusy ? '正在确认…' : '按原操作恢复确认' }}
      </button>
    </template>
    <details v-if="assetRecoveryReceipt != null">
      <summary>查看原操作回执</summary>
      <pre style="white-space: pre-wrap; overflow-wrap: anywhere">{{ JSON.stringify(assetRecoveryReceipt, null, 2) }}</pre>
    </details>
  </section>
</template>
