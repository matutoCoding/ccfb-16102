// 设置页：菌种/裂纹参数、刷皮恢复与皮色调整，保存后全量重算生长状态
import type { AppSettings, SpeciesParam } from '../../types'
import { appStore } from '../../core/store'
import { el, clear, iconLabel, modal, toast } from '../dom'
import { icon } from '../icons'

export function renderSettingsPage(root: HTMLElement): void {
  clear(root)
  // 编辑副本，保存时一次性提交
  const draft: AppSettings = structuredClone(appStore.settings)

  const head = el('div', { className: 'page-head' },
    el('h1', {}, '设置'),
    el('p', {}, '参数同时作用于生长模型与着色器，保存后所有轮子按新参数重新演化，外观仍可复现'),
  )

  const body = el('div', { className: 'stack' })
  body.append(
    speciesCard('白地霉（绒毛）', draft.mold.geotrichum, 0.95),
    speciesCard('青霉（蓝绿斑）', draft.mold.penicillium, 0.92),
    speciesCard('螨虫（粉状麻点）', draft.mold.mite, 0.88),
    speciesCard('洗浸皮菌（橙红黏面）', draft.mold.smear, 0.95),
    crackCard(draft),
    behaviorCard(draft),
    colorCard(draft),
    dataCard(root),
  )

  const saveBar = el('div', { className: 'toolbar card', style: 'position:sticky;bottom:16px;justify-content:flex-end' },
    el('button', {}, '恢复默认'),
    el('button', { className: 'primary' }, '保存设置并重算'),
  )
  saveBar.querySelector('button.primary')!.addEventListener('click', async () => {
    await appStore.saveSettings(draft)
    toast('设置已保存，全部轮子生长结果已重算')
    // 触发主路由重新挂载，让查看器用新参数重建
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  saveBar.querySelector('button:not(.primary)')!.addEventListener('click', () => {
    renderSettingsPage(root)
  })

  root.append(head, body, saveBar)
}

function speciesCard(title: string, param: SpeciesParam, maxLove: number): HTMLElement {
  return el('div', { className: 'card' },
    el('h3', { style: 'margin-bottom:16px' }, title),
    slider('菌落点数量', param.colonies, 1, 16, 1, (v) => (param.colonies = v)),
    slider('生长速率（每日）', param.growthRate, 0.002, 0.03, 0.001, (v) => (param.growthRate = v), 3),
    slider('湿度偏好', param.humidityLove, 0.7, maxLove, 0.01, (v) => (param.humidityLove = v), 2),
    slider('着色强度', param.strength, 0.2, 1, 0.05, (v) => (param.strength = v), 2),
  )
}

function crackCard(draft: AppSettings): HTMLElement {
  const c = draft.mold.crack
  return el('div', { className: 'card' },
    el('h3', { style: 'margin-bottom:16px' }, '干裂纹'),
    slider('触发湿度阈值', c.humidityThreshold, 0.6, 0.92, 0.01, (v) => (c.humidityThreshold = v), 2),
    slider('裂纹密度', c.density, 0.1, 1.5, 0.05, (v) => (c.density = v), 2),
    slider('裂纹宽度', c.width, 0.03, 0.2, 0.005, (v) => (c.width = v), 3),
  )
}

function behaviorCard(draft: AppSettings): HTMLElement {
  return el('div', { className: 'card' },
    el('h3', { style: 'margin-bottom:16px' }, '作业与熟成行为'),
    slider('刷皮后霉斑残余', draft.brushRemnant, 0.05, 0.6, 0.05, (v) => (draft.brushRemnant = v), 2),
    slider('刷皮恢复天数', draft.brushRecoverDays, 5, 45, 1, (v) => (draft.brushRecoverDays = v)),
    slider('漏翻告警天数', draft.neglectTurnDays, 7, 30, 1, (v) => (draft.neglectTurnDays = v)),
  )
}

function colorCard(draft: AppSettings): HTMLElement {
  const young = colorInput('入窖乳黄', draft.rindYoung)
  const aged = colorInput('熟成棕褐', draft.rindAged)
  return el('div', { className: 'card' },
    el('h3', { style: 'margin-bottom:16px' }, '外皮色阶'),
    el('div', { className: 'form-grid' }, young, aged),
  )
}

function colorInput(label: string, rgb: [number, number, number]): HTMLElement {
  const toHex = (c: number[]) =>
    '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  const input = document.createElement('input')
  input.type = 'color'
  input.value = toHex(rgb)
  input.style.height = '40px'
  input.addEventListener('change', () => {
    const hex = input.value
    rgb[0] = parseInt(hex.slice(1, 3), 16) / 255
    rgb[1] = parseInt(hex.slice(3, 5), 16) / 255
    rgb[2] = parseInt(hex.slice(5, 7), 16) / 255
  })
  return el('div', {}, el('label', {}, label), input)
}

function slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  apply: (v: number) => void,
  digits = 0,
): HTMLElement {
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  const val = el('strong', {}, value.toFixed(digits))
  input.addEventListener('input', () => {
    const v = Number(input.value)
    apply(v)
    val.textContent = v.toFixed(digits)
  })
  return el('div', { className: 'range-row', style: 'margin-bottom:12px' },
    el('span', { className: 'muted' }, label), input, val)
}

function dataCard(root: HTMLElement): HTMLElement {
  const reset = el('button', { className: 'danger' }, iconLabel(icon('trash'), '重置为内置测试数据'))
  reset.addEventListener('click', () => {
    const mask = modal(
      '确认重置',
      el('p', {}, '将清空当前窖区、轮子、记录与巡检，并重新生成内置测试数据，此操作不可撤销。'),
      el('div', { className: 'row', style: 'justify-content:flex-end;margin-top:16px' },
        el('button', {}, '取消'),
        el('button', { className: 'danger' }, '确认重置'),
      ),
    )
    const [cancel, confirm] = mask.querySelectorAll('button')
    cancel.addEventListener('click', () => mask.remove())
    confirm.addEventListener('click', async () => {
      await appStore.resetToSeed()
      mask.remove()
      toast('已恢复内置测试数据')
      renderSettingsPage(root)
    })
  })
  return el('div', { className: 'card' },
    el('h3', { style: 'margin-bottom:8px' }, '数据管理'),
    el('p', { className: 'muted', style: 'margin-bottom:16px' }, '所有数据仅保存在本机浏览器 IndexedDB，不上传任何服务器'),
    reset,
  )
}
