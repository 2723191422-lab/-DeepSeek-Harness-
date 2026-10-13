#!/usr/bin/env node
/**
 * Contract self-check for the `dsh-learning-desk` bundle.
 *
 * It verifies what the Harness reads before it ever runs this package: the
 * manifest including its dependency policy, the bundle patch, the display
 * metadata, the icon, and the shipped file list. Runtime behavior is not
 * covered here — pure logic and the storage-domain record schemas are tested
 * with `node --test`, and a manual checklist covers the rendered panel.
 *
 * Every check reports every problem it finds; any problem sets exit code 1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root, one level above this script. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Largest icon the Harness accepts, in bytes. */
const ICON_LIMIT_BYTES = 256 * 1024

/** Bundle patch expectations that are not derivable from the manifest. */
const EXPECTED_PATCH_ID = 'learning-desk'

/** Client injection edges the panel needs before it materializes. */
const EXPECTED_CLIENT_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-sidebar',
]

/** @type {string[]} */
const problems = []
/** @type {string[]} */
const notes = []

/**
 * Record one problem.
 * @param {string} message - the problem.
 * @returns {void}
 */
function fail(message) {
  problems.push(message)
}

/**
 * Record and print one passing check.
 * @param {string} message - the check that passed.
 * @returns {void}
 */
function note(message) {
  notes.push(message)
  console.log(`ok   ${message}`)
}

/**
 * Read and parse a JSON file.
 * @param {string} relativePath - path relative to the package root.
 * @returns {unknown} the parsed value.
 */
function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'))
}

/**
 * List every file under a directory, relative to the package root.
 * @param {string} relativeDir - directory relative to the package root.
 * @returns {string[]} POSIX-style relative paths, sorted.
 */
function walk(relativeDir) {
  const found = []
  const visit = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        visit(rel)
      } else if (entry.isFile()) {
        found.push(rel)
      }
    }
  }
  try {
    visit(relativeDir)
  } catch {
    return []
  }
  return found.sort()
}

/**
 * Escape one literal chunk for a regular expression.
 * @param {string} chunk - literal text.
 * @returns {string} the escaped text.
 */
function escapeRegExp(chunk) {
  return chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether one `files` entry covers a relative path. Supports the exact name,
 * a bare directory, a trailing `/**`, and a single `*` segment.
 * @param {string} pattern - one `files` entry.
 * @param {string} rel - POSIX-style path relative to the package root.
 * @returns {boolean} true when covered.
 */
function covers(pattern, rel) {
  if (pattern === rel) return true
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return rel === prefix || rel.startsWith(`${prefix}/`)
  }
  if (!pattern.includes('/')) return rel.startsWith(`${pattern}/`)
  if (pattern.includes('*')) {
    const source = pattern.split('*').map(escapeRegExp).join('[^/]*')
    return new RegExp(`^${source}$`).test(rel)
  }
  return false
}

/**
 * Collect the dot-joined leaf key paths of a nested JSON object.
 * @param {unknown} value - the value to walk.
 * @param {string} prefix - key path built so far.
 * @returns {string[]} leaf key paths.
 */
function leafKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix === '' ? key : `${prefix}.${key}`))
}

let manifest
try {
  manifest = readJson('package.json')
  note('package.json parses')
} catch (error) {
  // Without a manifest there is nothing left to check against.
  console.error(`FAIL package.json does not parse: ${error.message}`)
  console.error('\nvalidate-manifest: 1 problem(s)')
  process.exit(1)
}

// --- Manifest identity and dependency policy -------------------------------

/** Dependency sections npm reads; every one of them is checked. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/**
 * Dependency name to the sections declaring it. A name in two sections is a
 * duplicate declaration, and a name other than `zod` is outside the policy.
 * @type {Map<string, string[]>}
 */
