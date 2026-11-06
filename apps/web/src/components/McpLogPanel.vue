<template>
  <section class="border-t border-line bg-panel">
    <div class="flex items-center justify-between px-5 py-2">
      <h2 class="m-0 text-sm font-medium">MCP 调用</h2>
      <button class="btn" type="button" @click="open = !open">{{ open ? '收起' : '展开' }}</button>
    </div>
    <ul v-if="open" class="m-0 max-h-44 list-none overflow-auto px-3 pb-3">
      <li v-if="logs.length === 0" class="px-2 py-3 text-sm text-muted">
        还没有 MCP 调用。Cursor 连上 /mcp 之后，这里会留下每次工具调用。
      </li>
      <li v-for="log in logs" :key="log.id" class="border-t border-line">
        <button
          class="grid w-full grid-cols-[88px_160px_52px_1fr] items-center gap-3 px-2 py-2 text-left text-sm"
          type="button"
          @click="active = active === log.id ? '' : log.id"
        >
          <time class="font-mono text-xs text-muted">{{ formatWhen(log.createdAt) }}</time>
          <span class="truncate font-mono text-xs">{{ log.toolName }}</span>
          <span class="inline-flex items-center gap-2">
            <i class="inline-block h-2 w-2 rounded-full" :style="{ background: log.ok ? '#2f9d78' : '#d85a4c' }" />
            {{ log.ok ? '成功' : '失败' }}
          </span>
          <span class="truncate text-muted">{{ log.summary }}</span>
        </button>
        <pre v-if="active === log.id" class="mx-2 mb-2 overflow-auto bg-ink p-3 font-mono text-xs text-muted">{{
          pretty(log.detail)
        }}</pre>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { formatWhen } from '@/labels'
import type { McpLog } from '@/types'

defineProps<{ logs: McpLog[] }>()

const open = ref(true)
const active = ref('')

function pretty(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}
</script>
