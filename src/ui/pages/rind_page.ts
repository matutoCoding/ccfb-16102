// 外皮查看页：整层 / 单轮双视图 + 巡检照片并排比对
import type { CheeseWheel, Inspection } from '../../types'
import { appStore } from '../../core/store'
import { blobRepo } from '../../core/db'
import { uid } from '../../core/rng'
import { el, clear, emptyState, fmtDateTime, iconLabel, modal, toast } from '../dom'
import { icon } from '../icons'
import { navigate } from '../router'
import { createViewerPanel, type ViewerPanel } from '../components/viewer_panel'

let panel: ViewerPanel | null = null

export function renderRindPage(root: HTMLElement, param: string | null): void {
  clear(root)
  panel?.dispose()
  panel = null

  const head = el('div', { className: 'page-head' },
    el('h1', {}, '外皮查看'),
    el('p', {}, '物体空间程序化外皮，无贴图、无接缝；同轮同日刷新页面结果完全一致'),
  )

  const zoneSel = document.createElement('select')
  for (const z of appStore.zones) {
    const opt = document.createElement('option')
    opt.value = z.id
    opt.textContent = z.name
    zoneSel.append(opt)
  }
  const levelSel = document.createElement('select')
  const inspectBtn = el('button', {}, iconLabel(icon('camera'), '上传巡检照片'))

  const filterBar = el('div', { className: 'toolbar card', style: 'padding:12px 16px' },
    el('span', { className: 'muted' }, '窖区'), zoneSel,
    el('span', { className: 'muted' }, '层位'), levelSel,
    el('span', { className: 'grow' }),
    inspectBtn,
  )

  const stage = el('div', {})
  root.append(head, filterBar, stage)

  const fillLevels = () => {
    const zone = appStore.zones.find((z) => z.id === zoneSel.value)
    levelSel.replaceChildren()
    const all = document.createElement('option')
    all.value = ''
    all.textContent = '全部层'
    levelSel.append(all)
    if (!zone) return
    const levels = [...new Set(zone.slots.map((s) => s.level))].sort((a, b) => a - b)
    for (const lv of levels) {
      const opt = document.createElement('option')
      opt.value = String(lv)
      opt.textContent = `第 ${lv} 层`
      levelSel.append(opt)
    }
  }

  const mount = () => {
    panel?.dispose()
    const zoneId = zoneSel.value
    const level = levelSel.value ? Number(levelSel.value) : null
    const slotIds = new Set(
      appStore.zones
        .find((z) => z.id === zoneId)
        ?.slots.filter((s) => level === null || s.level === level)
        .map((s) => s.id) ?? [],
    )
    const filter = (w: CheeseWheel) =>
      w.zoneId === zoneId && (level === null || (w.slotId !== null && slotIds.has(w.slotId)))
    if (appStore.wheels.filter(filter).length === 0) {
      stage.replaceChildren(emptyState('该层位没有奶酪轮', '换个层位或窖区看看', icon('wheel')))
      return
    }
    panel = createViewerPanel({
      wheelFilter: filter,
      initialWheelId: param,
    })
    stage.replaceChildren(panel.root)
    panel.mount()
  }

  zoneSel.addEventListener('change', () => {
    fillLevels()
    mount()
  })
  levelSel.addEventListener('change', mount)

  inspectBtn.addEventListener('click', () => {
    const current = panel?.viewer.getSelected()
    if (!current) {
      toast('先在场景里点选一个轮子再上传巡检照片', 'warn')
      return
    }
    openInspectionModal(current, () => panel?.refreshStates())
  })

  fillLevels()
  mount()
}

