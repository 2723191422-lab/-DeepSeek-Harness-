/** Deterministic in-memory durable-domain substitute with schema validation and failure injection. */
export function fakeDomain(spec) {
  const maps=new Map(Object.keys(spec.tables).map(name=>[name,new Map()]))
  let global=structuredClone(spec.global.initial)
  let writes=0
  let failAt=Infinity
  const before=()=>{writes++;if(writes===failAt)throw new Error('disk-failed')}
  return { failNext(){failAt=writes+1},closeCount:0,
    global:{get:()=>structuredClone(global),set:async value=>{const next=spec.global.schema.parse(value);before();global=structuredClone(next)}},
    table(name){const map=maps.get(name);return {entries:()=>structuredClone([...map]).values(),keys:()=>map.keys(),get:key=>structuredClone(map.get(key)),put:async(key,row)=>{const next=spec.tables[name].valueSchema.parse(row);before();map.set(key,structuredClone(next))},delete:async key=>{if(!map.has(key))return false;before();return map.delete(key)}}},
    async close(){this.closeCount++},
  }
}
