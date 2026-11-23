// 单轮特写探针：直接调用查看器 focusWheel，截取程序化外皮细节
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
await send('Page.navigate', { url: 'http://localhost:5181/#/rind' })
await new Promise((r) => setTimeout(r, 5000))

// 通过模块全局不可达，改为派发真实 pointer 事件序列到 wheel mesh：
// 直接在 canvas 上对多个候选位置点按，命中后 UI 标签会变化
const probe = await send('Runtime.evaluate', {
  expression: `(async () => {
    const c = document.querySelector('.viewport canvas')
    const r = c.getBoundingClientRect()
    const positions = [[0.5,0.4],[0.55,0.45],[0.45,0.5],[0.6,0.5],[0.4,0.45],[0.65,0.55],[0.35,0.55],[0.5,0.6]]
    for (const [fx, fy] of positions) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }))
      c.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }))
      await new Promise(res => setTimeout(res, 120))
    }
    await new Promise(res => setTimeout(res, 800))
    const label = document.querySelector('.toolbar .tag')?.textContent
    const modeBtn = document.querySelector('.toolbar button')?.textContent
    return JSON.stringify({ label, modeBtn })
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
console.log('UI:', probe.result.value)
await new Promise((r) => setTimeout(r, 1200))
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/shots/closeup_real.png', Buffer.from(shot.data, 'base64'))
console.log('=== ERRORS ===')
console.log(logs.length ? logs.join('\n---\n') : '(none)')
ws.close()
process.exit(0)
