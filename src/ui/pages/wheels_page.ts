// 奶酪轮档案页：按批次分组，三类奶酪分色标识，支持新建轮子并分配架位
import type { CheeseCategory, CheeseWheel } from '../../types'
import { CATEGORY_LABEL } from '../../types'
import { appStore } from '../../core/store'
import { dayIndex } from '../../core/growth'
import { hashString, uid } from '../../core/rng'
import { el, clear, emptyState, fmtDate, modal, toast } from '../dom'
import { icon } from '../icons'
import { navigate } from '../router'

const CATEGORY_TAG: Record<CheeseCategory, string> = {
  natural_rind: 'primary',
  washed_rind: 'warn',
  white_mold: 'info',
}

export function renderWheelsPage(root: HTMLElement): void {
  clear(root)
  const head = el('div', { className: 'page-head spread' },
    el('div', { className: 'col' },
      el('h1', {}, '奶酪轮档案'),
      el('p', {}, '按批次建档，录入直径、高度与入窖日期，每轮绑定唯一可复现种子'),
    ),
    newWheelBtn(root),
  )

  const groups = new Map<string, CheeseWheel[]>()
  for (const wheel of appStore.wheels) {
    const list = groups.get(wheel.batchId)
    if (list) list.push(wheel)
    else groups.set(wheel.batchId, [wheel])
  }

  const body = el('div', { className: 'stack' })
  if (groups.size === 0) {
    body.append(emptyState('还没有奶酪轮', '新建第一个批次的轮子开始建档', icon('wheel')))
  }
  for (const [batchId, wheels] of groups) {
    const batch = appStore.batches.find((b) => b.id === batchId)
    if (!batch) continue
    body.append(batchCard(batch.code, batch.category, wheels))
  }
  root.append(head, body)
}

function batchCard(code: string, category: CheeseCategory, wheels: CheeseWheel[]): HTMLElement {
  const rows = wheels.map((w) => {
    const age = dayIndex(w.enteredAt, appStore.viewDate)
    const slot = appStore.zones
      .flatMap((z) => z.slots)
      .find((s) => s.id === w.slotId)
    const moveBtn = el('button', { className: 'ghost', title: '调整架位' }, '调位')
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openMoveModal(w)
    })
    const tr = el('tr', {},
      el('td', {}, w.label),
      el('td', {}, el('span', { className: `tag ${CATEGORY_TAG[category]}` }, CATEGORY_LABEL[category])),
      el('td', {}, `${Math.round(w.diameter * 1000)}mm × ${Math.round(w.height * 1000)}mm`),
      el('td', {}, fmtDate(w.enteredAt)),
      el('td', {}, `${age} 天 / 目标 ${w.targetDays} 天`),
      el('td', {}, slot ? slot.code : '未上架'),
      el('td', {}, seedCell(w.seed)),
      el('td', {}, moveBtn),
    )
    tr.style.cursor = 'pointer'
    tr.addEventListener('click', () => navigate('rind', w.id))
    return tr
  })

  return el('div', { className: 'card' },
    el('div', { className: 'spread', style: 'margin-bottom:12px' },
      el('h2', {}, `批次 ${code}`),
      el('span', { className: 'muted' }, `${wheels.length} 个轮子 · 点击行查看外皮`),
    ),
    el('table', { className: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, '轮编号'), el('th', {}, '类型'), el('th', {}, '尺寸'),
        el('th', {}, '入窖日期'), el('th', {}, '熟成进度'), el('th', {}, '架位'),
        el('th', {}, '外观种子'), el('th', {}, '操作'))),
      el('tbody', {}, ...rows),
    ),
  )
}

function seedCell(seed: number): HTMLElement {
  return el('code', { className: 'muted', style: 'font-size:12px' }, String(seed % 100000))
}

function newWheelBtn(root: HTMLElement): HTMLElement {
  const btn = el('button', { className: 'primary' }, el('span', { style: 'display:flex;align-items:center;gap:6px' }))
  btn.querySelector('span')!.innerHTML = `${icon('plus')} 新建奶酪轮`
  btn.addEventListener('click', () => openNewModal(root))
  return btn
}

