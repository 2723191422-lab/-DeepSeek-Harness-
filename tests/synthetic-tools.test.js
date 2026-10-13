/** Replay a fixed synthetic four-tool scenario without model credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDesk,runtimeDomain} from '../src/host/service.js';
import {deskTools} from '../src/host/tools.js';
import {learningDeskDomain} from '../src/storage/domain.js';
import {emptyData} from '../src/ui/data.js';
import {fakeDomain} from './host-support.js';

test('synthetic four-tool snapshot replays without a key and preserves readable output',async()=>{
  const recorded=JSON.parse(readFileSync(new URL('./fixtures/synthetic-tools.json',import.meta.url),'utf8'));
  const ids=[recorded.calls[1].value.id,recorded.calls[4].value.deckId,recorded.calls[4].value.cards[0].id];
  let now=recorded.calls[0].time;
  const desk=createDesk(fakeDomain(learningDeskDomain),fakeDomain(runtimeDomain),()=>now,()=>{assert.ok(ids.length);return ids.shift()});
  await desk.command({type:'import',data:{...emptyData(),...recorded.initial}});
  const tools=deskTools(desk);
  for(const call of recorded.calls){
    now=call.name==='learning_desk_cards_from_note'&&call.args.cards?call.value.cards[0].due:call.time;
    const tool=tools.find(tool=>tool.name===call.name);
    const output=await tool.execute(call.args,{signal:new AbortController().signal});
    assert.equal(output.ok,!call.isError,call.name);
    assert.deepEqual(JSON.parse(output.text),call.value,call.name);
    assert.equal(tool.output.render(call.args,output)[0].text,output.text);
  }
  assert.equal(ids.length,0);
  await desk.close();
});
