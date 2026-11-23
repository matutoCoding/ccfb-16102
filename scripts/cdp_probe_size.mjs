// 诊断 viewport 与 canvas 的布局尺寸链
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result)
    pending.delete(msg.id)
  }
}
await new Promise((r) => (ws.onopen = r))
await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:5181/#/rind' })
await new Promise((r) => setTimeout(r, 6000))
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const vp = document.querySelector('.viewport')
    const c = document.querySelector('.viewport canvas')
    const content = document.querySelector('.content')
    const rect = el => el ? {w: el.clientWidth, h: el.clientHeight, offW: el.offsetWidth, offH: el.offsetHeight} : null
    return JSON.stringify({
      viewport: rect(vp),
      canvas: rect(c),
      canvasAttr: c ? {w: c.width, h: c.height, style: c.style.cssText} : null,
      content: rect(content),
      viewportCss: vp ? getComputedStyle(vp).cssText.slice(0,200) : null,
    })
  })()`,
  returnByValue: true,
})
console.log(r.result.value)
ws.close()
process.exit(0)
