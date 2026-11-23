// 窖区档案页：分区卡片、温湿度曲线、通风口、架位编号、新增温湿度采样
import type { CaveZone, ClimateSample } from '../../types'
import { appStore } from '../../core/store'
import { uid } from '../../core/rng'
import { el, clear, iconLabel, modal, toast } from '../dom'
import { icon } from '../icons'
import { lineChart } from '../line_chart'

export function renderZonesPage(root: HTMLElement): void {
  clear(root)
  const head = el('div', { className: 'page-head' },
    el('h1', {}, '窖区档案'),
    el('p', {}, '按山洞分区建档，维护温湿度记录、通风口位置与杉木架层位编号'),
  )

  const statRow = el('div', { className: 'stat-grid' },
    stat(appStore.zones.length, '窖区数量'),
    stat(appStore.zones.reduce((n, z) => n + z.slots.length, 0), '架位总数'),
    stat(appStore.wheels.length, '在架奶酪轮'),
    stat(
      appStore.zones.map((z) => z.targetHumidity).reduce((a, b) => a + b, 0) /
        Math.max(1, appStore.zones.length),
      '平均目标湿度', true,
    ),
  )

  const list = el('div', { className: 'stack' })
  for (const zone of appStore.zones) list.append(zoneCard(zone))

  root.append(head, statRow, list)
}

function stat(num: number | string, label: string, isPct = false): HTMLElement {
  const value = typeof num === 'number' && isPct ? `${Math.round(num * 100)}%` : num
  return el('div', { className: 'stat' },
    el('span', { className: 'num' }, String(value)),
    el('span', { className: 'label' }, label),
  )
}

function zoneCard(zone: CaveZone): HTMLElement {
  const recent = [...zone.climate].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 90)
  const tempPoints = recent
    .slice()
    .reverse()
    .map((c) => ({ t: c.at, v: (c.tempC + 2) / 30 }))
  const humPoints = recent
    .slice()
    .reverse()
    .map((c) => ({ t: c.at, v: c.humidity }))

  const slotRows = zone.slots.slice(0, 8).map((s) =>
    el('tr', {}, el('td', {}, s.code), el('td', {}, s.shelf), el('td', {}, `第 ${s.level} 层`),
      el('td', {}, `${s.position} 号位`),
      el('td', {}, slotWheelName(s.id))),
  )

  const vents = zone.vents.map((v) =>
    el('span', { className: 'tag info' }, iconLabel(icon('vent'), v.name)),
  )

  const card = el('div', { className: 'card stack' },
    el('div', { className: 'spread' },
      el('div', { className: 'col' },
        el('h2', {}, zone.name),
        el('span', { className: 'muted' },
          `目标 ${zone.targetTempC}°C / ${Math.round(zone.targetHumidity * 100)}% 湿度 ·
           ${zone.width.toFixed(1)}m × ${zone.depth.toFixed(1)}m × ${zone.height.toFixed(1)}m · ${zone.slots.length} 个架位`),
      ),
      el('div', { className: 'row' }, ...vents, addSampleBtn(zone)),
    ),
    lineChart([
      { label: '温度（归一化）', color: '#b77a1f', points: tempPoints },
      { label: '相对湿度', color: '#2f6f5e', points: humPoints },
    ]),
    el('div', { style: 'max-height:260px;overflow:auto' },
      el('table', { className: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, '位号'), el('th', {}, '架号'), el('th', {}, '层'), el('th', {}, '位置'), el('th', {}, '在架轮'))),
        el('tbody', {}, ...slotRows),
      ),
    ),
    zone.slots.length > 8 ? el('p', { className: 'muted' }, `仅显示前 8 个位号，共 ${zone.slots.length} 个`) : el('span'),
  )
  return card
}

function slotWheelName(slotId: string): string {
  const wheel = appStore.wheels.find((w) => w.slotId === slotId)
  return wheel ? wheel.label : '—'
}

function addSampleBtn(zone: CaveZone): HTMLElement {
  const btn = el('button', { className: 'primary' }, '录入温湿度')
  btn.addEventListener('click', () => openSampleModal(zone))
  return btn
}

function openSampleModal(zone: CaveZone): void {
  const tempInput = document.createElement('input')
  tempInput.type = 'number'
  tempInput.step = '0.1'
  tempInput.value = String(zone.targetTempC)
  const humInput = document.createElement('input')
  humInput.type = 'number'
  humInput.step = '0.01'
  humInput.min = '0'
  humInput.max = '1'
  humInput.value = String(zone.targetHumidity)

  const body = el('div', { className: 'form-grid' },
    el('div', {}, el('label', {}, '温度 °C'), tempInput),
    el('div', {}, el('label', {}, '相对湿度 0~1'), humInput),
  )

  const save = el('button', { className: 'primary' }, '保存采样')
  const footer = el('div', { className: 'row', style: 'justify-content:flex-end;margin-top:16px' }, save)
  const mask = modal(`录入温湿度 · ${zone.name}`, body, footer)

  save.addEventListener('click', async () => {
    const sample: ClimateSample = {
      id: uid('climate'),
      at: new Date().toISOString(),
      tempC: Number(tempInput.value),
      humidity: Number(humInput.value),
    }
    zone.climate.push(sample)
    await appStore.updateZone(zone)
    mask.remove()
    toast('温湿度已记录')
    renderZonesPage(document.querySelector('.content') as HTMLElement)
  })
}
