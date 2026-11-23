// CDP 截图探针：对各页面截图保存，人工/视觉确认渲染结果
import { writeFileSync } from 'node:fs'

const base = 'http://localhost:9333'
const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
const logs = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push(msg.params.args.map((a) => a.description ?? a.value ?? '').join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
  }
}
await new Promise((r) => (ws.onopen = r))
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

const pages = [
  ['#/zones', 'zones'],
  ['#/rind', 'rind'],
  ['#/forecast', 'forecast'],
  ['#/records', 'records'],
  ['#/wheels', 'wheels'],
  ['#/settings', 'settings'],
]
for (const [hash, name] of pages) {
  await send('Page.navigate', { url: `http://localhost:5181/${hash}` })
  await new Promise((r) => setTimeout(r, 5500))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/shots/shot_${name}.png`, Buffer.from(shot.data, 'base64'))
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.viewport canvas')
      return JSON.stringify({
        h1: document.querySelector('.content h1')?.textContent,
        canvas: c ? [c.width, c.height] : null,
        navCount: document.querySelectorAll('.nav-item').length,
      })
    })()`,
    returnByValue: true,
  })
  console.log(name, info.result.value)
}
console.log('=== ERRORS ===')
console.log(logs.length ? logs.join('\n---\n') : '(none)')
ws.close()
process.exit(0)