// 调位弹窗：列出全部窖区的空闲架位（含当前位），选定后同步轮子的窖区与位号
function openMoveModal(wheel: CheeseWheel): void {
  const occupied = new Set(appStore.wheels.map((w) => w.slotId).filter((id): id is string => id !== null))
  const zoneSel = document.createElement('select')
  const slotSel = document.createElement('select')

  const fillSlots = (zoneId: string) => {
    const zone = appStore.zones.find((z) => z.id === zoneId)
    slotSel.replaceChildren()
    if (!zone) return
    for (const s of zone.slots) {
      const isSelf = s.id === wheel.slotId
      const busy = occupied.has(s.id) && !isSelf
      if (busy) continue
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = isSelf ? `${s.code}（当前位）` : s.code
      slotSel.append(opt)
    }
  }

  for (const z of appStore.zones) {
    const opt = document.createElement('option')
    opt.value = z.id
    opt.textContent = z.name
    if (z.id === wheel.zoneId) opt.selected = true
    zoneSel.append(opt)
  }
  fillSlots(wheel.zoneId)
  zoneSel.addEventListener('change', () => fillSlots(zoneSel.value))

  const body = el('div', { className: 'form-grid' },
    el('div', {}, el('label', {}, '目标窖区'), zoneSel),
    el('div', {}, el('label', {}, '目标架位'), slotSel),
  )
  const save = el('button', { className: 'primary' }, '确认调位')
  const footer = el('div', { className: 'row', style: 'justify-content:flex-end;margin-top:16px' }, save)
  const mask = modal(`调整架位 · ${wheel.label}`, body, footer)

  save.addEventListener('click', async () => {
    const updated: CheeseWheel = {
      ...wheel,
      zoneId: zoneSel.value,
      slotId: slotSel.value,
    }
    await appStore.updateWheel(updated)
    mask.remove()
    toast(`已调至 ${appStore.zones.find((z) => z.id === zoneSel.value)?.name ?? ''} 的架位`)
    renderWheelsPage(document.querySelector('.content') as HTMLElement)
  })
}

function openNewModal(root: HTMLElement): void {
  const batchSel = document.createElement('select')
  for (const b of appStore.batches) {
    const opt = document.createElement('option')
    opt.value = b.id
    opt.textContent = `${b.code}（${CATEGORY_LABEL[b.category]}）`
    batchSel.append(opt)
  }
  const zoneSel = document.createElement('select')
  for (const z of appStore.zones) {
    const opt = document.createElement('option')
    opt.value = z.id
    opt.textContent = z.name
    zoneSel.append(opt)
  }
  const wheelNo = document.createElement('input')
  wheelNo.type = 'number'
  wheelNo.value = '1'
  const diameter = document.createElement('input')
  diameter.type = 'number'
  diameter.step = '0.005'
  diameter.value = '0.32'
  const height = document.createElement('input')
  height.type = 'number'
  height.step = '0.005'
  height.value = '0.11'

  const body = el('div', { className: 'form-grid' },
    el('div', {}, el('label', {}, '批次'), batchSel),
    el('div', {}, el('label', {}, '窖区'), zoneSel),
    el('div', {}, el('label', {}, '轮编号'), wheelNo),
    el('div', {}, el('label', {}, '直径（米）'), diameter),
    el('div', {}, el('label', {}, '高度（米）'), height),
  )
  const save = el('button', { className: 'primary' }, '建档')
  const footer = el('div', { className: 'row', style: 'justify-content:flex-end;margin-top:16px' }, save)
  const mask = modal('新建奶酪轮', body, footer)

  save.addEventListener('click', async () => {
    const batch = appStore.batches.find((b) => b.id === batchSel.value)
    const zone = appStore.zones.find((z) => z.id === zoneSel.value)
    if (!batch || !zone) return
    const freeSlot = zone.slots.find((s) => !appStore.wheels.some((w) => w.slotId === s.id))
    const seq = appStore.wheels.length + 1
    const wheel: CheeseWheel = {
      id: uid('wheel'),
      batchId: batch.id,
      zoneId: zone.id,
      slotId: freeSlot?.id ?? null,
      wheelNo: Number(wheelNo.value),
      label: `${batch.code}-${String(Number(wheelNo.value)).padStart(2, '0')}`,
      diameter: Number(diameter.value),
      height: Number(height.value),
      enteredAt: new Date().toISOString(),
      targetDays: batch.category === 'white_mold' ? 60 : batch.category === 'washed_rind' ? 180 : 540,
      seed: hashString(`${uid('wheel')}:${batch.code}:${seq}`),
      active: true,
    }
    await appStore.addWheel(wheel)
    mask.remove()
    toast('奶酪轮已建档并分配最近的空闲架位')
    renderWheelsPage(root)
  })
}
