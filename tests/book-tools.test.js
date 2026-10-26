import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImport,groupBooks,restoreLibrary} from '../core.js';
import {sourceDrafts,expandSourceDrafts,parseSplitTitles,splitCandidates,splitCollection} from '../book-tools.js';

const source=(format='EPUB',path='/合集',drive='百度网盘')=>({id:'source-'+format+drive,drive,format,path,url:''});
const library=()=>prepareImport([
  {title:'合集（共2册）',author:'合集作者',workId:'set',status:'read',readCount:2,readYears:[2023,2026],rating:4,notes:'合集感想',isbn:'9780306406157',sources:[source(),source('PDF')]},
  {title:'已有单本',author:'作者甲',workId:'existing',status:'read',readCount:3,readYears:[2021,2024,2024],rating:5,favorite:true,notes:'原笔记',sources:[source('MOBI','/其他位置','阿里云盘')]},
]).books;

test('all source locations and multiple formats round trip, can be removed, and reject bad links',()=>{
  const original=[source(),source('PDF'),source('MOBI','/第二处','阿里云盘')];
  const rows=sourceDrafts(original);assert.equal(rows.length,2);assert.deepEqual(rows[0].formats,['EPUB','PDF']);
  assert.deepEqual(expandSourceDrafts(rows),original);
  const edited=expandSourceDrafts([{...rows[1],formats:['MOBI','AZW3']}]);
  assert.equal(edited.length,2);assert.ok(edited.every(s=>s.path==='/第二处'&&s.drive==='阿里云盘'));
  assert.deepEqual(expandSourceDrafts([]),[]);
  assert.throws(()=>expandSourceDrafts([{...rows[0],formats:[]}]),/至少/);
  assert.throws(()=>expandSourceDrafts([{...rows[0],url:'javascript:alert(1)'}]),/链接/);
  assert.equal(expandSourceDrafts([...rows,rows[0]]).length,3);
});
test('splitting removes the collection, shares every source and preserves existing reading records',()=>{
  const before=library(),snapshot=structuredClone(before),parent=before[0],existing=before[1];
  const result=splitCollection(before,parent.id,[{title:'新拆单本',author:'作者乙',targetId:'new'},{title:'已有单本',author:'作者甲',targetId:existing.id}]);
  assert.deepEqual(before,snapshot);assert.equal(result.added,1);assert.equal(result.updated,1);
  assert.ok(!result.books.some(b=>b.id===parent.id));
  const updated=result.books.find(b=>b.id===existing.id),fresh=result.books.find(b=>b.title==='新拆单本');
  const {sources,updatedAt,...metadata}=updated,{sources:oldSources,updatedAt:oldDate,...oldMetadata}=existing;
  assert.deepEqual(metadata,oldMetadata);assert.equal(sources.length,3);assert.deepEqual(sources[0],oldSources[0]);
  assert.equal(fresh.status,'read');assert.equal(fresh.readCount,1);assert.deepEqual(fresh.readYears,[2026]);
  assert.equal(fresh.finishedAt,null);assert.equal(fresh.isbn,'');assert.equal(fresh.rating,0);assert.match(fresh.notes,/合集感想/);
  assert.ok(fresh.workId&&fresh.workId!==parent.workId);assert.equal(fresh.sources.length,2);
  assert.equal(groupBooks(restoreLibrary({app:'bluebooks',version:1,books:result.books}).books).length,2);
});
test('split previews retain ambiguous same-name candidates and reject partial or repeated targets atomically',()=>{
  const books=library();const parent=books[0];
  books.push({...books[1],id:'other-id',workId:'other-edition',author:'另一作者'});
  assert.equal(splitCandidates(books,parent.id,{title:'已有单本'}).length,2);
  const snapshot=structuredClone(books);
  assert.throws(()=>splitCollection(books,parent.id,[{title:'新书',targetId:'new'},{title:'已有单本',targetId:'missing'}]),/有效/);
  assert.deepEqual(books,snapshot);
  assert.throws(()=>splitCollection(books,parent.id,[{title:parent.title,targetId:parent.id}]),/有效/);
  assert.throws(()=>parseSplitTitles('A\nA'),/重复/);
  assert.deepEqual(parseSplitTitles('第一册 | 甲\n\n第二册\t乙'),[{title:'第一册',author:'甲'},{title:'第二册',author:'乙'}]);
});
test('splitting unread collections does not create reading dates and repeated source paths stay deduplicated',()=>{
  const books=library(),parent=books[0],existing=books[1];
  parent.status='unread';parent.readCount=0;parent.readYears=[];
  existing.sources.push({...parent.sources[0]});
  const result=splitCollection(books,parent.id,[{title:'已有单本',targetId:existing.id},{title:'未读单本',targetId:'new'}]);
  assert.equal(result.books.find(b=>b.id===existing.id).sources.length,3);
  const fresh=result.books.find(b=>b.title==='未读单本');
  assert.equal(fresh.author,'未知作者');
  assert.equal(fresh.status,'unread');assert.equal(fresh.readCount,0);assert.deepEqual(fresh.readYears,[]);assert.equal(fresh.finishedAt,null);
});
