// CDP 探针 2：遍历含 WebGL 的页面，抓着色器编译/链接错误与渲染产物
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
  const errors = []
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
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    }
  }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')

  for (const hash of ['#/rind', '#/forecast', '#/wheels', '#/settings']) {
    await send('Page.navigate', { url: `http://localhost:5181/${hash}` })
    await new Promise((r) => setTimeout(r, 5000))
    const probe = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('.viewport canvas');
        const gl = canvas ? canvas.getContext('webgl2') : null;
        let drawn = 0
        if (gl) {
          const px = new Uint8Array(4)
          gl.readPixels(canvas.width/2|0, canvas.height/2|0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
          drawn = px[0] + px[1] + px[2]
        }
        return JSON.stringify({
          hash: location.hash,
          hasCanvas: Boolean(canvas),
          webgl2: Boolean(gl),
          centerPixelSum: drawn,
          viewports: document.querySelectorAll('.viewport').length,
        })
      })()`,
      returnByValue: true,
    })
    console.log(probe.result.value)
  }

  console.log('=== CONSOLE ERRORS ===')
  console.log(logs.length ? logs.join('\n---\n') : '(none)')
  console.log('=== UNCAUGHT ===')
  console.log(errors.length ? errors.join('\n---\n') : '(none)')
  ws.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
