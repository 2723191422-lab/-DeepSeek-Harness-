import test from 'node:test'
import assert from 'node:assert/strict'
import { zh,en } from '../src/ui/i18n.js'
import { emptyData,normalizeData,planFor,calendarRecords,safeLink,localDate } from '../src/ui/data.js'
import { createCourse,createTask } from '../src/domain/models.js'
import { deriveStats } from '../src/ui/statistics.js'
test('all visible copy keys align in Chinese and English',()=>{
 assert.deepEqual(Object.keys(zh).sort(),Object.keys(en).sort());for(const key of Object.keys(zh)){assert.ok(zh[key]);assert.ok(en[key])}
})
test('portable envelope round trips and rejects unknown versions and duplicate ids',()=>{
 const data=emptyData();data.tasks=[createTask({id:'a',title:'A'})];assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(data))),data)
 assert.throws(()=>normalizeData({version:2}));assert.throws(()=>normalizeData({...data,tasks:[...data.tasks,...data.tasks]}))
})
test('UI composer combines course/task blocks, applies overrides and respects missing semester',()=>{
 const data=emptyData();data.settings.termStartDate='2026-10-12';data.courses=[createCourse({id:'c',name:'Course',weekday:1,start:'08:00',end:'09:00'})];data.tasks=[createTask({id:'t',title:'Task',date:'2026-10-12',estimateMin:30})]
 assert.deepEqual(planFor(data,'2026-10-12').blocks.map(row=>row.start),['08:00','09:00']);data.day_plans=[{date:'2026-10-12',blocks:[],overrides:[{id:'x',type:'remove',refId:'c:c'}]}];assert.equal(planFor(data,'2026-10-12').blocks.length,1)
 data.settings.termStartDate=null;data.day_plans=[];assert.equal(planFor(data,'2026-10-12').fixed.length,0)
})
test('statistics follow the local calendar and exclude break and unfinished records',()=>{
 const data=emptyData();data.tasks=[createTask({id:'t',title:'Task',date:'2026-10-12',status:'done',tags:['python']})];const start=new Date(2026,9,12,0,15).getTime();data.focus_records=[{id:'r',start,durationMin:60,mode:'pomodoro',completed:true,taskId:'t',courseId:null},{id:'break',start,durationMin:50,mode:'break',completed:true},{id:'pending',start,durationMin:30,mode:'pomodoro',completed:false}]
 const stats=deriveStats(data,localDate(start));assert.equal(stats.heatmap.at(-1).minutes,60);assert.equal(stats.byTag.python,60);assert.equal(stats.byCourse[''],60);assert.equal(stats.rate7,1);assert.equal(stats.trend.length,30)
 assert.equal(new Date(calendarRecords(data.focus_records)[0].start).toISOString().slice(0,10),localDate(start))
})
test('resource links never expose executable protocols',()=>{assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('data:text/html,hello'),null);assert.equal(safeLink('https://example.com'),'https://example.com/')})
