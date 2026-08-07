
const $=s=>document.querySelector(s);
const cfg={url:'https://xnymlntdkctjzuypjkbf.supabase.co',key:'sb_publishable_uVTZZ-o04xzI4K5Xb03d-A_0oVKbXaJ'};
let sb=null,session=null,profile=null,currentPage='dashboard';
const APP_VERSION='Enterprise Final v1.0';

function csvCell(v){
  const s=String(v??'').replace(/"/g,'""');
  return `"${s}"`;
}
function downloadCsv(filename,headers,rows){
  const bom='\ufeff';
  const csv=bom+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
function updateConnectionStatus(){
  const el=$('#connectionStatus'), banner=$('#offlineBanner');
  const online=navigator.onLine;
  if(el){
    el.textContent=online?'متصل':'غير متصل';
    el.classList.toggle('offline',!online);
  }
  if(banner)banner.classList.toggle('hidden',online);
  if(online && sb && profile && currentPage)refreshNotificationBadge().catch(()=>{});
}
window.addEventListener('online',updateConnectionStatus);
window.addEventListener('offline',updateConnectionStatus);

const titles={dashboard:'لوحة التحكم',projects:'المشاريع',parties:'الجهات',contracts:'العقود',variations:'الأعمال الإضافية',claims:'المطالبات المالية',advances:'العهد والسلف',requests:'طلبات الصرف',certificates:'المستخلصات',payments:'الدفعات',deductions:'الخصومات والاستقطاعات',purchaseOrders:'المشتريات',inventory:'المخزون والمستودعات',documents:'المرفقات والأرشيف',notifications:'الإشعارات',reports:'التقارير التنفيذية',activity:'سجل الاعتمادات',users:'المستخدمون',launch:'بدء التشغيل وإدخال البيانات',system:'إعدادات النظام'};
const roleAr={admin:'مدير النظام',general_manager:'المدير العام',finance_manager:'المدير المالي',accountant:'محاسب',project_manager:'مدير مشروع',procurement:'المشتريات',viewer:'مشاهدة فقط'};
const statusAr={draft:'مسودة',submitted:'مرفوع',under_review:'قيد المراجعة',approved:'معتمد',rejected:'مرفوض',partially_paid:'مدفوع جزئياً',paid:'مدفوع',cancelled:'ملغي',active:'نشط',planned:'مخطط',on_hold:'متوقف',completed:'مكتمل',client:'عميل',contractor:'مقاول',supplier:'مورد',consultant:'استشاري',subcontract:'مقاولة باطن',supply_contract:'توريد',client_contract:'عقد عميل',service_contract:'خدمات',bank_transfer:'تحويل بنكي',cheque:'شيك',cash:'نقدي',other:'أخرى'};

function money(v){return new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2}).format(Number(v||0))}
function d(v){return v?new Date(v).toLocaleDateString('ar-SA'):'—'}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',2800)}
function label(v){return statusAr[v]||roleAr[v]||v||'—'}
function rowsTable(head,rows){
  if(!rows.length)return '<div class="empty"><div class="empty-icon">⌁</div><b>لا توجد بيانات حتى الآن</b><span>ابدأ بإضافة أول سجل من زر الإضافة أعلى الصفحة.</span></div>';
  return `<div class="table-tools"><input class="table-search" type="search" placeholder="بحث داخل الجدول…"><span class="row-count">${rows.length} سجل</span></div>
  <div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function modal(title,body){const root=$('#modalRoot');root.innerHTML=`<div class="modal"><div class="modal-card"><div class="modal-head"><h3>${title}</h3><button id="closeModal">✕</button></div>${body}</div></div>`;$('#closeModal').onclick=()=>root.innerHTML='';root.querySelector('.modal').onclick=e=>{if(e.target.classList.contains('modal'))root.innerHTML=''};return root}
function can(...roles){return roles.includes(profile?.role)}
function companyId(){return profile.company_id}

document.addEventListener('input',e=>{
  if(!e.target.classList.contains('table-search'))return;
  const term=e.target.value.trim().toLowerCase();
  const wrap=e.target.closest('.card')||document;
  const rows=wrap.querySelectorAll('tbody tr');
  let visible=0;
  rows.forEach(row=>{
    const show=!term||row.textContent.toLowerCase().includes(term);
    row.style.display=show?'':'none';
    if(show)visible++;
  });
  const count=e.target.parentElement.querySelector('.row-count');
  if(count)count.textContent=`${visible} سجل`;
});

function statusClass(v){
  if(['approved','paid','active','completed','posted'].includes(v))return 'success';
  if(['submitted','under_review','partially_paid','planned'].includes(v))return 'warning';
  if(['rejected','cancelled','on_hold','terminated'].includes(v))return 'danger';
  return 'neutral';
}
function statusPill(v){return `<span class="status-pill ${statusClass(v)}">${label(v)}</span>`}

async function globalSearch(){
  const q=$('#globalSearch')?.value.trim();
  if(!q)return toast('اكتب كلمة البحث أولًا',true);
  const pattern=`%${q}%`;
  const [projectsResult,partiesResult,contractsResult]=await Promise.all([
    sb.from('projects').select('id,project_code,project_name_ar,status').or(`project_name_ar.ilike.${pattern},project_code.ilike.${pattern}`).limit(10),
    sb.from('parties').select('id,party_code,name_ar,party_type').or(`name_ar.ilike.${pattern},party_code.ilike.${pattern}`).limit(10),
    sb.from('contracts').select('id,contract_number,title,status').or(`contract_number.ilike.${pattern},title.ilike.${pattern}`).limit(10)
  ]);
  const projects=projectsResult.data||[],parties=partiesResult.data||[],contracts=contractsResult.data||[];
  const all=[
    ...projects.map(x=>({type:'مشروع',code:x.project_code,name:x.project_name_ar,page:'projects',status:x.status})),
    ...parties.map(x=>({type:'جهة',code:x.party_code,name:x.name_ar,page:'parties',status:x.party_type})),
    ...contracts.map(x=>({type:'عقد',code:x.contract_number,name:x.title,page:'contracts',status:x.status}))
  ];
  const r=modal(`نتائج البحث: ${esc(q)}`,all.length?
    `<div class="search-results">${all.map(x=>`<button class="search-result" data-page="${x.page}">
      <span><b>${esc(x.name||'—')}</b><small>${esc(x.type)} — ${esc(x.code||'—')}</small></span>
      ${statusPill(x.status)}
    </button>`).join('')}</div>`:
    '<div class="empty"><b>لا توجد نتائج مطابقة</b></div>');
  r.querySelectorAll('.search-result').forEach(b=>b.onclick=()=>{$('#modalRoot').innerHTML='';loadPage(b.dataset.page)});
}

function openQuickAdd(){
  const actions=[
    ['مشروع جديد','projects','🏗️'],['جهة جديدة','parties','👥'],['عقد جديد','contracts','📑'],
    ['طلب صرف','requests','💳'],['مستخلص','certificates','🧾'],['دفعة','payments','💰'],
    ['أمر شراء','purchaseOrders','🛒'],['حركة مخزون','inventory','📦']
  ];
  const r=modal('إضافة سريعة',`<div class="quick-action-grid">${actions.map(a=>`<button data-page="${a[1]}"><span>${a[2]}</span><b>${a[0]}</b></button>`).join('')}</div>`);
  r.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{
    $('#modalRoot').innerHTML='';
    loadPage(b.dataset.page).then(()=>setTimeout(()=>{
      const addBtn=$('#content .btn.primary');
      if(addBtn)addBtn.click();
    },250));
  });
}


async function refreshNotificationBadge(){
  if(!sb||!profile)return;
  const {count}=await sb.from('notifications').select('*',{count:'exact',head:true}).eq('is_read',false);
  const badge=$('#notificationBadge');
  if(!badge)return;
  badge.textContent=count||0;
  badge.classList.toggle('hidden',!count);
}

function downloadJson(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

function projectHealth(x){
  const cv=Number(x.contract_value||0), budget=Number(x.budget_value||0), paid=Number(x.paid_amount||0);
  if(x.status==='on_hold')return ['متوقف','danger'];
  if(budget>0 && paid>budget)return ['تجاوز مالي','danger'];
  if(Number(x.completion_percentage||0)>=90)return ['قريب من الإنجاز','success'];
  return ['ضمن المتابعة','warning'];
}

async function openProjectDetails(projectId){
  const [pResult,execResult,contractsResult,certsResult,paymentsResult]=await Promise.all([
    sb.from('projects').select('*,parties(name_ar),project_manager:profiles!projects_project_manager_id_fkey(full_name)').eq('id',projectId).single(),
    sb.from('v_project_executive_summary').select('*').eq('project_id',projectId).maybeSingle(),
    sb.from('contracts').select('contract_number,title,contract_value,status').eq('project_id',projectId).order('created_at',{ascending:false}),
    sb.from('payment_certificates').select('certificate_number,net_amount,status,certificate_date').eq('project_id',projectId).order('certificate_date',{ascending:false}).limit(8),
    sb.from('payments').select('payment_number,amount,status,payment_date').eq('project_id',projectId).order('payment_date',{ascending:false}).limit(8)
  ]);
  if(pResult.error)return toast(pResult.error.message,true);
  const p=pResult.data, ex=execResult.data||{}, contracts=contractsResult.data||[], certs=certsResult.data||[], pays=paymentsResult.data||[];
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
}

function canApproveFinance(){return can('admin','general_manager','finance_manager')}
function canApproveProjects(){return can('admin','general_manager','project_manager','finance_manager')}

async function changeStatus(table,id,currentStatus,newStatus,entityType,reloadFn,extra={}){
  const comments = newStatus==='rejected' ? (prompt('سبب الرفض:')||'') : '';
  if(newStatus==='rejected' && !comments) return toast('يجب كتابة سبب الرفض',true);

  const payload={status:newStatus,...extra};
  if(newStatus==='approved'){
    payload.approved_by=profile.id;
    payload.approved_at=new Date().toISOString();
  }
  const {error}=await sb.from(table).update(payload).eq('id',id);
  if(error)return toast(error.message,true);

  try{
    await sb.rpc('record_approval_action',{
      p_entity_type:entityType,
      p_entity_id:id,
      p_action:newStatus==='approved'?'approved':newStatus==='rejected'?'rejected':'reviewed',
      p_from_status:currentStatus,
      p_to_status:newStatus,
      p_comments:comments||null
    });
  }catch(_){}

  toast(newStatus==='approved'?'تم الاعتماد':'تم تحديث الحالة');
  reloadFn();
}


const SESSION_IDLE_MS=60*60*1000;
let idleTimer=null;

function resetIdleTimer(){
  clearTimeout(idleTimer);
  if(!session)return;
  idleTimer=setTimeout(async()=>{
    toast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجددًا',true);
    await sb.auth.signOut();
    setTimeout(()=>location.reload(),900);
  },SESSION_IDLE_MS);
}
['pointerdown','keydown','scroll','touchstart'].forEach(evt=>
  document.addEventListener(evt,resetIdleTimer,{passive:true})
);

function safeCount(result){return result?.count||0}
function checklistItem(done,title,page){
  return `<button class="setup-check ${done?'done':''}" onclick="loadPage('${page}')">
    <span>${done?'✓':'○'}</span><b>${title}</b><small>${done?'مكتمل':'يحتاج إعداد'}</small>
  </button>`;
}

async function runSystemDiagnostics(){
  const tables=['profiles','projects','parties','contracts','payment_requests','payment_certificates','payments','purchase_orders','notifications'];
  const results=[];
  for(const table of tables){
    const start=performance.now();
    const {error,count}=await sb.from(table).select('*',{count:'exact',head:true});
    results.push({
      table,
      ok:!error,
      count:count||0,
      ms:Math.round(performance.now()-start),
      message:error?.message||'جاهز'
    });
  }
  return results;
}

async function boot(){
  if(!cfg.url||!cfg.key){showError('تعذر تحميل إعدادات الاتصال.');return}
  sb=window.supabase.createClient(cfg.url,cfg.key);
  sb.auth.onAuthStateChange((event,newSession)=>{
    session=newSession;
    if(event==='SIGNED_OUT' && !$('#app').classList.contains('hidden'))location.reload();
    if(event==='TOKEN_REFRESHED')resetIdleTimer();
  });
  const {data:{session:s}}=await sb.auth.getSession();session=s;
  if(!session){$('#loginScreen').classList.remove('hidden');return}
  const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error){toast('تعذر قراءة حساب المستخدم: '+error.message,true);return}
  profile=data;resetIdleTimer();if(!profile.is_active){await sb.auth.signOut();toast('هذا الحساب موقوف',true);$('#loginScreen').classList.remove('hidden');return}$('#app').classList.remove('hidden');updateConnectionStatus();$('#identity').textContent=`${profile.full_name||session.user.email} — ${roleAr[profile.role]||profile.role}`;$('#today').textContent=new Date().toLocaleDateString('ar-SA',{dateStyle:'long'});
  await refreshNotificationBadge();
  loadPage(location.hash.slice(1)||localStorage.getItem('maskan_last_page')||'dashboard');
}
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  const button=e.submitter; if(button){button.disabled=true;button.textContent='جاري الدخول...'}
  const {error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if(button){button.disabled=false;button.textContent='تسجيل الدخول'}
  if(error){
    const ar=error.message.includes('Invalid login credentials')?'البريد الإلكتروني أو كلمة المرور غير صحيحة':error.message;
    return toast(ar,true);
  }
  location.reload();
};
$('#logout').onclick=async()=>{
  if(!confirm('هل تريد تسجيل الخروج؟'))return;
  await sb.auth.signOut();location.reload();
};
if($('#togglePassword'))$('#togglePassword').onclick=()=>{
  const input=$('#password');
  input.type=input.type==='password'?'text':'password';
};
if($('#forgotPassword'))$('#forgotPassword').onclick=async()=>{
  const email=$('#email').value.trim();
  if(!email)return toast('اكتب بريدك الإلكتروني أولًا',true);
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
  if(error)return toast(error.message,true);
  toast('تم إرسال رابط استعادة كلمة المرور إلى البريد');
};
$('#menu').onclick=()=>$('#sidebar').classList.toggle('open');
document.querySelectorAll('#nav button,[data-page]').forEach(b=>{
  if(!b.dataset.page)return;
  b.onclick=()=>{
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===b.dataset.page));
    loadPage(b.dataset.page);
    $('#sidebar').classList.remove('open');
  };
});

async function loadPage(page){
  currentPage=page;
  localStorage.setItem('maskan_last_page',page);
  if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`);
  $('#title').textContent=titles[page];
  $('#content').innerHTML='<div class="card skeleton-card"><div class="skeleton line wide"></div><div class="skeleton line"></div><div class="skeleton block"></div></div>';
  try{
    await ({dashboard,projects,parties,contracts,variations,claims,advances,requests,certificates,payments,deductions,purchaseOrders,inventory,documents,notifications,reports,activity,users,launch,system}[page])();
  }catch(e){
    $('#content').innerHTML=`<div class="card error-state"><b>تعذر تحميل الصفحة</b><span>${esc(e.message)}</span><button id="retryPage" class="btn primary">إعادة المحاولة</button></div>`;
    $('#retryPage').onclick=()=>loadPage(page);
  }
}

