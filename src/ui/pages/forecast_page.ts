// 熟成预测页：真实气候 vs 假设窖温湿度，双场景并排同步推演
import type { CheeseWheel, RindState } from '../../types'
import { appStore } from '../../core/store'
import { dateAtDay, dayIndex } from '../../core/growth'
import { el, clear, iconLabel, pct } from '../dom'
import { icon } from '../icons'
import { createViewerPanel, type ViewerPanel } from '../components/viewer_panel'

let baseline: ViewerPanel | null = null
let scenario: ViewerPanel | null = null

export function renderForecastPage(root: HTMLElement): void {
  clear(root)
  baseline?.dispose()
  scenario?.dispose()
  baseline = null
  scenario = null

  const head = el('div', { className: 'page-head' },
    el('h1', {}, '熟成预测'),
    el('p', {}, '按窖区温湿度向未来推演 6 个月，右侧可修改假设窖温湿度，与左侧真实档案场景并排对比'),
  )

  const wheelSel = document.createElement('select')
  for (const w of appStore.wheels) {
    const opt = document.createElement('option')
    opt.value = w.id
    opt.textContent = w.label
    wheelSel.append(opt)
  }

  // 假设场景参数
  const wheel0 = appStore.wheels[0]
  const zone0 = wheel0 ? appStore.zoneOf(wheel0) : undefined
  const tempInput = document.createElement('input')
  tempInput.type = 'number'
  tempInput.step = '0.5'
  tempInput.value = String((zone0?.targetTempC ?? 11) + 2)
  const humInput = document.createElement('input')
  humInput.type = 'number'
  humInput.step = '0.02'
  humInput.min = '0.5'
  humInput.max = '1'
  humInput.value = String(zone0?.targetHumidity ?? 0.9)

  const controls = el('div', { className: 'toolbar card', style: 'padding:12px 16px;flex-wrap:wrap' },
    el('span', { className: 'muted' }, '对比轮'), wheelSel,
    el('span', { className: 'muted' }, '假设窖温 °C'), tempInput,
    el('span', { className: 'muted' }, '假设湿度'), humInput,
  )

  const compare = el('div', { className: 'grid', style: 'grid-template-columns:1fr 1fr;align-items:start' })
  const diffBox = el('div', { className: 'card stack' })
  root.append(head, controls, compare, diffBox)

  // 向未来推 180 天
  const futureOffset = 180

  const mountPair = () => {
    baseline?.dispose()
    scenario?.dispose()
    const wheelId = wheelSel.value
    const filter = (w: CheeseWheel) => w.id === wheelId
    const maxDay = dayIndex(wheel0 ? appStore.wheels.find((w) => w.id === wheelId)!.enteredAt : new Date().toISOString(), appStore.viewDate) + futureOffset

    baseline = createViewerPanel({
      wheelFilter: filter,
      initialWheelId: wheelId,
      maxDayOffset: maxDay,
      hideCave: true,
      // 单向同步：仅左侧真实场景的时间轴驱动右侧假设场景，避免互相回传死循环
      onDateChange: (at) => {
        scenario?.setDate(at)
        updateDiff(at)
      },
    })
    scenario = createViewerPanel({
      wheelFilter: filter,
      initialWheelId: wheelId,
      maxDayOffset: maxDay,
      hideCave: true,
      stateResolver: (w, at) =>
        appStore.scenarioState(w, at, {
          tempC: Number(tempInput.value),
          humidity: Number(humInput.value),
        }),
    })

    labelPanel(baseline.root, '真实窖区气候', icon('cave'))
    labelPanel(scenario.root, `假设场景 ${tempInput.value}°C / ${Math.round(Number(humInput.value) * 100)}%`, icon('forecast'))
    compare.replaceChildren(baseline.root, scenario.root)
    baseline.mount()
    scenario.mount()
    updateDiff(dateAtDay(appStore.wheels.find((w) => w.id === wheelId)!.enteredAt, maxDay))
  }

  function updateDiff(at: Date): void {
    const wheel = appStore.wheels.find((w) => w.id === wheelSel.value)
    if (!wheel) return
    const real = appStore.rindState(wheel, at)
    const fake = appStore.scenarioState(wheel, at, {
      tempC: Number(tempInput.value),
      humidity: Number(humInput.value),
    })
    diffBox.replaceChildren(
      el('h2', {}, `场景差异 · ${at.toISOString().slice(0, 10)}`),
      diffRows(real, fake),
    )
  }

  wheelSel.addEventListener('change', mountPair)
  tempInput.addEventListener('change', mountPair)
  humInput.addEventListener('change', mountPair)
  mountPair()
}

function labelPanel(panelRoot: HTMLElement, title: string, iconHtml: string): void {
  const banner = el('div', {
    className: 'tag primary',
    style: 'position:absolute;top:12px;right:12px;z-index:6;padding:6px 12px;background:rgba(255,255,255,0.92)',
  })
  banner.append(iconLabel(iconHtml, title))
  const viewport = panelRoot.querySelector('.viewport') as HTMLElement | null
  viewport?.append(banner)
}

function diffRows(real: RindState, fake: RindState): HTMLElement {
  const keys: { key: keyof RindState; label: string }[] = [
    { key: 'geotrichum', label: '白地霉绒毛' },
    { key: 'penicillium', label: '青霉蓝绿斑' },
    { key: 'mite', label: '螨虫麻点' },
    { key: 'smear', label: '洗浸橙红菌' },
    { key: 'browning', label: '褐变程度' },
    { key: 'cracking', label: '干裂风险' },
  ]
  return el('div', { className: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(220px,1fr))' },
    ...keys.map(({ key, label }) => {
      const a = Number(real[key])
      const b = Number(fake[key])
      const delta = b - a
      const tone = Math.abs(delta) < 0.03 ? 'muted' : delta > 0 ? 'tag warn' : 'tag info'
      return el('div', { className: 'stat' },
        el('span', { className: 'label' }, label),
        el('span', { className: 'num', style: 'font-size:18px' }, `${pct(a)} → ${pct(b)}`),
        el('span', { className: tone }, `${delta >= 0 ? '+' : ''}${pct(delta)}`),
      )
    }),
  )
}
