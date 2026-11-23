// One status vocabulary shared by the leave and advance approval grids.
// Drafts are not an extra approver; the project manager prepares the request.
export const requestApprovalStages=[
 {id:'project_manager',title:'اعتماد المدير المباشر',name:'المدير المباشر'},
 {id:'projects_director',title:'اعتماد إدارة المشاريع',name:'مجدي محجوب — المدير العام'},
 {id:'hr',title:'اعتماد شؤون الموظفين',name:'م. محمد يوسف'}
];

export const advanceFinanceStage={id:'advance_finance',title:'اعتماد المالية للصرف',name:'مصعب عبد القيوم / مدير النظام'};
export const advanceDisbursementStage={id:'advance_disbursement',title:'توثيق صرف السلفة',name:'الإدارة المالية / مدير النظام'};

export function requestStageView(row,stage){
 if(stage==='advance_disbursement'){
  if(row?.module!=='advances')return {kind:'future',label:'غير مطبق'};
  const status=String(row?.status||'draft');
  if(status==='rejected'||status==='cancelled')return {kind:'stopped',label:'مرفوض'};
  if(status==='paid')return {kind:'done',label:'تم الصرف وربط الأقساط'};
  if(status==='finance_approved')return {kind:'waiting',label:'بانتظار توثيق الصرف'};
  return {kind:'future',label:'لم يصل بعد'};
 }
 if(stage==='advance_finance'){
  if(row?.module!=='advances')return {kind:'future',label:'غير مطبق'};
  const status=String(row?.status||'draft');
  if(status==='rejected'||status==='cancelled')return {kind:'stopped',label:'مرفوض'};
  if(status==='finance_approved'||status==='paid')return {kind:'done',label:'معتمد مالياً'};
  if(status==='approved'||status==='finance')return {kind:'waiting',label:'بانتظار المالية'};
  return {kind:'future',label:'لم يصل بعد'};
 }
 const current=String(row?.status||'draft');
 const index=requestApprovalStages.findIndex(item=>item.id===stage);
 if(index<0)return {kind:'future',label:'—'};
 if(current==='rejected')return {kind:'stopped',label:'مرفوض'};
 if(current==='returned')return index===0?{kind:'returned',label:'معاد للتصحيح'}:{kind:'future',label:'معلّق'};
 if(current==='draft')return index===0?{kind:'waiting',label:'إعداد الطلب'}:{kind:'future',label:'لم يبدأ'};
 const next=['approved','paid','finance','finance_approved'].includes(current)?requestApprovalStages.length:requestApprovalStages.findIndex(item=>item.id===current);
 if(next<0)return {kind:'future',label:'لم يبدأ'};
 if(index<next)return {kind:'done',label:'تم الاعتماد'};
 if(index===next)return {kind:'waiting',label:'بانتظار الاعتماد'};
 return {kind:'future',label:'لم يصل بعد'};
}

export function requestStageTimestamp(row,stage){
 if(stage==='advance_disbursement')return String(row?.data?.paid_at||'');
 if(stage==='advance_finance')return String(row?.data?.finance_approved_at||'');
 const tracking=row?.data?.approval_tracking;
 const event=tracking&&typeof tracking==='object'&&!Array.isArray(tracking)?tracking[stage]:null;
 return String(event?.at||(stage==='project_manager'?row?.data?.manager_submitted_at:'')||'');
}