async function dashboard(){
  const [pr,ct,rq,pc,py,po,vo,cl,ad]=await Promise.all([
    sb.from('projects').select('id',{count:'exact',head:true}),
    sb.from('contracts').select('contract_value'),
    sb.from('payment_requests').select('id',{count:'exact',head:true}).in('status',['submitted','under_review']),
    sb.from('payment_certificates').select('net_amount,status'),
    sb.from('payments').select('amount').eq('status','posted'),
    sb.from('purchase_orders').select('id',{count:'exact',head:true}).in('status',['submitted','under_review']),
    sb.from('variation_orders').select('id',{count:'exact',head:true}).in('status',['submitted','under_review']),
    sb.from('financial_claims').select('id',{count:'exact',head:true}).in('status',['submitted','under_review']),
    sb.from('advances').select('id',{count:'exact',head:true}).in('status',['submitted','under_review'])
  ]);
  const cv=(ct.data||[]).reduce((s,x)=>s+Number(x.contract_value||0),0),cert=(pc.data||[]).filter(x=>['approved','partially_paid','paid'].includes(x.status)).reduce((s,x)=>s+Number(x.net_amount||0),0),paid=(py.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  $('#content').innerHTML=`<div class="page-toolbar"><div><b>نظرة عامة تنفيذية</b><small>آخر تحديث: ${new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</small></div><button class="btn" onclick="loadPage('dashboard')">تحديث</button></div><div class="grid stats">
  <div class="card stat"><span class="muted">عدد المشاريع</span><div class="value">${pr.count||0}</div></div>
  <div class="card stat"><span class="muted">إجمالي العقود</span><div class="value">${money(cv)}</div></div>
  <div class="card stat"><span class="muted">المستخلصات المعتمدة</span><div class="value">${money(cert)}</div></div>
  <div class="card stat"><span class="muted">المدفوع</span><div class="value">${money(paid)}</div></div></div>
  <div class="grid two" style="margin-top:16px"><div class="card"><h3>الملخص المالي</h3><div class="quick">
  <div class="quick-row"><span>المتبقي من المستخلصات</span><b>${money(cert-paid)}</b></div>
  <div class="quick-row"><span>طلبات صرف تحتاج إجراء</span><b>${rq.count||0}</b></div>
  <div class="quick-row"><span>أوامر شراء تحتاج إجراء</span><b>${po.count||0}</b></div>
  <div class="quick-row"><span>أوامر تغيير تحتاج إجراء</span><b>${vo.count||0}</b></div>
  <div class="quick-row"><span>مطالبات تحتاج إجراء</span><b>${cl.count||0}</b></div>
  <div class="quick-row"><span>عهد وسلف تحتاج إجراء</span><b>${ad.count||0}</b></div></div></div>
  <div class="card"><h3>اختصارات</h3><div class="quick"><button class="btn primary" onclick="loadPage('requests')">طلب صرف جديد</button><button class="btn" onclick="loadPage('projects')">إدارة المشاريع</button><button class="btn" onclick="loadPage('reports')">التقارير التنفيذية</button><button class="btn" onclick="window.print()">طباعة</button></div></div></div>
  <div class="card onboarding" style="margin-top:16px"><div class="toolbar"><h3>دورة العمل المعتمدة</h3><span class="pill">${APP_VERSION}</span></div><div class="workflow"><button onclick="loadPage('parties')"><b>1</b><span>إضافة الجهات</span></button><button onclick="loadPage('projects')"><b>2</b><span>إنشاء المشروع</span></button><button onclick="loadPage('contracts')"><b>3</b><span>تسجيل العقد</span></button><button onclick="loadPage('requests')"><b>4</b><span>رفع طلب الصرف</span></button><button onclick="loadPage('certificates')"><b>5</b><span>توليد المستخلص</span></button><button onclick="loadPage('payments')"><b>6</b><span>تسجيل الدفعة</span></button></div></div>`;

  const [partyCount,contractCount,userCount]=await Promise.all([
    sb.from('parties').select('id',{count:'exact',head:true}),
    sb.from('contracts').select('id',{count:'exact',head:true}),
    sb.from('profiles').select('id',{count:'exact',head:true}).eq('is_active',true)
  ]);
  const setupComplete=(pr.count||0)>0 && safeCount(partyCount)>0 && safeCount(contractCount)>0;
  $('#content').insertAdjacentHTML('beforeend',`<div class="grid two production-panels" style="margin-top:16px">
    <div class="card">
      <div class="toolbar"><h3>جاهزية التشغيل</h3><span class="status-pill ${setupComplete?'success':'warning'}">${setupComplete?'جاهز للعمل':'إعداد أولي'}</span></div>
      <div class="setup-checklist">
        ${checklistItem(safeCount(partyCount)>0,'إدخال العملاء والمقاولين والموردين','parties')}
        ${checklistItem((pr.count||0)>0,'إنشاء أول مشروع','projects')}
        ${checklistItem(safeCount(contractCount)>0,'تسجيل العقود وربطها بالمشاريع','contracts')}
        ${checklistItem(safeCount(userCount)>0,'تفعيل المستخدمين والصلاحيات','users')}
      </div>
    </div>
    <div class="card">
      <div class="toolbar"><h3>مؤشرات جودة البيانات</h3><button class="btn" onclick="loadPage('system')">فحص النظام</button></div>
      <div class="quality-grid">
        <div><span>الجهات المسجلة</span><b>${safeCount(partyCount)}</b></div>
        <div><span>المشاريع المسجلة</span><b>${pr.count||0}</b></div>
        <div><span>العقود المسجلة</span><b>${safeCount(contractCount)}</b></div>
        <div><span>المستخدمون النشطون</span><b>${safeCount(userCount)}</b></div>
      </div>
    </div>
  </div>`);

}

async function projects(){
  const {data,error}=await sb.from('projects').select('*,parties(name_ar),project_manager:profiles!projects_project_manager_id_fkey(full_name)').order('created_at',{ascending:false});
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
    document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    const v=btn.dataset.status;document.querySelectorAll('tbody tr').forEach(tr=>tr.style.display=!v||tr.dataset.status===v?'':'none');
  });
  if($('#addProject'))$('#addProject').onclick=addProject;
  if($('#exportProjects'))$('#exportProjects').onclick=()=>downloadCsv('projects.csv',['الكود','المشروع','العميل','مدير المشروع','قيمة العقد','الإنجاز','الحالة'],(data||[]).map(x=>[x.project_code,x.project_name_ar,x.parties?.name_ar||'',x.project_manager?.full_name||'',x.contract_value,x.completion_percentage,label(x.status)]));
}