const declaredDependencies = new Map()
for (const section of DEPENDENCY_SECTIONS) {
  const entries = manifest[section]
  if (entries === undefined) continue
  if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
    fail(`package.json ${section} must be an object`)
    continue
  }
  for (const [name, range] of Object.entries(entries)) {
    declaredDependencies.set(name, [...(declaredDependencies.get(name) ?? []), section])
    if (name.startsWith('@deepseek-ai/')) {
      fail(
        `package.json ${section} declares the Harness package ${name}: a @deepseek-ai/dsh* peer range that misses the running Harness makes boot skip the whole bundle`,
      )
    }
    if (typeof range !== 'string' || range.trim() === '') {
      fail(`package.json ${section}.${name} must be a non-empty version range`)
    }
  }
}
const zodSections = declaredDependencies.get('zod') ?? []
if (!zodSections.includes('dependencies')) fail('package.json dependencies must declare "zod": the record schemas are zod')
if (zodSections.length !== 1) {
  fail(`package.json must declare "zod" exactly once, found it in ${zodSections.join(' and ') || 'no dependency section'}`)
}
for (const [name, sections] of declaredDependencies) {
  if (name === 'zod') continue
  fail(`package.json ${sections.join(' and ')} declares ${name}: zod is the only dependency this bundle may carry`)
}
for (const key of ['name', 'version', 'type', 'license', 'exports', 'files', 'dsh']) {
  if (manifest[key] === undefined) fail(`package.json is missing ${key}`)
}
if (manifest.name !== 'dsh-learning-desk') fail(`package.json name must be "dsh-learning-desk", received ${JSON.stringify(manifest.name)}`)
if (manifest.version !== '1.0.0') fail(`package.json version must be "1.0.0", received ${JSON.stringify(manifest.version)}`)
if (manifest.type !== 'module') fail('package.json must declare "type": "module"')
if (manifest.private !== undefined) fail('package.json must not be private: the bundle is meant to be installed from a repository')
if (problems.length === 0) note('manifest identity and dependency policy hold (zod only, no @deepseek-ai/* dependency)')

// --- Export map -----------------------------------------------------------

const exportsMap = manifest.exports
if (exportsMap !== undefined) {
  const expectedExports = { '.': './index.js', './client': './client.js', './icon': './icon.svg' }
  for (const [specifier, target] of Object.entries(expectedExports)) {
    if (exportsMap[specifier] !== target) {
      fail(`exports["${specifier}"] must be ${JSON.stringify(target)}, received ${JSON.stringify(exportsMap[specifier])}`)
    }
  }
  if (exportsMap['./locale/*.json'] !== './locale/*.json') fail('exports must expose "./locale/*.json"')
  for (const target of Object.values(exportsMap)) {
    if (typeof target !== 'string' || target.includes('*')) continue
    try {
      if (!statSync(join(ROOT, target)).isFile()) fail(`exports target is not a file: ${target}`)
    } catch {
      fail(`exports target is missing: ${target}`)
    }
  }
  let localeCount = 0
  for (const file of walk('locale')) {
    if (file.endsWith('.json')) localeCount += 1
  }
  if (localeCount === 0) fail('exports declares "./locale/*.json" but locale/ holds no JSON file')
  if (problems.length === 0) note('export map resolves every declared target')
}

// --- dsh declarations -----------------------------------------------------

const dsh = manifest.dsh
if (dsh !== undefined) {
  if (dsh.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch must be "./cordis.patch.yml"')
  const client = dsh.client
  if (client === undefined) fail('dsh.client is missing: without it the Web half never loads')
  else {
    if (client.platform !== 'web') fail('dsh.client.platform must be "web"')
    if (client.immediately !== true) fail('dsh.client.immediately must be true')
    if (!Array.isArray(client.inject)) fail('dsh.client.inject must be an array')
    else {
      for (const pkg of EXPECTED_CLIENT_INJECT) {
        if (!client.inject.includes(pkg)) fail(`dsh.client.inject must list ${pkg}`)
      }
    }
  }
}

// --- `files` coverage -----------------------------------------------------

const patterns = Array.isArray(manifest.files) ? manifest.files : []
if (patterns.length === 0) fail('package.json files must be a non-empty array')
const runtimeFiles = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  ...walk('locale'),
  ...walk('src'),
]
if (runtimeFiles.length === 0 || patterns.length === 0) {
  /* reported above */
} else {
  for (const file of runtimeFiles) {
    if (!patterns.some(pattern => covers(pattern, file))) fail(`files does not ship runtime file ${file}`)
  }
  for (const pattern of patterns) {
    if (typeof pattern !== 'string') fail(`files entries must be strings, received ${JSON.stringify(pattern)}`)
  }
  if (problems.length === 0) note(`files covers all ${runtimeFiles.length} runtime files`)
}

// --- Display metadata -----------------------------------------------------

/**
 * Compare two key lists and report the difference.
 * @param {string} label - subject of the comparison.
 * @param {string[]} left - first key list.
 * @param {string[]} right - second key list.
 * @returns {void}
 */
function compareKeys(label, left, right) {
  const missing = left.filter(key => !right.includes(key))
  const extra = right.filter(key => !left.includes(key))
  if (missing.length > 0) fail(`${label}: missing ${missing.join(', ')}`)
  if (extra.length > 0) fail(`${label}: unexpected ${extra.join(', ')}`)
}

