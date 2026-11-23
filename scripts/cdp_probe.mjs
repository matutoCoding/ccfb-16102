// 零依赖 CDP 探针：抓页面 console、异常，并报告 WebGL 与 three.js 渲染状态
const base = 'http://localhost:9333'

async function main() {
  const target = await (await fetch(`${base}/json/new?http://localhost:5181/`, { method: 'PUT' })).json()
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
  const errors = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = msg.params.args.map((a) => a.description ?? a.value ?? '').join(' ')
      logs.push(text)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    }
  }

  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: 'http://localhost:5181/' })
  await new Promise((r) => setTimeout(r, 6000))

  const probe = await send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('.viewport canvas');
      const gl = canvas ? canvas.getContext('webgl2') : null;
      const wheelCount = document.querySelectorAll('.viewport canvas').length;
      const navItems = document.querySelectorAll('.nav-item').length;
      const statNums = [...document.querySelectorAll('.stat .num')].map(n => n.textContent);
      return JSON.stringify({
        hasCanvas: Boolean(canvas),
        canvasSize: canvas ? [canvas.width, canvas.height] : null,
        webgl2: Boolean(gl),
        viewports: wheelCount,
        navItems,
        statNums: statNums.slice(0, 6),
        bodyText: document.querySelector('.content h1')?.textContent ?? null,
      });
    })()`,
    returnByValue: true,
  })

  console.log('=== PROBE ===')
  console.log(probe.result.value)
  console.log('=== CONSOLE ERRORS ===')
  console.log(logs.length ? logs.join('\n') : '(none)')
  console.log('=== UNCAUGHT EXCEPTIONS ===')
  console.log(errors.length ? errors.join('\n') : '(none)')
  ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
