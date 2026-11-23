// 可复现性探针：单轮特写截图两次（中间整页重载），逐像素比对
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

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

async function shootWheelCloseup(tag) {
  await send('Page.navigate', { url: 'http://localhost:5181/#/rind' })
  await new Promise((r) => setTimeout(r, 5000))
  // 点第一个轮子进入细看模式：触发 canvas 中心偏上的 pointerdown
  const rect = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.viewport canvas')
      const r = c.getBoundingClientRect()
      return JSON.stringify({ x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 })
    })()`,
    returnByValue: true,
  })
  const { x, y } = JSON.parse(rect.result.value)
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
  })
  await new Promise((r) => setTimeout(r, 1500))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/shots/closeup_${tag}.png`, Buffer.from(shot.data, 'base64'))
  // 取 canvas 中心区域像素哈希（程序外皮本体）
  const px = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.viewport canvas')
      const gl = c.getContext('webgl2')
      const w = c.width, h = c.height
      const data = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
      // 采样中心 200x200
      let sum = ''
      const cx = Math.floor(w/2), cy = Math.floor(h/2)
      for (let yy = cy-100; yy < cy+100; yy += 4) {
        for (let xx = cx-100; xx < cx+100; xx += 4) {
          const i = (yy * w + xx) * 4
          sum += data[i] + ',' + data[i+1] + ',' + data[i+2] + ';'
        }
      }
      return sum
    })()`,
    returnByValue: true,
  })
  return createHash('sha256').update(px.result.value).digest('hex')
}

const hash1 = await shootWheelCloseup('a')
const hash2 = await shootWheelCloseup('b')
console.log('hash1:', hash1.slice(0, 24))
console.log('hash2:', hash2.slice(0, 24))
console.log('REPRODUCIBLE:', hash1 === hash2)
console.log('=== ERRORS ===')
console.log(logs.length ? logs.join('\n---\n') : '(none)')
ws.close()
process.exit(0)
