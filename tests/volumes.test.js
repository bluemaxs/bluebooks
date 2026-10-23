import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImport, restoreLibrary, groupBooks, appendBooks, mergeGroup, readingCount, readingCountForYear} from '../core.js';

const rows = () => [
  {title:'第一卷',author:'作者',isbn:'9780306406157',workId:'volume-one',status:'read',readCount:2,readYears:[2025,2025],sources:[{drive:'百度网盘',format:'EPUB',path:'/合集.epub'}]},
  {title:'第二卷',author:'作者',isbn:'9780306406157',workId:'volume-two',status:'read',readCount:1,readYears:[2024],sources:[{drive:'百度网盘',format:'EPUB',path:'/合集.epub'}]},
];
test('volumes sharing an ISBN and omnibus file remain separate through restore and repeated import', () => {
  const restored=restoreLibrary({app:'bluebooks',version:1,books:rows()}).books;
  assert.equal(groupBooks(restored).length,2);
  assert.deepEqual(restored.map(b=>b.workId),['volume-one','volume-two']);
  const first=appendBooks([],prepareImport(rows()).books);
  assert.equal(first.added,2);
  const again=appendBooks(first.books,prepareImport(rows()).books);
  assert.equal(again.added,0);assert.equal(again.duplicates,2);
  assert.equal(groupBooks(again.books).reduce((n,b)=>n+readingCount(b),0),3);
});
test('source-less annual books are retained and identical work IDs do not duplicate them',()=>{
  const input=[{title:'待补来源',workId:'no-source',status:'read',readCount:2,readYears:[2021,2025],sources:[]}];
  const imported=appendBooks([],prepareImport(input).books);
  assert.equal(imported.added,1);assert.deepEqual(imported.books[0].sources,[]);
  const repeated=appendBooks(imported.books,prepareImport(input).books);
  assert.equal(repeated.duplicates,1);assert.equal(repeated.books.length,1);
  const withFile=prepareImport([{...input[0],sources:[{drive:"百度网盘",format:"EPUB",path:"/后来补的来源.epub"}]}]).books;
  assert.equal(appendBooks(withFile,prepareImport(input).books).duplicates,1);
});
test('same-year rereads count individually and zero ratings remain unscored',()=>{
  const imported=prepareImport(rows()).books;
  assert.equal(readingCountForYear(imported[0],2025),2);
  assert.equal(readingCountForYear(imported[0],2024),0);
  const zero=prepareImport([{title:'A',rating:0}]).books[0];assert.equal(zero.rating,0);
  const fractional=prepareImport([{title:'B',rating:4.8}]).books[0];assert.equal(fractional.rating,4.8);
});
test('different file sources for the same volume retain the longest known reading history',()=>{
  const first=rows()[0];
  const incoming=prepareImport([first,{...first,readCount:1,readYears:[2025],updatedAt:'2099-01-01',sources:[{drive:'百度网盘',format:'MOBI',path:'/合集.mobi'}]}]).books;
  const grouped=groupBooks(incoming)[0];assert.equal(grouped.readCount,2);assert.deepEqual(grouped.readYears,[2025,2025]);
  const merged=mergeGroup(incoming,grouped);assert.equal(merged.length,1);assert.equal(merged[0].sources.length,2);
});
test('directory references round trip as a single source',()=>{
  const book={title:'系列',workId:'series-parent',status:'read',sources:[{drive:'百度网盘',format:'目录',path:'/已读/系列目录',url:''}]};
  const restored=restoreLibrary({version:1,books:[book]}).books[0];
  assert.equal(restored.sources.length,1);assert.equal(restored.sources[0].format,'目录');assert.equal(restored.sources[0].path,'/已读/系列目录');
});
