import {annualLeave} from './modules.mjs';
export const employeeRegisterFields = [
 ['code','الرقم الوظيفي'],['name','اسم الموظف'],['project_code','رقم المشروع'],
 ['hire_date','تاريخ التعيين'],['job','المسمى الوظيفي'],['department','القسم'],
 ['nationality','الجنسية'],['identity','الهوية أو الإقامة'],['phone','الجوال'],
 ['email','البريد الإلكتروني'],['basic','الراتب الأساسي'],['housing','بدل السكن'],
 ['transport','بدل النقل'],['payment_method','طريقة الصرف'],['bank','البنك'],
 ['iban','الآيبان'],['sponsorship','حالة الكفالة'],['opening_leave','رصيد افتتاحي للإجازات'],
 ['annual_entitlement','الاستحقاق السنوي'],['supervisor_account','رقم حساب المدير المباشر'],
 ['home_phone','هاتف الموظف في البلد الأم'],['employment_status','حالة الموظف'],
 ['salary','الأجر الشهري الإجمالي'],['project_id','اسم المشروع'],['manager','المدير المباشر'],
 ['current_leave','رصيد الإجازات الحالي'],['latest_leave','آخر طلب إجازة معتمد'],
 ['service_years','سنوات الخدمة المكتملة'],['accrued_leave','الإجازة المتراكمة منذ التعيين']
].map(([key,label])=>({key,label,type:'register'}));
export function employeeRegisterValue(row,key,rows){
 const data=row.data||{};
 const project=rows.find(item=>item.id===data.project_id&&item.module==='projects');
 const service=annualLeave(data.hire_date);
 const leaves=rows.filter(item=>item.module==='leave'&&item.status==='approved'&&item.data.employee_id===row.id);
 const annual=leaves.filter(item=>item.data.balance_deducted??(!item.data.leave_type||item.data.leave_type==='annual'));
 const used=annual.reduce((total,item)=>total+Number(item.data.days||0),0);
 if(key==='project_code')return project?.data.code||data.extra_fields?.['رقم المشروع']||'';
 if(key==='project_id')return project?.data.name||'';
 if(key==='annual_entitlement')return data.sponsorship==='yes'?(service?.annual??'أكمل تاريخ التعيين'):(data.annual_days||'');
 if(key==='service_years')return service?.years??'أكمل تاريخ التعيين';
 if(key==='accrued_leave')return service?.accrued??'أكمل تاريخ التعيين';
 if(key==='current_leave')return data.sponsorship==='yes'?(service?Math.round((service.accrued+Number(data.opening_leave||0)-used)*100)/100:'أكمل تاريخ التعيين'):Number(data.opening_leave||0)+Number(data.legacy_ledger_adjustment||0)-used;
 if(key==='latest_leave'){
  const latest=[...leaves].sort((a,b)=>String(b.data.request_date||b.data.start||b.created_at).localeCompare(String(a.data.request_date||a.data.start||a.created_at)))[0];
  return latest?[latest.data.request_date||latest.data.start,latest.code].filter(Boolean).join(' · '):data.last_leave_request||data.extra_fields?.['آخر طلب إجازة معتمد']||'';
 }
 const field=employeeRegisterFields.find(field=>field.key===key);
 return data[key]??data.extra_fields?.[field?.label]??'';
}
