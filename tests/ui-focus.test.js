import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesk, runtimeDomain } from '../src/host/service.js'
import { learningDeskDomain } from '../src/storage/domain.js'
import { elapsedMs,transitionTimer } from '../src/ui/timer.js'
import { fakeDomain } from './host-support.js'
function fixture(start) { const domain=fakeDomain(learningDeskDomain),runtime=fakeDomain(runtimeDomain);let now=start;return {domain,runtime,now:value=>now=value,desk:()=>createDesk(domain,runtime,()=>now)} }

test('refresh, panel switch and sleep use persisted elapsed wall time, with countdown capping',async()=>{
 const f=fixture(new Date(2026,9,12,10).getTime());const original=f.desk();await original.command({type:'timer',action:'start',minutes:25});f.now(new Date(2026,9,12,10,40).getTime());const restored=f.desk();const data=await restored.read();assert.equal(data.timer,null);assert.equal(data.focus_records.length,1);assert.equal(data.focus_records[0].durationMin,25);assert.equal((await restored.read()).focus_records.length,1)
})
test('pause does not accrue time, resume is idempotent, and focus finish splits local midnight',async()=>{
 const start=new Date(2026,9,12,23,50).getTime();const f=fixture(start);const desk=f.desk();await desk.command({type:'timer',action:'start',minutes:60,mode:'countup'});f.now(start+5*60000);await desk.command({type:'timer',action:'pause'});f.now(start+15*60000);assert.equal(elapsedMs((await desk.read()).timer,start+15*60000),5*60000);await desk.command({type:'timer',action:'resume'});f.now(start+20*60000);await desk.command({type:'timer',action:'resume'});f.now(start+25*60000);const data=await desk.command({type:'timer',action:'finish'});assert.equal(data.timer,null);assert.deepEqual(data.focus_records.map(row=>row.durationMin),[5,10]);assert.equal(new Date(data.focus_records[1].start).getDate(),13)
})
test('reset discards unsaved focus; concurrent start calls create only one timer',async()=>{
 const f=fixture(1000000),desk=f.desk();const results=await Promise.allSettled([desk.command({type:'timer',action:'start',minutes:1}),desk.command({type:'timer',action:'start',minutes:1})]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);await desk.command({type:'timer',action:'reset'});const data=await desk.read();assert.equal(data.timer,null);assert.equal(data.focus_records.length,0)
})
test('pure timer transition rejects invalid starts and survives clock moving backwards',()=>{
 assert.throws(()=>transitionTimer(null,'start',0,{minutes:0}),/invalidForm/);const timer=transitionTimer(null,'start',1000,{minutes:1,id:'x'});assert.equal(elapsedMs(timer,0),0);assert.equal(elapsedMs(timer,100000),60000)
})
