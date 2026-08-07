/* Maskan ERP Enterprise v1.5.4 — complete project edit form */
(function(){
  'use strict';

  window.editProject = async function(x){
    const [cl,pm]=await Promise.all([
      sb.from('parties').select('id,party_code,name_ar').eq('party_type','client').eq('is_active',true).order('name_ar'),
      sb.from('profiles').select('id,full_name,role').eq('is_active',true).order('full_name')
    ]);
    if(cl.error)return toast(cl.error.message,true);
    if(pm.error)return toast(pm.error.message,true);

    const managers=(pm.data||[]).filter(u=>['project_manager','admin','general_manager'].includes(u.role));
    const r=modal('تعديل المشروع وربط العميل ومدير المشروع',`<form id="f" class="form-grid">
      <label>كود المشروع<input name="project_code" value="${esc(x.project_code||'')}" required></label>
      <label>اسم المشروع<input name="project_name_ar" value="${esc(x.project_name_ar||'')}" required></label>
      <label>العميل<select name="client_id"><option value="">بدون عميل</option>${(cl.data||[]).map(o=>`<option value="${o.id}" ${o.id===x.client_id?'selected':''}>${esc(o.party_code||'')} — ${esc(o.name_ar||'')}</option>`)}</select></label>
      <label>مدير المشروع<select name="project_manager_id"><option value="">بدون مدير مشروع</option>${managers.map(o=>`<option value="${o.id}" ${o.id===x.project_manager_id?'selected':''}>${esc(o.full_name||'مستخدم')} — ${esc(roleAr[o.role]||o.role||'')}</option>`)}</select></label>
      <label>قيمة العقد<input name="contract_value" type="number" step=".01" min="0" value="${Number(x.contract_value||0)}"></label>
      <label>الميزانية<input name="budget_value" type="number" step=".01" min="0" value="${Number(x.budget_value||0)}"></label>
      <label>نسبة الإنجاز %<input name="completion_percentage" type="number" min="0" max="100" step=".01" value="${Number(x.completion_percentage||0)}"></label>
      <label>الحالة<select name="status"><option value="planned" ${x.status==='planned'?'selected':''}>مخطط</option><option value="active" ${x.status==='active'?'selected':''}>نشط</option><option value="on_hold" ${x.status==='on_hold'?'selected':''}>متوقف</option><option value="completed" ${x.status==='completed'?'selected':''}>مكتمل</option></select></label>
      <label>تاريخ البداية<input name="start_date" type="date" value="${esc(x.start_date||'')}"></label>
      <label>تاريخ النهاية المخطط<input name="planned_end_date" type="date" value="${esc(x.planned_end_date||'')}"></label>
      <label class="full">الموقع<input name="location" value="${esc(x.location||'')}"></label>
      <div class="full form-actions"><button class="btn primary">حفظ التعديلات</button></div>
    </form>`);

    r.querySelector('#f').onsubmit=async e=>{
      e.preventDefault();
      const o=Object.fromEntries(new FormData(e.target));
      ['client_id','project_manager_id','start_date','planned_end_date'].forEach(k=>{if(!o[k])o[k]=null});
      ['contract_value','budget_value','completion_percentage'].forEach(k=>{o[k]=Number(o[k]||0)});
      const {error}=await sb.from('projects').update(o).eq('id',x.id);
      if(error)return toast(error.message,true);
      $('#modalRoot').innerHTML='';
      toast('تم تحديث المشروع وربط العميل ومدير المشروع');
      projects();
    };
  };

  document.documentElement.dataset.projectEdit='v1.5.4';
})();
