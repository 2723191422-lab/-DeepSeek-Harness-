import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStyles} from '../scripts/validate-ui.mjs';
import {CSS} from '../src/ui/styles.js';
test('style policy rejects an undefined token, literal color and heavy weight',()=>{
  validateStyles(CSS);
  assert.throws(()=>validateStyles('color:var(--dsw-alias-imaginary)'),/unsupported theme token/);
  assert.throws(()=>validateStyles('color:#123456'),/literal colors/);
  assert.throws(()=>validateStyles('font-weight:700'),/font weights/);
});
