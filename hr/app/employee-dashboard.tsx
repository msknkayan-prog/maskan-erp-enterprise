// @ts-nocheck
'use client';
import {useMemo,useState} from 'react';
import {Download,FileText,Search,RefreshCw,Users,Building2,BriefcaseBusiness,CheckCircle2} from 'lucide-react';
import {companyDisplayName} from '../lib/modules.mjs';
import {employeeRegisterValue} from '../lib/employee-register.mjs';
import {workbookBytes} from '../lib/sheets.mjs';

const definitions=[
 ['company','الشركة'],['code','الرقم الوظيفي'],['name','اسم الموظف'],['job','المسمى الوظيفي'],['department','القسم'],
 ['project_id','المشروع'],['manager','المدير المباشر'],['employment_status','حالة الموظف'],['working_company','شركة العمل'],
 ['hire_date','تاريخ التعيين'],['sponsorship','حالة الكفالة'],
 ['identity','رقم الإقامة / الهوية'],['phone','الجوال'],['email','البريد الإلكتروني'],
 ['basic','الأساسي'],['housing','بدل السكن'],['transport','بدل النقل'],['salary','إجمالي الراتب']
];
const reportPresets={
 basic:['company','code','name','job','project_id','employment_status'],
 operational:['company','working_company','code','name','job','department','project_id','manager','employment_status','hire_date','sponsorship'],
 contact:['company','code','name','project_id','manager','phone','email'],
 comprehensive:definitions.map(x=>x[0])
};
const activeStatus=value=>['active','نشط','على رأس العمل','علي راس العمل'].includes(String(value||'').trim());
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).trim();
const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const distinct=values=>[...new Set(values.map(x=>String(x??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
function saveSpreadsheet(name,table){
 const bytes=workbookBytes(table);
 const link=document.createElement('a');
 link.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 link.download=name+'.xlsx';link.click();
 setTimeout(()=>URL.revokeObjectURL(link.href),1500);
}
export default function EmployeeReportsDashboard({rows=[],user,company='',onOpenEmployees,onRefresh,loading=false}){
 const [companyFilter,setCompanyFilter]=useState('');
 const [projectFilter,setProjectFilter]=useState('');
 const [statusFilter,setStatusFilter]=useState('all');
 const [sponsorFilter,setSponsorFilter]=useState('');
 const [jobFilter,setJobFilter]=useState('');
 const [term,setTerm]=useState('');
 const [preset,setPreset]=useState('basic');
 const canDetailed=['admin','hr'].includes(user?.role);
 const canContact=canDetailed||user?.role==='administrative_assistant';
 const effectivePreset=preset==='comprehensive'&&!canDetailed?'operational':preset==='contact'&&!canContact?'basic':preset;
 const employees=useMemo(()=>rows.filter(r=>r.module==='employees'&&!r.data?._archived&&!r.data?._deleted&&(!company||r.company===company)),[rows,company]);
 const projects=useMemo(()=>rows.filter(r=>r.module==='projects'&&!r.data?._deleted),[rows]);
 const projectName=row=>{
  const p=projects.find(p=>p.id===row.data?.project_id);
  return String(p?.data?.name||row.data?.project_name||row.data?.['اسم المشروع']||'غير محدد');
 };
 const companies=distinct(employees.map(r=>r.company));
 const departments=distinct(employees.map(r=>r.data?.department||r.data?.job));
 const availableProjects=distinct(employees.filter(r=>!companyFilter||r.company===companyFilter).map(projectName));
 const filtered=employees.filter(r=>{
  const d=r.data||{},status=d.employment_status||d.employee_status||'غير محدد';
  if(companyFilter&&r.company!==companyFilter)return false;
  if(projectFilter&&projectName(r)!==projectFilter)return false;
  if(statusFilter==='active'&&!activeStatus(status))return false;
  if(statusFilter==='inactive'&&activeStatus(status))return false;
  if(sponsorFilter&&String(employeeRegisterValue(r,'sponsorship',rows)||'غير محدد')!==sponsorFilter)return false;
  if(jobFilter&&String(d.department||d.job||'')!==jobFilter)return false;
  const haystack=normalize([d.name,d.employee_name,d.code,d.employee_number,r.code,d.job,d.department,projectName(r),companyDisplayName(r.company),status].join(' '));
  return normalize(term).split(/\s+/).filter(Boolean).every(word=>haystack.includes(word));
 });
 const fields=definitions.filter(([key])=>reportPresets[effectivePreset].includes(key));
 const fieldValue=(row,key)=>{
  if(key==='company')return companyDisplayName(row.company);
  if(key==='project_id')return projectName(row);
  const value=employeeRegisterValue(row,key,rows);
  return value===0?'0':String(value??'');
 };
 const table=[fields.map(x=>x[1]),...filtered.map(row=>fields.map(([key])=>fieldValue(row,key)))];
 const byCompany=companies.map(co=>{
  const records=filtered.filter(r=>r.company===co);
  return {company:co,count:records.length,active:records.filter(r=>activeStatus(r.data?.employment_status||r.data?.employee_status)).length};
 }).filter(x=>x.count);
 const active=filtered.filter(r=>activeStatus(r.data?.employment_status||r.data?.employee_status)).length;
 const projectCount=new Set(filtered.map(projectName).filter(x=>x!=='غير محدد')).size;
 const exportReport=()=>saveSpreadsheet('كشف-الموظفين-'+new Date().toISOString().slice(0,10),table);
 const printReport=()=>{
  const heading=fields.map(x=>'<th>'+safe(x[1])+'</th>').join('');
  const body=filtered.map(row=>'<tr>'+fields.map(([key])=>'<td>'+safe(fieldValue(row,key))+'</td>').join('')+'</tr>').join('');
  const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف موظفي الشركات</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px/1.65 Tahoma,Arial,sans-serif;color:#302b20;direction:rtl}h1{font-size:19px;color:#896a26;margin:0 0 8px}small{color:#666}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #d8cbaa;padding:6px;text-align:right;word-break:break-word}th{background:#f4eddd}tr:nth-child(even){background:#faf8f3}thead{display:table-header-group}.footer{margin-top:24px;border-top:1px solid #ccc;padding:12px 0;display:flex;justify-content:space-between}.no-print{margin:16px;padding:9px;background:#b08d43;border:0;color:white}@media print{.no-print{display:none}}</style></head><body><h1>كشف موظفي الشركات — '+safe(effectivePreset==='basic'?'مختصر':effectivePreset==='operational'?'وظيفي':effectivePreset==='contact'?'تواصل':'مفصل')+'</h1><small>الشركة: '+safe(companyFilter?companyDisplayName(companyFilter):company?companyDisplayName(company):'جميع الشركات المسموح بها')+' | المشروع: '+safe(projectFilter||'الكل')+' | حالة الموظف: '+safe(statusFilter==='all'?'الكل':statusFilter==='active'?'نشط':'غير نشط')+' | العدد: '+filtered.length+' | تاريخ الاستخراج: '+new Date().toLocaleDateString('ar-SA',{timeZone:'Asia/Riyadh'})+'</small><table><thead><tr>'+heading+'</tr></thead><tbody>'+body+'</tbody></table><div class="footer"><span>إعداد شؤون الموظفين</span><span>توقيع / اعتماد: __________________</span></div><button class="no-print" onclick="window.print()">طباعة / حفظ PDF</button></body></html>';
  const win=window.open('','_blank');if(!win)return;win.document.open();win.document.write(html);win.document.close();
 };
 const reset=()=>{setCompanyFilter('');setProjectFilter('');setStatusFilter('all');setSponsorFilter('');setJobFilter('');setTerm('')};
 return <section className="panel" dir="rtl" aria-label="لوحة كشوف موظفي الشركات" style={{padding:15,marginBottom:15,border:'1px solid #d6bf87'}}>
  <div className="panel-head" style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
   <div><h2 style={{margin:0}}>لوحة كشوف موظفي الشركات</h2><small>إحصائيات مباشرة من سجلات الموظفين المسموح بعرضها، مع استخراج كشوف Excel وPDF حسب الفلاتر</small></div>
   <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
    <button type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14}/> تحديث البيانات</button>
    <button type="button" onClick={onOpenEmployees}><Users size={14}/> فتح سجل الموظفين</button>
   </div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:9,margin:'13px 0'}}>
   {[[<Users size={17}/>, 'الموظفون في النتائج',filtered.length],[<CheckCircle2 size={17}/>,'النشطون',active],[<Building2 size={17}/>,'الشركات',byCompany.length],[<BriefcaseBusiness size={17}/>,'المشاريع',projectCount]].map(([icon,label,value],i)=><div key={i} style={{border:'1px solid #e1d2af',borderRadius:9,padding:12,background:'#fbf8f0'}}>{icon}<small style={{display:'block'}}>{label}</small><strong style={{fontSize:20}}>{value}</strong></div>)}
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:12}}>
   <label>الشركة<select aria-label="فلترة كشف الموظفين حسب الشركة" value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setProjectFilter('')}}><option value="">جميع الشركات المتاحة</option>{companies.map(co=><option key={co} value={co}>{companyDisplayName(co)}</option>)}</select></label>
   <label>المشروع<select aria-label="فلترة كشف الموظفين حسب المشروع" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="">كل المشاريع</option>{availableProjects.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
   <label>الحالة<select aria-label="فلترة كشف الموظفين حسب الحالة" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">جميع الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط / أخرى</option></select></label>
   <label>القسم / الوظيفة<select aria-label="فلترة كشف الموظفين حسب القسم" value={jobFilter} onChange={e=>setJobFilter(e.target.value)}><option value="">جميع الأقسام</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
   <label>الكفالة<select aria-label="فلترة كشف الموظفين حسب الكفالة" value={sponsorFilter} onChange={e=>setSponsorFilter(e.target.value)}><option value="">كل حالات الكفالة</option>{distinct(employees.map(r=>employeeRegisterValue(r,'sponsorship',rows)||'غير محدد')).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label>اسم / رقم وظيفي / كلمة بحث<div style={{position:'relative'}}><Search size={15} style={{position:'absolute',right:10,top:13}}/><input type="search" value={term} onChange={e=>setTerm(e.target.value)} placeholder="ابحث عن الموظف أو رقمه" style={{paddingRight:32}}/></div></label>
  </div>
  <div style={{display:'flex',alignItems:'end',gap:8,flexWrap:'wrap',marginBottom:12}}>
   <label style={{minWidth:200}}>نوع الكشف<select value={effectivePreset} onChange={e=>setPreset(e.target.value)}><option value="basic">كشف مختصر</option><option value="operational">كشف وظيفي ومشاريع</option>{canContact&&<option value="contact">كشف التواصل</option>}{canDetailed&&<option value="comprehensive">كشف مفصل (للمخولين)</option>}</select></label>
   <button type="button" disabled={!filtered.length} onClick={exportReport}><Download size={15}/> تصدير كشف Excel ({filtered.length})</button>
   <button type="button" disabled={!filtered.length} onClick={printReport}><FileText size={15}/> طباعة / حفظ PDF</button>
   <button type="button" onClick={reset}>مسح جميع الفلاتر</button>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:7,marginBottom:13}}>
   {byCompany.map(item=><div key={item.company} style={{border:'1px solid #e4d8bf',padding:'9px 11px',borderRadius:8}}><strong>{companyDisplayName(item.company)}</strong><div style={{display:'flex',justifyContent:'space-between'}}><small>الإجمالي: {item.count}</small><small>نشط: {item.active}</small></div><div style={{height:5,background:'#eee7d7',marginTop:5,borderRadius:5}}><div style={{width:(item.active/item.count*100)+'%',height:5,background:'#b28d42',borderRadius:5}}/></div></div>)}
  </div>
  <div className="table-wrap" style={{maxHeight:370,overflow:'auto'}}><table><thead><tr>{fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>
   {filtered.slice(0,100).map(row=><tr key={row.id}>{fields.map(([key])=><td key={key}>{fieldValue(row,key)||'—'}</td>)}</tr>)}
   {!filtered.length&&<tr><td colSpan={fields.length} style={{textAlign:'center',padding:22}}>لا توجد بيانات مطابقة للفلاتر المحددة.</td></tr>}
  </tbody></table></div>
  <small>عرض أول {Math.min(100,filtered.length)} من {filtered.length} موظف. يشمل التصدير جميع النتائج المطابقة، وليس أول 100 فقط. لا تشمل الكشوف البيانات المؤرشفة أو الشركات الخارجة عن صلاحيات المستخدم.</small>
 </section>;
}
