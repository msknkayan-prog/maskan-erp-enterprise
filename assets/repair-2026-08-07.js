/* Maskan ERP Enterprise — Production relationship patch v1.1 — 2026-08-07
   Loaded after assets/app.js.
   Purpose: remove ambiguous PostgREST embeds and correct approval-history timestamps.
*/

projects = async function(){
  const {data,error}=await sb.from('projects')
    .select('*,parties(name_ar),project_manager:profiles!projects_project_manager_id_fkey(full_name)')
    .order('created_at',{ascending:false});
  if(error)throw error;

  const rows=(data||[]).map(x=>`<tr data-status="${esc(x.status)}">
    <td>${esc(x.project_code)}</td><td><b>${esc(x.project_name_ar)}</b><small class="subline">${esc(x.location||'')}</small></td>
    <td>${esc(x.parties?.name_ar||'—')}</td><td>${esc(x.project_manager?.full_name||'—')}</td>
    <td>${money(x.contract_value)}</td>
    <td><div class="mini-progress"><span style="width:${Math.min(100,Number(x.completion_percentage||0))}%"></span></div><small>${Number(x.completion_percentage||0)}%</small></td>
    <td>${statusPill(x.status)}</td>
    <td><div class="row-actions"><button class="btn small" onclick="openProjectDetails('${x.id}')">عرض</button>${can('admin','general_manager','project_manager')?`<button class="btn small" onclick='editProject(${JSON.stringify(x)})'>تعديل</button>`:''}</div></td>
  </tr>`);

  $('#content').innerHTML=`<div class="card">
    <div class="toolbar"><h3>سجل المشاريع</h3><div class="actions">
      ${can('admin','general_manager','project_manager')?'<button id="addProject" class="btn primary">+ مشروع جديد</button>':''}
      <button id="exportProjects" class="btn">تصدير CSV</button><button class="btn" onclick="window.print()">طباعة</button>
    </div></div>
    <div class="filter-bar"><button class="filter active" data-status="">الكل</button><button class="filter" data-status="active">نشط</button><button class="filter" data-status="planned">مخطط</button><button class="filter" data-status="on_hold">متوقف</button><button class="filter" data-status="completed">مكتمل</button></div>
    ${rowsTable(['الكود','المشروع','العميل','مدير المشروع','قيمة العقد','الإنجاز','الحالة','إجراء'],rows)}
  </div>`;

  document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const v=btn.dataset.status;
    document.querySelectorAll('tbody tr').forEach(tr=>tr.style.display=!v||tr.dataset.status===v?'':'none');
  });

  if($('#addProject'))$('#addProject').onclick=addProject;
  if($('#exportProjects'))$('#exportProjects').onclick=()=>downloadCsv(
    'projects.csv',
    ['الكود','المشروع','العميل','مدير المشروع','قيمة العقد','الإنجاز','الحالة'],
    (data||[]).map(x=>[x.project_code,x.project_name_ar,x.parties?.name_ar||'',x.project_manager?.full_name||'',x.contract_value,x.completion_percentage,label(x.status)])
  );
};

openProjectDetails = async function(projectId){
  const [pResult,execResult,contractsResult,certsResult,paymentsResult]=await Promise.all([
    sb.from('projects')
      .select('*,parties(name_ar),project_manager:profiles!projects_project_manager_id_fkey(full_name)')
      .eq('id',projectId).single(),
    sb.from('v_project_executive_summary').select('*').eq('project_id',projectId).maybeSingle(),
    sb.from('contracts').select('contract_number,title,contract_value,status').eq('project_id',projectId).order('created_at',{ascending:false}),
    sb.from('payment_certificates').select('certificate_number,net_amount,status,certificate_date').eq('project_id',projectId).order('certificate_date',{ascending:false}).limit(8),
    sb.from('payments').select('payment_number,amount,status,payment_date').eq('project_id',projectId).order('payment_date',{ascending:false}).limit(8)
  ]);
  if(pResult.error)return toast(pResult.error.message,true);

  const p=pResult.data;
  const ex=execResult.data||{};
  const contracts=contractsResult.data||[];
  const certs=certsResult.data||[];
  const pays=paymentsResult.data||[];
  const [health,healthClass]=projectHealth({...p,...ex});

  modal(`ملف المشروع — ${esc(p.project_name_ar)}`,`<div class="project-detail">
    <div class="project-hero">
      <div><span class="eyebrow">${esc(p.project_code)}</span><h2>${esc(p.project_name_ar)}</h2>
      <p>${esc(p.location||'الموقع غير محدد')} — ${esc(p.parties?.name_ar||'بدون عميل')}</p></div>
      <span class="status-pill ${healthClass}">${health}</span>
    </div>
    <div class="detail-kpis">
      <div><span>قيمة المشروع</span><b>${money(p.contract_value)}</b></div>
      <div><span>الميزانية</span><b>${money(p.budget_value)}</b></div>
      <div><span>المستخلصات</span><b>${money(ex.certified_net)}</b></div>
      <div><span>المدفوع</span><b>${money(ex.paid_amount)}</b></div>
      <div><span>أوامر الشراء</span><b>${money(ex.purchase_orders_value)}</b></div>
      <div><span>الإنجاز</span><b>${Number(p.completion_percentage||0)}%</b></div>
    </div>
    <div class="grid two">
      <div class="card inset"><h3>العقود المرتبطة</h3>${rowsTable(['الرقم','العنوان','القيمة','الحالة'],contracts.map(x=>`<tr><td>${esc(x.contract_number)}</td><td>${esc(x.title)}</td><td>${money(x.contract_value)}</td><td>${statusPill(x.status)}</td></tr>`))}</div>
      <div class="card inset"><h3>آخر الحركات المالية</h3>
        <div class="timeline">${[...certs.map(x=>({date:x.certificate_date,title:`مستخلص ${x.certificate_number}`,amount:x.net_amount,status:x.status})),...pays.map(x=>({date:x.payment_date,title:`دفعة ${x.payment_number}`,amount:x.amount,status:x.status}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10).map(x=>`<div><time>${d(x.date)}</time><span><b>${esc(x.title)}</b><small>${money(x.amount)}</small></span>${statusPill(x.status)}</div>`).join('')||'<div class="empty compact">لا توجد حركات</div>'}</div>
      </div>
    </div>
    <div class="modal-actions"><button class="btn" onclick="window.print()">طباعة الملف التنفيذي</button></div>
  </div>`);
};

activity = async function(){
  const {data,error}=await sb.from('approval_history')
    .select('*,actor:profiles!approval_history_acted_by_fkey(full_name)')
    .order('acted_at',{ascending:false})
    .limit(300);
  if(error)throw error;

  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>سجل الاعتمادات والإجراءات</h3><button class="btn" onclick="window.print()">طباعة</button></div>
  ${rowsTable(['التاريخ','المستخدم','نوع المعاملة','الإجراء','من حالة','إلى حالة','الملاحظات'],(data||[]).map(x=>`<tr>
    <td>${d(x.acted_at)}</td><td>${esc(x.actor?.full_name||'—')}</td><td>${esc(x.entity_type)}</td>
    <td>${statusPill(x.action)}</td><td>${label(x.from_status)}</td><td>${label(x.to_status)}</td><td>${esc(x.comments||'—')}</td></tr>`))}</div>`;
};

// Visible release marker for production support.
document.documentElement.dataset.erpRelease='v1.1-production';
document.title='مسكن الكيان ERP — Enterprise Final v1.1 Production';
