import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject, normalizeProject, priceSummary, projectRows} from '../projects.js';
import {projectPage, projectResults} from '../project-pages.js';
import {prepareImport, restoreLibrary, groupBooks, readingCount, recordRead, parseCSV} from '../core.js';
const plan=()=>({app:'bluebooks-price-plan',version:1,sections:[{id:'a',name:'Reader',cost:100,milestone:200,rows:[{id:'r1',title:'A',price:0.1},{id:'r2',title:'B',price:0.2},{id:'r3',title:'C',price:null}]}]});
const wishes=()=>({app:'bluebooks-wishlist',version:1,items:[{id:'w1',title:'<script>',status:'read',originalFill:'green'},{id:'w2',title:'Next',status:'unread'}]});
test('independent JSON datasets reject each other rather than replace the wrong draft',()=>{
  assert.throws(()=>normalizeProject('prices',wishes()));
  assert.throws(()=>normalizeProject('wishlist',plan()));
  assert.throws(()=>normalizeProject('prices',{app:'bluebooks',version:1,books:[]}));
  assert.throws(()=>restoreLibrary(plan()));
  assert.deepEqual(normalizeProject('wishlist',emptyProject('wishlist')).items,[]);
});
test('prices sum in cents and a missing price stays distinct from zero',()=>{
  const p=normalizeProject('prices',plan());
  const x=priceSummary(p.sections[0]);
  assert.equal(x.total,0.3);assert.equal(x.remaining,99.7);assert.equal(x.targetRemaining,199.7);assert.equal(x.priced,2);
  p.sections[0].rows[2].price=0;assert.equal(priceSummary(p.sections[0]).priced,3);
});
test('price import validates amounts and IDs',()=>{
  for(const price of [-1,'wrong',Infinity,0.123]){const p=plan();p.sections[0].rows[0].price=price;assert.throws(()=>normalizeProject('prices',p));}
  const p=plan();p.sections[0].rows.push({...p.sections[0].rows[0]});assert.throws(()=>normalizeProject('prices',p));
});
test('wishlist status filtering and HTML escaping preserve imported content safely',()=>{
  const w=normalizeProject('wishlist',wishes());
  assert.equal(projectRows('wishlist',w,{status:'read'}).length,1);
  assert.equal(projectRows('wishlist',w,{query:'Next'}).length,1);
  const result=projectResults('wishlist',w,{});assert.ok(result.html.includes('&lt;script&gt;'));assert.ok(result.html.includes('wishlist-read'));assert.ok(!result.html.includes('<script>'));
  assert.ok(projectPage('prices',normalizeProject('prices',plan()),{}).includes('价格回收计划'));
});
test('old read records default to one and rereads accumulate without inventing old dates',()=>{
  const b=prepareImport([{title:'A',status:'read'}]).books[0];assert.equal(readingCount(b),1);assert.equal(b.finishedAt,null);assert.deepEqual(b.readYears,[]);
  const date=new Date(2026,5,1);const again={...b,...recordRead(b,date)};assert.equal(again.readCount,2);assert.deepEqual(again.readYears,[2026]);
  const third={...again,...recordRead(again,date)};assert.equal(third.readCount,3);assert.deepEqual(third.readYears,[2026,2026]);
  const restored=restoreLibrary({app:'bluebooks',version:1,books:[third]}).books[0];assert.equal(restored.readCount,3);assert.deepEqual(restored.readYears,[2026,2026]);
});
test('multiple file sources do not inflate a reread count and CSV can set counts',()=>{
  const b=prepareImport([{title:'A',author:'B',status:'read',readCount:3,readYears:[2021,2022,2025]},{title:'A',author:'B',status:'read',readCount:1}]).books;
  const grouped=groupBooks(b)[0];assert.equal(grouped.readCount,3);assert.equal(grouped.readYears.length,3);
  assert.equal(prepareImport(parseCSV('书名,状态,阅读次数\nA,已读,4')).books[0].readCount,4);
  assert.equal(readingCount({status:'unread',readCount:-5}),0);
});
