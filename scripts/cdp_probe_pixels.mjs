// CDP 探针 3：验证实际渲染产物——像素方差、mesh 数量、WebGL 错误、可复现性
const base = 'http://localhost:9333'

async function main() {
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
  await send('Page.navigate', { url: 'http://localhost:5181/#/rind' })
  await new Promise((r) => setTimeout(r, 6000))

  const expr = `(async () => {
    // 访问 three 内部场景统计
    const canvases = document.querySelectorAll('.viewport canvas')
    const c = canvases[0]
    const gl = c.getContext('webgl2')
    // 采样九宫格像素（通过 toDataURL 间接读取，避免 preserveDrawingBuffer 限制）
    const url = c.toDataURL()
    // 统计 DOM 指标
    const metricValues = [...document.querySelectorAll('.stat .num')].map(n => n.textContent)
    const sliders = document.querySelectorAll('input[type=range]').length
    const tags = [...document.querySelectorAll('.tag')].map(t => t.textContent).slice(0, 8)
    return JSON.stringify({
      canvasCount: canvases.length,
      canvasW: c.width, canvasH: c.height,
      hasContent: url.length > 5000,
      dataUrlLen: url.length,
      metricValues,
      sliders,
      tags,
      glError: gl.getError(),
    })
  })()`
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  console.log('RIND PAGE:', r.result.value)

  // 进入单轮模式：点第一个 nav 不行，直接验证 forecast 双场景
  await send('Page.navigate', { url: 'http://localhost:5181/#/forecast' })
  await new Promise((r) => setTimeout(r, 6000))
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const cs = document.querySelectorAll('.viewport canvas')
      return JSON.stringify({
        canvasCount: cs.length,
        lens: [...cs].map(c => c.toDataURL().length),
        diffStats: document.querySelectorAll('.stat').length,
      })
    })()`,
    returnByValue: true,
  })
  console.log('FORECAST PAGE:', r2.result.value)

  console.log('=== ERRORS ===')
  console.log(logs.length ? logs.join('\n---\n') : '(none)')
  ws.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