try {
  const en = readJson('locale/en.json')
  const zh = readJson('locale/zh.json')
  compareKeys('locale keys (en vs zh)', leafKeys(en), leafKeys(zh))
  for (const [locale, data] of [['en', en], ['zh', zh]]) {
    for (const key of ['meta.title', 'meta.description']) {
      const value = key.split('.').reduce((node, part) => (node === undefined ? undefined : node[part]), data)
      if (typeof value !== 'string' || value.trim() === '') fail(`locale/${locale}.json ${key} must be a non-empty string`)
    }
  }
  if (problems.length === 0) note('locale dictionaries align and carry display metadata')
} catch (error) {
  fail(`locale JSON does not parse: ${error.message}`)
}

// --- Icon -----------------------------------------------------------------

try {
  const iconPath = join(ROOT, 'icon.svg')
  const size = statSync(iconPath).size
  if (size > ICON_LIMIT_BYTES) fail(`icon.svg is ${size} bytes, over the ${ICON_LIMIT_BYTES}-byte limit`)
  if (size === 0) fail('icon.svg is empty')
  const head = readFileSync(iconPath, 'utf8').trimStart().slice(0, 200)
  if (!head.startsWith('<svg') && !head.startsWith('<?xml')) fail('icon.svg does not start with an SVG document')
  if (problems.length === 0) note(`icon.svg is a ${size}-byte SVG`)
} catch (error) {
  fail(`icon.svg is missing or unreadable: ${error.message}`)
}

// --- Bundle patch ---------------------------------------------------------

try {
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  const lines = patch.split('\n')
  if (!/^- insert:\s*$/.test(lines[0] ?? '')) fail('cordis.patch.yml must start with a top-level "- insert:" list')
  const entries = []
  let current
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    const item = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line)
    if (item !== null) {
      current = { id: item[1] }
      entries.push(current)
      continue
    }
    const member = /^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/.exec(line)
    if (member === null || current === undefined) {
      fail(`cordis.patch.yml has an unrecognized line: ${JSON.stringify(line)}`)
      continue
    }
    current[member[1]] = member[2]
  }
  if (entries.length !== 1) fail(`cordis.patch.yml must insert exactly one row, found ${entries.length}`)
  else {
    const [row] = entries
    if (row.id !== EXPECTED_PATCH_ID) fail(`cordis.patch.yml row id must be "${EXPECTED_PATCH_ID}", received ${JSON.stringify(row.id)}`)
    if (row.name !== manifest.name) fail(`cordis.patch.yml row name must be the package name ${JSON.stringify(manifest.name)}, received ${JSON.stringify(row.name)}`)
    if (row.config !== '{}') fail(`cordis.patch.yml row must carry config: {}, received ${JSON.stringify(row.config)}`)
  }
  if (problems.length === 0) note('cordis.patch.yml inserts one row for this package')
} catch (error) {
  fail(`cordis.patch.yml is missing or unreadable: ${error.message}`)
}

// --- Client bundle --------------------------------------------------------

try {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  if (!source.includes(`id: '${manifest.name}'`)) fail(`client.js must register the module table id ${JSON.stringify(manifest.name)}`)
  for (const slot of ['sidebar.panellist', 'main']) {
    if (!source.includes(`'${slot}'`)) fail(`client.js never registers into the ${slot} slot`)
  }
  if (!source.includes("PANEL_ID = 'learning-desk'")) fail('client.js must share one panel id between the sidebar entry and the main key')
  if (!source.includes('--dsw-alias-')) fail('client.js references no --dsw-alias-* theme token')
  const { zh, en } = await import('../src/ui/i18n.js')
  compareKeys('client dictionary keys (zh vs en)', Object.keys(zh), Object.keys(en))
  for (const key of ['panel', 'navToday', 'navPlan', 'navKnowledge', 'navStats', 'navSettings']) {
    if (!zh[key] || !en[key]) fail(`client dictionaries are missing the "${key}" key`)
  }
  if (problems.length === 0) note('client bundle registers both slots and ships aligned dictionaries')
} catch (error) {
  fail(`client.js is missing or unreadable: ${error.message}`)
}

// --- Report ---------------------------------------------------------------

for (const message of problems) console.error(`FAIL ${message}`)
if (problems.length === 0) {
  console.log(`\nvalidate-manifest: ${notes.length} checks passed`)
} else {
  console.error(`\nvalidate-manifest: ${problems.length} problem(s)`)
  process.exitCode = 1
}
