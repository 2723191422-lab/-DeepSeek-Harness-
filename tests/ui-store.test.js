import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore,LEGACY_KEY } from '../src/ui/store.js'
import { emptyData } from '../src/ui/data.js'
function storeFor(fetcher,storage){return createStore({fetcher,storage,timer:()=>1,clearTimer:()=>{}})}
test('corrupt browser JSON is preserved and reported while Host data still loads',async()=>{
 const raw='{broken';const store=storeFor(async()=>({json:async()=>({ok:true,value:emptyData()})}),{getItem:key=>key===LEGACY_KEY?raw:null});await store.initialize();assert.equal(store.get().legacy.raw,raw);assert.equal(store.get().legacy.valid,false);assert.equal(store.get().loading,false);assert.equal(store.get().error,null);await store.dispose()
})
test('failed writes retain previous data and subscription cleanup aborts requests',async()=>{
 let signal;const store=storeFor(async(url,request)=>{signal=request.signal;return {json:async()=>request.method==='GET'?{ok:true,value:emptyData()}:{ok:false,code:'writeUnknown'}}});await store.initialize();const previous=store.get().data;await assert.rejects(()=>store.command({type:'delete',table:'tasks',id:'t'}),/writeUnknown/);assert.equal(store.get().data,previous);assert.equal(store.get().error,'writeUnknown');assert.equal(store.get().notices.at(-1).error,true);await store.dispose();assert.equal(signal.aborted,true)
})
test('queued commands serialize without replacing the entire Host snapshot',async()=>{
 const sent=[];const store=storeFor(async(url,request)=>{if(request.body)sent.push(JSON.parse(request.body));return {json:async()=>({ok:true,value:emptyData()})}});await store.initialize();await Promise.all([store.command({type:'delete',table:'tasks',id:'a'}),store.command({type:'delete',table:'tasks',id:'b'})]);assert.deepEqual(sent.map(row=>row.id),['a','b']);await store.dispose()
})

test('a stale poll cannot replace the result of a newer mutation', async () => {
  let resolvePoll
  const polling = new Promise(resolve=>{resolvePoll=resolve})
  const store=createStore({fetcher:async (_url,options)=>options.method==='GET'?polling:{json:async()=>({ok:true,value:{...emptyData(),tasks:[{id:'new'}]}})},timer:()=>0,clearTimer:()=>{}})
  const refresh=store.refresh()
  await store.command({type:'put'})
  resolvePoll({json:async()=>({ok:true,value:emptyData()})})
  await refresh
  assert.equal(store.get().data.tasks[0].id,'new')
  await store.dispose()
})
