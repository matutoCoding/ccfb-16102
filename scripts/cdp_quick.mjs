const base='http://localhost:9333'
const t=await(await fetch(`${base}/json/new?about:blank`,{method:'PUT'})).json()
const ws=new WebSocket(t.webSocketDebuggerUrl)
let id=0;const pend=new Map()
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const errs=[]
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);return}
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push(m.params.args.map(a=>a.description??a.value).join(' '))
 if(m.method==='Runtime.exceptionThrown')errs.push('EXC:'+(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text))}
await new Promise(r=>ws.onopen=r)
await send('Runtime.enable');await send('Page.enable')
for(const h of ['#/wheels','#/rind']){
 await send('Page.navigate',{url:`http://localhost:5181/${h}`})
 await new Promise(r=>setTimeout(r,4500))
 const r=await send('Runtime.evaluate',{expression:`JSON.stringify({
   moveBtns:document.querySelectorAll('.table button').length,
   canvas:document.querySelector('.viewport canvas')?[document.querySelector('.viewport canvas').width,document.querySelector('.viewport canvas').height]:null,
   h1:document.querySelector('.content h1')?.textContent})`,returnByValue:true})
 console.log(h,r.result.value)
}
console.log('ERRORS:',errs.length?errs.join('\n'):'(none)')
ws.close();process.exit(0)
