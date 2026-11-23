// 轻量折线图：Canvas 手绘温湿度，零图表依赖
import { el } from './dom'

export function lineChart(
  series: { label: string; color: string; points: { t: string; v: number }[] }[],
  height = 180,
): HTMLElement {
  const wrapEl = el('div', { className: 'col' })
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = `${height}px`
  canvas.height = height * 2
  wrapEl.append(canvas)
  const legend = el('div', { className: 'row', style: 'gap:16px;flex-wrap:wrap' })
  for (const s of series) {
    legend.append(el('span', { className: 'row', style: 'gap:6px;font-size:14px;color:var(--text-2)' },
      dot(s.color), s.label))
  }
  wrapEl.append(legend)
  requestAnimationFrame(() => draw(canvas, series))
  return wrapEl
}

function dot(color: string): HTMLElement {
  return el('span', {
    style: `width:10px;height:10px;border-radius:50%;background:${color};display:inline-block`,
  })
}

function draw(
  canvas: HTMLCanvasElement,
  series: { label: string; color: string; points: { t: string; v: number }[] }[],
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = 2
  const w = canvas.clientWidth * dpr
  const h = canvas.height
  canvas.width = w
  ctx.clearRect(0, 0, w, h)
  ctx.font = '12px sans-serif'
  ctx.lineWidth = 2 * dpr

  const padL = 44 * dpr
  const padR = 12 * dpr
  const padT = 12 * dpr
  const padB = 22 * dpr
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  // 网格
  ctx.strokeStyle = '#e4e8ed'
  ctx.fillStyle = '#8590a0'
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(w - padR, y)
    ctx.stroke()
    const val = 1 - i / 4
    ctx.fillText(val.toFixed(2), 6 * dpr, y + 4 * dpr)
  }

  for (const s of series) {
    if (s.points.length < 2) continue
    ctx.strokeStyle = s.color
    ctx.beginPath()
    s.points.forEach((p, i) => {
      const x = padL + (plotW * i) / (s.points.length - 1)
      const y = padT + plotH * (1 - p.v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
}
