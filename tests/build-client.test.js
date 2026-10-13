import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext, Script } from 'node:vm'
import { buildClient } from '../scripts/build-client.mjs'

test('fixture named aliases and namespace imports execute in the real module-loader format',()=>{
  const bundle=buildClient({entry:'scripts/fixtures/good/entry.js'})
  new Script(bundle)
  let entry
  runInNewContext(bundle,{window:{__ModuleLoader__:{load: value=>{entry=value.factory(()=>({}))}}}})
  assert.equal(entry.answer(),42)
  assert.deepEqual(Array.from(entry.inject),['slots'])
  assert.equal(bundle,buildClient({entry:'scripts/fixtures/good/entry.js'}))
  assert.ok(!bundle.includes(process.cwd()))
})
for(const [syntax,message] of [
  ['export default 1','export default'],['export * from "./a.js"','export default'],['const x=1;\nexport { x as y }','aliases'],['import React from "react"','default'],['import {a} from "zod"','bare module'],['const x=import("./a.js")','dynamic import'],['export async function x() {}','async declarations'],['import "./a.js"','side-effect'],
]) test(`unsupported ESM fails with file and line: ${syntax}`,()=>{
  const root=mkdtempSync(join(tmpdir(),'ld-build-'))
  try {writeFileSync(join(root,'entry.js'),'// first line\n'+syntax);assert.throws(()=>buildClient({root,entry:'entry.js'}),error=>error.message.includes('entry.js:')&&error.message.includes(message))}finally{rmSync(root,{recursive:true,force:true})}
})
test('comment and string keywords are not interpreted as module declarations',()=>{
  const root=mkdtempSync(join(tmpdir(),'ld-build-'))
  try {writeFileSync(join(root,'entry.js'),"// export default\nexport const text = 'import( export default';\nexport const dictionary = { import: 'Import' }\n");new Script(buildClient({root,entry:'entry.js'}))}finally{rmSync(root,{recursive:true,force:true})}
})
test('regex literals are preserved but dynamic imports in template interpolations are rejected',()=>{
 const root=mkdtempSync(join(tmpdir(),'ld-build-'))
 try {
  writeFileSync(join(root,'entry.js'),"export const regex = /import\\( export default/;\nexport const value = `import( text ${1+2}`\n");new Script(buildClient({root,entry:'entry.js'}))
  writeFileSync(join(root,'entry.js'),'export const value = `x ${import("./x.js")}`\n');assert.throws(()=>buildClient({root,entry:'entry.js'}),/dynamic import/)
 } finally {rmSync(root,{recursive:true,force:true})}
})
