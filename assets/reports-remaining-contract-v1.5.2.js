/* Maskan ERP Enterprise v1.5.2 — Executive reports: remaining contract amount */
(function(){
  'use strict';

  window.reports = async function reports(){
    const [ps,cs,pays,deds,pos,vars,claims,advs,exec]=await Promise.all([
      sb.from('projects').select('project_name_ar,contract_value,budget_value,completion_percentage,status'),
      sb.from('v_contract_financial_summary').select('*'),
      sb.from('payments').select('amount,payment_date'),
      sb.from('deductions').select('amount,deduction_type'),
      sb.from('purchase_orders').select('total_amount,status'),
      sb.from('variation_orders').select('total_amount,status'),
      sb.from('financial_claims').select('claimed_amount,approved_amount,status'),
      sb.from('advances').select('amount,outstanding_amount,status'),
      sb.from('v_project_executive_summary').select('*')
    ]);

    const projectContract=(ps.data||[]).reduce((s,x)=>s+Number(x.contract_value||0),0);
    const budgets=(ps.data||[]).reduce((s,x)=>s+Number(x.budget_value||0),0);
    const paid=(pays.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const ded=(deds.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const po=(pos.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0);
    const vo=(vars.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0);
    const claimApproved=(claims.data||[]).reduce((s,x)=>s+Number(x.approved_amount||0),0);
    const advanceOutstanding=(advs.data||[]).reduce((s,x)=>s+Number(x.outstanding_amount||0),0);
    const contractRows=(cs.data||[]).map(x=>{
      const contractValue=Number(x.contract_value||0);
      const paidAmount=Number(x.paid_amount||0);
      const remainingRaw=x.remaining_contract_value;
      const remaining=(remainingRaw===null||remainingRaw===undefined||remainingRaw==='')?contractValue-paidAmount:Number(remainingRaw||0);
      const paymentPct=contractValue>0?(paidAmount/contractValue)*100:0;
      return {...x,_remaining:remaining,_paymentPct:paymentPct};
    });
    const totalContractValue=contractRows.reduce((s,x)=>s+Number(x.contract_value||0),0);
    const totalContractPaid=contractRows.reduce((s,x)=>s+Number(x.paid_amount||0),0);
    const totalRemaining=contractRows.reduce((s,x)=>s+Number(x._remaining||0),0);

    $('#content').innerHTML=`<div class="card"><div class="print-header"><div class="logo small">م</div><div><b>شركة مسكن الكيان للمقاولات</b><span>التقرير التنفيذي والمالي</span></div><time>${new Date().toLocaleDateString('ar-SA')}</time></div>
      <div class="toolbar"><h3>التقارير الإدارية والمالية</h3><div class="actions"><button id="exportExecutive" class="btn">تصدير المشاريع CSV</button><button id="exportContractsReport" class="btn">تصدير العقود CSV</button><button class="btn" onclick="window.print()">طباعة التقرير</button></div></div>
      <div class="grid stats" style="margin-bottom:14px">
        <div class="card stat"><span class="muted">إجمالي قيمة العقود</span><div class="value">${money(totalContractValue)}</div></div>
        <div class="card stat"><span class="muted">إجمالي المدفوع من العقود</span><div class="value">${money(totalContractPaid)}</div></div>
        <div class="card stat"><span class="muted">المبلغ المتبقي من العقود</span><div class="value">${money(totalRemaining)}</div></div>
      </div>
      <div class="report-grid">
        <div class="report-box"><h4>المشاريع</h4><div class="quick"><div class="quick-row"><span>إجمالي قيمة المشاريع</span><b>${money(projectContract)}</b></div><div class="quick-row"><span>إجمالي الميزانيات</span><b>${money(budgets)}</b></div><div class="quick-row"><span>عدد المشاريع</span><b>${(ps.data||[]).length}</b></div></div></div>
        <div class="report-box"><h4>التدفقات النقدية</h4><div class="quick"><div class="quick-row"><span>المدفوع</span><b>${money(paid)}</b></div><div class="quick-row"><span>إجمالي الخصومات والاستقطاعات</span><b>${money(ded)}</b></div><div class="quick-row"><span>أوامر الشراء</span><b>${money(po)}</b></div><div class="quick-row"><span>أوامر التغيير</span><b>${money(vo)}</b></div><div class="quick-row"><span>المطالبات المعتمدة</span><b>${money(claimApproved)}</b></div><div class="quick-row"><span>العهد والسلف القائمة</span><b>${money(advanceOutstanding)}</b></div></div></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>ملخص تنفيذي للمشاريع</h3>
        ${rowsTable(['المشروع','قيمة المشروع','عقود الباطن','المستخلصات','المدفوع','المشتريات','أوامر التغيير','المطالبات'],
          (exec.data||[]).map(x=>`<tr><td>${esc(x.project_name_ar)}</td><td>${money(x.contract_value)}</td><td>${money(x.subcontract_value)}</td><td>${money(x.certified_net)}</td><td>${money(x.paid_amount)}</td><td>${money(x.purchase_orders_value)}</td><td>${money(x.variation_value)}</td><td>${money(x.approved_claims)}</td></tr>`))}
      </div>
      <div class="card" style="margin-top:14px"><div class="toolbar"><h3>ملخص العقود</h3><span class="pill">المتبقي: ${money(totalRemaining)}</span></div>
        ${rowsTable(['رقم العقد','قيمة العقد','المعتمد إجمالي','المعتمد صافي','المدفوع','المبلغ المتبقي من العقد','نسبة الصرف'],contractRows.map(x=>`<tr><td>${esc(x.contract_number)}</td><td>${money(x.contract_value)}</td><td>${money(x.certified_gross)}</td><td>${money(x.certified_net)}</td><td>${money(x.paid_amount)}</td><td><b>${money(x._remaining)}</b></td><td>${x._paymentPct.toFixed(1)}%</td></tr>`))}
      </div>`;

    if($('#exportExecutive'))$('#exportExecutive').onclick=()=>downloadCsv('executive-report.csv',
      ['المشروع','قيمة المشروع','عقود الباطن','المستخلصات','المدفوع','المشتريات','أوامر التغيير','المطالبات'],
      (exec.data||[]).map(x=>[x.project_name_ar,x.contract_value,x.subcontract_value,x.certified_net,x.paid_amount,x.purchase_orders_value,x.variation_value,x.approved_claims]));

    if($('#exportContractsReport'))$('#exportContractsReport').onclick=()=>downloadCsv('contracts-financial-report.csv',
      ['رقم العقد','قيمة العقد','المعتمد إجمالي','المعتمد صافي','المدفوع','المبلغ المتبقي من العقد','نسبة الصرف'],
      contractRows.map(x=>[x.contract_number,x.contract_value,x.certified_gross,x.certified_net,x.paid_amount,x._remaining,x._paymentPct.toFixed(2)+'%']));
  };

  document.documentElement.dataset.reportsRemainingContract='v1.5.2';
})();
