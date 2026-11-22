import {annualLeave,leaveAccrualAsOf,nextContractExpiry,serviceDuration,companyDisplayName} from './modules.mjs';
export const employeeRegisterFields = [
 ['working_company','الشركة التي يعمل بها'],['code','الرقم الوظيفي'],['name','اسم الموظف'],['manager','المدير المباشر'],['project_code','رمز المشروع'],['project_manager_name','اسم مدير المشروع'],
 ['hire_date','تاريخ التعيين'],['job','المسمى الوظيفي'],['department','القسم'],
 ['nationality','الجنسية'],['identity','الهوية أو الإقامة'],['phone','الجوال'],
 ['email','البريد الإلكتروني'],['basic','الراتب الأساسي'],['housing','بدل السكن'],
 ['transport','بدل النقل'],['salary','الراتب الشهري الإجمالي'],['bank_amount','تحويل بنكي'],['cash_amount','المتبقي كاش'],['payment_method','طريقة الصرف'],['bank','البنك'],
 ['iban','الآيبان'],['sponsorship','حالة الكفالة'],['opening_leave','رصيد افتتاحي للإجازات'],
 ['supervisor_account','رقم حساب المدير المباشر'],
 ['home_phone','هاتف الموظف في البلد الأم'],['employment_status','حالة الموظف'],
 ['project_id','اسم المشروع'],
 ['current_leave','رصيد الإجازات الحالي'],['latest_leave','آخر طلب إجازة معتمد'],
 ['service_years','مدة الخدمة (سنوات / أشهر / أيام)'],['service_total_days','إجمالي أيام الخدمة'],['accrued_leave','الإجازة المتراكمة منذ التعيين']
].map(([key,label])=>({key,label,type:'register'}));
export function employeeRegisterValue(row,key,rows){
 const data=row.data||{};
 const project=rows.find(item=>item.id===data.project_id&&item.module==='projects');
 const service=annualLeave(data.hire_date,leaveAccrualAsOf(data));
 const leaves=rows.filter(item=>item.module==='leave'&&item.status==='approved'&&item.data.employee_id===row.id);
 const annual=leaves.filter(item=>item.data.balance_deducted??(!item.data.leave_type||item.data.leave_type==='annual'));
 const used=annual.reduce((total,item)=>total+Number(item.data.paid_days??Math.max(0,Number(item.data.days||0)-Number(item.data.unpaid_days||0))),0);
 if(key==='working_company')return companyDisplayName(data.working_company||row.company);
 if(key==='project_code'){
  const code=String(project?.data.code||data.project_number||data.project_code||data.extra_fields?.['رقم المشروع']||'').trim();
  return /^\d+$/.test(code)?code:'';
 }
 if(key==='project_manager_name')return project?.data.manager_name||data.project_manager_name||'';
 if(key==='project_id')return project?.data.name||data.project_name||data['اسم المشروع']||'';
 if(key==='contract_expiry')return data.contract_expiry_mode==='manual'?(data.contract_expiry||'حدد تاريخ انتهاء العقد'):nextContractExpiry(data.hire_date)||'أكمل تاريخ التعيين';
 if(key==='service_years'){const span=serviceDuration(data.hire_date);return span?span.years+' سنة، '+span.months+' شهر، '+span.days+' يوم':'أكمل تاريخ التعيين';}
 if(key==='service_total_days')return serviceDuration(data.hire_date)?.totalDays??'أكمل تاريخ التعيين';
 if(key==='accrued_leave')return data.leave_balance_mode==='manual'?Number(data.manual_leave_entitlement||0):service?.accrued??'أكمل تاريخ التعيين';
 if(key==='current_leave'){const carry=data.opening_leave_confirmed==='yes'?Number(data.opening_leave||0):0;return service||data.leave_balance_mode==='manual'||data.opening_leave_confirmed==='yes'?Math.round(((data.leave_balance_mode==='manual'?Number(data.manual_leave_entitlement||0):(service?.accrued||0)+carry)-used)*100)/100:'أكمل تاريخ التعيين';}
 if(key==='latest_leave'){
  const latest=[...leaves].sort((a,b)=>String(b.data.request_date||b.data.start||b.created_at).localeCompare(String(a.data.request_date||a.data.start||a.created_at)))[0];
  return latest?[latest.data.request_date||latest.data.start,latest.code].filter(Boolean).join(' · '):data.last_leave_request||data.extra_fields?.['آخر طلب إجازة معتمد']||'';
 }
 // Read canonical form fields first, then imported Excel field names.
 // Do not rewrite the source values or derive salary proportions during display.
 const imported={
  code:['employee_number','الرقم الوظيفي'],
  name:['employee_name','اسم الموظف'],
  project_code:['project_number','رقم المشروع'],
  job:['job_title','المسمى الوظيفي'],
  identity:['national_id','الهوية أو الإقامة'],
  basic:['basic_salary','الراتب الأساسي'],
  housing:['housing_allowance','بدل السكن'],
  transport:['transport_allowance','بدل النقل'],
  sponsorship:['sponsorship_status','حالة الكفالة'],
  employment_status:['employee_status','حالة الموظف'],
  salary:['total_monthly_salary','الأجر الشهري الإجمالي'],
  manager:['direct_manager','المدير المباشر'],
  opening_leave:['opening_leave_balance','رصيد افتتاحي للإجازات'],
  phone:['mobile','الجوال'],
  hire_date:['hire_date','تاريخ التعيين']
 };
 const field=employeeRegisterFields.find(field=>field.key===key);
 const candidates=[key,...(imported[key]||[]),field?.label].filter(Boolean);
 for(const candidate of candidates){
  const value=data[candidate]??data.extra_fields?.[candidate];
  if(value!==undefined&&value!==null&&value!==''){
   if(key==='sponsorship'){
    if(value==='yes'||value==='على الكفالة'||value==='علي الكفالة')return 'على الكفالة';
    if(value==='no'||value==='خارج الكفالة')return 'خارج الكفالة';
   }
   return value;
  }
 }
 return '';
}
