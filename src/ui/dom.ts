// 轻量 DOM 构造助手，保持视图代码简洁
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value
    else if (key.startsWith('data-')) node.setAttribute(key, value)
    else node.setAttribute(key, value)
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return node
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}

// 图标 + 文字的安全构造：SVG 走 innerHTML，文字走文本节点，避免标签被转义显示
export function iconLabel(iconHtml: string, text: string): HTMLElement {
  const holder = el('span', { style: 'display:inline-flex;align-items:center;gap:6px' })
  const iconNode = el('span', { style: 'display:inline-flex' })
  iconNode.innerHTML = iconHtml
  holder.append(iconNode, document.createTextNode(text))
  return holder
}

// 仅放一个图标的内联节点
export function iconNode(iconHtml: string): HTMLElement {
  const holder = el('span', { style: 'display:inline-flex' })
  holder.innerHTML = iconHtml
  return holder
}

export function modal(title: string, body: HTMLElement, footer?: HTMLElement): HTMLElement {
  const mask = el('div', { className: 'modal-mask' })
  const box = el('div', { className: 'modal' })
  const head = el('div', { className: 'spread' }, el('h3', {}, title), closeButton())
  box.append(head, body)
  if (footer) box.append(footer)
  mask.append(box)
  mask.addEventListener('pointerdown', (e) => {
    if (e.target === mask) mask.remove()
  })
  document.body.append(mask)
  return mask
}

function closeButton(): HTMLElement {
  const btn = el('button', { className: 'ghost', title: '关闭' }, '✕')
  btn.addEventListener('click', () => btn.closest('.modal-mask')?.remove())
  return btn
}

export function toast(message: string, kind: 'info' | 'warn' | 'danger' = 'info'): void {
  const node = el('div', {
    className: `tag ${kind === 'info' ? 'primary' : kind}`,
    style:
      'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:60;padding:10px 20px;font-size:15px;box-shadow:var(--shadow-lg)',
  }, message)
  document.body.append(node)
  setTimeout(() => node.remove(), 2600)
}

export function emptyState(title: string, subtitle: string, iconHtml: string): HTMLElement {
  return el('div', { className: 'empty-state' },
    el('div', { className: 'icon-box' }, createSvgHolder(iconHtml)),
    el('h3', {}, title),
    el('p', {}, subtitle),
  )
}

function createSvgHolder(svg: string): HTMLElement {
  const span = el('span', { style: 'color:var(--text-3);display:flex' })
  span.innerHTML = svg
  return span
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
