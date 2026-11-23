// 应用入口：初始化数据 -> 挂载外壳 -> 哈希路由分发
import './styles.css'
import { appStore } from './core/store'
import { onRouteChange, parseHash, type Route } from './ui/router'
import { renderShell } from './ui/shell'
import { renderZonesPage } from './ui/pages/zones_page'
import { renderWheelsPage } from './ui/pages/wheels_page'
import { renderRindPage } from './ui/pages/rind_page'
import { renderRecordsPage } from './ui/pages/records_page'
import { renderForecastPage } from './ui/pages/forecast_page'
import { renderSettingsPage } from './ui/pages/settings_page'

async function bootstrap(): Promise<void> {
  await appStore.ensureLoaded()
  const mount = (route: Route, param: string | null) => {
    renderShell(route, (root) => {
      switch (route) {
        case 'zones':
          return renderZonesPage(root)
        case 'wheels':
          return renderWheelsPage(root)
        case 'rind':
          return renderRindPage(root, param)
        case 'records':
          return renderRecordsPage(root)
        case 'forecast':
          return renderForecastPage(root)
        case 'settings':
          return renderSettingsPage(root)
      }
    })
  }

  const initial = parseHash()
  mount(initial.route, initial.param)
  onRouteChange(({ route, param }) => mount(route, param))
}

bootstrap().catch((err) => {
  const app = document.getElementById('app')
  if (app) {
    app.innerHTML = `<div style="padding:48px;font-family:sans-serif">
      <h2>启动失败</h2><pre style="color:#b3453a">${String(err)}</pre></div>`
  }
  console.error(err)
})