async function addProject(){
  const [cl,pm]=await Promise.all([sb.from('parties').select('id,name_ar').eq('party_type','client').eq('is_active',true),sb.from('profiles').select('id,full_name').eq('is_active',true)]);
  const r=modal('إضافة مشروع',`<form id="f" class="form-grid"><label>كود المشروع<input name="project_code" required></label><label>اسم المشروع<input name="project_name_ar" required></label><label>العميل<select name="client_id"><option value="">بدون</option>${(cl.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label><label>مدير المشروع<select name="project_manager_id"><option value="">بدون</option>${(pm.data||[]).map(x=>`<option value="${x.id}">${esc(x.full_name||'مستخدم')}</option>`)}</select></label><label>قيمة العقد<input name="contract_value" type="number" step=".01" value="0"></label><label>الميزانية<input name="budget_value" type="number" step=".01" value="0"></label><label>الموقع<input name="location"></label><label>تاريخ البداية<input name="start_date" type="date"></label><label>تاريخ النهاية<input name="planned_end_date" type="date"></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);
  r.querySelector('#f').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));Object.assign(o,{company_id:companyId(),created_by:profile.id});['client_id','project_manager_id','start_date','planned_end_date'].forEach(k=>{if(!o[k])delete o[k]});const {error}=await sb.from('projects').insert(o);if(error)return toast(error.message,true);$('#modalRoot').innerHTML='';toast('تمت إضافة المشروع');projects()};
}

async function editProject(x){
  const [cl,pm]=await Promise.all([
    sb.from('parties').select('id,name_ar').eq('party_type','client').eq('is_active',true),
    sb.from('profiles').select('id,full_name').eq('is_active',true)
  ]);
  const r=modal('تعديل المشروع',`<form id="f" class="form-grid">
    <label>كود المشروع<input name="project_code" value="${esc(x.project_code)}" required></label>
    <label>اسم المشروع<input name="project_name_ar" value="${esc(x.project_name_ar)}" required></label>
    <label>العميل<select name="client_id"><option value="">بدون</option>${(cl.data||[]).map(o=>`<option value="${o.id}" ${o.id===x.client_id?'selected':''}>${esc(o.name_ar)}</option>`)}</select></label>
    <label>مدير المشروع<select name="project_manager_id"><option value="">بدون</option>${(pm.data||[]).map(o=>`<option value="${o.id}" ${o.id===x.project_manager_id?'selected':''}>${esc(o.full_name||'مستخدم')}</option>`)}</select></label>
    <label>قيمة العقد<input name="contract_value" type="number" step=".01" value="${Number(x.contract_value||0)}"></label>
    <label>الميزانية<input name="budget_value" type="number" step=".01" value="${Number(x.budget_value||0)}"></label>
    <label>نسبة الإنجاز<input name="completion_percentage" type="number" min="0" max="100" step=".01" value="${Number(x.completion_percentage||0)}"></label>
    <label>الحالة<select name="status"><option value="planned" ${x.status==='planned'?'selected':''}>مخطط</option><option value="active" ${x.status==='active'?'selected':''}>نشط</option><option value="on_hold" ${x.status==='on_hold'?'selected':''}>متوقف</option><option value="completed" ${x.status==='completed'?'selected':''}>مكتمل</option></select></label>
    <label class="full">الموقع<input name="location" value="${esc(x.location||'')}"></label>
    <div class="full form-actions"><button class="btn primary">حفظ التعديلات</button></div>
  </form>`);
  r.querySelector('#f').onsubmit=async e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
    ['client_id','project_manager_id'].forEach(k=>{if(!o[k])o[k]=null});
    const {error}=await sb.from('projects').update(o).eq('id',x.id);
    if(error)return toast(error.message,true);
    $('#modalRoot').innerHTML='';toast('تم تحديث المشروع');projects();
  };
}

async function parties(){
  const {data,error}=await sb.from('parties').select('*').order('created_at',{ascending:false});if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>العملاء والمقاولون والموردون</h3><div class="actions">
    ${can('admin','general_manager','finance_manager','accountant','procurement')?'<button id="addParty" class="btn primary">+ إضافة جهة</button>':''}
    <button id="exportParties" class="btn">تصدير CSV</button></div></div>
    ${rowsTable(['الكود','الاسم','النوع','الجوال','السجل التجاري','الرقم الضريبي','إجراء'],(data||[]).map(x=>`<tr>
      <td>${esc(x.party_code)}</td><td><b>${esc(x.name_ar)}</b></td><td>${statusPill(x.party_type)}</td>
      <td>${esc(x.phone||'—')}</td><td>${esc(x.commercial_registration||'—')}</td><td>${esc(x.vat_number||'—')}</td>
      <td>${can('admin','general_manager','finance_manager','accountant','procurement')?`<button class="btn small" onclick='editParty(${JSON.stringify(x)})'>تعديل</button>`:'—'}</td>
    </tr>`))}</div>`;
  if($('#exportParties'))$('#exportParties').onclick=()=>downloadCsv('parties.csv',['الكود','الاسم','النوع','الجوال','السجل التجاري','الرقم الضريبي'],(data||[]).map(x=>[x.party_code,x.name_ar,label(x.party_type),x.phone||'',x.commercial_registration||'',x.vat_number||'']));
  if($('#addParty'))$('#addParty').onclick=()=>partyForm();
}
function partyForm(x=null){
  const r=modal(x?'تعديل جهة':'إضافة جهة',`<form id="f" class="form-grid">
    <label>الكود<input name="party_code" value="${esc(x?.party_code||'')}" required></label>
    <label>الاسم<input name="name_ar" value="${esc(x?.name_ar||'')}" required></label>
    <label>النوع<select name="party_type"><option value="client" ${x?.party_type==='client'?'selected':''}>عميل</option><option value="contractor" ${x?.party_type==='contractor'?'selected':''}>مقاول</option><option value="supplier" ${x?.party_type==='supplier'?'selected':''}>مورد</option><option value="consultant" ${x?.party_type==='consultant'?'selected':''}>استشاري</option></select></label>
    <label>الجوال<input name="phone" value="${esc(x?.phone||'')}"></label>
    <label>السجل التجاري<input name="commercial_registration" value="${esc(x?.commercial_registration||'')}"></label>
    <label>الرقم الضريبي<input name="vat_number" value="${esc(x?.vat_number||'')}"></label>
    <label class="full">IBAN<input name="iban" value="${esc(x?.iban||'')}"></label>
    <div class="full"><button class="btn primary">حفظ</button></div></form>`);
  r.querySelector('#f').onsubmit=async e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
    let result;
    if(x)result=await sb.from('parties').update(o).eq('id',x.id);
    else{Object.assign(o,{company_id:companyId(),created_by:profile.id});result=await sb.from('parties').insert(o)}
    if(result.error)return toast(result.error.message,true);
    $('#modalRoot').innerHTML='';toast(x?'تم تحديث الجهة':'تمت إضافة الجهة');parties();
  };
}
function editParty(x){partyForm(x)}

async function contracts(){
  const {data,error}=await sb.from('contracts').select('*,projects(project_name_ar),parties(name_ar)').order('created_at',{ascending:false});if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>العقود</h3><div class="actions">${can('admin','general_manager','project_manager','finance_manager','accountant')?'<button id="addContract" class="btn primary">+ عقد جديد</button>':''}</div></div>${rowsTable(['رقم العقد','المشروع','الطرف','العنوان','القيمة','النوع','الحالة'],(data||[]).map(x=>`<tr><td>${esc(x.contract_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td><td>${esc(x.title)}</td><td>${money(x.contract_value)}</td><td>${label(x.contract_type)}</td><td>${statusPill(x.status)}</td></tr>`))}</div>`;
  if($('#addContract'))$('#addContract').onclick=async()=>{const [pr,pa]=await Promise.all([sb.from('projects').select('id,project_name_ar').eq('status','active'),sb.from('parties').select('id,name_ar').eq('is_active',true)]);const r=modal('إضافة عقد',`<form id="f" class="form-grid"><label>المشروع<select name="project_id">${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label><label>الطرف<select name="party_id">${(pa.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label><label>النوع<select name="contract_type"><option value="subcontract">مقاولة باطن</option><option value="supply_contract">توريد</option><option value="client_contract">عقد عميل</option><option value="service_contract">خدمات</option></select></label><label>العنوان<input name="title" required></label><label>القيمة<input name="contract_value" type="number" step=".01" required></label><label>الاحتجاز %<input name="retention_percentage" type="number" step=".01" value="0"></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);r.querySelector('#f').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));Object.assign(o,{company_id:companyId(),created_by:profile.id});const {error}=await sb.from('contracts').insert(o);if(error)return toast(error.message,true);$('#modalRoot').innerHTML='';contracts()}};
}


