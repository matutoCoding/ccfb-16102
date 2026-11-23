// 通过设置页重置按钮重新播种，再验证同批次轮编号唯一
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
await send('Page.navigate', { url: 'http://localhost:5181/#/settings' })
await new Promise((r) => setTimeout(r, 4000))

// 点击重置按钮
await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('重置为内置测试数据'))?.click()`,
})
await new Promise((r) => setTimeout(r, 600))
// 确认弹窗
await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.modal-mask button')].find(b => b.textContent.includes('确认重置'))?.click()`,
})
await new Promise((r) => setTimeout(r, 2500))

// 回到轮子页检查编号
await send('Page.navigate', { url: 'http://localhost:5181/#/wheels' })
await new Promise((r) => setTimeout(r, 4000))
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const labels = [...document.querySelectorAll('.table tbody tr td:first-child')].map(td => td.textContent.trim())
    const firstBatch = labels.slice(0, 6)
    const unique = new Set(labels).size
    return JSON.stringify({ firstBatch, total: labels.length, uniqueLabels: unique, allUnique: unique === labels.length })
  })()`,
  returnByValue: true,
})
console.log(r.result.value)
console.log('=== ERRORS ===')
console.log(logs.length ? logs.join('\n') : '(none)')
ws.close()
process.exit(0)
