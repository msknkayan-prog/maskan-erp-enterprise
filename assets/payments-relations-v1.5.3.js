/* Maskan ERP Enterprise v1.5.3 — payments relation display fix
   Resolves project/party/contract names client-side from their ids so the payments
   register does not depend on embedded PostgREST relationship aliases.
*/
(function(){
  'use strict';

  async function paymentsResolved(){
    const [py,pr,pa,ct]=await Promise.all([
      sb.from('payments').select('*').order('payment_date',{ascending:false}).limit(2000),
      sb.from('projects').select('id,project_code,project_name_ar'),
      sb.from('parties').select('id,party_code,name_ar'),
      sb.from('contracts').select('id,contract_number,title')
    ]);
    if(py.error)throw py.error;if(pr.error)throw pr.error;if(pa.error)throw pa.error;if(ct.error)throw ct.error;

    const projects=new Map((pr.data||[]).map(x=>[x.id,x]));
    const parties=new Map((pa.data||[]).map(x=>[x.id,x]));
    const contracts=new Map((ct.data||[]).map(x=>[x.id,x]));
    const rows=py.data||[];

    $('#content').innerHTML=`<div class="card"><div class="toolbar"><h3>سجل الدفعات</h3><div class="actions"><button id="exportPaymentsResolved" class="btn">تصدير Excel</button><button class="btn" onclick="window.print()">طباعة</button></div></div>
      <div class="table-tools"><span class="muted">${rows.length} سجل</span><input id="paymentResolvedSearch" type="search" placeholder="بحث داخل الجدول..."></div>
      <div id="paymentsResolvedTable"></div></div>`;

    const render=(list)=>{
      $('#paymentsResolvedTable').innerHTML=rowsTable(['رقم الدفعة','المشروع','الجهة','العقد','المبلغ','التاريخ','طريقة الدفع','الحالة','إجراء'],list.map(x=>{
        const p=projects.get(x.project_id),a=parties.get(x.party_id),c=contracts.get(x.contract_id);
        const projectText=p?`${esc(p.project_code||'')} — ${esc(p.project_name_ar||'')}`:'غير مربوط';
        const partyText=a?`${esc(a.party_code||'')} — ${esc(a.name_ar||'')}`:'غير مربوط';
        const contractText=c?`${esc(c.contract_number||'')} — ${esc(c.title||'')}`:'غير مربوط';
        return `<tr><td><b>${esc(x.payment_number||'—')}</b></td><td>${projectText}</td><td>${partyText}</td><td>${contractText}</td><td>${money(x.amount)}</td><td>${d(x.payment_date)}</td><td>${label(x.payment_method)}</td><td>${statusPill(x.status)}</td><td>${typeof window.editPayment==='function'?`<button class="btn" onclick="editPayment('${x.id}')">تعديل</button>`:'—'}</td></tr>`;
      }));
    };
    render(rows);

    $('#paymentResolvedSearch').oninput=e=>{
      const q=String(e.target.value||'').trim().toLowerCase();
      if(!q)return render(rows);
      render(rows.filter(x=>{
        const p=projects.get(x.project_id),a=parties.get(x.party_id),c=contracts.get(x.contract_id);
        return [x.payment_number,p?.project_code,p?.project_name_ar,a?.party_code,a?.name_ar,c?.contract_number,c?.title,x.amount,x.status].some(v=>String(v||'').toLowerCase().includes(q));
      }));
    };

    $('#exportPaymentsResolved').onclick=()=>downloadCsv('payments-register.csv',
      ['رقم الدفعة','المشروع','كود المشروع','الجهة','كود الجهة','رقم العقد','المبلغ','التاريخ','طريقة الدفع','الحالة'],
      rows.map(x=>{const p=projects.get(x.project_id),a=parties.get(x.party_id),c=contracts.get(x.contract_id);return [x.payment_number,p?.project_name_ar||'',p?.project_code||'',a?.name_ar||'',a?.party_code||'',c?.contract_number||'',x.amount,x.payment_date,x.payment_method,x.status]}));
  }

  window.payments=paymentsResolved;
  document.documentElement.dataset.paymentsRelations='v1.5.3';
})();
