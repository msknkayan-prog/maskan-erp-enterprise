import {employeeRegisterValue} from './employee-register.mjs';

// Each project column has one distinct key; salary is derived from personnel,
// not copied into the project record or confused with the numeric project code.
export const projectRegisterFields=[
 {key:'name',label:'اسم المشروع'},
 {key:'code',label:'رمز المشروع'},
 {key:'manager_name',label:'اسم مدير المشروع'},
 {key:'active_employee_count',label:'الموظفون النشطون'},
 {key:'monthly_salary_total',label:'إجمالي الرواتب الشهرية للموظفين النشطين'},
 {key:'manager_email',label:'بريد حساب مدير المشروع'},
 {key:'director_email',label:'بريد مدير المشاريع'},
 {key:'latitude',label:'خط العرض'},
 {key:'longitude',label:'خط الطول'},
 {key:'radius',label:'نطاق الحضور بالمتر'}
];

export function projectActiveEmployees(project,records=[]){
 return records.filter(row=>row.module==='employees'&&row.data?.project_id===project.id&&
  !row.data?._archived&&!row.data?._deleted&&
  ['active','نشط','على رأس العمل','علي راس العمل'].includes(String(row.data.employment_status||row.data.employee_status||'').trim()));
}

export function projectRegisterValue(project,key,records=[]){
 const data=project.data||{};
 if(key==='code'){
  const code=String(data.code||project.code||'').trim();
  return /^\d+$/.test(code)?code:'';
 }
 if(key==='manager_name'){
  if(String(data.manager_name||'').trim())return String(data.manager_name).trim();
  const linked=records.filter(r=>r.module==='employees'&&r.data?.project_id===project.id&&!r.data?._deleted&&!r.data?._archived);
  const unique=[...new Set(linked.map(r=>String(r.data?.manager||r.data?.direct_manager||'').trim()).filter(Boolean))];
  return unique.length===1?unique[0]:unique.length>1?'يحتاج تحديد مدير المشروع':'غير معيّن';
 }
 if(key==='active_employee_count')return projectActiveEmployees(project,records).length;
 if(key==='monthly_salary_total')return projectActiveEmployees(project,records).reduce((sum,employee)=>{
  const value=Number(employeeRegisterValue(employee,'salary',records));
  return sum+(Number.isFinite(value)?value:0);
 },0);
 return data[key]??'';
}
