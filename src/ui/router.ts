// 哈希路由：#/zones、#/wheels、#/rind、#/records、#/forecast、#/settings
export type Route = 'zones' | 'wheels' | 'rind' | 'records' | 'forecast' | 'settings'

const ROUTES: Route[] = ['zones', 'wheels', 'rind', 'records', 'forecast', 'settings']

export function parseHash(): { route: Route; param: string | null } {
  const raw = location.hash.replace(/^#\/?/, '')
  const [name, param] = raw.split('/')
  const route = ROUTES.includes(name as Route) ? (name as Route) : 'zones'
  return { route, param: param ?? null }
}

export function navigate(route: Route, param?: string): void {
  location.hash = param ? `/${route}/${param}` : `/${route}`
}

export function onRouteChange(handler: (r: ReturnType<typeof parseHash>) => void): () => void {
  const listener = () => handler(parseHash())
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
