/** Enforce the external plugin's browser import and semantic-style policy. */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CSS } from '../src/ui/styles.js';
import { buildClient } from './build-client.mjs';
const aliases = new Set('bg-base bg-layer-1 bg-layer-2 bg-layer-3 bg-overlay bg-mask-1 border-l1 border-l2 border-l4 label-primary label-primary-foreground label-secondary label-tertiary brand-primary brand-text link interactive-bg-active interactive-bg-hover button-primary-fill button-primary-hover state-success-primary state-error-primary state-error-secondary'.split(' ').map(name => `--dsw-alias-${name}`));
const other = new Set(['--dsw-radius-xs','--dsw-radius-sm','--dsw-radius-md','--dsw-radius-xl','--dsw-radius-panel','--dsw-font-family']);
/** Reject undefined theme names and literal color/weight overrides.
 * @param {string} css - Scoped plugin stylesheet.
 * @returns {void} Throws with the unsupported declaration.
 */
export function validateStyles(css) {
  for (const [,name] of css.matchAll(/var\((--[^),\s]+)/g)) if (!aliases.has(name) && !other.has(name)) throw new Error(`unsupported theme token: ${name}`);
  if (/#(?:[a-f\d]{3,8})\b|\b(?:rgb|hsl)a?\(/i.test(css)) throw new Error('literal colors are unsupported');
  if (/font-weight\s*:\s*(?:[6-9]\d\d|bold)/.test(css)) throw new Error('font weights above 500 are unsupported');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateStyles(CSS);
  for (const name of readdirSync('src/ui').filter(name=>name.endsWith('.js'))) {
    const source=readFileSync(`src/ui/${name}`,'utf8');
    for(const [,specifier] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) if(specifier!=='react'&&!specifier.startsWith('.'))throw new Error(`${name}: forbidden import ${specifier}`);
  }
  if(buildClient()!==readFileSync('client.js','utf8'))throw new Error('client.js is stale; run npm run build');
  console.log('validate-ui: imports, semantic styles and generated client passed');
}
