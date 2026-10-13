/** Deterministic compiler for the deliberately restricted browser ESM subset. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Mask comments and quoted text while preserving offsets and line breaks. */
function mask(source) {
  const result = [...source]
  const blank = (start, end) => { for (let j=start;j<end;j++) if (source[j] !== '\n') result[j] = ' ' }
  function scan(start, expression = false) {
    let i=start, braces=0, expectsExpression=true
    while (i < source.length) {
      const char=source[i]
      if (/\s/.test(char)) { i++; continue }
      if (char==='/' && source[i+1]==='/') { const end=source.indexOf('\n',i); const stop=end<0?source.length:end;blank(i,stop);i=stop;continue }
      if (char==='/' && source[i+1]==='*') { const end=source.indexOf('*/',i+2);const stop=end<0?source.length:end+2;blank(i,stop);i=stop;continue }
      if (char==='"' || char==="'") {
        const begin=i++;while(i<source.length) {if(source[i]==='\\')i+=2;else if(source[i++]===char)break}blank(begin,i);expectsExpression=false;continue
      }
      if (char==='`') {
        blank(i,++i)
        while(i<source.length) {
          if(source[i]==='\\') {blank(i,i+2);i+=2}
          else if(source[i]==='`') {blank(i,++i);break}
          else if(source[i]==='$' && source[i+1]==='{') {blank(i,i+2);i=scan(i+2,true)}
          else {blank(i,i+1);i++}
        }
        expectsExpression=false;continue
      }
      if (char==='/' && expectsExpression) {
        const begin=i++;let bracket=false
        while(i<source.length) {
          if(source[i]==='\\')i+=2
          else {if(source[i]==='[')bracket=true;if(source[i]===']')bracket=false;if(source[i++]==='/'&&!bracket)break}
        }
        while(/[a-z]/i.test(source[i] || '')&&i<source.length)i++
        blank(begin,i);expectsExpression=false;continue
      }
      if (/[A-Za-z_$]/.test(char)) {
        const begin=i++;while(/[\w$]/.test(source[i] || '')&&i<source.length)i++
        const word=source.slice(begin,i)
        expectsExpression=['return','throw','case','delete','void','typeof','new','yield','await','in','of'].includes(word)
        continue
      }
      if (char==='{') {braces++;expectsExpression=true}
      else if (char==='}') {if(expression&&braces===0){blank(i,i+1);return i+1}braces--;expectsExpression=false}
      else if (/[0-9)\]]/.test(char)) expectsExpression=false
      else if (char!=='.') expectsExpression=true
      i++
    }
    return i
  }
  scan(0)
  return result.join('')
}

/** Compile a reachable tree; reject unsupported syntax with relative file and line. */
export function buildClient({ root = process.cwd(), entry = 'src/ui/entry.js', output } = {}) {
  root = resolve(root)
  const modules = new Map()
  const visiting = new Set()
  const keyOf = file => relative(root, file).split(sep).join('/')
  function visit(file) {
    const key = keyOf(file)
    if (key.startsWith('../')) throw new Error(`${key}:1: imports must stay inside the source root`)
    if (visiting.has(key)) throw new Error(`${key}:1: cyclic imports are unsupported`)
    if (modules.has(key)) return
    visiting.add(key)
    const source = readFileSync(file, 'utf8')
    const code = mask(source)
    const replacements = []
    const exports = new Set()
    const fail = (offset, reason) => { throw new Error(`${key}:${source.slice(0, offset).split('\n').length}: ${reason}`) }
    for (const token of code.matchAll(/\b(import|export)\b/g)) {
      const offset = token.index
      if (/^\s*:/.test(code.slice(offset + token[0].length)) || code[offset-1] === '.') continue
      const tail = source.slice(offset)
      if (token[1] === 'import') {
        if (/^import\s*\(/.test(tail)) fail(offset, 'dynamic import() is unsupported')
        const match = /^import\s+(\{[^}]*\}|\*\s+as\s+[\w$]+)\s+from\s+(['"])([^'"\n]+)\2\s*;?/.exec(tail)
        if (!match) fail(offset, 'only named or namespace imports are supported; default and side-effect imports are unsupported')
        const [, bindings, , specifier] = match
        if (specifier !== 'react' && !specifier.startsWith('./') && !specifier.startsWith('../')) fail(offset, `bare module '${specifier}' is unsupported; only 'react' is allowed`)
        let target = specifier
        if (specifier !== 'react') {
          const dependency = resolve(dirname(file), specifier)
          target = keyOf(dependency)
          visit(dependency)
        }
        const names = bindings.startsWith('{') ? bindings.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean).map(x => {
          if (!/^[\w$]+(?:\s+as\s+[\w$]+)?$/.test(x)) fail(offset, 'invalid named import')
          return x.replace(/\s+as\s+/, ': ')
        }).join(', ') : null
        const binding = names === null ? bindings.replace(/^\*\s+as\s+/, '') : `{ ${names} }`
        replacements.push([offset, offset + match[0].length, `const ${binding} = __require(${JSON.stringify(target)});\n`])
      } else {
        const declaration = /^export\s+(function|const|let|class)\s+([\w$]+)/.exec(tail)
        if (declaration) {
          exports.add(declaration[2])
          replacements.push([offset, offset + tail.match(/^export\s+/)[0].length, ''])
        } else {
          const list = /^export\s+\{([^}]*)\}\s*;?(?=\s*(?:\n|$))/.exec(tail)
          if (!list || /\bas\b/.test(list[1])) fail(offset, 'export default, export *, re-exports, aliases and async declarations are unsupported')
          for (const name of list[1].split(',').map(x => x.trim()).filter(Boolean)) {
            if (!/^[\w$]+$/.test(name)) fail(offset, 'invalid export name')
            exports.add(name)
          }
          replacements.push([offset, offset + list[0].length, ''])
        }
      }
    }
    let compiled = source
    for (const [start, end, replacement] of replacements.sort((a,b) => b[0]-a[0])) compiled = compiled.slice(0,start)+replacement+compiled.slice(end)
    modules.set(key, `${compiled.trimEnd()}\nObject.assign(__exports, { ${[...exports].sort().join(', ')} });\n`)
    visiting.delete(key)
  }
  visit(resolve(root, entry))
  const text = `// Generated by scripts/build-client.mjs. Do not edit.\nwindow.__ModuleLoader__.load({\n  id: 'dsh-learning-desk',\n  factory(require) {\n    const __modules = Object.create(null);\n    const __cache = Object.create(null);\n${[...modules].sort(([a],[b]) => a.localeCompare(b,'en')).map(([key,body]) => `    __modules[${JSON.stringify(key)}] = function(__exports, __require) {\n${body.split('\n').map(line => line ? '    '+line : '').join('\n')}\n    };`).join('\n')}\n    function __require(id) {\n      if (id === 'react') return require('react');\n      if (!__cache[id]) {\n        __cache[id] = {};\n        __modules[id](__cache[id], __require);\n      }\n      return __cache[id];\n    }\n    return __require(${JSON.stringify(entry)});\n  },\n});\n`
  if (output) writeFileSync(resolve(root, output), text)
  return text
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  try { buildClient({ entry: process.argv[2] || 'src/ui/entry.js', output: process.argv[3] || 'client.js' }) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
