/* Maskan ERP Enterprise v1.5.1 — payment editing
   Adds an explicit Edit action to the payments register with role-gated updates.
*/
(function(){
  'use strict';

  const editableRoles=['admin','general_manager','finance_manager','accountant'];
  const canEditPayments=()=>editableRoles.includes(profile?.role);

  function paymentMethodLabel(v){
    return ({bank_transfer:'تحويل بنكي',cheque:'شيك',cash:'نقدي',other:'أخرى'})[v]||v||'—';
  }

  async function editPaymentRecord(id){
    if(!canEditPayments()) return toast('ليس لديك صلاحية تعديل الدفعات',true);
    const {data:x,error}=await sb.from('payments')
      .select('id,payment_number,amount,payment_date,payment_method,status,project_id,party_id,contract_id')
      .eq('id',id).single();
    if(error) return toast(error.message,true);

    const r=modal('تعديل الدفعة',`<form id="editPaymentForm" class="form-grid">
      <label>رقم الدفعة<input value="${esc(x.payment_number||'')}" disabled></label>
      <label>المبلغ<input name="amount" type="number" min="0" step="0.01" value="${Number(x.amount||0)}" required></label>
      <label>تاريخ الدفعة<input name="payment_date" type="date" value="${esc(x.payment_date||'')}" required></label>
      <label>طريقة الدفع<select name="payment_method">
        <option value="bank_transfer" ${x.payment_method==='bank_transfer'?'selected':''}>تحويل بنكي</option>
        <option value="cheque" ${x.payment_method==='cheque'?'selected':''}>شيك</option>
        <option value="cash" ${x.payment_method==='cash'?'selected':''}>نقدي</option>
        <option value="other" ${x.payment_method==='other'?'selected':''}>أخرى</option>
      </select></label>
      <label>الحالة<select name="status">
        <option value="draft" ${x.status==='draft'?'selected':''}>مسودة</option>
        <option value="submitted" ${x.status==='submitted'?'selected':''}>مرفوع</option>
        <option value="approved" ${x.status==='approved'?'selected':''}>معتمد</option>
        <option value="posted" ${x.status==='posted'?'selected':''}>مرحل</option>
        <option value="cancelled" ${x.status==='cancelled'?'selected':''}>ملغي</option>
      </select></label>
      ${x.status==='posted'?'<div class="full hint" style="padding:10px;border:1px solid #e8c46a;border-radius:10px">تنبيه: هذه الدفعة مرحلة. أي تعديل سيؤثر على التقارير المالية.</div>':''}
      <div class="full form-actions"><button class="btn primary" type="submit">حفظ التعديلات</button><button class="btn" type="button" id="cancelPaymentEdit">إلغاء</button></div>
    </form>`);

    r.querySelector('#cancelPaymentEdit').onclick=()=>document.querySelector('#modalRoot').innerHTML='';
    r.querySelector('#editPaymentForm').onsubmit=async e=>{
      e.preventDefault();
      const o=Object.fromEntries(new FormData(e.target));
      o.amount=Number(o.amount||0);
      if(!Number.isFinite(o.amount)||o.amount<0) return toast('قيمة الدفعة غير صحيحة',true);
      const {error:updateError}=await sb.from('payments').update(o).eq('id',id);
      if(updateError) return toast(updateError.message,true);
      document.querySelector('#modalRoot').innerHTML='';
      toast('تم تعديل الدفعة بنجاح');
      payments();
    };
  }

  window.editPaymentRecord=editPaymentRecord;

  // Replace the payments register with a schema-safe view that includes Edit.
  payments=async function(){
    const {data,error}=await sb.from('payments')
      .select('id,payment_number,project_id,party_id,contract_id,amount,payment_date,payment_method,status')
      .order('payment_date',{ascending:false});
    if(error) throw error;
    const items=data||[];

    const projectIds=[...new Set(items.map(x=>x.project_id).filter(Boolean))];
    const partyIds=[...new Set(items.map(x=>x.party_id).filter(Boolean))];
    const contractIds=[...new Set(items.map(x=>x.contract_id).filter(Boolean))];
    const [pr,pa,ct]=await Promise.all([
      projectIds.length?sb.from('projects').select('id,project_code,project_name_ar').in('id',projectIds):Promise.resolve({data:[]}),
      partyIds.length?sb.from('parties').select('id,party_code,name_ar').in('id',partyIds):Promise.resolve({data:[]}),
      contractIds.length?sb.from('contracts').select('id,contract_number,title').in('id',contractIds):Promise.resolve({data:[]})
    ]);
    const projects=Object.fromEntries((pr.data||[]).map(x=>[x.id,x]));
    const parties=Object.fromEntries((pa.data||[]).map(x=>[x.id,x]));
    const contracts=Object.fromEntries((ct.data||[]).map(x=>[x.id,x]));

    const rows=items.map(x=>{
      const p=projects[x.project_id], party=parties[x.party_id], c=contracts[x.contract_id];
      return `<tr>
        <td><b>${esc(x.payment_number||'—')}</b></td>
        <td>${esc(p?.project_code||'—')}<small class="subline">${esc(p?.project_name_ar||'')}</small></td>
        <td>${esc(party?.party_code||'—')}<small class="subline">${esc(party?.name_ar||'')}</small></td>
        <td>${esc(c?.contract_number||'—')}</td>
        <td>${money(x.amount)}</td>
        <td>${d(x.payment_date)}</td>
        <td>${esc(paymentMethodLabel(x.payment_method))}</td>
        <td>${statusPill(x.status)}</td>
        <td>${canEditPayments()?`<button class="btn small" onclick="editPaymentRecord('${x.id}')">تعديل</button>`:'—'}</td>
      </tr>`;
    });

    document.querySelector('#content').innerHTML=`<div class="card">
      <div class="toolbar"><h3>سجل الدفعات</h3><div class="actions"><button class="btn" onclick="window.print()">طباعة</button></div></div>
      ${rowsTable(['رقم الدفعة','المشروع','الجهة','العقد','المبلغ','التاريخ','طريقة الدفع','الحالة','إجراء'],rows)}
    </div>`;
  };

  document.documentElement.dataset.paymentEdit='v1.5.1';
})();
