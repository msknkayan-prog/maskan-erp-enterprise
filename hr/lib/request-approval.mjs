// One status vocabulary shared by the leave and advance approval grids.
// Drafts are not an extra approver; the project manager prepares the request.
export const requestApprovalStages=[
 {id:'project_manager',title:'اعتماد مدير المشروع',name:'مدير المشروع'},
 {id:'projects_director',title:'اعتماد إدارة المشاريع',name:'مجدي محجوب — المدير العام'},
 {id:'hr',title:'مراجعة شؤون الموظفين',name:'م. محمد يوسف'},
 {id:'finance',title:'اعتماد المالية والصرف',name:'مصعب عبد القيوم'}
];

export function requestStageView(row,stage){
 const current=String(row?.status||'draft');
 const index=requestApprovalStages.findIndex(item=>item.id===stage);
 if(index<0)return {kind:'future',label:'—'};
 if(current==='rejected')return {kind:'stopped',label:'مرفوض'};
 if(current==='returned')return index===0?{kind:'returned',label:'معاد للتصحيح'}:{kind:'future',label:'معلّق'};
 if(current==='draft')return index===0?{kind:'waiting',label:'إعداد الطلب'}:{kind:'future',label:'لم يبدأ'};
 const next=current==='approved'||current==='paid'?requestApprovalStages.length:requestApprovalStages.findIndex(item=>item.id===current);
 if(next<0)return {kind:'future',label:'لم يبدأ'};
 if(index<next)return {kind:'done',label:'تم الاعتماد'};
 if(index===next)return {kind:'waiting',label:'بانتظار الاعتماد'};
 return {kind:'future',label:'لم يصل بعد'};
}

export function requestStageTimestamp(row,stage){
 const tracking=row?.data?.approval_tracking;
 const event=tracking&&typeof tracking==='object'&&!Array.isArray(tracking)?tracking[stage]:null;
 return String(event?.at||(stage==='project_manager'?row?.data?.manager_submitted_at:'')||'');
}
