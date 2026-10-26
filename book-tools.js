import {DRIVES,groupBooks,normalizeTitle,prepareImport,safeURL,uid} from './core.js';

export const COMMON_FORMATS=['EPUB','PDF','MOBI','AZW3','AZW','TXT','DOCX','ZIP','RAR','7Z','EXE','目录','书目'];

export function sourceDrafts(sources=[]) {
  const locations=new Map();
  for(const source of sources){
    const key=JSON.stringify([source.drive,source.url||'',source.path||'']);
    if(!locations.has(key))locations.set(key,{drive:source.drive,url:source.url||'',path:source.path||'',formats:[],ids:{}});
    const row=locations.get(key);
    if(!row.formats.includes(source.format))row.formats.push(source.format);
    row.ids[source.format]=source.id;
  }
  return [...locations.values()];
}

export function expandSourceDrafts(rows) {
  const sources=[],seen=new Set();
  for(const [index,row] of rows.entries()){
    if(!DRIVES.includes(row.drive))throw Error(`来源 ${index+1} 的网盘无效。`);
    if(!Array.isArray(row.formats)||!row.formats.length)throw Error(`请为来源 ${index+1} 至少勾选一种文件格式，或移除该来源。`);
    const rawURL=String(row.url||'').trim(),url=safeURL(rawURL);
    if(rawURL&&!url)throw Error(`来源 ${index+1} 的链接须为有效的 http / https 链接。`);
    const path=String(row.path||'').slice(0,2000);
    for(const value of row.formats){
      const format=String(value).trim().toUpperCase();
      if(!format||format.length>12)throw Error('文件格式须为1到12个字符。');
      const key=JSON.stringify([row.drive,format,url,path]);
      if(seen.has(key))continue;
      seen.add(key);sources.push({id:row.ids?.[format]||uid(),drive:row.drive,format,url,path});
    }
  }
  return sources;
}

export function parseSplitTitles(text) {
  const lines=String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length||lines.length>200)throw Error('请填写1到200本单本书名，每行一本。');
  const seen=new Set();
  return lines.map(line=>{
    const [rawTitle,...authors]=line.split(/\t|\s*\|\s*/);
    const title=rawTitle.trim(),author=authors.join(' / ').trim();
    if(!title||title.length>300||author.length>200)throw Error('书名须为1到300字，作者最多200字。');
    const key=JSON.stringify([normalizeTitle(title),normalizeTitle(author)]);
    if(seen.has(key))throw Error(`《${title}》重复填写，请合并后再预览。`);
    seen.add(key);return {title,author};
  });
}

export function splitCandidates(books,collectionId,entry) {
  return groupBooks(books).filter(b=>!b.ids.includes(collectionId)&&normalizeTitle(b.title)===normalizeTitle(entry.title));
}

export function splitCollection(books,collectionId,entries,now=new Date().toISOString()) {
  const grouped=groupBooks(books),collection=grouped.find(b=>b.ids.includes(collectionId));
  if(!collection)throw Error('原合集已不存在，请重新打开书目。');
  if(!Array.isArray(entries)||!entries.length||entries.length>200)throw Error('请先预览要拆分的书目。');
  const seenTitles=new Set(),seenTargets=new Set(),updates=new Map(),newBooks=[];
  for(const entry of entries){
    const title=String(entry.title||'').trim(),author=String(entry.author||'').trim();
    if(!title||title.length>300||author.length>200)throw Error('请检查拆出的书名和作者。');
    const titleKey=JSON.stringify([normalizeTitle(title),normalizeTitle(author)]);
    if(seenTitles.has(titleKey))throw Error(`《${title}》重复填写。`);
    seenTitles.add(titleKey);
    if(entry.targetId==='new'){
      const isRead=collection.status==='read';
      const knownYear=collection.readYears?.at(-1);
      const note=[`拆自合集《${collection.title}》。`,collection.notes].filter(Boolean).join('\n\n');
      const book=prepareImport([{title,author:author||'未知作者',category:collection.category,isbn:'',workId:uid(),status:collection.status,readCount:isRead?1:0,readYears:isRead&&knownYear?[knownYear]:[],finishedAt:isRead?collection.finishedAt:null,rating:0,favorite:false,notes:note,addedAt:now,updatedAt:now,sources:collection.sources}]).books[0];
      newBooks.push(book);continue;
    }
    const target=grouped.find(b=>b.ids.includes(entry.targetId));
    if(!target||target.key===collection.key||normalizeTitle(target.title)!==normalizeTitle(title))throw Error(`请为《${title}》选择有效的已有书目，或选择新建。`);
    if(seenTargets.has(target.key))throw Error('两行选择了同一本已有书目，请合并后再拆分。');
    seenTargets.add(target.key);
    const sources=[...target.sources],seen=new Set(sources.map(s=>JSON.stringify([s.drive,s.format,s.url,s.path])));
    for(const source of collection.sources){
      const key=JSON.stringify([source.drive,source.format,source.url,source.path]);
      if(!seen.has(key)){sources.push({...source,id:uid()});seen.add(key);}
    }
    const {key,ids,...book}=target;
    updates.set(target.key,{ids,book:{...book,sources,updatedAt:now}});
  }
  const removed=new Set(collection.ids);
  for(const {ids} of updates.values())for(const id of ids)removed.add(id);
  const next=[...books.filter(b=>!removed.has(b.id)),...[...updates.values()].map(x=>x.book),...newBooks];
  if(next.length>100000)throw Error('拆分后超过100,000条书目，请先整理书库。');
  return {books:next,added:newBooks.length,updated:updates.size,removed:collection.ids.length};
}
