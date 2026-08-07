/* Maskan ERP Enterprise v1.4.3 Stable
   Fixes startup freeze caused by the v1.4 body-wide MutationObserver loop.
   Keeps Go-Live dashboard, contract alerts, budget controls and audit access
   without observing the entire document tree.
*/
(function(){
  'use strict';
  const RELEASE='Enterprise Final v1.4.3 Stable';
  document.documentElement.dataset.erpRelease='v1.4.3-stable';
  document.title='مسكن الكيان ERP — Enterprise Final v1.4.3 Stable';

  const fmt=n=>typeof money==='function'?money(Number(n||0)):new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2}).format(Number(n||0));
  const e=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));

  function syncStartupUI(){
    const app=document.getElementById('app');
    const login=document.getElementById('loginScreen');
    const status=document.getElementById('startupStatus');
    if(!app||!login)return;
    if(!app.classList.contains('hidden')){
      login.classList.add('hidden');
      if(status)status.textContent='تم الاتصال بنجاح';
    }else{
      login.classList.remove('hidden');
      if(status && window.supabase)status.textContent='جاهز لتسجيل الدخول';
    }
  }

  const app=document.getElementById('app');
  if(app){
    new MutationObserver(syncStartupUI).observe(app,{attributes:true,attributeFilter:['class']});
  }
  window.addEventListener('load',()=>{
    syncStartupUI();
    const top=document.querySelector('.topmeta');
    if(top){
      let badge=top.querySelector('.enterprise-release-badge');
      if(!badge){badge=document.createElement('span');badge.className='pill enterprise-release-badge';top.appendChild(badge)}
      if(badge.textContent!== 'v1.4.3 Stable')badge.textContent='v1.4.3 Stable';
    }
  });

  async function appendExecutiveDashboard(){
    const content=document.querySelector('#content');
    if(!content||content.querySelector('.v143-executive')||!window.sb)return;
    try{
      const [bc,alerts]=await Promise.all([
        sb.from('v_erp_budget_control').select('*'),
        sb.from('v_erp_contract_alerts').select('*').in('alert_level',['expired','expires_30d','expires_60d'])
      ]);
      if(bc.error)throw bc.error;
      const rows=bc.data||[];
      const budget=rows.reduce((s,x)=>s+Number(x.budget_value||0),0);
      const paid=rows.reduce((s,x)=>s+Number(x.paid_amount||0),0);
      const committed=rows.reduce((s,x)=>s+Number(x.purchase_commitments||0),0);
      const remaining=rows.reduce((s,x)=>s+Number(x.budget_remaining||0),0);
      const alertRows=(alerts.data||[]).slice(0,8);
      const panel=document.createElement('div');
      panel.className='v143-executive';
      panel.innerHTML=`<div class="card" style="margin-top:14px"><div class="toolbar"><h3>لوحة الإدارة التنفيذية</h3><span class="status-pill success">v1.4.3 Stable</span></div><div class="grid three"><div class="quick-row"><span>إجمالي الميزانيات</span><b>${fmt(budget)}</b></div><div class="quick-row"><span>المدفوع الفعلي</span><b>${fmt(paid)}</b></div><div class="quick-row"><span>التزامات أوامر الشراء</span><b>${fmt(committed)}</b></div><div class="quick-row"><span>المتبقي بعد الالتزامات</span><b>${fmt(remaining)}</b></div></div></div><div class="card" style="margin-top:14px"><div class="toolbar"><h3>تنبيهات العقود</h3><span class="pill">${alertRows.length} تنبيه</span></div>${alertRows.length?`<div class="quick">${alertRows.map(x=>`<div class="quick-row"><span>${e(x.contract_number)} — ${e(x.title||'عقد')}</span><b>${x.alert_level==='expired'?'منتهي':`${Number(x.days_remaining||0)} يوم`}</b></div>`).join('')}</div>`:'<div class="empty compact">لا توجد عقود منتهية أو قريبة الانتهاء.</div>'}</div>`;
      content.appendChild(panel);
    }catch(err){console.warn('Stable executive panel unavailable:',err.message)}
  }

  async function showAuditLog(){
    const {data,error}=await sb.from('erp_audit_log').select('*').order('changed_at',{ascending:false}).limit(500);
    if(error)return typeof toast==='function'?toast(error.message,true):null;
    const rows=(data||[]).map(x=>`<tr><td>${e(new Date(x.changed_at).toLocaleString('ar-SA'))}</td><td>${e(x.table_name)}</td><td>${e(x.action)}</td><td>${e(x.record_id||'—')}</td><td>${e(x.changed_by||'—')}</td></tr>`);
    modal('سجل التدقيق المؤسسي',`${rowsTable(['التاريخ','الجدول','العملية','السجل','المستخدم'],rows)}<div class="modal-actions"><button class="btn" onclick="window.print()">طباعة / PDF</button></div>`);
  }

  async function appendProjectBudget(projectId){
    try{
      const {data,error}=await sb.from('v_erp_budget_control').select('*').eq('project_id',projectId).maybeSingle();
      if(error||!data)return;
      const root=document.querySelector('#modalRoot .project-detail');
      if(!root||root.querySelector('.v143-budget'))return;
      const div=document.createElement('div');div.className='card inset v143-budget';div.style.marginTop='14px';
      div.innerHTML=`<h3>الرقابة على الميزانية</h3><div class="detail-kpis"><div><span>الميزانية</span><b>${fmt(data.budget_value)}</b></div><div><span>المدفوع</span><b>${fmt(data.paid_amount)}</b></div><div><span>التزامات الشراء</span><b>${fmt(data.purchase_commitments)}</b></div><div><span>المتبقي</span><b>${fmt(data.budget_remaining)}</b></div></div>`;
      root.appendChild(div);
    }catch(err){console.warn(err)}
  }

  if(typeof window.dashboard==='function'){
    const base=window.dashboard;
    window.dashboard=async function(){await base();await appendExecutiveDashboard()};
  }
  if(typeof window.openProjectDetails==='function'){
    const base=window.openProjectDetails;
    window.openProjectDetails=async function(id){await base(id);await appendProjectBudget(id)};
  }
  if(typeof window.system==='function'){
    const base=window.system;
    window.system=async function(){
      await base();
      const content=document.querySelector('#content');if(!content||content.querySelector('.v143-go-live'))return;
      const card=document.createElement('div');card.className='card full-span v143-go-live';card.style.marginTop='14px';
      card.innerHTML=`<div class="toolbar"><h3>مركز Go-Live المؤسسي</h3><span class="status-pill success">${RELEASE}</span></div><div class="grid three"><div><b>سجل التدقيق</b><p class="hint">تتبع الإضافة والتعديل والحذف.</p><button id="v143Audit" class="btn">فتح سجل التدقيق</button></div><div><b>رقابة الميزانية</b><p class="hint">مقارنة الميزانية بالمدفوع والتزامات الشراء.</p></div><div><b>تنبيهات العقود</b><p class="hint">العقود المنتهية والقريبة من الانتهاء.</p></div></div>`;
      content.appendChild(card);card.querySelector('#v143Audit').onclick=showAuditLog;
    };
  }

  syncStartupUI();
})();