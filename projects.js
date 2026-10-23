import { uid } from "./core.js";

export const PROJECT_TYPES = {
  prices: { app: "bluebooks-price-plan", file: "price-plan.json", label: "价格回收计划", cache: "price-plan" },
  wishlist: { app: "bluebooks-wishlist", file: "wishlist.json", label: "待看清单", cache: "wishlist" },
};
export const money = value => value === null || value === undefined ? "未计入" : `¥${Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const text = (value, max = 50000) => String(value ?? "").slice(0, max);
function amount(value, optional = false) {
  if (value === null || value === undefined || value === "") {
    if (optional) return null;
    throw new Error("设备成本和回收目标不能为空。");
  }
  const number=Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e9 || Math.abs(number*100-Math.round(number*100))>0.00001) throw new Error("金额须为不小于 0、最多两位小数的数字。");
  return number;
}
export function emptyProject(kind) {
  const type=PROJECT_TYPES[kind];
  if(!type) throw new Error("未知清单类型。");
  return {app:type.app,version:1,...(kind==='prices'?{currency:'CNY',sections:[]}:{items:[]})};
}
export function normalizeProject(kind, input) {
  const type=PROJECT_TYPES[kind];
  if(!type || input?.app !== type.app || input.version !== 1) throw new Error(`请选择 ${type?.file || '正确的 JSON 文件'}；书库、价格计划和待看清单使用不同格式。`);
  if(kind==='prices') {
    if(!Array.isArray(input.sections) || input.sections.length>100) throw new Error("价格计划需要 sections 数组，最多 100 个分组。");
    const sectionIds=new Set(),rowIds=new Set();
    const sections=input.sections.map(s=>{
      if(!s || !text(s.name).trim() || !Array.isArray(s.rows) || s.rows.length>100000) throw new Error("价格计划分组须包含名称和书目数组。");
      const id=text(s.id||uid(),100);if(sectionIds.has(id))throw new Error("价格计划的分组编号重复。");sectionIds.add(id);
      return {...s,id,name:text(s.name,200),title:text(s.title||s.name,1000),cost:amount(s.cost),milestone:amount(s.milestone),sourceTotal:amount(s.sourceTotal,true),costBreakdown:Array.isArray(s.costBreakdown)?s.costBreakdown.map(x=>amount(x)):[],rows:s.rows.map(r=>{
        if(!r || !text(r.title).trim())throw new Error("价格记录缺少书名。");
        const rowId=text(r.id||uid(),100);if(rowIds.has(rowId))throw new Error("价格记录的编号重复。");rowIds.add(rowId);
        return {...r,id:rowId,title:text(r.title,500).trim(),price:amount(r.price,true),notes:text(r.notes)};
      })};
    });
    return {...input,app:type.app,version:1,currency:'CNY',sections};
  }
  if(!Array.isArray(input.items)||input.items.length>100000)throw new Error("待看清单需要 items 数组，最多 100,000 条。");
  const ids=new Set();
  return {...input,app:type.app,version:1,items:input.items.map(r=>{
    if(!r||!text(r.title).trim())throw new Error("待看记录缺少书名。");
    const id=text(r.id||uid(),100);if(ids.has(id))throw new Error("待看记录的编号重复。");ids.add(id);
    return {...r,id,title:text(r.title,500).trim(),isbn:text(r.isbn,50),source:text(r.source),location:text(r.location),notes:text(r.notes),status:r.status==='read'?'read':'unread',originalFill:text(r.originalFill,50)};
  })};
}
export function priceSummary(section) {
  const totalCents=section.rows.reduce((sum,r)=>sum+(r.price===null?0:Math.round(r.price*100)),0);
  const costCents=Math.round(section.cost*100),targetCents=Math.round(section.milestone*100);
  return {total:totalCents/100,count:section.rows.length,priced:section.rows.filter(r=>r.price!==null).length,remaining:Math.max(0,costCents-totalCents)/100,targetRemaining:Math.max(0,targetCents-totalCents)/100,ratio:costCents?totalCents/costCents:null};
}
export function projectRows(kind,data,{query='',section='',status='all'}={}) {
  const q=query.toLocaleLowerCase().trim();
  if(kind==='prices')return data.sections.filter(s=>!section||s.id===section).map(s=>({...s,rows:s.rows.filter(r=>!q||[r.title,r.notes,r.price].join(' ').toLocaleLowerCase().includes(q))}));
  return data.items.filter(r=>(status==='all'||r.status===status)&&(!q||[r.title,r.isbn,r.source,r.location,r.notes].join(' ').toLocaleLowerCase().includes(q)));
}
