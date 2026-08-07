/* Maskan ERP Enterprise v1.4.8 — auth/session recovery
   Handles transient Supabase JWT clock-skew errors during imports by refreshing
   the session once, retrying the operation, and forcing a clean sign-in only
   when recovery is not possible.
*/

(function(){
  const isJwtTimeError = err => {
    const msg=String(err?.message||err||'').toLowerCase();
    return msg.includes('jwt issued at future') ||
           msg.includes('jwt issued in the future') ||
           msg.includes('invalid jwt') ||
           msg.includes('jwt expired');
  };

  async function recoverSession(){
    if(!sb?.auth) throw new Error('تعذر تهيئة جلسة الدخول');
    try{
      const {data,error}=await sb.auth.refreshSession();
      if(error) throw error;
      if(!data?.session) throw new Error('تعذر تجديد جلسة الدخول');
      session=data.session;
      return data.session;
    }catch(err){
      try{ await sb.auth.signOut({scope:'local'}); }catch(_){}
      throw new Error('انتهت جلسة الدخول أو يوجد اختلاف في التوقيت. سجّل الدخول مرة أخرى ثم أعد المحاولة.');
    }
  }

  async function withAuthRetry(operation){
    try{
      return await operation();
    }catch(err){
      if(!isJwtTimeError(err)) throw err;
      await recoverSession();
      return await operation();
    }
  }

  // Replace the import handler with a session-safe version. The original
  // validation/mapping behavior is preserved; only authenticated DB calls are
  // retried after a token refresh when Supabase reports JWT clock skew.
  if(typeof processImportFile==='function'){
    processImportFile=async function(module,file,box,commitButton){
      const spec=IMPORT_SPECS[module];
      box.innerHTML='<div class="diagnostic-loading">جاري قراءة الملف والتحقق من البيانات…</div>';
      const rows=await readImportFile(file);
      if(!rows.length)throw new Error('الملف لا يحتوي على بيانات');
      const missing=spec.required.filter(k=>!(k in rows[0]));
      if(missing.length)throw new Error(`أعمدة مفقودة: ${missing.join(', ')}`);

      // Refresh proactively before reference lookups. If the provider rejects
      // the refresh for any non-time-related reason, keep the current session
      // and let the normal query surface the actual error.
      try{
        const refreshed=await sb.auth.refreshSession();
        if(refreshed?.data?.session) session=refreshed.data.session;
      }catch(_){}

      const ctx=spec.prepare?await withAuthRetry(()=>spec.prepare(rows)):{};
      const validation=validateImportRows(spec,rows,ctx);
      box.innerHTML=previewImport(spec,rows,validation);
      commitButton.classList.toggle('hidden',!validation.valid.length);

      commitButton.onclick=async()=>{
        commitButton.disabled=true;
        commitButton.textContent='جاري الحفظ…';
        try{
          const payload=validation.valid.map((x,i)=>spec.map(x.data,i,ctx));
          const result=await withAuthRetry(async()=>{
            const response=await sb.from(spec.table).upsert(payload,{onConflict:spec.key});
            if(response.error)throw response.error;
            return response;
          });
          void result;
          box.insertAdjacentHTML('afterbegin',`<div class="import-complete">تم استيراد ${payload.length} سجل بنجاح</div>`);
          toast(`اكتمل استيراد ${spec.title}`);
        }catch(err){
          toast(err.message||String(err),true);
          if(isJwtTimeError(err) || String(err?.message||'').includes('جلسة الدخول')){
            setTimeout(()=>location.reload(),1200);
          }
        }finally{
          commitButton.disabled=false;
          commitButton.textContent='تأكيد الاستيراد';
        }
      };
    };
  }

  // Recover from auth-state refresh failures without leaving the app stuck.
  window.addEventListener('unhandledrejection',async event=>{
    if(!isJwtTimeError(event.reason))return;
    event.preventDefault?.();
    try{
      await recoverSession();
      toast('تم تجديد جلسة الدخول. أعد المحاولة الآن.');
    }catch(err){
      toast(err.message,true);
      setTimeout(()=>location.reload(),1200);
    }
  });

  document.documentElement.dataset.authSessionFix='v1.4.8';
})();
