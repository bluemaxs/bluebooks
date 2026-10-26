import {escapeHTML as e,uid} from './core.js';
import {readDataset,writeDataset} from './storage.js';
import {PROJECT_TYPES,READER_DEVICES,emptyProject,normalizeProject} from './projects.js';
import {projectPage,projectResults} from './project-pages.js';

export class ProjectController {
  constructor(callbacks){this.callbacks=callbacks;this.data={};this.resetFilters();}
  async load(){
    for(const [kind,type] of Object.entries(PROJECT_TYPES)){
      try{const saved=await readDataset(type.cache);this.data[kind]=saved?normalizeProject(kind,saved):emptyProject(kind);}
      catch{this.data[kind]=emptyProject(kind);this.callbacks.toast(`${type.label}缓存不可用，请重新打开对应 JSON。`);}
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.id=`open-${kind}-file`;document.body.append(input);
      input.addEventListener('change',async()=>{
        const file=input.files[0];input.value='';if(!file)return;
        try{
          if(file.size>25*1024*1024)throw new Error('文件不能超过25 MB。');
          const next=normalizeProject(kind,JSON.parse(await file.text()));
          this.callbacks.confirm(`打开${type.label}？`,`将使用「${e(file.name)}」替换本页草稿，不影响其他 JSON 文件。`,async()=>{
            if(!await this.save(kind,next))return false;
            this.callbacks.navigate(kind);this.callbacks.toast(`${type.label}已载入。`);
          },'确认打开');
        }catch(error){this.callbacks.toast('无法打开：'+error.message);}
      });
    }
    document.addEventListener('input',event=>{if(event.target.id==='project-search'){this.ui.query=event.target.value;this.renderResults();}});
    document.addEventListener('change',event=>{
      if(event.target.id==='project-section'){this.ui.section=event.target.value;this.renderResults();}
      if(event.target.id==='project-status'){this.ui.status=event.target.value;this.renderResults();}
    });
    document.addEventListener('click',async event=>{
      const target=event.target.closest('button');if(!target)return;
      const kind=this.callbacks.page();if(!this.isProject(kind))return;
      if(kind==='readers'&&target.dataset.readerDevice)this.selectDevice(target.dataset.readerDevice);
      if(target.dataset.action==='project-add')this.edit(kind);
      if(target.dataset.projectEdit)this.edit(kind,target.dataset.projectEdit);
      if(target.dataset.wishToggle){
        const id=target.dataset.wishToggle;
        const next={...this.data.wishlist,items:this.data.wishlist.items.map(x=>x.id===id?{...x,status:x.status==='read'?'unread':'read'}:x)};
        if(await this.save('wishlist',next)){this.callbacks.render();this.callbacks.toast('待看状态已更新，记得保存 wishlist.json。');}
      }
    });
    document.addEventListener('keydown',event=>{
      if(this.callbacks.page()!=='readers'||!event.target.matches('[data-reader-device]'))return;
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const current=READER_DEVICES.findIndex(d=>d.id===this.ui.device);
      const index=event.key==='Home'?0:event.key==='End'?READER_DEVICES.length-1:(current+(event.key==='ArrowRight'?1:-1)+READER_DEVICES.length)%READER_DEVICES.length;
      this.selectDevice(READER_DEVICES[index].id);
    });
  }
  isProject(kind){return Object.hasOwn(PROJECT_TYPES,kind);}
  count(kind){return kind==='prices'?this.data.prices.sections.reduce((n,s)=>n+s.rows.length,0):this.data[kind].items.length;}
  resetFilters(){this.ui={query:'',section:'',status:'all',device:'kindle'};}
  selectDevice(device){
    if(!READER_DEVICES.some(d=>d.id===device))return;
    this.ui.device=device;this.ui.query='';this.callbacks.render();
    document.querySelector(`#reader-tab-${device}`)?.focus();
  }
  render(kind){return projectPage(kind,this.data[kind],this.ui);}
  renderResults(){
    const kind=this.callbacks.page();if(!this.isProject(kind)||!document.querySelector('#project-results'))return;
    const result=projectResults(kind,this.data[kind],this.ui);
    document.querySelector('#project-results').innerHTML=result.html;
    document.querySelector('#project-result-count').textContent=`${kind==='readers'?READER_DEVICES.find(d=>d.id===this.ui.device).name+' · ':''}${result.count} 条记录`;
  }
  openFile(kind){document.querySelector(`#open-${kind}-file`).click();}
  export(kind){
    const data={...this.data[kind],exportedAt:new Date().toISOString()};
    this.callbacks.download(PROJECT_TYPES[kind].file,JSON.stringify(data,null,2));
    this.callbacks.toast(`${PROJECT_TYPES[kind].file} 已下载。`);
  }
  async reload(kind){const saved=await readDataset(PROJECT_TYPES[kind].cache);if(saved)this.data[kind]=normalizeProject(kind,saved);}
  async save(kind,next){
    try{
      const clean=normalizeProject(kind,next);await writeDataset(PROJECT_TYPES[kind].cache,clean);this.data[kind]=clean;this.callbacks.notify(kind);return true;
    }catch(error){this.callbacks.toast('保存失败：'+error.message);return false;}
  }
  edit(kind,id){
    const isPrice=kind==='prices',isReader=kind==='readers',data=this.data[kind];let record,section;
    if(isPrice){section=data.sections.find(s=>s.rows.some(r=>r.id===id));record=section?.rows.find(r=>r.id===id);}else record=data.items.find(r=>r.id===id);
    const dialog=document.querySelector('#form-dialog');
    const title=`${record?'编辑':'添加'}${isPrice?'价格记录':isReader?'阅读器书目':'待看书目'}`;
    const input=(name,label,value,extra='')=>`<label class="form-field ${name==='title'?'full':''}">${label}<input name="${name}" value="${e(value||'')}" ${extra}></label>`;
    let fields;
    if(isPrice){
      fields=data.sections.length?`<label class="form-field full">设备分组<select name="section">${data.sections.map(s=>`<option value="${e(s.id)}" ${section?.id===s.id?'selected':''}>${e(s.name)}</option>`).join('')}</select></label>`:`${input('deviceName','设备名称 *','','required maxlength="200"')}${input('cost','设备成本 *','','type="number" min="0" step="0.01" required')}${input('milestone','两倍回收目标 *','','type="number" min="0" step="0.01" required')}`;
      fields+=input('title','书名 *',record?.title,'required maxlength="500"')+`<label class="form-field full">价格（元，留空不计入）<input name="price" type="number" min="0" step="0.01" value="${record?.price===null||record?.price===undefined?'':e(record.price)}"></label>`;
    }else if(isReader){
      fields=`<label class="form-field full">阅读器<select name="deviceId">${READER_DEVICES.map(d=>`<option value="${d.id}" ${(record?.deviceId||this.ui.device)===d.id?'selected':''}>${d.name}</option>`).join('')}</select></label>`+input('title','书名 *',record?.title,'required maxlength="500"')+input('author','作者（选填）',record?.author,'maxlength="200"')+`<label class="form-field full">存放位置（选填）<input name="location" maxlength="2000" value="${e(record?.location||'')}" placeholder="例如：documents/文学，或设备里的收藏夹名称"></label>`;
    }else{
      fields=input('title','书名 *',record?.title,'required maxlength="500"')+input('isbn','ISBN',record?.isbn,'maxlength="50"')+`<label class="form-field">状态<select name="status"><option value="unread" ${record?.status!=='read'?'selected':''}>待看</option><option value="read" ${record?.status==='read'?'selected':''}>已读</option></select></label><label class="form-field full">来源<textarea name="source" class="notes-field" style="min-height:60px">${e(record?.source||'')}</textarea></label><label class="form-field full">资源位置<textarea name="location" class="notes-field" style="min-height:60px">${e(record?.location||'')}</textarea></label>`;
    }
    fields+=`<label class="form-field full">备注<textarea name="notes" class="notes-field">${e(record?.notes||'')}</textarea></label>`;
    dialog.innerHTML=`<form id="project-form"><div class="dialog-header"><h2>${title}</h2><button type="button" class="icon-button" data-close="form-dialog" aria-label="关闭">×</button></div><div class="dialog-body"><div class="form-grid">${fields}</div><div class="form-error" id="project-form-error" role="alert"></div></div><div class="dialog-footer">${record?'<button type="button" class="button danger small" id="project-remove">移除此记录</button>':'<span></span>'}<button class="button primary" type="submit">保存记录</button></div></form>`;
    document.querySelector('#project-form').onsubmit=async event=>{
      event.preventDefault();const values=Object.fromEntries(new FormData(event.target));const title=values.title.trim();if(!title){document.querySelector('#project-form-error').textContent='请填写书名。';return;}
      let next;
      if(isPrice){
        const row={...record,id:record?.id||uid(),title,price:values.price===''?null:Number(values.price),notes:values.notes};
        let sections=data.sections;
        if(!sections.length)sections=[{id:uid(),name:values.deviceName.trim(),title:values.deviceName.trim(),cost:Number(values.cost),milestone:Number(values.milestone),costBreakdown:[],sourceTotal:null,rows:[]}];
        const chosen=values.section||sections[0].id;
        next={...data,sections:sections.map(s=>({...s,rows:[...s.rows.filter(r=>r.id!==id),...(s.id===chosen?[row]:[])]}))};
        // Preserve row order when editing within the same device.
        if(record&&section?.id===chosen)next.sections=next.sections.map(s=>s.id===chosen?{...s,rows:data.sections.find(x=>x.id===chosen).rows.map(r=>r.id===id?row:r)}:s);
      }else next={...data,items:record?data.items.map(r=>r.id===id?{...r,...values,title}:r):[...data.items,{...values,id:uid(),title,...(isReader?{}:{originalFill:''})}]};
      try{normalizeProject(kind,next);}catch(error){document.querySelector('#project-form-error').textContent=error.message;return;}
      if(await this.save(kind,next)){dialog.close();this.callbacks.render();this.callbacks.toast(`记录已保存，记得保存 ${PROJECT_TYPES[kind].file}。`);}
    };
    if(record)document.querySelector('#project-remove').onclick=()=>this.callbacks.confirm('移除此记录？','此操作仅修改当前清单，不影响其他 JSON 文件。',async()=>{
      const next=isPrice?{...data,sections:data.sections.map(s=>({...s,rows:s.rows.filter(r=>r.id!==id)}))}:{...data,items:data.items.filter(r=>r.id!==id)};
      if(!await this.save(kind,next))return false;this.callbacks.render();this.callbacks.toast('记录已移除。');
    },'移除记录');
    dialog.showModal();
  }
}
