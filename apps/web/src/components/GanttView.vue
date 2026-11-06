<template>
  <div v-if="tasks.length === 0" class="p-6 text-sm text-muted">没有可画的任务。</div>
  <div v-else ref="scroller" class="scroller">
    <div class="gantt" :style="{ minWidth: `${LABEL_WIDTH + chart.count * MIN_DAY}px` }">
      <div class="labels">
        <div class="corner">任务</div>
        <div v-for="task in tasks" :key="task.id" class="label">
          <div class="label-text" :style="{ paddingLeft: `${12 + task.depth * 16}px` }">
            <button class="title" type="button" @click="emit('edit', task)">{{ task.title }}</button>
            <p class="meta">
              <span>{{ task.assignee || '未指定' }}</span>
              <span>{{ task.progress }}%</span>
            </p>
          </div>
          <div class="label-actions">
            <button class="text-btn" type="button" @click="emit('add-child', task)">子任务</button>
            <select :aria-label="`修改${task.title}的状态`" :value="task.status" @change="onStatus(task, $event)">
              <option v-for="status in STATUS_ORDER" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="time" :style="{ '--day-width': `${dayWidth}px` }">
        <div class="head" :style="{ height: `${HEADER_HEIGHT}px` }">
          <div v-for="(day, index) in chart.days" :key="day" class="day">
            <span v-if="index === 0 || day.endsWith('-01')" class="month">{{ Number(day.slice(5, 7)) }}月</span>
            <span class="num">{{ day.slice(8) }}</span>
          </div>
        </div>
        <div ref="bodyEl" class="body" :style="{ height: `${tasks.length * ROW_HEIGHT}px` }">
          <svg :width="trackWidth" :height="tasks.length * ROW_HEIGHT">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6" fill="#a3b0c2" />
              </marker>
            </defs>
            <line
              v-if="todayX !== null"
              :x1="todayX"
              :x2="todayX"
              y1="0"
              :y2="tasks.length * ROW_HEIGHT"
              stroke="#e0a15a"
              stroke-width="2"
            />
            <path
              v-for="(line, index) in lines"
              :key="index"
              :d="line"
              fill="none"
              stroke="#a3b0c2"
              stroke-width="1.5"
              marker-end="url(#arrow)"
            />
          </svg>
          <div v-for="task in tasks" :key="task.id" class="row" @pointerdown="onRowDown($event, task)">
            <div
              v-if="bar(task)"
              class="bar"
              :class="{ dragging: drag?.taskId === task.id }"
              :style="barStyle(task)"
              :title="`拖动移动 ${task.title}，拖两端改开始或结束`"
              @pointerdown.stop="onBarDown($event, task, 'move')"
            >
              <i :style="fillStyle(task)" />
              <span class="handle left" title="改开始日期" @pointerdown.stop="onBarDown($event, task, 'start')" />
              <span class="handle right" title="改结束日期" @pointerdown.stop="onBarDown($event, task, 'end')" />
            </div>
            <span v-else class="unscheduled">按住拖出时间</span>
            <span
              v-if="drag?.taskId === task.id && bar(task)"
              class="drag-label"
              :style="{ left: barStyle(task).left }"
            >
              {{ drag.previewStart.slice(5) }} – {{ drag.previewEnd.slice(5) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { STATUS_BAR, STATUS_LABEL, STATUS_ORDER } from '@/labels'
import type { Task, TaskStatus } from '@/types'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  edit: [task: Task]
  'add-child': [task: Task]
  'change-status': [task: Task, status: TaskStatus]
  schedule: [task: Task, startDate: string, endDate: string]
}>()

const LABEL_WIDTH = 320
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 52
const MIN_DAY = 32
const MAX_DAY = 52

const today = localToday()
const scroller = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
const pending = ref<Record<string, { start: string; end: string }>>({})

interface Drag {
  taskId: string
  mode: 'move' | 'start' | 'end' | 'create'
  originX: number
  anchor: string
  start: string
  end: string
  previewStart: string
  previewEnd: string
  moved: boolean
}

const drag = ref<Drag | null>(null)
let observer: ResizeObserver | null = null

const chart = computed(() => {
  const starts: string[] = []
  const ends: string[] = []
  for (const task of props.tasks) {
    const start = task.startDate ?? task.endDate
    const end = task.endDate ?? task.startDate
    if (start) starts.push(start)
    if (end) ends.push(end)
  }
  starts.sort()
  ends.sort()
  let origin = starts[0] ? addDays(starts[0], -1) : addDays(today, -3)
  let last = ends.at(-1) ? addDays(ends.at(-1)!, 2) : addDays(today, 14)
  if (today < origin) origin = addDays(today, -2)
  if (today > last) last = addDays(today, 7)
  let count = Math.max(diffDays(origin, last) + 1, 1)
  const available = Math.max((viewportWidth.value || 960) - LABEL_WIDTH, MIN_DAY)
  while (count * MAX_DAY < available && count < 120) {
    last = addDays(last, 7)
    count = diffDays(origin, last) + 1
  }
  return {
    origin,
    last,
    count,
    days: Array.from({ length: count }, (_, index) => addDays(origin, index)),
  }
})

const trackWidth = computed(() => {
  const minimum = chart.value.count * MIN_DAY
  const available = Math.max((viewportWidth.value || 960) - LABEL_WIDTH, minimum)
  return Math.max(available, minimum)
})

const dayWidth = computed(() => (chart.value.count > 0 ? trackWidth.value / chart.value.count : MIN_DAY))

const todayX = computed(() => {
  const offset = diffDays(chart.value.origin, today)
  if (offset < 0 || offset >= chart.value.count) return null
  return offset * dayWidth.value + dayWidth.value / 2
})

const lines = computed(() => {
  const indexById = new Map(props.tasks.map((task, index) => [task.id, index]))
  const paths: string[] = []
  props.tasks.forEach((task, index) => {
    const target = box(task)
    if (!target) return
    for (const predecessorId of task.dependsOnTaskIds) {
      const predecessorIndex = indexById.get(predecessorId)
      if (predecessorIndex === undefined) continue
      const source = box(props.tasks[predecessorIndex]!)
      if (!source) continue
      const x1 = source.left + source.width
      const y1 = predecessorIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      const x2 = target.left
      const y2 = index * ROW_HEIGHT + ROW_HEIGHT / 2
      const mid = (x1 + x2) / 2
      paths.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`)
    }
  })
  return paths
})

watch(
  () => props.tasks,
  () => {
    if (!drag.value) pending.value = {}
  }
)

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (scroller.value) observer.observe(scroller.value)
  measure()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

function measure() {
  viewportWidth.value = scroller.value?.clientWidth ?? 0
}

function onStatus(task: Task, event: Event) {
  emit('change-status', task, (event.target as HTMLSelectElement).value as TaskStatus)
}

function datesOf(task: Task): { start: string | null; end: string | null } {
  if (drag.value?.taskId === task.id) return { start: drag.value.previewStart, end: drag.value.previewEnd }
  const held = pending.value[task.id]
  if (held) return held
  return { start: task.startDate, end: task.endDate }
}

function startOf(task: Task): string | null {
  const dates = datesOf(task)
  return dates.start ?? dates.end
}

function endOf(task: Task): string | null {
  const dates = datesOf(task)
  return dates.end ?? dates.start
}

function box(task: Task): { left: number; width: number } | null {
  const start = startOf(task)
  const end = endOf(task)
  if (!start || !end) return null
  const left = (diffDays(chart.value.origin, start) / chart.value.count) * trackWidth.value
  const width = Math.max(((diffDays(start, end) + 1) / chart.value.count) * trackWidth.value - 6, 8)
  return { left, width }
}

function bar(task: Task) {
  return box(task)
}

function barStyle(task: Task) {
  const shape = box(task)
  if (!shape) return {}
  return {
    left: `${shape.left}px`,
    width: `${shape.width}px`,
    background: withAlpha(STATUS_BAR[task.status], 0.28),
  }
}

function fillStyle(task: Task) {
  return {
    width: `${task.progress}%`,
    background: STATUS_BAR[task.status],
  }
}

function onRowDown(event: PointerEvent, task: Task) {
  if (event.button !== 0 || bar(task)) return
  onCreateDown(event, task)
}

function onBarDown(event: PointerEvent, task: Task, mode: 'move' | 'start' | 'end') {
  if (event.button !== 0) return
  event.preventDefault()
  const start = startOf(task)
  const end = endOf(task)
  if (!start || !end) return
  drag.value = {
    taskId: task.id,
    mode,
    originX: event.clientX,
    anchor: start,
    start,
    end,
    previewStart: start,
    previewEnd: end,
    moved: false,
  }
}

function onCreateDown(event: PointerEvent, task: Task) {
  if (event.button !== 0) return
  event.preventDefault()
  const day = dayFromClient(event.clientX)
  drag.value = {
    taskId: task.id,
    mode: 'create',
    originX: event.clientX,
    anchor: day,
    start: day,
    end: day,
    previewStart: day,
    previewEnd: day,
    moved: false,
  }
}

function onPointerMove(event: PointerEvent) {
  const current = drag.value
  if (!current) return
  if (Math.abs(event.clientX - current.originX) >= 4) current.moved = true
  const { origin, last } = chart.value
  if (current.mode === 'create') {
    const day = dayFromClient(event.clientX)
    current.previewStart = day < current.anchor ? day : current.anchor
    current.previewEnd = day > current.anchor ? day : current.anchor
    return
  }
  const rawDelta = Math.round((event.clientX - current.originX) / dayWidth.value)
  if (current.mode === 'move') {
    const delta = clampMove(current.start, current.end, rawDelta, origin, last)
    current.previewStart = addDays(current.start, delta)
    current.previewEnd = addDays(current.end, delta)
    return
  }
  if (current.mode === 'start') {
    const next = clampDay(addDays(current.start, rawDelta), origin, current.end)
    current.previewStart = next
    current.previewEnd = current.end
    return
  }
  const next = clampDay(addDays(current.end, rawDelta), current.start, last)
  current.previewStart = current.start
  current.previewEnd = next
}

function onPointerUp() {
  const current = drag.value
  if (!current) return
  drag.value = null
  if (!current.moved) return
  const task = props.tasks.find((item) => item.id === current.taskId)
  if (!task || (task.startDate === current.previewStart && task.endDate === current.previewEnd)) return
  pending.value = { ...pending.value, [task.id]: { start: current.previewStart, end: current.previewEnd } }
  emit('schedule', task, current.previewStart, current.previewEnd)
}

function dayFromClient(clientX: number): string {
  const rect = bodyEl.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || chart.value.count <= 0) return chart.value.origin
  const x = Math.min(Math.max(clientX - rect.left, 0), Math.max(rect.width - 0.01, 0))
  const index = Math.min(chart.value.count - 1, Math.floor(x / (rect.width / chart.value.count)))
  return addDays(chart.value.origin, index)
}

function clampDay(day: string, min: string, max: string): string {
  if (day < min) return min
  if (day > max) return max
  return day
}

function clampMove(start: string, end: string, delta: number, origin: string, last: string): number {
  let next = delta
  while (next > 0 && addDays(end, next) > last) next -= 1
  while (next < 0 && addDays(start, next) < origin) next += 1
  return next
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function localToday(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10)
}

function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}
</script>

<style scoped>
.scroller {
  height: 100%;
  overflow: auto;
}

.gantt {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  width: 100%;
  height: 100%;
}

.labels,
.time {
  width: 100%;
  min-width: 0;
  user-select: none;
}

.corner,
.head {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 52px;
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-line);
}

.corner {
  z-index: 3;
  display: flex;
  align-items: flex-end;
  padding: 0 12px 8px;
  font-size: 13px;
  color: var(--color-muted);
}

.labels {
  position: sticky;
  left: 0;
  z-index: 4;
  background: var(--color-ink);
  border-right: 1px solid var(--color-line);
}

.label,
.row {
  height: 56px;
  border-bottom: 1px solid var(--color-line);
}

.label {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
}

.title {
  display: block;
  max-width: 150px;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
  text-align: left;
  white-space: nowrap;
  background: transparent;
  border: 0;
}

.meta,
.unscheduled {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
}

.meta {
  display: flex;
  gap: 8px;
}

.label-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.label-actions select,
.text-btn {
  font-size: 12px;
  color: var(--color-muted);
  background: transparent;
  border: 0;
}

.head {
  display: flex;
}

.day {
  box-sizing: border-box;
  display: flex;
  flex: 1 0 32px;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 32px;
  padding: 0 0 6px 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
  border-left: 1px solid var(--color-line);
}

.month {
  color: var(--color-text);
}

.body {
  position: relative;
  background-image: linear-gradient(
    to right,
    transparent calc(var(--day-width) - 1px),
    var(--color-line) calc(var(--day-width) - 1px)
  );
  background-size: var(--day-width) 100%;
}

.body svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.row {
  position: relative;
}

.bar {
  position: absolute;
  top: 16px;
  height: 22px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.bar.dragging {
  cursor: grabbing;
}

.bar i {
  display: block;
  height: 100%;
  pointer-events: none;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}

.handle.left {
  left: 0;
}

.handle.right {
  right: 0;
}

.unscheduled {
  position: absolute;
  top: 18px;
  left: 8px;
  cursor: ew-resize;
  user-select: none;
}

.drag-label {
  position: absolute;
  top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text);
  white-space: nowrap;
  pointer-events: none;
}
</style>
