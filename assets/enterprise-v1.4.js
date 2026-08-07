/* Maskan ERP Enterprise v1.4 — final go-live enhancements
   Executive dashboard, budget control, expiry alerts, audit viewer,
   BOQ summary, controlled backup restore and production health helpers.
*/
(function(){
  'use strict';
  const RELEASE='Enterprise Final v1.4 Go-Live';
  document.documentElement.dataset.erpRelease='v1.4-go-live';
  document.title='مسكن الكيان ERP — Enterprise Final v1.4 Go-Live';

  const fmt=n=>typeof money==='function'?money(Number(n||0)):new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2}).format(Number(n||0));
  const e=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const cid=()=>typeof companyId==='function'?companyId():null;

  async function appendExecutiveDashboard(){
    const content=document.querySelector('#content');
    if(!content || content.querySelector('.v14-executive'))return;
    try{
      const [bc,alerts,claims,vars]=await Promise.all([
        sb.from('v_erp_budget_control').select('*'),
        sb.from('v_erp_contract_alerts').select('*').in('alert_level',['expired','expires_30d','expires_60d']),
        sb.from('financial_claims').select('claimed_amount,approved_amount,status'),
        sb.from('variation_orders').select('total_amount,status')
      ]);
      if(bc.error)throw bc.error;
      const rows=bc.data||[];
      const budget=rows.reduce((s,x)=>s+Number(x.budget_value||0),0);
      const paid=rows.reduce((s,x)=>s+Number(x.paid_amount||0),0);
      const committed=rows.reduce((s,x)=>s+Number(x.purchase_commitments||0),0);
      const remaining=rows.reduce((s,x)=>s+Number(x.budget_remaining||0),0);
      const approvedClaims=(claims.data||[]).reduce((s,x)=>s+Number(x.approved_amount||0),0);
      const variations=(vars.data||[]).filter(x=>['approved','active','completed'].includes(x.status)).reduce((s,x)=>s+Number(x.total_amount||0),0);
      const danger=rows.filter(x=>Number(x.budget_remaining||0)<0).length;
      const alertRows=(alerts.data||[]).slice(0,8);
      const panel=document.createElement('div');
      panel.className='v14-executive';
      panel.innerHTML=`
        <div class="card" style="margin-top:14px">
          <div class="toolbar"><h3>لوحة الإدارة التنفيذية</h3><span class="status-pill success">v1.4 Go-Live</span></div>
          <div class="grid three">
            <div class="quick-row"><span>إجمالي الميزانيات</span><b>${fmt(budget)}</b></div>
            <div class="quick-row"><span>المدفوع الفعلي</span><b>${fmt(paid)}</b></div>
            <div class="quick-row"><span>التزامات أوامر الشراء</span><b>${fmt(committed)}</b></div>
            <div class="quick-row"><span>المتبقي بعد الالتزامات</span><b>${fmt(remaining)}</b></div>
            <div class="quick-row"><span>مطالبات معتمدة</span><b>${fmt(approvedClaims)}</b></div>
            <div class="quick-row"><span>أعمال إضافية معتمدة</span><b>${fmt(variations)}</b></div>
          </div>
          ${danger?`<div class="diagnostic-summary warning" style="margin-top:12px"><b>${danger} مشروع تجاوز الميزانية</b><span>راجع الميزانية والمدفوعات وأوامر الشراء.</span></div>`:''}
        </div>
        <div class="card" style="margin-top:14px">
          <div class="toolbar"><h3>تنبيهات العقود</h3><span class="pill">${alertRows.length} تنبيه</span></div>
          ${alertRows.length?`<div class="quick">${alertRows.map(x=>`<div class="quick-row"><span>${e(x.contract_number)} — ${e(x.title||'عقد')}</span><b>${x.alert_level==='expired'?'منتهي':`${Number(x.days_remaining||0)} يوم`}</b></div>`).join('')}</div>`:'<div class="empty compact">لا توجد عقود منتهية أو قريبة الانتهاء.</div>'}
        </div>`;
      content.appendChild(panel);
    }catch(err){
      console.warn('v1.4 dashboard extensions unavailable:',err.message);
    }
  }

  async function showAuditLog(){
    const {data,error}=await sb.from('erp_audit_log').select('*').order('changed_at',{ascending:false}).limit(500);
    if(error)return typeof toast==='function'?toast('شغّل ملف SQL رقم 10 لتفعيل سجل التدقيق',true):null;
    const rows=(data||[]).map(x=>`<tr><td>${e(new Date(x.changed_at).toLocaleString('ar-SA'))}</td><td>${e(x.table_name)}</td><td>${e(x.action)}</td><td>${e(x.record_id||'—')}</td><td>${e(x.changed_by||'—')}</td></tr>`);
    modal('سجل التدقيق المؤسسي',`${rowsTable(['التاريخ','الجدول','العملية','السجل','المستخدم'],rows)}<div class="modal-actions"><button class="btn" onclick="window.print()">طباعة / PDF</button></div>`);
  }

  async function showBOQSummary(){
    const {data,error}=await sb.from('contract_items').select('*').limit(1000);
    if(error)return toast(error.message,true);
    const items=data||[];
    if(!items.length)return modal('ملخص BOQ','<div class="empty">لا توجد بنود عقود مسجلة بعد.</div>');
    const pick=(x,keys)=>keys.find(k=>x[k]!=null && x[k]!=='');
    const sample=items[0]||{};
    const descKey=pick(sample,['description','item_description','title','item_name','scope']);
    const qtyKey=pick(sample,['quantity','qty']);
    const unitKey=pick(sample,['unit','uom']);
    const rateKey=pick(sample,['unit_rate','rate','unit_price']);
    const totalKey=pick(sample,['total_amount','line_total','amount','value']);
    const total=totalKey?items.reduce((s,x)=>s+Number(x[totalKey]||0),0):0;
    const rows=items.slice(0,500).map(x=>`<tr><td>${e(x.contract_id||'—')}</td><td>${e(descKey?x[descKey]:'—')}</td><td>${e(qtyKey?x[qtyKey]:'—')}</td><td>${e(unitKey?x[unitKey]:'—')}</td><td>${e(rateKey?x[rateKey]:'—')}</td><td>${totalKey?fmt(x[totalKey]):'—'}</td></tr>`);
    modal('ملخص BOQ / بنود العقود',`<div class="quick-row"><span>عدد البنود</span><b>${items.length}</b></div>${totalKey?`<div class="quick-row"><span>إجمالي البنود</span><b>${fmt(total)}</b></div>`:''}${rowsTable(['العقد','البند','الكمية','الوحدة','السعر','الإجمالي'],rows)}`);
  }

  async function appendProjectBudget(projectId){
    try{
      const {data,error}=await sb.from('v_erp_budget_control').select('*').eq('project_id',projectId).maybeSingle();
      if(error||!data)return;
      const root=document.querySelector('#modalRoot .project-detail');
      if(!root||root.querySelector('.v14-budget'))return;
      const div=document.createElement('div');div.className='card inset v14-budget';div.style.marginTop='14px';
      const used=Number(data.paid_amount||0)+Number(data.purchase_commitments||0);
      const pct=Number(data.budget_value||0)>0?Math.min(999,(used/Number(data.budget_value))*100):0;
      div.innerHTML=`<h3>الرقابة على الميزانية</h3><div class="detail-kpis"><div><span>الميزانية</span><b>${fmt(data.budget_value)}</b></div><div><span>المدفوع</span><b>${fmt(data.paid_amount)}</b></div><div><span>التزامات الشراء</span><b>${fmt(data.purchase_commitments)}</b></div><div><span>المتبقي</span><b>${fmt(data.budget_remaining)}</b></div></div><div class="mini-progress"><span style="width:${Math.min(100,pct)}%"></span></div><small>استخدام الميزانية: ${pct.toFixed(1)}%</small>`;
      root.appendChild(div);
    }catch(err){console.warn(err)}
  }

  function controlledRestoreUI(container){
    if(!container || container.querySelector('.v14-restore'))return;
    const card=document.createElement('div');card.className='card full-span v14-restore';
    card.innerHTML=`<div class="toolbar"><h3>الاستعادة المحكومة للنسخة الاحتياطية</h3><span class="pill">مدير النظام فقط</span></div><p class="hint">يتم التحقق من الشركة ومحتوى ملف JSON قبل أي كتابة. الاستعادة تستخدم المعرّف الأصلي لكل سجل.</p><label class="file-button">اختيار نسخة JSON<input id="v14RestoreFile" type="file" accept=".json"></label><div id="v14RestorePreview" class="module-preview"><div class="empty compact">لم يتم اختيار ملف</div></div>`;
    container.appendChild(card);
    const input=card.querySelector('#v14RestoreFile'),preview=card.querySelector('#v14RestorePreview');
    input.onchange=async()=>{
      try{
        if(!profile || profile.role!=='admin')throw new Error('الاستعادة متاحة لمدير النظام فقط');
        const backup=JSON.parse(await input.files[0].text());
        if(!backup.data || !backup.company_id)throw new Error('ملف النسخة الاحتياطية غير صالح');
        if(String(backup.company_id)!==String(cid()))throw new Error('النسخة تخص شركة مختلفة');
        const allowed=['parties','projects','contracts','payment_requests','payment_certificates','payments','deductions','purchase_orders','variation_orders','financial_claims','advances'];
        const summary=allowed.map(t=>[t,Array.isArray(backup.data[t])?backup.data[t].length:0]).filter(x=>x[1]>0);
        preview.innerHTML=`<div class="import-summary"><span class="status-pill success">نسخة صالحة</span><span class="pill">${summary.reduce((s,x)=>s+x[1],0)} سجل</span></div><div class="quick">${summary.map(x=>`<div class="quick-row"><span>${e(x[0])}</span><b>${x[1]}</b></div>`).join('')}</div><button id="v14RestoreCommit" class="btn primary">بدء الاستعادة</button>`;
        preview.querySelector('#v14RestoreCommit').onclick=async()=>{
          const confirmText=prompt('للتأكيد اكتب: استعادة');
          if(confirmText!=='استعادة')return toast('تم إلغاء الاستعادة',true);
          const btn=preview.querySelector('#v14RestoreCommit');btn.disabled=true;btn.textContent='جاري الاستعادة…';
          try{
            for(const [table] of summary){
              const rows=backup.data[table];
              for(let i=0;i<rows.length;i+=200){
                const {error}=await sb.from(table).upsert(rows.slice(i,i+200),{onConflict:'id'});
                if(error)throw new Error(`${table}: ${error.message}`);
              }
            }
            toast('اكتملت الاستعادة بنجاح');preview.insertAdjacentHTML('afterbegin','<div class="diagnostic-summary success"><b>تمت الاستعادة</b><span>أعد فحص النظام قبل متابعة العمل.</span></div>');
          }catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='بدء الاستعادة'}
        };
      }catch(err){preview.innerHTML=`<div class="import-failed"><b>تعذر اعتماد النسخة</b><span>${e(err.message)}</span></div>`}
    };
  }

  // Wrap the current production functions after all previous patches.
  if(typeof window.dashboard==='function'){
    const base=window.dashboard;
    window.dashboard=async function(){await base();await appendExecutiveDashboard()};
  }
  if(typeof window.openProjectDetails==='function'){
    const base=window.openProjectDetails;
    window.openProjectDetails=async function(id){await base(id);await appendProjectBudget(id)};
  }
  if(typeof window.contracts==='function'){
    const base=window.contracts;
    window.contracts=async function(){
      await base();
      const toolbar=document.querySelector('#content .toolbar');if(!toolbar)return;
      let actions=toolbar.querySelector('.actions');if(!actions){actions=document.createElement('div');actions.className='actions';toolbar.appendChild(actions)}
      if(!actions.querySelector('.v14-boq')){const b=document.createElement('button');b.className='btn v14-boq';b.textContent='ملخص BOQ';b.onclick=showBOQSummary;actions.appendChild(b)}
    };
  }
  if(typeof window.system==='function'){
    const base=window.system;
    window.system=async function(){
      await base();
      const content=document.querySelector('#content');if(!content)return;
      const card=document.createElement('div');card.className='card full-span v14-go-live';card.style.marginTop='14px';
      card.innerHTML=`<div class="toolbar"><h3>مركز Go-Live المؤسسي</h3><span class="status-pill success">${RELEASE}</span></div><div class="grid three"><div><b>سجل التدقيق</b><p class="hint">تتبع الإضافة والتعديل والحذف في الجداول التشغيلية.</p><button id="v14Audit" class="btn">فتح سجل التدقيق</button></div><div><b>رقابة الميزانية</b><p class="hint">مقارنة الميزانية بالمدفوع والتزامات أوامر الشراء.</p></div><div><b>تنبيهات العقود</b><p class="hint">تنبيه للعقود المنتهية والقريبة من تاريخ الانتهاء.</p></div></div>`;
      content.appendChild(card);card.querySelector('#v14Audit').onclick=showAuditLog;controlledRestoreUI(content);
    };
  }

  function badge(){
    const top=document.querySelector('.topmeta');if(!top)return;
    const old=top.querySelector('.enterprise-release-badge');if(old)old.textContent='v1.4 Go-Live';
  }
  const obs=new MutationObserver(()=>badge());obs.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',badge);
})();