async function variations(){
  const {data,error}=await sb.from('variation_orders')
    .select('*,projects(project_name_ar),contracts(contract_number),parties(name_ar)')
    .order('request_date',{ascending:false});
  if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>الأعمال الإضافية وأوامر التغيير</h3>
  <div class="actions">${can('admin','general_manager','project_manager','finance_manager')?'<button id="addVariation" class="btn primary">+ أمر تغيير</button>':''}
  <button class="btn" onclick="window.print()">طباعة</button></div></div>
  ${rowsTable(['الرقم','المشروع','العقد','الطرف','العنوان','القيمة','شامل الضريبة','الحالة','الإجراء'],
    (data||[]).map(x=>`<tr><td>${esc(x.variation_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td>
    <td>${esc(x.contracts?.contract_number||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td>
    <td>${esc(x.title)}</td><td>${money(x.amount)}</td><td>${money(x.total_amount)}</td><td>${statusPill(x.status)}</td>
    <td>${canApproveFinance() && ['submitted','under_review'].includes(x.status)
      ? `<button class="btn primary" onclick="changeStatus('variation_orders','${x.id}','${x.status}','approved','variation_order',variations,{approved_date:new Date().toISOString().slice(0,10)})">اعتماد</button>
         <button class="btn danger" onclick="changeStatus('variation_orders','${x.id}','${x.status}','rejected','variation_order',variations)">رفض</button>`
      : '—'}</td></tr>`))}</div>`;
  if($('#addVariation'))$('#addVariation').onclick=async()=>{
    const [pr,ct,pa]=await Promise.all([
      sb.from('projects').select('id,project_name_ar').eq('status','active'),
      sb.from('contracts').select('id,contract_number').eq('status','active'),
      sb.from('parties').select('id,name_ar').eq('is_active',true)
    ]);
    const r=modal('إضافة أمر تغيير',`<form id="f" class="form-grid">
      <label>المشروع<select name="project_id">${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label>
      <label>العقد<select name="contract_id"><option value="">بدون</option>${(ct.data||[]).map(x=>`<option value="${x.id}">${esc(x.contract_number)}</option>`)}</select></label>
      <label>الطرف<select name="party_id"><option value="">بدون</option>${(pa.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label>
      <label>العنوان<input name="title" required></label>
      <label>القيمة<input name="amount" type="number" step=".01" required></label>
      <label>الضريبة %<input name="vat_percentage" type="number" step=".01" value="15"></label>
      <label class="full">الوصف<textarea name="description"></textarea></label>
      <div class="full"><button class="btn primary">حفظ</button></div></form>`);
    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,requested_by:profile.id,status:'submitted'});
      ['contract_id','party_id'].forEach(k=>{if(!o[k])delete o[k]});
      const {data:newRow,error}=await sb.from('variation_orders').insert(o).select().single();
      if(error)return toast(error.message,true);
      await sb.rpc('record_approval_action',{p_entity_type:'variation_order',p_entity_id:newRow.id,p_action:'submitted',p_from_status:'draft',p_to_status:'submitted',p_comments:null});
      $('#modalRoot').innerHTML='';toast('تم إنشاء أمر التغيير');variations();
    };
  };
}


async function approveClaim(id,currentStatus,claimedAmount){
  const value=prompt('المبلغ المعتمد:',claimedAmount);
  if(value===null)return;
  const amount=Number(value);
  if(Number.isNaN(amount)||amount<0)return toast('المبلغ غير صحيح',true);
  await changeStatus('financial_claims',id,currentStatus,'approved','financial_claim',claims,{
    approved_amount:amount,
    approved_date:new Date().toISOString().slice(0,10)
  });
}

async function claims(){
  const {data,error}=await sb.from('financial_claims')
    .select('*,projects(project_name_ar),contracts(contract_number),parties!financial_claims_client_id_fkey(name_ar)')
    .order('created_at',{ascending:false});
  if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>المطالبات المالية</h3>
  <div class="actions">${can('admin','general_manager','project_manager','finance_manager')?'<button id="addClaim" class="btn primary">+ مطالبة مالية</button>':''}
  <button class="btn" onclick="window.print()">طباعة</button></div></div>
  ${rowsTable(['رقم المطالبة','المشروع','العقد','النوع','العنوان','المطالب به','المعتمد','الحالة','الإجراء'],
    (data||[]).map(x=>`<tr><td>${esc(x.claim_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td>
    <td>${esc(x.contracts?.contract_number||'—')}</td><td>${esc(x.claim_type)}</td><td>${esc(x.title)}</td>
    <td>${money(x.claimed_amount)}</td><td>${money(x.approved_amount)}</td><td>${statusPill(x.status)}</td>
    <td>${canApproveFinance() && ['submitted','under_review'].includes(x.status)
      ? `<button class="btn primary" onclick="approveClaim('${x.id}','${x.status}',${Number(x.claimed_amount||0)})">اعتماد</button>
         <button class="btn danger" onclick="changeStatus('financial_claims','${x.id}','${x.status}','rejected','financial_claim',claims)">رفض</button>`
      : '—'}</td></tr>`))}</div>`;
  if($('#addClaim'))$('#addClaim').onclick=async()=>{
    const [pr,ct,cl]=await Promise.all([
      sb.from('projects').select('id,project_name_ar').eq('status','active'),
      sb.from('contracts').select('id,contract_number').eq('status','active'),
      sb.from('parties').select('id,name_ar').eq('party_type','client').eq('is_active',true)
    ]);
    const r=modal('إضافة مطالبة مالية',`<form id="f" class="form-grid">
      <label>المشروع<select name="project_id">${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label>
      <label>العقد<select name="contract_id"><option value="">بدون</option>${(ct.data||[]).map(x=>`<option value="${x.id}">${esc(x.contract_number)}</option>`)}</select></label>
      <label>العميل<select name="client_id"><option value="">بدون</option>${(cl.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label>
      <label>النوع<select name="claim_type"><option value="progress">مستخلص</option><option value="variation">أمر تغيير</option><option value="delay">تأخير</option><option value="additional_work">أعمال إضافية</option><option value="final">نهائية</option><option value="other">أخرى</option></select></label>
      <label>العنوان<input name="title" required></label><label>المبلغ المطالب به<input name="claimed_amount" type="number" step=".01" required></label>
      <label class="full">الوصف<textarea name="description"></textarea></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);
    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,created_by:profile.id,status:'submitted',submitted_date:new Date().toISOString().slice(0,10)});
      ['contract_id','client_id'].forEach(k=>{if(!o[k])delete o[k]});
      const {data:newRow,error}=await sb.from('financial_claims').insert(o).select().single();
      if(error)return toast(error.message,true);
      await sb.rpc('record_approval_action',{p_entity_type:'financial_claim',p_entity_id:newRow.id,p_action:'submitted',p_from_status:'draft',p_to_status:'submitted',p_comments:null});
      $('#modalRoot').innerHTML='';toast('تم إنشاء المطالبة');claims();
    };
  };
}

async function advances(){
  const {data,error}=await sb.from('advances')
    .select('*,projects(project_name_ar),parties(name_ar),profiles!advances_employee_id_fkey(full_name)')
    .order('issued_date',{ascending:false});
  if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>العهد والسلف</h3>
  <div class="actions">${can('admin','general_manager','finance_manager','accountant')?'<button id="addAdvance" class="btn primary">+ عهدة أو سلفة</button>':''}
  <button class="btn" onclick="window.print()">طباعة</button></div></div>
  ${rowsTable(['الرقم','النوع','المستفيد','المشروع','الغرض','المبلغ','المسترد','المتبقي','الحالة','الإجراء'],
    (data||[]).map(x=>`<tr><td>${esc(x.advance_number)}</td><td>${esc(x.advance_type)}</td>
    <td>${esc(x.parties?.name_ar||x.profiles?.full_name||'—')}</td><td>${esc(x.projects?.project_name_ar||'—')}</td>
    <td>${esc(x.purpose)}</td><td>${money(x.amount)}</td><td>${money(x.recovered_amount)}</td><td>${money(x.outstanding_amount)}</td><td>${statusPill(x.status)}</td>
    <td>${canApproveFinance() && ['submitted','under_review'].includes(x.status)
      ? `<button class="btn primary" onclick="changeStatus('advances','${x.id}','${x.status}','approved','advance',advances)">اعتماد</button>
         <button class="btn danger" onclick="changeStatus('advances','${x.id}','${x.status}','rejected','advance',advances)">رفض</button>`
      : '—'}</td></tr>`))}</div>`;
  if($('#addAdvance'))$('#addAdvance').onclick=async()=>{
    const [pr,pa,us]=await Promise.all([
      sb.from('projects').select('id,project_name_ar').eq('status','active'),
      sb.from('parties').select('id,name_ar').eq('is_active',true),
      sb.from('profiles').select('id,full_name').eq('is_active',true)
    ]);
    const r=modal('إضافة عهدة أو سلفة',`<form id="f" class="form-grid">
      <label>النوع<select name="advance_type"><option value="employee">موظف</option><option value="contractor">مقاول</option><option value="supplier">مورد</option><option value="project">مشروع</option><option value="other">أخرى</option></select></label>
      <label>المشروع<select name="project_id"><option value="">بدون</option>${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label>
      <label>الجهة<select name="party_id"><option value="">بدون</option>${(pa.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label>
      <label>الموظف<select name="employee_id"><option value="">بدون</option>${(us.data||[]).map(x=>`<option value="${x.id}">${esc(x.full_name||'مستخدم')}</option>`)}</select></label>
      <label>المبلغ<input name="amount" type="number" step=".01" required></label>
      <label>تاريخ الاستحقاق<input name="due_date" type="date"></label>
      <label class="full">الغرض<textarea name="purpose" required></textarea></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);
    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,requested_by:profile.id,status:'submitted'});
      ['project_id','party_id','employee_id','due_date'].forEach(k=>{if(!o[k])delete o[k]});
      const {data:newRow,error}=await sb.from('advances').insert(o).select().single();
      if(error)return toast(error.message,true);
      await sb.rpc('record_approval_action',{p_entity_type:'advance',p_entity_id:newRow.id,p_action:'submitted',p_from_status:'draft',p_to_status:'submitted',p_comments:null});
      $('#modalRoot').innerHTML='';toast('تم إنشاء السلفة');advances();
    };
  };
}



async function requests(){
  const {data,error}=await sb.from('payment_requests')
    .select('*,projects(project_name_ar),parties(name_ar),contracts(contract_number)')
    .order('created_at',{ascending:false});
  if(error)throw error;

  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>طلبات الصرف</h3>
  <div class="actions">${can('admin','general_manager','project_manager','finance_manager','accountant')?'<button id="addRequest" class="btn primary">+ طلب صرف</button>':''}
  <button class="btn" onclick="window.print()">طباعة</button></div></div>
  ${rowsTable(['رقم الطلب','المشروع','العقد','المستفيد','الإنجاز','المبلغ المطلوب','الحالة','الإجراء'],
  (data||[]).map(x=>`<tr>
    <td>${esc(x.request_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td>
    <td>${esc(x.contracts?.contract_number||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td>
    <td>${x.progress_percentage}%</td><td>${money(x.requested_amount)}</td><td>${statusPill(x.status)}</td>
    <td>${canApproveFinance() && ['submitted','under_review'].includes(x.status)
      ? `<button class="btn primary" onclick="changeStatus('payment_requests','${x.id}','${x.status}','approved','payment_request',requests)">اعتماد</button>
         <button class="btn danger" onclick="changeStatus('payment_requests','${x.id}','${x.status}','rejected','payment_request',requests)">رفض</button>`
      : '—'}</td></tr>`))}</div>`;

  if($('#addRequest'))$('#addRequest').onclick=async()=>{
    const {data:cs}=await sb.from('contracts').select('id,contract_number,project_id,party_id,projects(project_name_ar),parties(name_ar)').eq('status','active');
    const r=modal('طلب صرف',`<form id="f" class="form-grid">
      <label class="full">العقد<select name="contract_id">${(cs||[]).map(x=>`<option value="${x.id}" data-project="${x.project_id}" data-party="${x.party_id}">${esc(x.contract_number)} — ${esc(x.projects?.project_name_ar)} — ${esc(x.parties?.name_ar)}</option>`)}</select></label>
      <label>نسبة الإنجاز<input name="progress_percentage" type="number" min="0" max="100" step=".01"></label>
      <label>الأعمال الحالية<input name="current_work_value" type="number" step=".01" value="0"></label>
      <label>مواد بالموقع<input name="material_on_site_value" type="number" step=".01" value="0"></label>
      <label>أعمال إضافية<input name="variation_value" type="number" step=".01" value="0"></label>
      <label>المبلغ المراد صرفه<input name="requested_amount" type="number" step=".01" required></label>
      <label class="full">ملاحظات<textarea name="notes"></textarea></label>
      <div class="full"><button class="btn primary">رفع الطلب</button></div></form>`);
    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target)),opt=e.target.contract_id.selectedOptions[0];
      Object.assign(o,{company_id:companyId(),project_id:opt.dataset.project,party_id:opt.dataset.party,requested_by:profile.id,status:'submitted',submitted_at:new Date().toISOString()});
      const {data:newRow,error}=await sb.from('payment_requests').insert(o).select().single();
      if(error)return toast(error.message,true);
      try{await sb.rpc('record_approval_action',{p_entity_type:'payment_request',p_entity_id:newRow.id,p_action:'submitted',p_from_status:'draft',p_to_status:'submitted',p_comments:null})}catch(_){}
      $('#modalRoot').innerHTML='';toast('تم رفع طلب الصرف');requests();
    };
  };
}

async function certificates(){
  const {data,error}=await sb.from('payment_certificates').select('*,projects(project_name_ar),parties(name_ar),contracts(contract_number)').order('created_at',{ascending:false});if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>المستخلصات</h3><div class="actions">${can('admin','general_manager','finance_manager','accountant')?'<button id="addCert" class="btn primary">+ توليد مستخلص</button>':''}<button class="btn" onclick="window.print()">طباعة</button></div></div>${rowsTable(['رقم المستخلص','المشروع','العقد','المستفيد','الإجمالي','الخصومات','الضريبة','الصافي','الحالة'],(data||[]).map(x=>`<tr><td>${esc(x.certificate_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td><td>${esc(x.contracts?.contract_number||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td><td>${money(x.gross_amount)}</td><td>${money(Number(x.retention_amount)+Number(x.advance_recovery)+Number(x.other_deductions))}</td><td>${money(x.vat_amount)}</td><td>${money(x.net_amount)}</td><td>${statusPill(x.status)}</td></tr>`))}</div>`;
  if($('#addCert'))$('#addCert').onclick=async()=>{const {data:reqs}=await sb.from('payment_requests').select('id,request_number,project_id,contract_id,party_id,requested_amount,contracts(vat_percentage,retention_percentage),parties(name_ar)').eq('status','approved');const r=modal('توليد مستخلص',`<form id="f" class="form-grid"><label class="full">طلب الصرف<select name="request_id">${(reqs||[]).map(x=>`<option value="${x.id}">${esc(x.request_number)} — ${esc(x.parties?.name_ar)} — ${money(x.requested_amount)}</option>`)}</select></label><label>الإجمالي<input name="gross_amount" type="number" step=".01"></label><label>الاحتجاز<input name="retention_amount" type="number" step=".01" value="0"></label><label>استرداد دفعة مقدمة<input name="advance_recovery" type="number" step=".01" value="0"></label><label>خصومات أخرى<input name="other_deductions" type="number" step=".01" value="0"></label><label>الضريبة %<input name="vat_percentage" type="number" step=".01" value="15"></label><div class="full"><button class="btn primary">توليد</button></div></form>`);const sel=r.querySelector('[name=request_id]'),gross=r.querySelector('[name=gross_amount]');const fill=()=>{const x=(reqs||[]).find(a=>a.id===sel.value);gross.value=x?.requested_amount||0;r.querySelector('[name=vat_percentage]').value=x?.contracts?.vat_percentage??15;r.querySelector('[name=retention_amount]').value=(Number(gross.value)*Number(x?.contracts?.retention_percentage||0)/100).toFixed(2)};sel.onchange=fill;fill();r.querySelector('#f').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target)),x=(reqs||[]).find(a=>a.id===o.request_id);delete o.request_id;Object.assign(o,{company_id:companyId(),payment_request_id:x.id,project_id:x.project_id,contract_id:x.contract_id,party_id:x.party_id,certified_by:profile.id,status:'approved'});const {error}=await sb.from('payment_certificates').insert(o);if(error)return toast(error.message,true);await sb.from('payment_requests').update({status:'approved',approved_at:new Date().toISOString(),approved_by:profile.id}).eq('id',x.id);$('#modalRoot').innerHTML='';certificates()}};
}

async function payments(){
  const {data,error}=await sb.from('payments').select('*,projects(project_name_ar),parties(name_ar),payment_certificates(certificate_number)').order('payment_date',{ascending:false});if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>الدفعات</h3><div class="actions">${can('admin','general_manager','finance_manager','accountant')?'<button id="addPayment" class="btn primary">+ تسجيل دفعة</button>':''}</div></div>${rowsTable(['رقم الدفعة','المستخلص','المشروع','المستفيد','المبلغ','الطريقة','مرجع البنك','التاريخ'],(data||[]).map(x=>`<tr><td>${esc(x.payment_number)}</td><td>${esc(x.payment_certificates?.certificate_number||'—')}</td><td>${esc(x.projects?.project_name_ar||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td><td>${money(x.amount)}</td><td>${label(x.payment_method)}</td><td>${esc(x.bank_reference||'—')}</td><td>${d(x.payment_date)}</td></tr>`))}</div>`;
  if($('#addPayment'))$('#addPayment').onclick=async()=>{const {data:cs}=await sb.from('payment_certificates').select('id,certificate_number,project_id,contract_id,party_id,net_amount,parties(name_ar)').in('status',['approved','partially_paid']);const r=modal('تسجيل دفعة',`<form id="f" class="form-grid"><label class="full">المستخلص<select name="certificate_id">${(cs||[]).map(x=>`<option value="${x.id}">${esc(x.certificate_number)} — ${esc(x.parties?.name_ar)} — ${money(x.net_amount)}</option>`)}</select></label><label>المبلغ<input name="amount" type="number" step=".01"></label><label>التاريخ<input name="payment_date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>الطريقة<select name="payment_method"><option value="bank_transfer">تحويل بنكي</option><option value="cheque">شيك</option><option value="cash">نقدي</option><option value="other">أخرى</option></select></label><label>مرجع البنك<input name="bank_reference"></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);const sel=r.querySelector('[name=certificate_id]'),amt=r.querySelector('[name=amount]');const fill=()=>amt.value=(cs||[]).find(x=>x.id===sel.value)?.net_amount||0;sel.onchange=fill;fill();r.querySelector('#f').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target)),x=(cs||[]).find(a=>a.id===o.certificate_id);delete o.certificate_id;Object.assign(o,{company_id:companyId(),payment_certificate_id:x.id,project_id:x.project_id,contract_id:x.contract_id,party_id:x.party_id,paid_by:profile.id,status:'posted'});const {error}=await sb.from('payments').insert(o);if(error)return toast(error.message,true);await sb.from('payment_certificates').update({status:Number(o.amount)>=Number(x.net_amount)?'paid':'partially_paid'}).eq('id',x.id);$('#modalRoot').innerHTML='';payments()}};
}



async function deductions(){
  const {data,error}=await sb.from('deductions')
    .select('*,projects(project_name_ar),parties(name_ar),contracts(contract_number)')
    .order('deduction_date',{ascending:false});
  if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>الخصومات والاستقطاعات</h3>
  <div class="actions">${can('admin','general_manager','finance_manager','accountant')?'<button class="btn primary" id="addDeduction">+ إضافة خصم</button>':''}
  <button class="btn" onclick="window.print()">طباعة</button></div></div>
  ${rowsTable(['التاريخ','المشروع','العقد','الجهة','نوع الخصم','الوصف','المبلغ','الحالة'],(data||[]).map(x=>`<tr>
    <td>${d(x.deduction_date)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td>
    <td>${esc(x.contracts?.contract_number||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td>
    <td>${esc(x.deduction_type)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td>
    <td>${statusPill(x.status)}</td></tr>`))}</div>`;

  if($('#addDeduction'))$('#addDeduction').onclick=async()=>{
    const [pr,ct,pa]=await Promise.all([
      sb.from('projects').select('id,project_name_ar').order('project_name_ar'),
      sb.from('contracts').select('id,contract_number,project_id,party_id').eq('status','active'),
      sb.from('parties').select('id,name_ar').order('name_ar')
    ]);
    const r=modal('إضافة خصم أو استقطاع',`<form id="f" class="form-grid">
      <label>المشروع<select name="project_id" required>${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label>
      <label>العقد<select name="contract_id"><option value="">بدون عقد</option>${(ct.data||[]).map(x=>`<option value="${x.id}" data-party="${x.party_id||''}">${esc(x.contract_number)}</option>`)}</select></label>
      <label>الجهة<select name="party_id"><option value="">بدون جهة</option>${(pa.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label>
      <label>نوع الخصم<select name="deduction_type"><option value="penalty">غرامة</option><option value="damage">تلفيات</option><option value="material">مواد</option><option value="advance_recovery">استرداد سلفة</option><option value="other">أخرى</option></select></label>
      <label>المبلغ<input name="amount" type="number" min="0" step="0.01" required></label>
      <label>التاريخ<input name="deduction_date" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
      <label class="full">الوصف<textarea name="description" required></textarea></label>
      <div class="full"><button class="btn primary">حفظ الخصم</button></div>
    </form>`);
    const contractSelect=r.querySelector('[name=contract_id]');
    contractSelect.onchange=()=>{const party=contractSelect.selectedOptions[0]?.dataset.party;if(party)r.querySelector('[name=party_id]').value=party};
    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:companyId(),created_by:profile.id,status:'active'});
      if(!o.contract_id)delete o.contract_id;if(!o.party_id)delete o.party_id;
      const {error}=await sb.from('deductions').insert(o);
      if(error)return toast(error.message,true);
      $('#modalRoot').innerHTML='';toast('تم حفظ الخصم');deductions();
    };
  };
}

async function purchaseOrders(){
  const {data,error}=await sb.from('purchase_orders').select('*,projects(project_name_ar),parties(name_ar)').order('created_at',{ascending:false});if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>أوامر الشراء</h3><div class="actions">${can('admin','general_manager','procurement','finance_manager')?'<button id="addPO" class="btn primary">+ أمر شراء</button>':''}</div></div>${rowsTable(['رقم الأمر','المشروع','المورد','قبل الضريبة','الخصم','الضريبة','الإجمالي','الحالة'],(data||[]).map(x=>`<tr><td>${esc(x.po_number)}</td><td>${esc(x.projects?.project_name_ar||'—')}</td><td>${esc(x.parties?.name_ar||'—')}</td><td>${money(x.subtotal)}</td><td>${money(x.discount_amount)}</td><td>${money(x.vat_amount)}</td><td>${money(x.total_amount)}</td><td>${statusPill(x.status)}</td></tr>`))}</div>`;
  if($('#addPO'))$('#addPO').onclick=async()=>{const [pr,su]=await Promise.all([sb.from('projects').select('id,project_name_ar').eq('status','active'),sb.from('parties').select('id,name_ar').eq('party_type','supplier').eq('is_active',true)]);const r=modal('أمر شراء',`<form id="f" class="form-grid"><label>المشروع<select name="project_id"><option value="">عام</option>${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label><label>المورد<select name="supplier_id">${(su.data||[]).map(x=>`<option value="${x.id}">${esc(x.name_ar)}</option>`)}</select></label><label>الإجمالي قبل الضريبة<input name="subtotal" type="number" step=".01"></label><label>الخصم<input name="discount_amount" type="number" step=".01" value="0"></label><label>الضريبة %<input name="vat_percentage" type="number" step=".01" value="15"></label><label>التسليم المتوقع<input name="expected_delivery_date" type="date"></label><label class="full">ملاحظات<textarea name="notes"></textarea></label><div class="full"><button class="btn primary">حفظ</button></div></form>`);r.querySelector('#f').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));Object.assign(o,{company_id:companyId(),requested_by:profile.id,status:'submitted'});['project_id','expected_delivery_date'].forEach(k=>{if(!o[k])delete o[k]});const {error}=await sb.from('purchase_orders').insert(o);if(error)return toast(error.message,true);$('#modalRoot').innerHTML='';purchaseOrders()}};
}


async function inventory(){
  const [balances,warehouses,items,movements]=await Promise.all([
    sb.from('v_inventory_balances').select('*').order('item_name_ar'),
    sb.from('warehouses').select('*').order('warehouse_name'),
    sb.from('inventory_items').select('*').order('item_name_ar'),
    sb.from('stock_movements')
      .select('*,warehouses(warehouse_name),inventory_items(item_name_ar,item_code),projects(project_name_ar)')
      .order('movement_date',{ascending:false})
      .limit(50)
  ]);

  if(balances.error) throw balances.error;
  if(warehouses.error) throw warehouses.error;
  if(items.error) throw items.error;
  if(movements.error) throw movements.error;

  const lowStock=(balances.data||[]).filter(x=>Number(x.current_balance)<Number(x.minimum_stock));
  const totalValue=(balances.data||[]).reduce((s,x)=>s+Number(x.stock_value||0),0);

  $('#content').innerHTML=`
    <div class="grid stats">
      <div class="card stat"><span class="muted">عدد المستودعات</span><div class="value">${(warehouses.data||[]).length}</div></div>
      <div class="card stat"><span class="muted">عدد الأصناف</span><div class="value">${(items.data||[]).length}</div></div>
      <div class="card stat"><span class="muted">قيمة المخزون</span><div class="value">${money(totalValue)}</div></div>
      <div class="card stat"><span class="muted">أصناف تحت الحد الأدنى</span><div class="value">${lowStock.length}</div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="toolbar"><h3>أرصدة المخزون</h3>
        <div class="actions">
          ${can('admin','general_manager','procurement')?'<button class="btn primary" id="addWarehouse">+ مستودع</button><button class="btn primary" id="addItem">+ صنف</button>':''}
          ${can('admin','general_manager','procurement','project_manager')?'<button class="btn primary" id="addMovement">+ حركة مخزون</button>':''}
          <button class="btn" onclick="window.print()">طباعة</button>
        </div>
      </div>
      ${rowsTable(['كود الصنف','الصنف','المستودع','الوحدة','الرصيد','الحد الأدنى','قيمة المخزون'],
        (balances.data||[]).map(x=>`<tr>
          <td>${esc(x.item_code)}</td><td>${esc(x.item_name_ar)}</td><td>${esc(x.warehouse_name)}</td>
          <td>${esc(x.unit)}</td><td>${Number(x.current_balance).toLocaleString('ar-SA')}</td>
          <td>${Number(x.minimum_stock).toLocaleString('ar-SA')}</td><td>${money(x.stock_value)}</td>
        </tr>`))}
    </div>

    <div class="card" style="margin-top:16px">
      <h3>آخر حركات المخزون</h3>
      ${rowsTable(['رقم الحركة','التاريخ','المستودع','الصنف','النوع','الكمية','التكلفة','المشروع'],
        (movements.data||[]).map(x=>`<tr>
          <td>${esc(x.movement_number)}</td><td>${d(x.movement_date)}</td>
          <td>${esc(x.warehouses?.warehouse_name||'—')}</td>
          <td>${esc(x.inventory_items?.item_name_ar||'—')}</td>
          <td>${esc(x.movement_type)}</td><td>${Number(x.quantity).toLocaleString('ar-SA')}</td>
          <td>${money(Number(x.quantity)*Number(x.unit_cost))}</td>
          <td>${esc(x.projects?.project_name_ar||'—')}</td>
        </tr>`))}
    </div>`;

  if($('#addWarehouse')) $('#addWarehouse').onclick=async()=>{
    const {data:users}=await sb.from('profiles').select('id,full_name').eq('is_active',true);
    const m=modal('إضافة مستودع',`<form id="f" class="form-grid">
      <label>كود المستودع<input name="warehouse_code" required></label>
      <label>اسم المستودع<input name="warehouse_name" required></label>
      <label>الموقع<input name="location"></label>
      <label>أمين المستودع<select name="custodian_id"><option value="">بدون</option>${(users||[]).map(x=>`<option value="${x.id}">${esc(x.full_name||'مستخدم')}</option>`)}</select></label>
      <div class="full"><button class="btn primary">حفظ</button></div></form>`);
    m.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,created_by:profile.id});
      if(!o.custodian_id)delete o.custodian_id;
      const {error}=await sb.from('warehouses').insert(o);
      if(error)return toast(error.message,true);
      $('#modalRoot').innerHTML='';toast('تمت إضافة المستودع');inventory();
    };
  };

  if($('#addItem')) $('#addItem').onclick=()=>{
    const m=modal('إضافة صنف مخزون',`<form id="f" class="form-grid">
      <label>كود الصنف<input name="item_code" required></label>
      <label>اسم الصنف<input name="item_name_ar" required></label>
      <label>التصنيف<input name="category"></label>
      <label>الوحدة<input name="unit" value="حبة" required></label>
      <label>الحد الأدنى<input name="minimum_stock" type="number" step="0.001" value="0"></label>
      <label>آخر سعر شراء<input name="last_purchase_price" type="number" step="0.01" value="0"></label>
      <label class="full">ملاحظات<textarea name="notes"></textarea></label>
      <div class="full"><button class="btn primary">حفظ</button></div></form>`);
    m.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,created_by:profile.id});
      const {error}=await sb.from('inventory_items').insert(o);
      if(error)return toast(error.message,true);
      $('#modalRoot').innerHTML='';toast('تمت إضافة الصنف');inventory();
    };
  };

  if($('#addMovement')) $('#addMovement').onclick=async()=>{
    const [wh,it,pr]=await Promise.all([
      sb.from('warehouses').select('id,warehouse_name').eq('is_active',true),
      sb.from('inventory_items').select('id,item_code,item_name_ar,last_purchase_price').eq('is_active',true),
      sb.from('projects').select('id,project_name_ar').eq('status','active')
    ]);
    const m=modal('إضافة حركة مخزون',`<form id="f" class="form-grid">
      <label>المستودع<select name="warehouse_id" required>${(wh.data||[]).map(x=>`<option value="${x.id}">${esc(x.warehouse_name)}</option>`)}</select></label>
      <label>الصنف<select name="inventory_item_id" required>${(it.data||[]).map(x=>`<option value="${x.id}" data-price="${x.last_purchase_price}">${esc(x.item_code)} — ${esc(x.item_name_ar)}</option>`)}</select></label>
      <label>نوع الحركة<select name="movement_type">
        <option value="receipt">استلام</option><option value="issue">صرف</option><option value="opening">رصيد افتتاحي</option>
        <option value="adjustment_in">تسوية إضافة</option><option value="adjustment_out">تسوية خصم</option>
      </select></label>
      <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" required></label>
      <label>تكلفة الوحدة<input name="unit_cost" type="number" min="0" step="0.01" value="0"></label>
      <label>المشروع<select name="project_id"><option value="">بدون</option>${(pr.data||[]).map(x=>`<option value="${x.id}">${esc(x.project_name_ar)}</option>`)}</select></label>
      <label>التاريخ<input name="movement_date" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
      <label class="full">البيان<textarea name="description"></textarea></label>
      <div class="full"><button class="btn primary">حفظ الحركة</button></div></form>`);
    const itemSelect=m.querySelector('[name=inventory_item_id]');
    const priceInput=m.querySelector('[name=unit_cost]');
    const fillPrice=()=>priceInput.value=itemSelect.selectedOptions[0]?.dataset.price||0;
    itemSelect.onchange=fillPrice;fillPrice();

    m.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
      Object.assign(o,{company_id:profile.company_id,created_by:profile.id});
      if(!o.project_id)delete o.project_id;
      const {error}=await sb.from('stock_movements').insert(o);
      if(error)return toast(error.message,true);
      $('#modalRoot').innerHTML='';toast('تم حفظ حركة المخزون');inventory();
    };
  };
}



async function documents(){
  const {data,error}=await sb.from('document_attachments')
    .select('*')
    .order('created_at',{ascending:false});
  if(error)throw error;

  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>المرفقات والأرشيف</h3>
    <div class="actions"><button id="uploadDocument" class="btn primary">+ رفع مرفق</button></div></div>
    ${rowsTable(['اسم الملف','نوع السجل','الوصف','الحجم','التاريخ','الإجراء'],
      (data||[]).map(x=>`<tr>
        <td>${esc(x.file_name)}</td><td>${esc(x.entity_type)}</td><td>${esc(x.description||'—')}</td>
        <td>${x.file_size ? (Number(x.file_size)/1024/1024).toFixed(2)+' MB' : '—'}</td>
        <td>${d(x.created_at)}</td>
        <td><button class="btn" onclick="openDocument('${esc(x.file_path)}')">فتح</button></td>
      </tr>`))}</div>`;

  $('#uploadDocument').onclick=()=>{
    const r=modal('رفع مرفق',`<form id="f" class="form-grid">
      <label>نوع السجل<select name="entity_type">
        <option value="project">مشروع</option><option value="contract">عقد</option>
        <option value="payment_request">طلب صرف</option><option value="certificate">مستخلص</option>
        <option value="purchase_order">أمر شراء</option><option value="claim">مطالبة</option>
        <option value="other">أخرى</option>
      </select></label>
      <label>معرف السجل UUID<input name="entity_id" placeholder="UUID" required></label>
      <label class="full">الملف<input name="file" type="file" required></label>
      <label class="full">الوصف<textarea name="description"></textarea></label>
      <div class="full"><button class="btn primary">رفع وحفظ</button></div>
    </form>`);

    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();
      const form=e.target;
      const file=form.file.files[0];
      if(!file)return toast('اختر ملفًا',true);

      const entityId=form.entity_id.value.trim();
      const safeName=file.name.replace(/[^\w.\-\u0600-\u06FF]/g,'_');
      const path=`${companyId()}/${form.entity_type.value}/${entityId}/${Date.now()}_${safeName}`;

      const upload=await sb.storage.from('maskan-erp-documents').upload(path,file,{upsert:false});
      if(upload.error)return toast(upload.error.message,true);

      const {error}=await sb.from('document_attachments').insert({
        company_id:companyId(),
        entity_type:form.entity_type.value,
        entity_id:entityId,
        file_name:file.name,
        file_path:path,
        mime_type:file.type||null,
        file_size:file.size,
        description:form.description.value||null,
        uploaded_by:profile.id
      });
      if(error){
        await sb.storage.from('maskan-erp-documents').remove([path]);
        return toast(error.message,true);
      }

      $('#modalRoot').innerHTML='';
      toast('تم رفع المرفق');
      documents();
    };
  };
}

async function openDocument(path){
  const {data,error}=await sb.storage.from('maskan-erp-documents').createSignedUrl(path,120);
  if(error)return toast(error.message,true);
  window.open(data.signedUrl,'_blank','noopener');
}

async function notifications(){
  const {data,error}=await sb.from('notifications')
    .select('*')
    .order('created_at',{ascending:false});
  if(error)throw error;

  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>الإشعارات</h3>
    <div class="actions"><button id="markAllRead" class="btn">تحديد الكل كمقروء</button></div></div>
    ${rowsTable(['العنوان','الرسالة','النوع','الحالة','التاريخ'],
      (data||[]).map(x=>`<tr>
        <td>${esc(x.title)}</td><td>${esc(x.message)}</td><td>${esc(x.notification_type)}</td>
        <td>${x.is_read?'مقروء':'جديد'}</td><td>${d(x.created_at)}</td>
      </tr>`))}</div>`;

  $('#markAllRead').onclick=async()=>{
    const {error}=await sb.from('notifications')
      .update({is_read:true,read_at:new Date().toISOString()})
      .eq('is_read',false);
    if(error)return toast(error.message,true);
    toast('تم تحديث الإشعارات');await refreshNotificationBadge();notifications();
  };
}


async function reports(){
  const [ps,cs,pays,deds,pos,vars,claims,advs,exec]=await Promise.all([sb.from('projects').select('project_name_ar,contract_value,budget_value,completion_percentage,status'),sb.from('v_contract_financial_summary').select('*'),sb.from('payments').select('amount,payment_date'),sb.from('deductions').select('amount,deduction_type'),sb.from('purchase_orders').select('total_amount,status'),sb.from('variation_orders').select('total_amount,status'),sb.from('financial_claims').select('claimed_amount,approved_amount,status'),sb.from('advances').select('amount,outstanding_amount,status'),sb.from('v_project_executive_summary').select('*')]);
  const projectContract=(ps.data||[]).reduce((s,x)=>s+Number(x.contract_value||0),0),budgets=(ps.data||[]).reduce((s,x)=>s+Number(x.budget_value||0),0),paid=(pays.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),ded=(deds.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),po=(pos.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0),vo=(vars.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0),claimApproved=(claims.data||[]).reduce((s,x)=>s+Number(x.approved_amount||0),0),advanceOutstanding=(advs.data||[]).reduce((s,x)=>s+Number(x.outstanding_amount||0),0);
  $('#content').innerHTML=`<div class="card"><div class="print-header"><div class="logo small">م</div><div><b>شركة مسكن الكيان للمقاولات</b><span>التقرير التنفيذي والمالي</span></div><time>${new Date().toLocaleDateString('ar-SA')}</time></div>
    <div class="toolbar"><h3>التقارير الإدارية والمالية</h3><div class="actions"><button id="exportExecutive" class="btn">تصدير CSV</button><button class="btn" onclick="window.print()">طباعة التقرير</button></div></div><div class="report-grid">
  <div class="report-box"><h4>المشاريع</h4><div class="quick"><div class="quick-row"><span>إجمالي قيمة المشاريع</span><b>${money(projectContract)}</b></div><div class="quick-row"><span>إجمالي الميزانيات</span><b>${money(budgets)}</b></div><div class="quick-row"><span>عدد المشاريع</span><b>${(ps.data||[]).length}</b></div></div></div>
  <div class="report-box"><h4>التدفقات النقدية</h4><div class="quick"><div class="quick-row"><span>المدفوع</span><b>${money(paid)}</b></div><div class="quick-row"><span>إجمالي الخصومات والاستقطاعات</span><b>${money(ded)}</b></div><div class="quick-row"><span>أوامر الشراء</span><b>${money(po)}</b></div><div class="quick-row"><span>أوامر التغيير</span><b>${money(vo)}</b></div><div class="quick-row"><span>المطالبات المعتمدة</span><b>${money(claimApproved)}</b></div><div class="quick-row"><span>العهد والسلف القائمة</span><b>${money(advanceOutstanding)}</b></div></div></div></div>
  <div class="card" style="margin-top:14px"><h3>ملخص تنفيذي للمشاريع</h3>
    ${rowsTable(['المشروع','قيمة المشروع','عقود الباطن','المستخلصات','المدفوع','المشتريات','أوامر التغيير','المطالبات'],
      (exec.data||[]).map(x=>`<tr><td>${esc(x.project_name_ar)}</td><td>${money(x.contract_value)}</td>
      <td>${money(x.subcontract_value)}</td><td>${money(x.certified_net)}</td><td>${money(x.paid_amount)}</td>
      <td>${money(x.purchase_orders_value)}</td><td>${money(x.variation_value)}</td><td>${money(x.approved_claims)}</td></tr>`))}
    </div>
    <div class="card" style="margin-top:14px"><h3>ملخص العقود</h3>${rowsTable(['رقم العقد','قيمة العقد','المعتمد إجمالي','المعتمد صافي','المدفوع','المتبقي'],(cs.data||[]).map(x=>`<tr><td>${esc(x.contract_number)}</td><td>${money(x.contract_value)}</td><td>${money(x.certified_gross)}</td><td>${money(x.certified_net)}</td><td>${money(x.paid_amount)}</td><td>${money(x.remaining_contract_value)}</td></tr>`))}</div>`;
  if($('#exportExecutive'))$('#exportExecutive').onclick=()=>downloadCsv('executive-report.csv',
    ['المشروع','قيمة المشروع','عقود الباطن','المستخلصات','المدفوع','المشتريات','أوامر التغيير','المطالبات'],
    (exec.data||[]).map(x=>[x.project_name_ar,x.contract_value,x.subcontract_value,x.certified_net,x.paid_amount,x.purchase_orders_value,x.variation_value,x.approved_claims]));
}

async function activity(){
  const {data,error}=await sb.from('approval_history').select('*,profiles(full_name)').order('created_at',{ascending:false}).limit(300);
  if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>سجل الاعتمادات والإجراءات</h3><button class="btn" onclick="window.print()">طباعة</button></div>
  ${rowsTable(['التاريخ','المستخدم','نوع المعاملة','الإجراء','من حالة','إلى حالة','الملاحظات'],(data||[]).map(x=>`<tr>
    <td>${d(x.created_at)}</td><td>${esc(x.profiles?.full_name||'—')}</td><td>${esc(x.entity_type)}</td>
    <td>${statusPill(x.action)}</td><td>${label(x.from_status)}</td><td>${label(x.to_status)}</td><td>${esc(x.comments||'—')}</td></tr>`))}
  </div>`;
}

async function users(){
  const {data,error}=await sb.from('profiles').select('*').order('created_at');if(error)throw error;
  $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>المستخدمون والصلاحيات</h3><span class="pill">${(data||[]).length} مستخدم</span></div>
  ${rowsTable(['الاسم','البريد','المسمى الوظيفي','الصلاحية','الحالة','إجراء'],(data||[]).map(x=>`<tr>
    <td>${esc(x.full_name||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.job_title||'—')}</td>
    <td>${roleAr[x.role]||x.role}</td><td>${x.is_active?statusPill('active'):statusPill('on_hold')}</td>
    <td>${can('admin')?`<button class="btn small" onclick='editUser(${JSON.stringify(x)})'>إدارة</button>`:'—'}</td></tr>`))}
  <p class="hint">إنشاء حساب المصادقة لأول مرة يتم من Supabase Authentication، ثم يمكن إدارة صلاحياته وحالته من هنا.</p></div>`;
}
function editUser(x){
  const roles=Object.keys(roleAr);
  const r=modal('إدارة المستخدم',`<form id="f" class="form-grid">
    <label>الاسم<input name="full_name" value="${esc(x.full_name||'')}"></label>
    <label>المسمى الوظيفي<input name="job_title" value="${esc(x.job_title||'')}"></label>
    <label>الصلاحية<select name="role">${roles.map(role=>`<option value="${role}" ${x.role===role?'selected':''}>${roleAr[role]}</option>`).join('')}</select></label>
    <label>الحالة<select name="is_active"><option value="true" ${x.is_active?'selected':''}>نشط</option><option value="false" ${!x.is_active?'selected':''}>موقوف</option></select></label>
    <div class="full"><button class="btn primary">حفظ التغييرات</button></div>
  </form>`);
  r.querySelector('#f').onsubmit=async e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.is_active=o.is_active==='true';
    const {error}=await sb.from('profiles').update(o).eq('id',x.id);
    if(error)return toast(error.message,true);
    $('#modalRoot').innerHTML='';toast('تم تحديث المستخدم');users();
  };
}


const IMPORT_SPECS={
  parties:{
    title:'العملاء والمقاولون والموردون',
    table:'parties',
    key:'party_code',
    required:['name_ar'],
    columns:['party_code','name_ar','party_type','phone','commercial_registration','vat_number','iban'],
    example:['CL-0001','اسم العميل','client','05XXXXXXXX','1010XXXXXX','3XXXXXXXXXXXXXX','SA00XXXXXXXXXXXX'],
    map:(r,i)=>({
      company_id:companyId(),
      party_code:r.party_code||`PTY-${String(i+1).padStart(4,'0')}`,
      name_ar:r.name_ar,
      party_type:r.party_type||'supplier',
      phone:r.phone||null,
      commercial_registration:r.commercial_registration||null,
      vat_number:r.vat_number||null,
      iban:r.iban||null,
      created_by:profile.id
    })
  },
  projects:{
    title:'المشاريع',
    table:'projects',
    key:'project_code',
    required:['project_name_ar'],
    columns:['project_code','project_name_ar','client_code','location','contract_value','budget_value','completion_percentage','status'],
    example:['PRJ-0001','اسم المشروع','CL-0001','الرياض','1000000','850000','0','planned'],
    async prepare(rows){
      const codes=[...new Set(rows.map(r=>r.client_code).filter(Boolean))], clients={};
      if(codes.length){
        const {data,error}=await sb.from('parties').select('id,party_code').in('party_code',codes);
        if(error)throw error;(data||[]).forEach(x=>clients[x.party_code]=x.id);
      }
      return {clients};
    },
    map:(r,i,ctx)=>({
      company_id:companyId(),
      project_code:r.project_code||`PRJ-${String(i+1).padStart(4,'0')}`,
      project_name_ar:r.project_name_ar,
      client_id:r.client_code?ctx.clients[r.client_code]||null:null,
      location:r.location||null,
      contract_value:Number(r.contract_value||0),
      budget_value:Number(r.budget_value||0),
      completion_percentage:Number(r.completion_percentage||0),
      status:r.status||'planned',
      created_by:profile.id
    })
  },
  contracts:{
    title:'العقود',
    table:'contracts',
    key:'contract_number',
    required:['contract_number','title','project_code','party_code'],
    columns:['contract_number','title','contract_type','project_code','party_code','contract_value','start_date','end_date','retention_percentage','status'],
    example:['CNT-0001','عقد أعمال العظم','subcontract','PRJ-0001','CT-0001','500000','2026-08-01','2027-02-01','10','active'],
    async prepare(rows){
      const projectCodes=[...new Set(rows.map(r=>r.project_code).filter(Boolean))];
      const partyCodes=[...new Set(rows.map(r=>r.party_code).filter(Boolean))];
      const [pr,pa]=await Promise.all([
        sb.from('projects').select('id,project_code').in('project_code',projectCodes),
        sb.from('parties').select('id,party_code').in('party_code',partyCodes)
      ]);
      if(pr.error)throw pr.error;if(pa.error)throw pa.error;
      const projects={},parties={};
      (pr.data||[]).forEach(x=>projects[x.project_code]=x.id);
      (pa.data||[]).forEach(x=>parties[x.party_code]=x.id);
      return {projects,parties};
    },
    validate:(r,ctx)=>{
      const errors=[];
      if(!ctx.projects[r.project_code])errors.push(`المشروع ${r.project_code} غير موجود`);
      if(!ctx.parties[r.party_code])errors.push(`الجهة ${r.party_code} غير موجودة`);
      return errors;
    },
    map:(r,i,ctx)=>({
      company_id:companyId(),
      contract_number:r.contract_number,
      title:r.title,
      contract_type:r.contract_type||'subcontract',
      project_id:ctx.projects[r.project_code],
      party_id:ctx.parties[r.party_code],
      contract_value:Number(r.contract_value||0),
      start_date:r.start_date||null,
      end_date:r.end_date||null,
      retention_percentage:Number(r.retention_percentage||0),
      status:r.status||'draft',
      created_by:profile.id
    })
  },
  requests:{
    title:'طلبات الصرف',
    table:'payment_requests',
    key:'request_number',
    required:['request_number','project_code','party_code','requested_amount'],
    columns:['request_number','project_code','party_code','contract_number','requested_amount','request_date','description','status'],
    example:['REQ-0001','PRJ-0001','CT-0001','CNT-0001','25000','2026-08-04','دفعة أعمال','draft'],
    async prepare(rows){return await prepareFinancialRefs(rows)},
    validate:validateFinancialRefs,
    map:(r,i,ctx)=>({
      company_id:companyId(),request_number:r.request_number,project_id:ctx.projects[r.project_code],
      party_id:ctx.parties[r.party_code],contract_id:r.contract_number?ctx.contracts[r.contract_number]||null:null,
      requested_amount:Number(r.requested_amount||0),request_date:r.request_date||new Date().toISOString().slice(0,10),
      description:r.description||null,status:r.status||'draft',requested_by:profile.id,created_by:profile.id
    })
  },
  certificates:{
    title:'المستخلصات',
    table:'payment_certificates',
    key:'certificate_number',
    required:['certificate_number','project_code','party_code','net_amount'],
    columns:['certificate_number','project_code','party_code','contract_number','gross_amount','retention_amount','deduction_amount','vat_amount','net_amount','certificate_date','status'],
    example:['CERT-0001','PRJ-0001','CT-0001','CNT-0001','25000','2500','0','3375','25875','2026-08-04','draft'],
    async prepare(rows){return await prepareFinancialRefs(rows)},
    validate:validateFinancialRefs,
    map:(r,i,ctx)=>({
      company_id:companyId(),certificate_number:r.certificate_number,project_id:ctx.projects[r.project_code],
      party_id:ctx.parties[r.party_code],contract_id:r.contract_number?ctx.contracts[r.contract_number]||null:null,
      gross_amount:Number(r.gross_amount||0),retention_amount:Number(r.retention_amount||0),
      deduction_amount:Number(r.deduction_amount||0),vat_amount:Number(r.vat_amount||0),
      net_amount:Number(r.net_amount||0),certificate_date:r.certificate_date||new Date().toISOString().slice(0,10),
      status:r.status||'draft',created_by:profile.id
    })
  },
  payments:{
    title:'الدفعات',
    table:'payments',
    key:'payment_number',
    required:['payment_number','project_code','party_code','amount'],
    columns:['payment_number','project_code','party_code','contract_number','amount','payment_date','payment_method','reference_number','status'],
    example:['PAY-0001','PRJ-0001','CT-0001','CNT-0001','20000','2026-08-04','bank_transfer','TRX-123','posted'],
    async prepare(rows){return await prepareFinancialRefs(rows)},
    validate:validateFinancialRefs,
    map:(r,i,ctx)=>({
      company_id:companyId(),payment_number:r.payment_number,project_id:ctx.projects[r.project_code],
      party_id:ctx.parties[r.party_code],contract_id:r.contract_number?ctx.contracts[r.contract_number]||null:null,
      amount:Number(r.amount||0),payment_date:r.payment_date||new Date().toISOString().slice(0,10),
      payment_method:r.payment_method||'bank_transfer',reference_number:r.reference_number||null,
      status:r.status||'posted',created_by:profile.id
    })
  },
  purchase_orders:{
    title:'أوامر الشراء',
    table:'purchase_orders',
    key:'po_number',
    required:['po_number','project_code','party_code','total_amount'],
    columns:['po_number','project_code','party_code','order_date','expected_delivery_date','total_amount','description','status'],
    example:['PO-0001','PRJ-0001','SP-0001','2026-08-04','2026-08-15','15000','توريد مواد','draft'],
    async prepare(rows){return await prepareFinancialRefs(rows)},
    validate:validateFinancialRefs,
    map:(r,i,ctx)=>({
      company_id:companyId(),po_number:r.po_number,project_id:ctx.projects[r.project_code],
      supplier_id:ctx.parties[r.party_code],order_date:r.order_date||new Date().toISOString().slice(0,10),
      expected_delivery_date:r.expected_delivery_date||null,total_amount:Number(r.total_amount||0),
      description:r.description||null,status:r.status||'draft',created_by:profile.id
    })
  }
};

async function prepareFinancialRefs(rows){
  const projectCodes=[...new Set(rows.map(r=>r.project_code).filter(Boolean))];
  const partyCodes=[...new Set(rows.map(r=>r.party_code).filter(Boolean))];
  const contractNumbers=[...new Set(rows.map(r=>r.contract_number).filter(Boolean))];
  const [pr,pa,ct]=await Promise.all([
    sb.from('projects').select('id,project_code').in('project_code',projectCodes),
    sb.from('parties').select('id,party_code').in('party_code',partyCodes),
    contractNumbers.length?sb.from('contracts').select('id,contract_number').in('contract_number',contractNumbers):Promise.resolve({data:[],error:null})
  ]);
  if(pr.error)throw pr.error;if(pa.error)throw pa.error;if(ct.error)throw ct.error;
  const projects={},parties={},contracts={};
  (pr.data||[]).forEach(x=>projects[x.project_code]=x.id);
  (pa.data||[]).forEach(x=>parties[x.party_code]=x.id);
  (ct.data||[]).forEach(x=>contracts[x.contract_number]=x.id);
  return {projects,parties,contracts};
}
function validateFinancialRefs(r,ctx){
  const errors=[];
  if(!ctx.projects[r.project_code])errors.push(`المشروع ${r.project_code} غير موجود`);
  if(!ctx.parties[r.party_code])errors.push(`الجهة ${r.party_code} غير موجودة`);
  if(r.contract_number&&!ctx.contracts[r.contract_number])errors.push(`العقد ${r.contract_number} غير موجود`);
  return errors;
}

function normalizeHeader(v){
  return String(v??'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,'_');
}
function normalizeRows(rows){
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[normalizeHeader(k),v==null?'':String(v).trim()])));
}
function parseCsv(text){
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&quote&&n==='"'){cell+='"';i++;continue}
    if(c==='"'){quote=!quote;continue}
    if(c===','&&!quote){row.push(cell.trim());cell='';continue}
    if((c==='\n'||c==='\r')&&!quote){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell.trim());cell='';if(row.some(x=>x!==''))rows.push(row);row=[];continue;
    }
    cell+=c;
  }
  if(cell||row.length){row.push(cell.trim());if(row.some(x=>x!==''))rows.push(row)}
  if(rows.length<2)return [];
  const headers=rows[0].map(normalizeHeader);
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
async function readImportFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='csv')return normalizeRows(parseCsv(await file.text()));
  if(!['xlsx','xls'].includes(ext))throw new Error('نوع الملف غير مدعوم. استخدم Excel أو CSV');
  if(!window.XLSX)throw new Error('تعذر تحميل أداة قراءة Excel. تحقق من الاتصال بالإنترنت');
  const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false,dateNF:'yyyy-mm-dd'});
  return normalizeRows(rows);
}
function validateImportRows(spec,rows,ctx){
  const valid=[],errors=[];
  rows.forEach((r,i)=>{
    const rowErrors=[];
    spec.required.forEach(k=>{if(!String(r[k]||'').trim())rowErrors.push(`الحقل ${k} مطلوب`)});
    if(spec.validate)rowErrors.push(...spec.validate(r,ctx));
    if(rowErrors.length)errors.push({row:i+2,data:r,errors:rowErrors});
    else valid.push({row:i+2,data:r});
  });
  return {valid,errors};
}
function previewImport(spec,rows,validation){
  const preview=rows.slice(0,8);
  return `<div class="import-summary">
    <span class="status-pill success">${validation.valid.length} صالح</span>
    <span class="status-pill ${validation.errors.length?'danger':'neutral'}">${validation.errors.length} خطأ</span>
    <span class="pill">${rows.length} إجمالي</span>
  </div>
  ${rowsTable(spec.columns,preview.map(r=>`<tr>${spec.columns.map(c=>`<td>${esc(r[c]||'—')}</td>`).join('')}</tr>`))}
  ${validation.errors.length?`<details class="import-errors"><summary>عرض أخطاء التحقق</summary>
    ${validation.errors.slice(0,50).map(e=>`<div><b>الصف ${e.row}</b><span>${e.errors.map(esc).join(' — ')}</span></div>`).join('')}
  </details>`:''}`;
}
function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function templateCsv(spec){
  return spec.columns.join(',')+'\n'+spec.example.map(csvEscape).join(',');
}
function downloadText(filename,text,type='text/plain;charset=utf-8'){
  const blob=new Blob(['\uFEFF'+text],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function processImportFile(module,file,box,commitButton){
  const spec=IMPORT_SPECS[module];box.innerHTML='<div class="diagnostic-loading">جاري قراءة الملف والتحقق من البيانات…</div>';
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
      const payload=validation.valid.map((x,i)=>spec.map(x.data,i,ctx));
      const {error}=await sb.from(spec.table).upsert(payload,{onConflict:spec.key});
      if(error)throw error;
      box.insertAdjacentHTML('afterbegin',`<div class="import-complete">تم استيراد ${payload.length} سجل بنجاح</div>`);
      toast(`اكتمل استيراد ${spec.title}`);
    }catch(err){toast(err.message,true)}
    finally{commitButton.disabled=false;commitButton.textContent='تأكيد الاستيراد'}
  };
}
async function launch(){
  const [p,pr,c]=await Promise.all([
    sb.from('parties').select('id',{count:'exact',head:true}),
    sb.from('projects').select('id',{count:'exact',head:true}),
    sb.from('contracts').select('id',{count:'exact',head:true})
  ]);
  const cards=Object.entries(IMPORT_SPECS).map(([key,spec])=>`
    <div class="card import-module">
      <div class="toolbar"><div><h3>${spec.title}</h3><small>${spec.columns.length} أعمدة معتمدة</small></div><span class="pill">Excel / CSV</span></div>
      <div class="import-actions">
        <button class="btn template-btn" data-module="${key}">تنزيل نموذج CSV</button>
        <label class="file-button">اختيار ملف Excel أو CSV<input class="module-file" data-module="${key}" type="file" accept=".xlsx,.xls,.csv"></label>
        <button class="btn primary commit-import hidden" data-module="${key}">تأكيد الاستيراد</button>
      </div>
      <div class="module-preview" id="preview-${key}"><div class="empty compact">لم يتم اختيار ملف</div></div>
    </div>`).join('');
  $('#content').innerHTML=`<div class="launch-hero card"><div><span class="eyebrow">${APP_VERSION}</span>
    <h2>مركز استيراد الملفات</h2><p>استيراد Excel وCSV مع معاينة البيانات والتحقق من الأخطاء قبل الحفظ.</p></div>
    <span class="status-pill ${(p.count||0)&&(pr.count||0)?'success':'warning'}">${(p.count||0)&&(pr.count||0)?'قيد التشغيل':'إعداد أولي'}</span></div>
  <div class="grid three launch-stats">
    <div class="card"><span>الجهات</span><b>${p.count||0}</b></div>
    <div class="card"><span>المشاريع</span><b>${pr.count||0}</b></div>
    <div class="card"><span>العقود</span><b>${c.count||0}</b></div>
  </div>
  <div class="import-instructions card"><h3>طريقة الاستخدام</h3>
    <ol><li>نزّل النموذج الخاص بالبيانات.</li><li>املأ الملف دون تغيير أسماء الأعمدة.</li><li>اختر الملف لمعاينته والتحقق منه.</li><li>صحح الأخطاء إن ظهرت، ثم اضغط تأكيد الاستيراد.</li></ol>
  </div>
  <div class="grid two import-grid">${cards}</div>`;
  document.querySelectorAll('.template-btn').forEach(btn=>btn.onclick=()=>{
    const spec=IMPORT_SPECS[btn.dataset.module];
    downloadText(`Maskan_${btn.dataset.module}_Template.csv`,templateCsv(spec),'text/csv;charset=utf-8');
  });
  document.querySelectorAll('.module-file').forEach(input=>input.onchange=async e=>{
    const module=input.dataset.module,box=$(`#preview-${module}`),commit=document.querySelector(`.commit-import[data-module="${module}"]`);
    commit.classList.add('hidden');
    try{await processImportFile(module,e.target.files[0],box,commit)}
    catch(err){box.innerHTML=`<div class="import-failed"><b>تعذر قراءة الملف</b><span>${esc(err.message)}</span></div>`}
  });
}

async function system(){
  $('#content').innerHTML=`<div class="grid two">
    <div class="card"><h3>معلومات النظام</h3><div class="quick">
      <div class="quick-row"><span>الإصدار</span><b>${APP_VERSION}</b></div>
      <div class="quick-row"><span>قاعدة البيانات</span><b>Supabase Cloud</b></div>
      <div class="quick-row"><span>الاستضافة</span><b>Vercel</b></div>
      <div class="quick-row"><span>الاتصال</span><b>${navigator.onLine?'متصل':'غير متصل'}</b></div>
      <div class="quick-row"><span>المستخدم الحالي</span><b>${esc(profile.full_name||profile.email||'—')}</b></div>
    </div></div>
    <div class="card"><h3>النسخ الاحتياطي</h3><p class="hint">تنزيل نسخة JSON من البيانات التشغيلية الأساسية للأرشفة الداخلية.</p>
      <button id="backupData" class="btn primary">تنزيل نسخة احتياطية</button>
    </div>
    <div class="card full-span"><div class="toolbar"><h3>فحص جاهزية قاعدة البيانات</h3><button id="runDiagnostics" class="btn primary">بدء الفحص</button></div>
      <div id="diagnosticResults" class="diagnostic-results"><div class="empty compact">اضغط «بدء الفحص» للتحقق من الجداول والاتصال.</div></div>
    </div>
    <div class="card"><h3>التطبيق على الهاتف</h3><p class="hint">يمكن تثبيت النظام من قائمة المشاركة في Safari ثم اختيار «إضافة إلى الشاشة الرئيسية».</p>
      <button class="btn" onclick="location.reload()">إعادة تحميل النظام</button>
    </div>
    <div class="card"><h3>الأمان</h3><p class="hint">تُغلق الجلسة تلقائيًا بعد ساعة من عدم النشاط، وتتحكم سياسات RLS في صلاحيات الوصول إلى البيانات.</p></div>
  </div>`;

  $('#backupData').onclick=async()=>{
    const tables=['projects','parties','contracts','payment_requests','payment_certificates','payments','deductions','purchase_orders','variation_orders','financial_claims','advances'];
    const backup={generated_at:new Date().toISOString(),version:APP_VERSION,company_id:companyId(),data:{}};
    for(const table of tables){
      const {data,error}=await sb.from(table).select('*');
      backup.data[table]=error?{error:error.message}:data;
    }
    downloadJson(`maskan-erp-backup-${new Date().toISOString().slice(0,10)}.json`,backup);
    toast('تم تجهيز النسخة الاحتياطية');
  };

  $('#runDiagnostics').onclick=async()=>{
    const box=$('#diagnosticResults');
    box.innerHTML='<div class="diagnostic-loading">جاري فحص قاعدة البيانات والاتصال…</div>';
    const results=await runSystemDiagnostics();
    const okCount=results.filter(x=>x.ok).length;
    box.innerHTML=`<div class="diagnostic-summary ${okCount===results.length?'success':'warning'}">
      <b>${okCount}/${results.length} اختبارات ناجحة</b>
      <span>${okCount===results.length?'النظام جاهز للاستخدام الإنتاجي':'توجد نقاط تحتاج مراجعة'}</span>
    </div>
    ${rowsTable(['الجدول','الحالة','عدد السجلات','زمن الاستجابة','النتيجة'],results.map(x=>`<tr>
      <td>${esc(x.table)}</td><td>${x.ok?statusPill('active'):statusPill('rejected')}</td>
      <td>${x.count}</td><td>${x.ms} ms</td><td>${esc(x.message)}</td></tr>`))}`;
  };
}

const savedTheme=localStorage.getItem('maskan_theme')||'light';
document.documentElement.dataset.theme=savedTheme;
if($('#themeToggle'))$('#themeToggle').onclick=()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;
  localStorage.setItem('maskan_theme',next);
};
if($('#refreshPage'))$('#refreshPage').onclick=()=>{
  const btn=$('#refreshPage');btn.classList.add('spin');
  loadPage(currentPage).finally(()=>setTimeout(()=>btn.classList.remove('spin'),350));
};
if($('#globalSearchBtn'))$('#globalSearchBtn').onclick=globalSearch;
if($('#globalSearch'))$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();globalSearch()}});
if($('#quickAdd'))$('#quickAdd').onclick=openQuickAdd;
if($('#mobileMore'))$('#mobileMore').onclick=()=>$('#sidebar').classList.add('open');
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#modalRoot').innerHTML='';$('#sidebar').classList.remove('open')}});

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredInstallPrompt=e;
  $('#installApp')?.classList.remove('hidden');
});
if($('#installApp'))$('#installApp').onclick=async()=>{
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;
  $('#installApp').classList.add('hidden');
};

boot();

window.addEventListener('unhandledrejection',event=>{
  console.error('Unhandled promise rejection:',event.reason);
  if($('#app') && !$('#app').classList.contains('hidden'))toast('تعذر إكمال العملية. تحقق من الاتصال ثم حاول مجددًا.',true);
});
window.addEventListener('error',event=>{
  console.error('Application error:',event.error||event.message);
});
