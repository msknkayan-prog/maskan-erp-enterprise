/* Maskan ERP Enterprise v1.5.0 — unified import engine
   Consolidates import stability fixes: auth retry, enum/number sanitation,
   duplicate document numbering, and PostgREST schema-cache compatibility.
*/
(function(){
  'use strict';

  const str=v=>String(v??'').trim();
  const isJwtError=err=>{
    const m=str(err?.message||err).toLowerCase();
    return m.includes('jwt issued at future')||m.includes('jwt issued in the future')||m.includes('jwt expired')||m.includes('invalid jwt');
  };
  const parseMissingColumn=err=>{
    const m=str(err?.message||err);
    let x=m.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
    if(x)return {column:x[1],table:x[2]};
    x=m.match(/column\s+"([^"]+)"\s+of relation\s+"([^"]+)"\s+does not exist/i);
    if(x)return {column:x[1],table:x[2]};
    return null;
  };
  const sanitizeValue=v=>{
    if(typeof v==='number' && !Number.isFinite(v))return null;
    return v;
  };
  const sanitizeRows=rows=>rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,sanitizeValue(v)])));

  async function refreshAuth(){
    if(!sb?.auth)throw new Error('تعذر تهيئة جلسة الدخول');
    const {data,error}=await sb.auth.refreshSession();
    if(error||!data?.session)throw error||new Error('تعذر تجديد جلسة الدخول');
    session=data.session;
  }

  async function upsertCompatible(table,rows,onConflict){
    let payload=sanitizeRows(rows).map(r=>({...r}));
    const removed=[];
    let authRetried=false;
    for(let attempt=0;attempt<10;attempt++){
      const res=await sb.from(table).upsert(payload,{onConflict});
      if(!res.error)return {removed};
      if(isJwtError(res.error) && !authRetried){
        await refreshAuth();authRetried=true;continue;
      }
      const miss=parseMissingColumn(res.error);
      if(miss && miss.table===table && payload.some(r=>Object.prototype.hasOwnProperty.call(r,miss.column))){
        payload=payload.map(r=>{const c={...r};delete c[miss.column];return c});
        removed.push(miss.column);continue;
      }
      throw res.error;
    }
    throw new Error('تعذر إكمال الاستيراد بعد محاولات التوافق مع بنية قاعدة البيانات');
  }

  function ensureUniqueDocumentNumbers(module,payload){
    const fields={payments:['payment_number','PAY'],requests:['request_number','REQ'],certificates:['certificate_number','CERT'],purchase_orders:['po_number','PO']};
    const info=fields[module];
    if(!info)return {rows:payload,renumbered:0};
    const [field,prefix]=info,seen=new Set(),out=[];
    let next=1,renumbered=0;
    const reserve=v=>{seen.add(v);const m=String(v||'').match(/(\d+)$/);if(m)next=Math.max(next,Number(m[1])+1)};
    payload.forEach(r=>{const v=str(r[field]);if(v&&!seen.has(v))reserve(v)});
    seen.clear();next=1;
    for(const row of payload){
      const r={...row};let v=str(r[field]);
      if(v && !seen.has(v)){seen.add(v);const m=v.match(/(\d+)$/);if(m)next=Math.max(next,Number(m[1])+1);out.push(r);continue;}
      while(seen.has(`${prefix}-${String(next).padStart(4,'0')}`))next++;
      r[field]=`${prefix}-${String(next).padStart(4,'0')}`;seen.add(r[field]);next++;renumbered++;out.push(r);
    }
    return {rows:out,renumbered};
  }

  function dedupeExactConflict(payload,keySpec){
    const keys=str(keySpec).split(',').map(x=>x.trim()).filter(Boolean);
    if(!keys.length)return {rows:payload,duplicates:0};
    const map=new Map();
    for(const row of payload){
      const sig=keys.map(k=>str(row?.[k])).join('\u001f');
      if(!map.has(sig))map.set(sig,row);
      else if(JSON.stringify(map.get(sig))===JSON.stringify(row))map.set(sig,row);
      else map.set(sig,row);
    }
    return {rows:[...map.values()],duplicates:payload.length-map.size};
  }

  if(typeof window.processImportFile==='function' || typeof processImportFile==='function'){
    window.processImportFile=async function(module,file,box,commitButton){
      const spec=IMPORT_SPECS[module];
      box.innerHTML='<div class="diagnostic-loading">جاري قراءة الملف والتحقق من البيانات…</div>';
      const rows=await readImportFile(file);
      if(!rows.length)throw new Error('الملف لا يحتوي على بيانات');
      const missing=spec.required.filter(k=>!(k in rows[0]));
      if(missing.length)throw new Error(`أعمدة مفقودة: ${missing.join(', ')}`);

      try{await refreshAuth()}catch(err){if(isJwtError(err))throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى ثم أعد المحاولة.');}
      const ctx=spec.prepare?await spec.prepare(rows):{};
      const validation=validateImportRows(spec,rows,ctx);
      box.innerHTML=previewImport(spec,rows,validation);
      commitButton.classList.toggle('hidden',!validation.valid.length);

      commitButton.onclick=async()=>{
        commitButton.disabled=true;commitButton.textContent='جاري الحفظ…';
        try{
          let payload=validation.valid.map((x,i)=>spec.map(x.data,i,ctx));
          const unique=ensureUniqueDocumentNumbers(module,payload);payload=unique.rows;
          const clean=dedupeExactConflict(payload,spec.key);payload=clean.rows;
          if(!payload.length)throw new Error('لا توجد سجلات صالحة للحفظ');
          const result=await upsertCompatible(spec.table,payload,spec.key);
          const notes=[];
          if(unique.renumbered)notes.push(`تم تصحيح ${unique.renumbered} رقم مستند مكرر`);
          if(clean.duplicates)notes.push(`تم دمج ${clean.duplicates} سجل مكرر تمامًا`);
          if(result.removed.length)notes.push(`تم تجاهل أعمدة غير موجودة بقاعدة البيانات: ${[...new Set(result.removed)].join(', ')}`);
          const note=notes.length?` — ${notes.join(' — ')}`:'';
          box.insertAdjacentHTML('afterbegin',`<div class="import-complete">تم استيراد ${payload.length} سجل بنجاح${note}</div>`);
          toast(`اكتمل استيراد ${spec.title}${note}`);
        }catch(err){
          const msg=str(err?.message||err);
          toast(msg,true);
          if(isJwtError(err)||msg.includes('جلسة الدخول'))setTimeout(()=>location.reload(),1200);
        }finally{
          commitButton.disabled=false;commitButton.textContent='تأكيد الاستيراد';
        }
      };
    };
    try{processImportFile=window.processImportFile}catch(_){}
  }

  document.documentElement.dataset.importEngine='v1.5.0';
})();
