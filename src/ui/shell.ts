// 应用外壳：侧边导航 + 内容区
import type { Route } from './router'
import { navigate } from './router'
import { el } from './dom'
import { icon, type IconName } from './icons'

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'zones', label: '窖区档案', icon: 'cave' },
  { route: 'wheels', label: '奶酪轮档案', icon: 'wheel' },
  { route: 'rind', label: '外皮查看', icon: 'rind' },
  { route: 'records', label: '翻刷记录', icon: 'brush' },
  { route: 'forecast', label: '熟成预测', icon: 'forecast' },
  { route: 'settings', label: '设置', icon: 'settings' },
]

export function renderShell(active: Route, mount: (root: HTMLElement) => void): void {
  const app = document.getElementById('app')
  if (!app) return
  app.replaceChildren()

  const navButtons = NAV.map((item) => {
    const btn = el('button', {
      className: `nav-item ${item.route === active ? 'active' : ''}`,
    }, el('span', { className: 'nav-icon' }), el('span', {}, item.label))
    btn.querySelector('.nav-icon')!.innerHTML = icon(item.icon)
    btn.addEventListener('click', () => navigate(item.route))
    return btn
  })

  const nav = el('nav', { className: 'sidebar' },
    el('div', { className: 'brand' },
      el('div', { className: 'brand-mark' }),
      el('div', { className: 'col' },
        el('strong', {}, '熟成窖演化台'),
        el('small', { className: 'muted' }, 'Rind Evolution Workbench'),
      ),
    ),
    el('div', { className: 'nav-list' }, ...navButtons),
  )

  const main = el('main', { className: 'content' })
  app.append(nav, main)
  mount(main)
}
