// 翻刷记录页：按轮子查看翻面/刷皮/抹油/洗盐水时间线，新增作业即时驱动生长模型
import type { CareAction, CareRecord } from '../../types'
import { CARE_LABEL } from '../../types'
import { appStore } from '../../core/store'
import { uid } from '../../core/rng'
import { el, clear, emptyState, fmtDateTime, iconLabel, modal, toast } from '../dom'
import { icon } from '../icons'

const ACTION_TAG: Record<CareAction, string> = {
  turn: 'info',
  brush: 'primary',
  oil: 'warn',
  brine_wash: 'danger',
}

export function renderRecordsPage(root: HTMLElement): void {
  clear(root)
  const head = el('div', { className: 'page-head spread' },
    el('div', { className: 'col' },
      el('h1', {}, '翻刷记录'),
      el('p', {}, '每次翻面、刷皮、抹油、洗盐水都会改变外皮演化：刷淡霉斑、释放压痕、抑制好氧霉'),
    ),
  )

  const wheelSel = document.createElement('select')
  for (const w of appStore.wheels) {
    const opt = document.createElement('option')
    opt.value = w.id
    opt.textContent = w.label
    wheelSel.append(opt)
  }
  const addBtn = el('button', { className: 'primary' }, iconLabel(icon('plus'), '登记作业'))
  const bar = el('div', { className: 'toolbar card', style: 'padding:12px 16px' },
    el('span', { className: 'muted' }, '奶酪轮'), wheelSel,
    el('span', { className: 'grow' }), addBtn,
  )

  const timeline = el('div', { className: 'card' })
  root.append(head, bar, timeline)

  const renderTimeline = () => {
    const wheelId = wheelSel.value
    const records = appStore.recordsOf(wheelId)
    timeline.replaceChildren()
    if (records.length === 0) {
      timeline.append(emptyState('该轮还没有作业记录', '登记第一次翻面或刷皮', icon('brush')))
      return
    }
    const rows = [...records].reverse().map((r) =>
      el('div', { className: 'row', style: 'gap:16px;padding:12px 0;border-bottom:1px solid var(--border)' },
        el('span', { className: `tag ${ACTION_TAG[r.action]}`, style: 'min-width:72px;text-align:center' },
          CARE_LABEL[r.action]),
        el('div', { className: 'col grow' },
          el('strong', {}, fmtDateTime(r.at)),
          el('span', { className: 'muted' },
            `操作人 ${r.operator} · 强度 ${Math.round(r.intensity * 100)}% · ${r.note ?? '无备注'}`),
        ),
      ),
    )
    timeline.append(...rows)
  }

  wheelSel.addEventListener('change', renderTimeline)
  addBtn.addEventListener('click', () => openCareModal(wheelSel.value, renderTimeline))
  renderTimeline()
}

function openCareModal(wheelId: string, onSaved: () => void): void {
  const actionSel = document.createElement('select')
  for (const action of Object.keys(CARE_LABEL) as CareAction[]) {
    const opt = document.createElement('option')
    opt.value = action
    opt.textContent = CARE_LABEL[action]
    actionSel.append(opt)
  }
  const intensity = document.createElement('input')
  intensity.type = 'range'
  intensity.min = '0.1'
  intensity.max = '1'
  intensity.step = '0.05'
  intensity.value = '0.6'
  const intensityVal = el('strong', {}, '60%')
  intensity.addEventListener('input', () => {
    intensityVal.textContent = `${Math.round(Number(intensity.value) * 100)}%`
  })
  const operator = document.createElement('input')
  operator.value = '老周'
  const note = document.createElement('textarea')
  note.rows = 2
  note.placeholder = '作业备注（可选）'

  const body = el('div', { className: 'col' },
    el('div', { className: 'form-grid' },
      el('div', {}, el('label', {}, '作业类型'), actionSel),
      el('div', {}, el('label', {}, '操作人'), operator),
    ),
    el('label', {}, '作业强度'),
    el('div', { className: 'row' }, intensity, intensityVal),
    el('label', {}, '备注'), note,
  )
  const save = el('button', { className: 'primary' }, '保存作业')
  const footer = el('div', { className: 'row', style: 'justify-content:flex-end;margin-top:16px' }, save)
  const mask = modal('登记翻刷作业', body, footer)

  save.addEventListener('click', async () => {
    const record: CareRecord = {
      id: uid('care'),
      wheelId,
      at: new Date().toISOString(),
      action: actionSel.value as CareAction,
      intensity: Number(intensity.value),
      operator: operator.value || '未署名',
      note: note.value || undefined,
    }
    await appStore.addRecord(record)
    mask.remove()
    toast('作业已记录，外皮状态将按新事件重新演化')
    onSaved()
  })
}
