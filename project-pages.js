import { escapeHTML as e } from './core.js';
import { PROJECT_TYPES, money, priceSummary, projectRows } from './projects.js';

export function projectPage(kind,data,ui) {
  const isPrice=kind==='prices',type=PROJECT_TYPES[kind];
  const count=isPrice?data.sections.reduce((n,s)=>n+s.rows.length,0):data.items.length;
  const head=`<div class="page-heading"><div><div class="eyebrow">${isPrice?'READING VALUE':'MY NEXT READS'}</div><h1>${type.label}</h1><p>${isPrice?'按设备整理书目价格，记录你的回收进度。':'把下一本想读的书，留在这里。绿色行表示已读。'}</p></div><div class="heading-buttons"><button class="button primary" data-action="project-add">＋ 添加${isPrice?'记录':'书目'}</button></div></div>`;
  if(!count && (isPrice?!data.sections.length:true))return head+`<div class="empty-state"><h3>打开你的${type.label}</h3><p>选择 ${type.file}，即可载入从表格整理好的内容。本页的数据独立保存。</p><button class="button primary" data-action="open-json">打开${type.label} JSON</button></div>`;
  let summary;
  if(isPrice)summary=`<div class="project-device-grid">${data.sections.map(s=>{
    const x=priceSummary(s);const ratio=x.ratio===null?'未设成本':(x.ratio*100).toFixed(1)+'%';
    return `<section class="project-device"><div class="device-name">${e(s.name)}<span>${x.count} 条书目 · ${x.priced} 条计入金额</span></div><div class="device-value">${money(x.total)}<small>累计计入</small></div><div class="device-baseline"><span>设备成本 ${money(s.cost)}</span><strong>${ratio}</strong></div><div class="device-progress"><span style="width:${Math.min(100,Math.max(0,(x.ratio||0)*100))}%"></span></div><div class="device-foot">${x.remaining===0?'已回本':`距回本 ${money(x.remaining)}`} · ${x.targetRemaining===0?'已达两倍目标':`距两倍目标 ${money(x.targetRemaining)}`}</div></section>`;
  }).join('')}</div>`;
  else summary=`<div class="read-summary"><div><strong>${data.items.length}</strong><p>全部书目</p></div><div><strong>${data.items.filter(x=>x.status!=='read').length}</strong><p>待看</p></div><div><strong>${data.items.filter(x=>x.status==='read').length}</strong><p>已读</p></div><div class="read-quote">下一本，会遇见什么？</div></div>`;
  const filters=`<div class="project-filter-bar"><label class="search-box"><input id="project-search" type="search" aria-label="搜索${type.label}" placeholder="${isPrice?'搜索书名或备注…':'搜索书名、ISBN、来源、资源位置…'}" value="${e(ui.query)}"></label>${isPrice?`<select class="filter-select" id="project-section" aria-label="设备分组"><option value="">全部设备</option>${data.sections.map(s=>`<option value="${e(s.id)}" ${ui.section===s.id?'selected':''}>${e(s.name)}</option>`).join('')}</select>`:`<select class="filter-select" id="project-status" aria-label="待看状态"><option value="all" ${ui.status==='all'?'selected':''}>全部状态</option><option value="unread" ${ui.status==='unread'?'selected':''}>待看</option><option value="read" ${ui.status==='read'?'selected':''}>已读</option></select>`}<span class="result-count" id="project-result-count"></span></div><div class="project-file-note">独立文件：${type.file} · 修改后点击右上角保存，不会写入 library.json。</div>`;
  return head+summary+filters+'<div id="project-results"></div>';
}
export function projectResults(kind,data,ui) {
  const filtered=projectRows(kind,data,ui);
  if(kind==='prices'){
    const count=filtered.reduce((n,s)=>n+s.rows.length,0);
    return {count,html:count?filtered.filter(s=>s.rows.length).map(s=>{
      const sum=s.rows.reduce((n,r)=>n+(r.price===null?0:Math.round(r.price*100)),0)/100;
      return `<section class="project-section"><h2>${e(s.title)}</h2><div class="project-table-scroll"><table class="project-table price-table"><thead><tr><th>序号</th><th>书名</th><th>价格</th><th>备注</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${s.rows.map((r,i)=>`<tr><td class="row-number">${i+1}</td><td class="project-title">${e(r.title)}</td><td class="price-cell ${r.price===null?'missing-value':''}">${money(r.price)}</td><td class="project-notes">${e(r.notes||'—')}</td><td><button class="list-action" data-project-edit="${e(r.id)}">编辑</button></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">${ui.query?'筛选小计':'合计'}</td><td class="price-cell">${money(sum)}</td><td colspan="2">${s.rows.filter(r=>r.price===null).length?`${s.rows.filter(r=>r.price===null).length} 条价格留空，未计入`:'按表内金额累计'}</td></tr></tfoot></table></div>${s.correction?`<p class="project-section-note">${e(s.correction)}</p>`:''}</section>`;
    }).join(''):'<div class="empty-state"><h3>没有匹配的价格记录</h3><p>换个关键词或设备分组。</p></div>'};
  }
  return {count:filtered.length,html:filtered.length?`<div class="project-table-scroll"><table class="project-table wishlist-table"><thead><tr><th>书名 / ISBN</th><th>来源</th><th>资源位置</th><th>备注</th><th>状态</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${filtered.map(r=>`<tr class="${r.status==='read'?'wishlist-read':''}"><td class="project-title">${e(r.title)}${r.isbn?`<small class="project-isbn">${e(r.isbn)}</small>`:''}</td><td class="project-notes">${e(r.source||'—')}</td><td class="project-notes">${e(r.location||'—')}</td><td class="project-notes">${e(r.notes||'—')}</td><td><button class="status-chip ${r.status==='read'?'read':''}" data-wish-toggle="${e(r.id)}" title="点击切换已读/待看">${r.status==='read'?'✓ 已读':'待看'}</button></td><td><button class="list-action" data-project-edit="${e(r.id)}">编辑</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><h3>没有匹配的待看书目</h3><p>换个关键词或阅读状态。</p></div>'};
}
