import {DRIVES,STATUSES,escapeHTML as e,normalizeTitle} from './core.js';
import {COMMON_FORMATS,sourceDrafts,expandSourceDrafts,parseSplitTitles,splitCandidates,splitCollection} from './book-tools.js';

export function mountSourceEditor(root,sources=[]) {
  let drafts=sourceDrafts(sources);
  function readDrafts(){
    return [...root.querySelectorAll('[data-source-row]')].map((row,index)=>({
      ...drafts[index],drive:row.querySelector('[name="sourceDrive"]').value,
      url:row.querySelector('[name="sourceURL"]').value,path:row.querySelector('[name="sourcePath"]').value,
      formats:[...row.querySelectorAll('[name="sourceFormat"]:checked')].map(x=>x.value).concat(row.querySelector('[name="sourceCustom"]').value.split(/[,，、\s]+/).filter(Boolean)),
    }));
  }
  function render(){
    root.innerHTML=`<div class="source-editor-heading"><h3>网盘来源</h3><button type="button" class="button small" data-add-source>＋ 添加来源</button></div><p class="form-intro">每处来源可勾选多种格式。文件路径不同可分开添加；移除来源只修改书目记录。</p><div class="source-editor-list">${drafts.map((d,index)=>{
      const formats=[...new Set([...COMMON_FORMATS,...d.formats])];
      return `<fieldset class="source-editor-card" data-source-row="${index}"><legend>来源 ${index+1}</legend><button type="button" class="text-button source-remove" data-remove-source="${index}" aria-label="移除来源 ${index+1}">移除此来源</button><div class="form-grid"><label class="form-field">网盘<select name="sourceDrive">${DRIVES.map(drive=>`<option ${d.drive===drive?'selected':''}>${drive}</option>`).join('')}</select></label><label class="form-field">网盘链接（选填）<input name="sourceURL" type="url" value="${e(d.url)}" placeholder="https://…"></label><div class="form-field full"><span>文件格式（可多选）</span><div class="format-options">${formats.map(format=>`<label><input type="checkbox" name="sourceFormat" value="${e(format)}" ${d.formats.includes(format)?'checked':''}>${e(format)}</label>`).join('')}</div></div><label class="form-field full">其他格式（选填，逗号分隔）<input name="sourceCustom" placeholder="如 MP3、MP4；用逗号分隔"></label><label class="form-field full">文件或目录路径（选填）<input name="sourcePath" maxlength="2000" value="${e(d.path)}" placeholder="/电子书/合集目录"></label></div></fieldset>`;
    }).join('')||'<p class="source-empty">暂无来源。可以添加，也可以只保留书目和阅读记录。</p>'}</div>`;
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-add-source')){
      drafts=readDrafts();drafts.push({drive:DRIVES[0],url:'',path:'',formats:['EPUB'],ids:{}});render();
    }else if(button.dataset.removeSource!==undefined){
      drafts=readDrafts().filter((_,index)=>index!==Number(button.dataset.removeSource));render();
    }
  });
  render();
  return {sources:()=>expandSourceDrafts(readDrafts())};
}

export function openSplitDialog({dialog,collection,getBooks,save}) {
  let entries=[];
  dialog.innerHTML=`<form id="split-form"><div class="dialog-header"><h2>将合集拆成单本</h2><button type="button" class="icon-button" data-close="form-dialog" aria-label="关闭">×</button></div><div class="dialog-body"><p class="form-intro">原合集：《${e(collection.title)}》。确认拆分后移除合集，单本共用原合集全部网盘来源；已有书目保留其其他来源及阅读记录。</p><label class="form-field">单本书名（每行一本）<textarea id="split-titles" class="notes-field" required placeholder="书名一 | 作者（选填）&#10;书名二"></textarea></label><p class="form-intro">支持「书名 | 作者」。新书继承合集状态，已读各记1次；不推测缺失的年份，评分留空。已有书目不增加阅读次数。</p><button type="button" class="button" id="split-preview-button">生成拆分预览</button><div id="split-error" class="form-error" role="alert"></div><div id="split-preview"></div></div><div class="dialog-footer"><button type="button" class="button" data-close="form-dialog">取消</button><button class="button primary" id="split-confirm" type="submit" disabled>确认拆分并移除合集</button></div></form>`;
  const error=dialog.querySelector('#split-error'),preview=dialog.querySelector('#split-preview'),confirm=dialog.querySelector('#split-confirm');
  dialog.querySelector('#split-titles').oninput=()=>{entries=[];preview.innerHTML='';error.textContent='';confirm.disabled=true;};
  dialog.querySelector('#split-preview-button').onclick=()=>{
    error.textContent='';confirm.disabled=true;preview.innerHTML='';entries=[];
    try{
      entries=parseSplitTitles(dialog.querySelector('#split-titles').value);
      preview.innerHTML=`<p class="split-summary">将处理 ${entries.length} 本单书 · 原合集 ${collection.sources.length} 条文件来源</p>`+entries.map((entry,index)=>{
        const matches=splitCandidates(getBooks(),collection.id,entry);
        const compatible=matches.filter(b=>!entry.author||b.author==='未知作者'||normalizeTitle(b.author)===normalizeTitle(entry.author));
        const selected=compatible.length===1?compatible[0].id:matches.length>1?'':'new';
        return `<section class="split-row"><h3>${index+1}. ${e(entry.title)}</h3>${entry.author?`<p>${e(entry.author)}</p>`:''}<label class="form-field">处理方式<select name="target-${index}" required>${selected===''?'<option value="">存在多个版本，请选择</option>':''}<option value="new" ${selected==='new'?'selected':''}>新建独立书目 · ${STATUSES[collection.status]}</option>${matches.map(b=>`<option value="${e(b.id)}" ${selected===b.id?'selected':''}>追加到《${e(b.title)}》 · ${e(b.author)} · ${STATUSES[b.status]} · ${b.sources.length}条来源</option>`).join('')}</select></label></section>`;
      }).join('');
      confirm.disabled=false;
    }catch(err){error.textContent=err.message;}
  };
  dialog.querySelector('#split-form').onsubmit=async event=>{
    event.preventDefault();error.textContent='';confirm.disabled=true;
    try{
      const choices=entries.map((entry,index)=>({...entry,targetId:dialog.querySelector(`[name="target-${index}"]`).value}));
      const result=splitCollection(getBooks(),collection.id,choices);
      if(await save(result))dialog.close();
    }catch(err){error.textContent=err.message;}
    finally{confirm.disabled=false;}
  };
  dialog.showModal();
}
