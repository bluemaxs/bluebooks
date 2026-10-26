import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialLibrary, loadDefaultLibrary } from '../default-library.js';
import { groupBooks, readingCount } from '../core.js';

test('first visit and legacy example drafts load the published default library',async()=>{
  let calls=0;
  const defaultState={books:[{id:'default'}],demo:false};
  const loader=async()=>{calls++;return defaultState;};
  assert.equal(await initialLibrary(null,loader),defaultState);
  assert.equal(await initialLibrary({books:[{id:'example'}],demo:true},loader),defaultState);
  assert.equal(calls,2);
});
test('existing user drafts, including deliberate empty libraries, survive website updates',async()=>{
  const loader=async()=>{throw Error('must not load');};
  const custom={books:[{id:'my-book',notes:'my edits'}],demo:false};
  const empty={books:[],demo:false};
  assert.equal(await initialLibrary(custom,loader),custom);
  assert.equal(await initialLibrary(empty,loader),empty);
});
test('default loading uses a module-relative URL and preserves read records',async()=>{
  const state=await loadDefaultLibrary(async url=>{
    assert.ok(url instanceof URL);
    assert.ok(url.pathname.endsWith('/default-library.json'));
    return {ok:true,json:async()=>({app:'bluebooks',version:1,books:[{id:'historical',workId:'volume-one',title:'A',status:'read',readCount:2,readYears:[2023,2026],sources:[]}]})};
  });
  assert.equal(state.demo,false);assert.equal(state.books[0].readCount,2);
  assert.deepEqual(state.books[0].readYears,[2023,2026]);assert.equal(state.books[0].finishedAt,null);
});
test('HTTP, network and invalid default data errors are exposed for retry',async()=>{
  await assert.rejects(loadDefaultLibrary(async()=>({ok:false})),/无法加载/);
  await assert.rejects(loadDefaultLibrary(async()=>{throw Error('offline');}),/offline/);
  await assert.rejects(loadDefaultLibrary(async()=>({ok:true,json:async()=>({version:2,books:[]})})),/版本/);
});
test('published default contains the full approved merged snapshot',async()=>{
  const input=JSON.parse(await readFile(new URL('../default-library.json',import.meta.url),'utf8'));
  const state=await loadDefaultLibrary(async()=>({ok:true,json:async()=>input}));
  const groups=groupBooks(state.books);
  assert.equal(groups.length,7628);assert.ok(groups.every(b=>b.ids.length===1));
  assert.equal(groups.filter(b=>b.status==='read').length,385);
  assert.equal(groups.filter(b=>b.status==='unread').length,7243);
  assert.equal(groups.reduce((n,b)=>n+readingCount(b),0),398);
  const archives=state.books.flatMap(b=>b.sources).filter(s=>s.path.startsWith('/book/')&&['EXE','ZIP','RAR','7Z','E01','E02'].includes(s.format));
  assert.equal(archives.length,430);
});
