import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,normalizeProject,projectRows} from '../projects.js';
import {projectPage,projectResults} from '../project-pages.js';
import {restoreLibrary,readingCountForSelection} from '../core.js';

const records=()=>({...emptyProject('readers'),items:[
  {id:'k1',deviceId:'kindle',title:'同一本书',author:'作者甲',location:'documents/文学',notes:'Kindle 版本'},
  {id:'x1',deviceId:'x3',title:'同一本书',author:'作者甲',location:'Books/小说',notes:'X3 版本'},
  {id:'x2',deviceId:'x3',title:'另一册',author:'作者乙',location:'收藏夹',notes:'测试备注'},
]});
test('one reader JSON keeps both device lists and their separate copies through a round trip',()=>{
  const input=normalizeProject('readers',records());
  assert.deepEqual(normalizeProject('readers',JSON.parse(JSON.stringify(input))),input);
  assert.deepEqual(input.devices.map(d=>d.name),['Kindle','X3']);
  assert.equal(projectRows('readers',input,{device:'kindle'}).length,1);
  assert.equal(projectRows('readers',input,{device:'x3'}).length,2);
  assert.equal(projectRows('readers',input,{device:'x3',query:'收藏夹'}).length,1);
  assert.equal(projectRows('readers',input,{device:'kindle',query:'X3 版本'}).length,0);
  const moved=normalizeProject('readers',{...input,items:input.items.map(r=>r.id==='k1'?{...r,deviceId:'x3'}:r)});
  assert.equal(projectRows('readers',moved,{device:'kindle'}).length,0);
  assert.equal(projectRows('readers',moved,{device:'x3'}).length,3);
  assert.equal(moved.items.find(r=>r.id==='k1').notes,'Kindle 版本');
});
test('reader import rejects other datasets, bad devices and duplicate records',()=>{
  for(const kind of ['prices','wishlist']){
    assert.throws(()=>normalizeProject('readers',emptyProject(kind)));
    assert.throws(()=>normalizeProject(kind,records()));
  }
  assert.throws(()=>restoreLibrary(records()));
  assert.throws(()=>normalizeProject('readers',{...records(),app:'bluebooks',books:[]}));
  assert.throws(()=>normalizeProject('readers',{...records(),version:2}));
  for(const row of [{id:'bad',title:' ' ,deviceId:'kindle'},{id:'bad',title:'A',deviceId:'other'}]){
    assert.throws(()=>normalizeProject('readers',{...records(),items:[row]}));
  }
  assert.throws(()=>normalizeProject('readers',{...records(),items:[records().items[0],records().items[0]]}));
  assert.throws(()=>normalizeProject('readers',{...records(),devices:[{id:'kindle'},{id:'kindle'}]}));
  assert.throws(()=>normalizeProject('readers',{...records(),devices:[{id:'kindle'}]}));
  assert.throws(()=>normalizeProject('readers',{...records(),items:[{...records().items[0],status:'broken'}]}));
});
test('reader statuses migrate old files and filter only the chosen device',()=>{
  const old=normalizeProject('readers',records());assert.ok(old.items.every(r=>r.status==='unread'));
  const data=normalizeProject('readers',{...records(),items:records().items.map((r,i)=>({...r,status:['reading','read','unread'][i]}))});
  assert.equal(projectRows('readers',data,{device:'kindle',status:'reading'}).length,1);
  assert.equal(projectRows('readers',data,{device:'kindle',status:'read'}).length,0);
  assert.equal(projectRows('readers',data,{device:'x3',status:'read'}).length,1);
  assert.equal(projectRows('readers',data,{device:'x3',status:'unread',query:'收藏夹'}).length,1);
  assert.deepEqual(normalizeProject('readers',JSON.parse(JSON.stringify(data))),data);
  const page=projectPage('readers',data,{device:'x3',status:'read'});
  assert.match(page,/data-reader-status="reading"/);assert.match(page,/data-reader-status="read" aria-pressed="true"/);
});
test('empty device tabs remain usable and imported book text is escaped',()=>{
  const page=projectPage('readers',emptyProject('readers'),{device:'x3'});
  assert.match(page,/reader-contents\.json/);
  assert.match(page,/data-reader-device="kindle"/);assert.match(page,/data-reader-device="x3"/);
  assert.match(page,/id="reader-panel" role="tabpanel" aria-labelledby="reader-tab-x3"/);
  const data=normalizeProject('readers',{...records(),items:[{id:'unsafe',deviceId:'kindle',title:'<script>alert(1)</script>',author:'<img>',location:'<svg>',notes:'"quoted"'}]});
  const html=projectResults('readers',data,{device:'kindle'}).html;
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;svg&gt;'));
  assert.equal(projectResults('readers',data,{device:'x3'}).count,0);
});
test('year selection counts only that year while retaining rereads and undated history',()=>{
  const acrossYears={status:'read',readCount:2,readYears:[2023,2026],finishedAt:null};
  const sameYear={status:'read',readCount:3,readYears:[2025,2025],finishedAt:null};
  const unknown={status:'read',readCount:1,readYears:[],finishedAt:null};
  assert.equal(readingCountForSelection(acrossYears,'2023'),1);
  assert.equal(readingCountForSelection(acrossYears,'2026'),1);
  assert.equal(readingCountForSelection(acrossYears,'2025'),0);
  assert.equal(readingCountForSelection(sameYear,'2025'),2);
  assert.equal(readingCountForSelection(sameYear,'unknown'),1);
  assert.equal(readingCountForSelection(unknown,'unknown'),1);
  assert.equal(readingCountForSelection(unknown,'2026'),0);
  assert.equal(readingCountForSelection(acrossYears,''),2);
  const legacy={status:'read',readCount:2,finishedAt:'2024-06-15T12:00:00Z'};
  assert.equal(readingCountForSelection(legacy,'2024'),1);
  assert.equal(readingCountForSelection(legacy,'unknown'),1);
});