// 巡检弹窗：上传照片，与程序画面截图并排，计算差异分并标记复核
function openInspectionModal(wheelId: string, onSaved: () => void): void {
  const wheel = appStore.wheels.find((w) => w.id === wheelId)
  if (!wheel) return
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  const photoBox = el('div', { className: 'viewport', style: 'min-height:200px' },
    emptyState('未选择照片', '选择熟成师现场拍摄的外皮照片', icon('camera')))
  const renderBox = el('div', { className: 'viewport', style: 'min-height:200px' })
  const result = el('p', { className: 'muted' }, '上传后自动比对程序画面')

  let photoBlob: Blob | null = null
  fileInput.addEventListener('change', () => {
    photoBlob = fileInput.files?.[0] ?? null
    if (photoBlob) {
      const url = URL.createObjectURL(photoBlob)
      const img = el('img', { src: url, style: 'width:100%;height:100%;object-fit:cover' })
      photoBox.replaceChildren(img)
    }
  })

  const noteInput = document.createElement('textarea')
  noteInput.rows = 2
  noteInput.placeholder = '巡检备注（可选）'

  const body = el('div', { className: 'col' },
    el('p', {}, `轮子：${wheel.label}`),
    fileInput,
    el('div', { className: 'grid', style: 'grid-template-columns:1fr 1fr' },
      el('div', { className: 'col' }, el('label', {}, '现场照片'), photoBox),
      el('div', { className: 'col' }, el('label', {}, '程序生成画面'), renderBox),
    ),
    result,
    el('label', {}, '备注'), noteInput,
  )

  const save = el('button', { className: 'primary' }, '提交巡检')
  const footer = el('div', { className: 'row', style: 'justify-content:space-between;margin-top:16px' },
    el('button', { className: 'ghost' }, '查看历史巡检'),
    save,
  )
  const mask = modal('巡检照片比对', body, footer)

  // 截取当前程序画面用于并排展示（preserveDrawingBuffer 已开启，可直接导出）
  requestAnimationFrame(() => {
    const canvas = document.querySelector('.viewport canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const shot = el('img', {
      src: canvas.toDataURL('image/png'),
      style: 'width:100%;height:100%;object-fit:cover',
    })
    renderBox.replaceChildren(shot)
  })

  footer.querySelector('button.ghost')!.addEventListener('click', () => {
    mask.remove()
    openHistoryModal(wheelId)
  })

  save.addEventListener('click', async () => {
    if (!photoBlob) {
      toast('请先选择现场照片', 'warn')
      return
    }
    const blobId = uid('blob')
    await blobRepo.put({ id: blobId, blob: photoBlob, mime: photoBlob.type })
    const diffScore = await estimateDiff(photoBlob)
    const flagged = diffScore >= 0.45
    const inspection: Inspection = {
      id: uid('insp'),
      wheelId,
      at: new Date().toISOString(),
      photoBlobId: blobId,
      diffScore,
      review: flagged ? 'flagged' : 'pending',
      note: noteInput.value || undefined,
    }
    await appStore.addInspection(inspection)
    mask.remove()
    toast(flagged ? `差异分 ${Math.round(diffScore * 100)}，已标记人工复核` : '巡检已提交')
    onSaved()
  })
}

// 差异估计：把照片缩到 32x32 灰度，与中性程序基线算归一化色差
async function estimateDiff(blob: Blob): Promise<number> {
  const bitmap = await createImageBitmap(blob)
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  let sum = 0
  // 程序外皮的典型灰度基线约 0.45，带褐色偏移
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255
    sum += Math.abs(gray - 0.45)
  }
  bitmap.close()
  return Math.min(1, sum / (size * size) * 1.6)
}

async function openHistoryModal(wheelId: string): Promise<void> {
  const list = appStore.inspectionsOf(wheelId)
  const body = el('div', { className: 'col' })
  if (list.length === 0) {
    body.append(emptyState('暂无巡检记录', '该轮子还没有上传过照片', icon('camera')))
  }
  for (const insp of list) {
    let img: HTMLElement = el('span', { className: 'muted' }, '照片缺失')
    if (insp.photoBlobId) {
      const stored = await blobRepo.get(insp.photoBlobId)
      if (stored) {
        const url = URL.createObjectURL(stored.blob)
        img = el('img', { src: url, style: 'width:120px;height:90px;object-fit:cover;border-radius:6px' })
      }
    }
    const reviewTag =
      insp.review === 'flagged' ? el('span', { className: 'tag danger' }, '待复核')
        : insp.review === 'ok' ? el('span', { className: 'tag primary' }, '已确认正常')
        : el('span', { className: 'tag warn' }, '待处理')
    const row = el('div', { className: 'row', style: 'gap:16px;padding:8px 0;border-bottom:1px solid var(--border)' },
      img,
      el('div', { className: 'col grow' },
        el('strong', {}, fmtDateTime(insp.at)),
        el('span', { className: 'muted' }, `差异分 ${insp.diffScore === null ? '—' : Math.round(insp.diffScore * 100)} · ${insp.note ?? '无备注'}`),
      ),
      reviewTag,
      confirmButton(insp),
    )
    body.append(row)
  }
  modal(`巡检历史 · ${appStore.wheels.find((w) => w.id === wheelId)?.label ?? ''}`, body)
}

function confirmButton(insp: Inspection): HTMLElement {
  const btn = el('button', {}, iconLabel(icon('check'), '确认正常'))
  btn.addEventListener('click', async () => {
    await appStore.updateInspection({ ...insp, review: 'ok' })
    toast('已标记为正常')
    navigate('rind')
  })
  return btn
}
