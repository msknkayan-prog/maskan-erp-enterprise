/* Maskan ERP Enterprise v1.4.5 — import batch de-duplication
   Prevents PostgreSQL: ON CONFLICT DO UPDATE command cannot affect row a second time.
   Keeps the last occurrence of each tenant-safe conflict key inside one import batch.
*/
(function(){
  'use strict';

  function dedupeByConflictKey(payload,keySpec){
    const keys=String(keySpec||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!keys.length)return {rows:payload,duplicates:0};
    const map=new Map();
    for(const row of payload){
      const signature=keys.map(k=>String(row?.[k]??'')).join('\u001f');
      map.set(signature,row); // last row wins, matching normal spreadsheet correction behaviour
    }
    return {rows:[...map.values()],duplicates:payload.length-map.size};
  }

  if(typeof window.processImportFile==='function'){
    window.processImportFile=async function(module,file,box,commitButton){
      const spec=IMPORT_SPECS[module];
      box.innerHTML='<div class="diagnostic-loading">جاري قراءة الملف والتحقق من البيانات…</div>';
      const rows=await readImportFile(file);
      if(!rows.length)throw new Error('الملف لا يحتوي على بيانات');
      const missing=spec.required.filter(k=>!(k in rows[0]));
      if(missing.length)throw new Error(`أعمدة مفقودة: ${missing.join(', ')}`);
      const ctx=spec.prepare?await spec.prepare(rows):{};
      const validation=validateImportRows(spec,rows,ctx);
      box.innerHTML=previewImport(spec,rows,validation);
      commitButton.classList.toggle('hidden',!validation.valid.length);
      commitButton.onclick=async()=>{
        commitButton.disabled=true;commitButton.textContent='جاري الحفظ…';
        try{
          const originalPayload=validation.valid.map((x,i)=>spec.map(x.data,i,ctx));
          const clean=dedupeByConflictKey(originalPayload,spec.key);
          if(!clean.rows.length)throw new Error('لا توجد سجلات صالحة للحفظ بعد إزالة التكرار');
          const {error}=await sb.from(spec.table).upsert(clean.rows,{onConflict:spec.key});
          if(error)throw error;
          const duplicateNote=clean.duplicates?` — تم دمج ${clean.duplicates} سجل مكرر داخل الملف`:'';
          box.insertAdjacentHTML('afterbegin',`<div class="import-complete">تم استيراد ${clean.rows.length} سجل بنجاح${duplicateNote}</div>`);
          toast(`اكتمل استيراد ${spec.title}${duplicateNote}`);
        }catch(err){toast(err.message,true)}
        finally{commitButton.disabled=false;commitButton.textContent='تأكيد الاستيراد'}
      };
    };
  }

  document.documentElement.dataset.importDedupe='v1.4.5';
})();
