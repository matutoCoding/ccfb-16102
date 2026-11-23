// 3D 面板：封装 CaveViewer 生命周期、日期时间轴与外皮状态指标
import type { CheeseWheel, RindState } from '../../types'
import { appStore } from '../../core/store'
import { dateAtDay, dayIndex } from '../../core/growth'
import { el, pct } from '../dom'
import { CaveViewer } from '../../render/cave_viewer'

export interface ViewerPanelOptions {
  // 限定只渲染这些轮子（单区/单层），不传则渲染全部
  wheelFilter?: (w: CheeseWheel) => boolean
  initialWheelId?: string | null
  // 预测模式：外部接管状态计算（场景对比）
  stateResolver?: (wheel: CheeseWheel, at: Date) => RindState
  // 隐藏窖区架子（单轮对比）
  hideCave?: boolean
  // 日期变化回调（预测页用来同步对比轮）
  onDateChange?: (at: Date) => void
  maxDayOffset?: number
}

export interface ViewerPanel {
  root: HTMLElement
  viewer: CaveViewer
  mount: () => void
  setDate: (at: Date) => void
  refreshStates: () => void
  dispose: () => void
}

export function createViewerPanel(opts: ViewerPanelOptions): ViewerPanel {
  const wheels = appStore.wheels.filter(opts.wheelFilter ?? (() => true))
  const zoneIds = new Set(wheels.map((w) => w.zoneId))
  const zone = appStore.zones.find((z) => zoneIds.has(z.id)) ?? appStore.zones[0]

  const host = el('div', { className: 'viewport' })
  const viewer = new CaveViewer(host, { zone, wheels, settings: appStore.settings })

  const resolver =
    opts.stateResolver ?? ((w: CheeseWheel, at: Date) => appStore.rindState(w, at))
  const minEnter = Math.min(...wheels.map((w) => new Date(w.enteredAt).getTime()))
  const baseDate = new Date(minEnter)
  const todayDay = dayIndex(baseDate.toISOString(), appStore.viewDate)
  const maxDay = opts.maxDayOffset ?? todayDay
  const selected = { id: opts.initialWheelId ?? null }

  // ---- 状态指标 ----
  const metricBox = el('div', { className: 'stat-grid', style: 'margin-top:16px' })
  const metrics = createMetrics(metricBox)

  // ---- 时间轴 ----
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = String(maxDay)
  slider.value = String(maxDay)
  const dateLabel = el('strong', {}, '')
  const timeline = el(
    'div',
    { className: 'card', style: 'margin-top:16px' },
    el('div', { className: 'spread' },
      el('h3', {}, '熟成时间轴'),
      el('span', { className: 'muted' }, '拖动按天连续演化，无跳变')),
    el('div', { className: 'row', style: 'margin-top:12px' }, dateLabel, slider),
  )

  const root = el('div', {}, host, timeline, metricBox)

  function currentAt(): Date {
    return dateAtDay(baseDate.toISOString(), Number(slider.value))
  }

  function refreshStates(): void {
    const at = currentAt()
    const states = new Map<string, RindState>()
    for (const w of wheels) states.set(w.id, resolver(w, at))
    viewer.setAllStates(states)
    if (selected.id) {
      const s = states.get(selected.id)
      if (s) metrics.update(s)
    }
  }

  function setDate(at: Date): void {
    if (!viewer.isMounted) return
    const day = dayIndex(baseDate.toISOString(), at)
    slider.value = String(Math.max(0, Math.min(maxDay, day)))
    applyDate()
  }

  function applyDate(): void {
    dateLabel.textContent = currentAt().toISOString().slice(0, 10)
    refreshStates()
    opts.onDateChange?.(currentAt())
  }

  // ---- 悬浮工具条 ----
  const modeBtn = el('button', {}, '单轮细看')
  const nameLabel = el(
    'span',
    { className: 'tag', style: 'background:rgba(255,255,255,0.92)' },
    '点击任意轮子细看',
  )
  const toolbar = el(
    'div',
    { className: 'toolbar', style: 'position:absolute;top:12px;left:12px;z-index:5' },
    modeBtn,
    nameLabel,
  )
  host.append(toolbar)

  viewer.setSelectHandler((id) => {
    if (!id) return
    selected.id = id
    nameLabel.textContent = nameOf(id)
    viewer.focusWheel(id)
    modeBtn.textContent = '返回整层'
    metrics.update(resolver(appStore.wheels.find((w) => w.id === id)!, currentAt()))
  })

  modeBtn.addEventListener('click', () => {
    if (viewer.currentMode === 'wheel') {
      selected.id = null
      viewer.focusWheel(null)
      modeBtn.textContent = '单轮细看'
      nameLabel.textContent = '点击任意轮子细看'
      refreshStates()
    } else if (selected.id) {
      viewer.focusWheel(selected.id)
      modeBtn.textContent = '返回整层'
    }
  })

  slider.addEventListener('input', applyDate)

  return {
    root,
    viewer,
    setDate,
    refreshStates,
    // 由页面在 root 插入 DOM 后调用，确保容器已有真实尺寸、场景已构建
    mount: () => {
      viewer.mount()
      if (opts.hideCave) {
        viewer.setCaveVisible(false)
        const focusId = opts.initialWheelId ?? wheels[0]?.id
        if (focusId) viewer.frameWheel(focusId)
      }
      applyDate()
    },
    dispose: () => viewer.dispose(),
  }
}

function nameOf(id: string): string {
  return appStore.wheels.find((w) => w.id === id)?.label ?? id
}

interface MetricHandle {
  update: (s: RindState) => void
}

function createMetrics(box: HTMLElement): MetricHandle {
  const defs: { key: keyof RindState; label: string; color: string }[] = [
    { key: 'geotrichum', label: '白地霉绒毛', color: '#d8d4c2' },
    { key: 'penicillium', label: '青霉蓝绿斑', color: '#4a7a6f' },
    { key: 'mite', label: '螨虫麻点', color: '#9a8f7d' },
    { key: 'smear', label: '洗浸橙红菌', color: '#c26a2e' },
    { key: 'browning', label: '褐变程度', color: '#7a5230' },
    { key: 'cracking', label: '干裂风险', color: '#b3453a' },
    { key: 'oil', label: '油膜', color: '#b79a4a' },
    { key: 'contactWet', label: '压痕湿斑', color: '#5a6b7a' },
  ]
  const bars = new Map<string, { bar: HTMLElement; value: HTMLElement }>()
  for (const d of defs) {
    const bar = el('span')
    bar.style.background = d.color
    const value = el('strong', {}, '0%')
    const card = el('div', { className: 'stat' },
      el('span', { className: 'label' }, d.label),
      value,
      el('div', { className: 'mold-bar' }, bar),
    )
    box.append(card)
    bars.set(d.key, { bar, value })
  }
  return {
    update(s) {
      for (const d of defs) {
        const handle = bars.get(d.key)!
        const v = Number(s[d.key])
        handle.bar.style.width = pct(v)
        handle.value.textContent = pct(v)
      }
    },
  }
}
