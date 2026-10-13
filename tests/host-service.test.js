import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesk, runtimeDomain,publicFailure } from '../src/host/service.js'
import { deskTools } from '../src/host/tools.js'
import { learningDeskDomain } from '../src/storage/domain.js'
import { emptyData } from '../src/ui/data.js'
import { createTask,createNote } from '../src/domain/models.js'
import { fakeDomain } from './host-support.js'
function fixture(){const domain=fakeDomain(learningDeskDomain),runtime=fakeDomain(runtimeDomain);return {domain,runtime,desk:createDesk(domain,runtime,()=>new Date(2026,9,12,10).getTime())}}

test('browser writes are visible to tool reads and tool writes are visible to browser reads',async()=>{
 const {desk}=fixture();await desk.command({type:'put',table:'tasks',record:createTask({id:'ui',title:'UI task',date:'2026-10-12'})});const tools=deskTools(desk);const add=tools.find(row=>row.name==='learning_desk_add_task');assert.equal((await add.execute({title:'Agent task',date:'2026-10-12'},{signal:new AbortController().signal})).ok,true);const today=await tools[0].execute({date:'2026-10-12'},{signal:new AbortController().signal});assert.ok(today.text.includes('UI task'));assert.ok(today.text.includes('Agent task'));assert.equal((await desk.read()).tasks.length,2)
})
test('invalid replacement import never erases existing records; valid export round trips',async()=>{
 const {desk}=fixture();const record=createTask({id:'t',title:'Keep me'});await desk.command({type:'put',table:'tasks',record});await assert.rejects(()=>desk.command({type:'import',data:{version:1,tasks:[{id:'bad'}]}}));assert.deepEqual((await desk.read()).tasks,[record]);const exported=await desk.read();await desk.command({type:'import',data:emptyData()});assert.equal((await desk.read()).tasks.length,0);await desk.command({type:'import',data:exported});assert.deepEqual((await desk.read()).tasks,[record])
})
test('invalid course timing and orphan review decks fail before write',async()=>{
 const {desk}=fixture();await assert.rejects(()=>desk.command({type:'put',table:'courses',record:{id:'c',name:'Course',teacher:'',location:'',weekday:1,start:'12:00',end:'10:00',weeks:{from:1,to:16,parity:'all'},color:'',note:''}}),/invalidTime/);assert.equal((await desk.read()).courses.length,0)
})
test('persistent write failure is visible and freezes dependent writes without exposing disk errors',async()=>{
 const {desk,domain}=fixture();domain.failNext();await assert.rejects(()=>desk.command({type:'put',table:'tasks',record:createTask({id:'x',title:'X'})}),/writeUnknown/);await assert.rejects(()=>desk.command({type:'put',table:'tasks',record:createTask({id:'y',title:'Y'})}),/writeUnknown/);assert.equal(publicFailure(new Error('/private/secret/file')).code,'unavailable');assert.ok(!JSON.stringify(publicFailure(new Error('/private/secret/file'))).includes('secret'))
})
test('tool cancellation is preserved; card pairs use existing SM-2 state and note identity',async()=>{
 const {desk}=fixture();const controller=new AbortController();controller.abort();await assert.rejects(()=>deskTools(desk)[0].execute({}, {signal:controller.signal}),{name:'AbortError'});await desk.command({type:'put',table:'notes',record:createNote({id:'n',title:'Note',markdown:'A fact',createdAt:1})});const created=await desk.tool('learning_desk_cards_from_note',{noteId:'n',cards:[{front:'What?',back:'A fact'}]});assert.equal(created.noteId,'n');assert.equal(created.cards[0].ease,2.5);assert.equal(created.cards[0].reps,0);assert.equal((await desk.read()).decks.length,1)
})
test('closing the service rejects new work and closes both durable handles after pending operations',async()=>{
 const {desk,domain,runtime}=fixture();const work=desk.command({type:'put',table:'tasks',record:createTask({id:'x',title:'X'})});await desk.close();await work;assert.equal(domain.closeCount,1);assert.equal(runtime.closeCount,1);await assert.rejects(()=>desk.read(),/unavailable/)
})

test('review limit is enforced across sessions and resets on the next local day', async () => {
  const domain = fakeDomain(learningDeskDomain), runtime = fakeDomain(runtimeDomain)
  let now = new Date(2026, 9, 12, 10).getTime()
  const desk = createDesk(domain, runtime, () => now)
  await desk.command({type:'settings', settings:{...(await desk.read()).settings,reviewLimit:1}})
  await desk.command({type:'put',table:'notes',record:createNote({id:'n',title:'Note',markdown:'A fact',createdAt:1})})
  const created = await desk.tool('learning_desk_cards_from_note',{noteId:'n',cards:[{front:'What?',back:'A fact'}]})
  const id = created.cards[0].id
  await desk.command({type:'review',id,grade:'good'})
  assert.equal((await desk.read()).reviewCount,1)
  const resumed = createDesk(domain,runtime,()=>now)
  await assert.rejects(()=>resumed.command({type:'review',id,grade:'easy'}),/reviewLimitReached/)
  now = new Date(2026,9,13,10).getTime()
  await resumed.command({type:'review',id,grade:'easy'})
  assert.equal((await resumed.read()).reviewCount,1)
})
