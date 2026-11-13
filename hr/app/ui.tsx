// @ts-nocheck
'use client';
import {useEffect,useState,useRef,Fragment} from 'react';
import {employeeRegisterFields,employeeRegisterValue} from '../lib/employee-register.mjs';
import {LayoutDashboard,Users,Building2,FileText,Wallet,ShoppingCart,CalendarDays,TriangleAlert,ChartNoAxesCombined,Search,Plus,ArrowUpLeft,Cloud,ChevronLeft,Download,Upload,X,Check,ShieldCheck,LogOut,RefreshCw,ArrowRight,MapPin} from 'lucide-react';
import {companies,canonicalCompany,companyDisplayName,modules,states,annualLeave,canRead,canWrite,workflow,enumOptions,relationModules,operationalModules,saudiDate,fixedLeaveDays,leaveEndDate,leaveNextDate,leaveCalendarDays,leaveChargedDays,permission,permissionChoice,permittedRead,permittedWrite} from '../lib/modules.mjs';
import {Attendance,Migration,Attachments,RecordPaper,RecordHistory} from './operations';
import ClientFinance from './client-finance';
import {companyLogoPath,companyOfficialName} from '../lib/company-brand.mjs';
import {readXlsx,workbookBytes} from '../lib/sheets.mjs';
import {preferredProjectManagers,preferredManagerForName,suggestedProjectsForManager} from '../lib/project-manager-roster.mjs';
import {canSelectManagerProject,managerReassignmentConflicts} from '../lib/manager-assignment.mjs';
const icons={users:Users,building:Building2,file:FileText,wallet:Wallet,cart:ShoppingCart,calendar:CalendarDays,alert:TriangleAlert,chart:ChartNoAxesCombined};
const money=n=>Number(n||0).toLocaleString('ar-SA',{maximumFractionDigits:2});
function download(name,content,type='text/csv;charset=utf-8'){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const csvEscape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
function csvParse(s){s=s.replace(/^\ufeff/,'');let rows=[],row=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(Boolean))rows.push(row);row=[];v=''}else v+=c}if(quoted)throw Error('علامات اقتباس غير مكتملة');row.push(v);if(row.some(Boolean))rows.push(row);return rows}
function ManagerProjectPicker({projects,companies,managerEmail,mode,selected,onModeChange,onSelectedChange,disabled=false}){
 const [query,setQuery]=useState('');
 const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().trim();
 const manager=normalize(managerEmail);
 const eligible=projects.filter(p=>{
  if(p.module!=='projects'||!manager||normalize(p.data?.manager_email)!==manager)return false;
  const shared=Array.isArray(p.data?._shared_companies)?p.data._shared_companies:[];
  return companies==='*'||companies.includes(p.company)||shared.some(c=>companies.includes(c));
 }).filter((p,index,all)=>{
  const key=r=>String(r.company||'')+'|'+String(r.data?.code||r.data?.project_number||r.code||r.id).trim().toLowerCase();
  return all.findIndex(other=>key(other)===key(p))===index;
 });
 const matched=eligible.filter(p=>normalize([p.data.name,p.data.code,p.data.project_number,p.code,p.company].join(' ')).includes(normalize(query)));
 const toggle=(id,checked)=>onSelectedChange(checked?[...new Set([...selected,id])]:selected.filter(x=>x!==id));
 return <fieldset className="member-project-access" disabled={disabled} dir="rtl">
 <legend>المشاريع المخوّل مدير المشروع بإدارة طلبات موظفيها</legend>
 <label>نطاق المشاريع<select value={mode} onChange={e=>onModeChange(e.target.value)}>
 <option value="selected">مشاريع محددة</option><option value="all">جميع المشاريع التي عُيّن مديرًا لها</option>
 </select></label>
 {mode==='selected'?<>
 <label>البحث باسم المشروع أو رقمه<input type="search" aria-label="بحث مشاريع المدير" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم المشروع"/></label>
 <div className="member-scope-actions"><span>المحددة {selected.length} من {eligible.length} · نتائج البحث {matched.length}</span>
 <button type="button" disabled={!matched.length} onClick={()=>onSelectedChange([...new Set([...selected,...matched.map(p=>p.id)])])}>تحديد النتائج</button>
 <button type="button" disabled={!matched.length} onClick={()=>onSelectedChange(selected.filter(id=>!matched.some(p=>p.id===id)))}>إلغاء تحديد النتائج</button></div>
 <div className="member-project-list" role="group" aria-label="قائمة مشاريع مدير المشروع">
 {matched.map(p=><label key={p.id} className="member-project-option"><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>toggle(p.id,e.target.checked)}/><span><strong>{p.data.name||'مشروع بدون اسم'}</strong><small>{p.code||p.data.code||'—'} · {p.company}</small></span></label>)}
 {!matched.length&&<p>لا توجد مشاريع مطابقة. راجع الشركة المختارة أو البحث.</p>}
 </div>
 <small>تظهر المشاريع المعيّن لها هذا الحساب فقط، مرة واحدة لكل رقم مشروع. إذا لم يظهر مشروع، عيّن مديره أولًا في سجل المشاريع.</small>
 </>:<small>يعرض فقط المشاريع التي تم تعيين الحساب مديرًا لها في سجل المشاريع وبنطاق شركاته.</small>}
 </fieldset>;
}
// The employee register is the source of direct-manager assignments. Keep the
// project-manager directory as the canonical identity for saving assignments.
function directManagerChoices(rows,members,company){
 const directory=rows.filter(r=>r.module==='project_managers'&&r.company===company);
 const staff=rows.filter(r=>r.module==='employees'&&r.company===company&&!r.data?._archived);
 return preferredProjectManagers.map(profile=>{
  const records=directory.filter(r=>preferredManagerForName(r.data?.name)?.id===profile.id);
  const managed=staff.filter(r=>preferredManagerForName(r.data?.manager)?.id===profile.id||records.some(d=>d.id===r.data?.direct_manager_id));
  const emails=[...new Set([...records.map(r=>r.data?.email),...managed.map(r=>r.data?.manager_email),...members.filter(m=>preferredManagerForName(m.display_name)?.id===profile.id).map(m=>m.email)].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean))];
  const eligibleEmails=emails.filter(email=>{
   const member=members.find(m=>String(m.email||'').trim().toLowerCase()===email);
   if(!member||member.role!=='project_manager'||member.is_active===false)return false;
   if(member.companies==='*')return true;
   try{return JSON.parse(member.companies||'[]').includes(company)}catch{return false}
  }).filter(email=>records.some(r=>String(r.data?.email||'').trim().toLowerCase()===email));
  const eligible=eligibleEmails.length===1;
  return {id:profile.id,name:profile.name,email:eligibleEmails[0]||emails[0]||'',eligible,ambiguous:eligibleEmails.length>1};
 });
}
export default function ERP(){const [integrityReport,setIntegrityReport]=useState(null),[integrityBusy,setIntegrityBusy]=useState(false),[managerSetup,setManagerSetup]=useState(null),[managerSetupBusy,setManagerSetupBusy]=useState(false),[leaveHolidayCandidate,setLeaveHolidayCandidate]=useState(''),[module,setModule]=useState('overview'),[pendingType,setPendingType]=useState(''),[pendingStage,setPendingStage]=useState(''),[pendingSearch,setPendingSearch]=useState(''),[payrollStage,setPayrollStage]=useState('__all__'),[company,setCompany]=useState(''),[payrollCompany,setPayrollCompany]=useState('__all__'),[payrollEdit,setPayrollEdit]=useState(null),[cycleEdit,setCycleEdit]=useState(null),[payrollManageBatchId,setPayrollManageBatchId]=useState(null),[payrollAllOpen,setPayrollAllOpen]=useState(false),[payrollBulkSelected,setPayrollBulkSelected]=useState([]),[payrollAddEmployeeId,setPayrollAddEmployeeId]=useState(''),[payrollMonth,setPayrollMonth]=useState(new Date(Date.now()+3*3600000).toISOString().slice(0,7)),[rows,setRows]=useState([]),[user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[employeeProjectSearch,setEmployeeProjectSearch]=useState(''),[employeeManagerSearch,setEmployeeManagerSearch]=useState(''),[projectCompanySearch,setProjectCompanySearch]=useState(''),[projectManagerSearch,setProjectManagerSearch]=useState(''),[managerRecordSearch,setManagerRecordSearch]=useState(''),[employeeFilterOpen,setEmployeeFilterOpen]=useState(false),[employeeFieldFilters,setEmployeeFieldFilters]=useState({}),[edit,setEdit]=useState(null),[employeeReadOnly,setEmployeeReadOnly]=useState(false),[showArchivedEmployees,setShowArchivedEmployees]=useState(false),[saving,setSaving]=useState(false),[formError,setFormError]=useState(''),[toast,setToast]=useState(''),[importRows,setImportRows]=useState(null),[members,setMembers]=useState([]),[audit,setAudit]=useState([]),[memberEmail,setMemberEmail]=useState(''),[memberContactEmail,setMemberContactEmail]=useState(''),[memberRole,setMemberRole]=useState('hr'),[memberEmployee,setMemberEmployee]=useState(''),[memberCompany,setMemberCompany]=useState('*'),[memberProject,setMemberProject]=useState('*'),[memberSelectedProjects,setMemberSelectedProjects]=useState([]),[memberPermissions,setMemberPermissions]=useState({}),[memberUsername,setMemberUsername]=useState(''),[memberEdit,setMemberEdit]=useState(null),[memberEditPermissions,setMemberEditPermissions]=useState({}),[memberBusy,setMemberBusy]=useState(false),[linkedEmployee,setLinkedEmployee]=useState(null),[memberSearch,setMemberSearch]=useState(''),[memberRoleFilter,setMemberRoleFilter]=useState(''),[memberUserFilter,setMemberUserFilter]=useState(''),[memberStatusFilter,setMemberStatusFilter]=useState(''),[memberFormOpen,setMemberFormOpen]=useState(false),[expandedPermissions,setExpandedPermissions]=useState(null),[passwordResetDialog,setPasswordResetDialog]=useState(null),[generatedPassword,setGeneratedPassword]=useState(null),[credentialPhone,setCredentialPhone]=useState(''),[newMemberCredential,setNewMemberCredential]=useState(null);
const notify=t=>{setToast(t);setTimeout(()=>setToast(''),4500)};
const refreshGeneration=useRef(0),lastBackgroundRefresh=useRef(0);
async function refresh(){
 const generation=++refreshGeneration.current;
 setLoading(true);setError('');
 try{
  const res=await fetch('/api/erp',{cache:'no-store'});
  const d=await res.json();
  if(generation!==refreshGeneration.current)return;
  if(res.status===401){location.href='/login';return}
  if(!res.ok)throw Error(d.error||'تعذر تحديث البيانات');
  setRows(d.rows);setUser(d.user);
 }catch(e){if(generation===refreshGeneration.current)setError(e.message)}
 finally{if(generation===refreshGeneration.current)setLoading(false)}
}
useEffect(()=>{
 refresh();
 const recheck=()=>{if(document.visibilityState!=='visible')return;const now=Date.now();if(now-lastBackgroundRefresh.current<2500)return;lastBackgroundRefresh.current=now;refresh()};
 window.addEventListener('focus',recheck);
 document.addEventListener('visibilitychange',recheck);
 return()=>{window.removeEventListener('focus',recheck);document.removeEventListener('visibilitychange',recheck);refreshGeneration.current++}
},[]);
useEffect(()=>{setSearch('');setImportRows(null);if(!['leave','advances','warnings','resignations','returns','terminations','leave_dues','settlements','payroll'].includes(module))setLinkedEmployee(null);if(['members','audit','projects','project_managers','employees'].includes(module))fetch('/api/erp?module='+(['projects','project_managers','employees'].includes(module)?(user?.role==='admin'?'members':'project_manager_choices'):module),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'تعذر قراءة صلاحيات المستخدمين');if(!Array.isArray(d.rows))throw Error('تعذر قراءة قائمة المستخدمين');return d}).then(d=>['members','projects','project_managers','employees'].includes(module)?setMembers(d.rows):setAudit(d.rows)).catch(err=>{setError(err.message);notify(err.message)})},[module]);
const permissionMap=raw=>{try{return typeof raw==='string'?JSON.parse(raw||'{}'):raw||{}}catch{return {}}};
const startMemberEdit=m=>{let selectedCompanies=[];let selectedProjects=[];try{if(m.companies!=='*')selectedCompanies=JSON.parse(m.companies||'[]')}catch{}try{if(m.projects!=='*')selectedProjects=JSON.parse(m.projects||'[]')}catch{}setMemberEdit({...m,original_email:m.email,contact_email:m.contact_email||m.email,username:m.username||'',companyMode:m.companies==='*'?'all':'selected',selectedCompanies,projectMode:m.projects==='*'?'all':'selected',selectedProjects});setMemberEditPermissions(permissionMap(m.permissions));};
async function saveManagerSetup(e){
 e.preventDefault();if(!managerSetup||managerSetupBusy)return;
 if(!managerSetup.ids.length)return notify('اختر مشروعًا واحدًا على الأقل');
 const email=String(managerSetup.email||'').trim().toLowerCase();
 const existingAccount=members.find(m=>String(m.email||'').trim().toLowerCase()===email);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  setManagerSetup(p=>({...p,showDetails:true}));return notify('حدد المشاريع ثم أدخل البريد الإلكتروني الصحيح للمدير');
 }
 if(String(managerSetup.name||'').trim().length<3)return notify('أدخل اسم المدير كاملًا');
 if(!existingAccount&&!String(managerSetup.username||'').trim()){
  setManagerSetup(p=>({...p,showDetails:true}));return notify('أدخل اسم المستخدم لإنشاء حساب المدير');
 }
 const selectedProjects=rows.filter(r=>r.module==='projects'&&managerSetup.ids.includes(r.id));
 const employeeCompany=rows.find(r=>r.module==='employees'&&r.id===managerSetup.employeeId)?.company||'';
 if(selectedProjects.length!==managerSetup.ids.length||selectedProjects.some(r=>!canSelectManagerProject(r,employeeCompany)))return notify('المشاريع المختارة لا تتطابق مع الشركة؛ أعد الاختيار');
 const conflicts=managerReassignmentConflicts(selectedProjects,managerSetup.ids,email);
 if(conflicts.length&&!window.confirm('المشاريع التالية مرتبطة بمدراء آخرين:\n'+conflicts.map(p=>'• '+(p.data?.name||p.code||p.id)).join('\n')+'\n\nهل تؤكد نقل هذه المشاريع إلى '+managerSetup.name+'؟ ستنتقل إليه اعتمادات الطلبات الجديدة.'))return;
 setManagerSetupBusy(true);
 try{
  const result=await post({action:'onboard_project_manager',name:managerSetup.name,email,phone:managerSetup.phone,username:managerSetup.username,project_ids:managerSetup.ids,employee_id:managerSetup.employeeId||null,confirm_reassign:conflicts.length>0});
  let msg='تم ربط المدير بـ '+result.projects+' مشروع وربط '+(result.employees_linked||0)+' موظف وتحديث صلاحياته';
  const currentAccount=members.find(m=>String(m.email||'').toLowerCase()===String(result.email||'').toLowerCase());
  if(result.created||currentAccount?.auth_ready===false){
   try{
    const invitation=await post({action:'send_password_link',email:result.email});
    msg+=invitation.method==='invitation'?'، وأُرسلت دعوة إعداد كلمة المرور':'، وأُرسل رابط تعيين كلمة المرور';
   }catch(err){msg+='؛ تعذر إرسال رابط كلمة المرور: '+(err.message||'أعد المحاولة من إدارة الحساب')}
  }
  setManagerSetup(null);
  await refresh();
  const list=await(await fetch('/api/erp?module=members',{cache:'no-store'})).json();
  if(Array.isArray(list.rows))setMembers(list.rows);
  notify(msg);
 }catch(err){notify(err.message||'تعذر إنشاء حساب المدير وربط المشاريع')}finally{setManagerSetupBusy(false)}
}
async function saveMemberEdit(e){e.preventDefault();if(!memberEdit)return;if(memberEdit.role!=='admin'&&memberEdit.companyMode==='selected'&&!memberEdit.selectedCompanies.length){notify('حدد شركة واحدة على الأقل أو اختر جميع الشركات');return;}if(memberEdit.role!=='admin'&&memberEdit.projectMode==='selected'&&!memberEdit.selectedProjects.length){notify('حدد مشروعًا واحدًا على الأقل أو اختر جميع المشاريع');return;}setMemberBusy(true);try{
 await post({action:'update_member',original_email:memberEdit.original_email,email:memberEdit.email,username:memberEdit.username,contact_email:memberEdit.contact_email,role:memberEdit.role,employee_id:memberEdit.employee_id||null,companies:memberEdit.companyMode==='all'?'*':memberEdit.selectedCompanies,projects:memberEdit.projectMode==='all'?'*':memberEdit.selectedProjects,permissions:memberEditPermissions});
 let linkMessage='';if(memberEdit.username?.trim()&&!members.find(m=>m.email===memberEdit.original_email)?.username){try{const sent=await post({action:'send_password_link',email:memberEdit.email});linkMessage=sent.method==='invitation'?' وتم إرسال دعوة كلمة المرور':' وتم إرسال رابط كلمة المرور'}catch(err){linkMessage='؛ تعذر إرسال رابط كلمة المرور: '+err.message}}const result=await (await fetch('/api/erp?module=members',{cache:'no-store'})).json();if(!Array.isArray(result.rows))throw Error(result.error||'تعذر تحديث القائمة');
 setMembers(result.rows);setMemberEdit(null);setPasswordResetDialog(null);notify('تم حفظ البريد والدور والصلاحيات'+linkMessage);
 }catch(err){notify(err.message||'تعذر حفظ الصلاحيات')}finally{setMemberBusy(false)}}
function openCredentialManager(m){
 const employee=rows.find(r=>r.id===m.employee_id&&r.module==='employees');
 const d=employee?.data||{};
 const suggested=String(d.phone||d.mobile||d.mobile_number||d.phone_number||d.jawal||'');
 setCredentialPhone(suggested);setGeneratedPassword(null);
 setPasswordResetDialog({email:m.email,username:m.username,role:m.role});
}
function shareMemberOnWhatsApp(account){
 const raw=credentialPhone.replace(/[^0-9+]/g,'').trim();
 let phone=raw.startsWith('+')?raw.slice(1):raw;
 if(/^05[0-9]{8}$/.test(phone))phone='966'+phone.slice(1);
 else if(/^5[0-9]{8}$/.test(phone))phone='966'+phone;
 else if(/^00[0-9]{8,13}$/.test(phone))phone=phone.slice(2);
 if(!/^[1-9][0-9]{7,14}$/.test(phone)){notify('أدخل رقم واتساب صحيحًا مع رمز الدولة، مثل 9665xxxxxxxx');return;}
 if(!account?.username){notify('احفظ اسم المستخدم أولًا');return;}
 const pass=account.password;
 if(!pass){notify('أنشئ كلمة مرور مؤقتة جديدة قبل المشاركة، أو استخدم رابط الاستعادة عبر البريد');return;}
 if(!window.confirm('سيتم فتح واتساب برسالة تتضمن كلمة المرور المؤقتة بنص واضح. قد تظهر في سجل المحادثة والروابط. هل تريد المتابعة؟'))return;
 const message=['بيانات الدخول إلى منصة مسكن الكيان','اسم المستخدم: '+account.username,'كلمة المرور المؤقتة: '+pass,'رابط المنصة: https://maskan-hr-cloud.vercel.app','يرجى تغيير كلمة المرور بعد أول دخول وعدم مشاركة الرسالة.'].join('\\n');
 window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
}
async function generateMemberPassword(){
 if(!passwordResetDialog||memberBusy)return;
 if(!window.confirm('سيتم إنشاء كلمة مرور مؤقتة جديدة للحساب. ستتوقف كلمة المرور السابقة عن العمل. هل تريد المتابعة؟'))return;
 setMemberBusy(true);setGeneratedPassword(null);
 try{
  const result=await post({action:'generate_temporary_password',email:passwordResetDialog.email});
  if(!result.password)throw Error('تعذر عرض كلمة المرور المُولَّدة');
  setGeneratedPassword({username:result.username,password:result.password});
  notify('تم إنشاء كلمة مرور مؤقتة. انسخها الآن، فلن تُعرض مرة أخرى بعد الإغلاق.');
 }catch(error){notify(error.message||'تعذر توليد كلمة المرور')}finally{setMemberBusy(false)}
}
async function sendMemberPasswordLink(email,username){if(!username){notify('أدخل اسم مستخدم واحفظه أولًا لتفعيل رابط كلمة المرور');return;}if(!window.confirm('إرسال رابط آمن لتعيين كلمة المرور إلى '+email+'؟'))return;setMemberBusy(true);try{const result=await post({action:'send_password_link',email});notify(result.method==='invitation'?'تم طلب إرسال دعوة إنشاء الحساب وكلمة المرور':'تم طلب إرسال رابط تغيير كلمة المرور')}catch(e){notify(e.message||'تعذر إرسال الرابط')}finally{setMemberBusy(false)}}
async function uploadCompanyLogo(file){
 if(!file||!edit?.id||module!=='company_profiles')return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){notify('ارفع شعار PNG أو JPG أو WebP بحجم لا يتجاوز 1 ميجابايت');return}
 if(user?.role!=='admin'){notify('رفع الشعار متاح للمدير العام فقط');return}
 setSaving(true);
 try{
  const form=new FormData();form.append('record',edit.id);form.append('file',file);
  const response=await fetch('/api/files',{method:'POST',body:form});
  const uploaded=await response.json();
  if(!response.ok||!uploaded.id)throw Error(uploaded.error||'تعذر رفع الشعار');
  await post({action:'set_company_logo',record_id:edit.id,file_id:uploaded.id,revision:edit.revision});
  await refresh();setEdit(null);notify('تم تحديث شعار الشركة في جميع نماذجها القابلة للطباعة');
 }catch(e){notify(e.message||'تعذر حفظ الشعار')}
 finally{setSaving(false)}
}
async function scanIntegrity(){
 if(user?.role!=='admin'||integrityBusy)return;
 setIntegrityBusy(true);
 try{
  const response=await fetch('/api/erp?module=integrity_report',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.ok)throw Error(data.error||'تعذر فحص الروابط');
  setIntegrityReport(data);
  notify(data.issue_count?'تم الفحص وتوجد '+data.issue_count+' ملاحظة تحتاج مراجعة':'نجح فحص الروابط دون ملاحظات');
 }catch(error){notify(error.message||'تعذر إجراء الفحص')}finally{setIntegrityBusy(false)}
}
async function post(body){const r=await fetch('/api/erp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d}
async function deleteDraftRequest(row){
  if(!row||row.status!=='draft'||!['leave','advances','resignations','warnings'].includes(row.module))return;
  if(!['admin','hr'].includes(user?.role)||!permittedWrite(user||{},row.module)||!permission(user||{},row.module,'edit')){notify('ليس لديك صلاحية حذف الطلبات');return;}
  if(!window.confirm('هل تؤكد حذف الطلب المسودة؟ سيختفي من السجل مع الاحتفاظ بسجل العملية للمراجعة. لا يمكن حذف الطلب المعتمد بهذه الطريقة.'))return;
  setSaving(true);
  try{
   await post({action:'delete_draft_request',module:row.module,id:row.id,revision:row.revision});
   if(edit?.id===row.id)setEdit(null);
   notify('تم حذف الطلب المسودة من السجل بنجاح');
   await refresh();
  }catch(err){notify(err.message||'تعذر حذف الطلب');}
  finally{setSaving(false);}
 }
async function deleteProject(row){
 if(!row||row.module!=='projects'||user?.role!=='admin')return notify('حذف المشروع متاح للمدير العام فقط');
 const projectName=String(row.data?.name||row.code||'المشروع');
 const linked=rows.filter(r=>r.id!==row.id&&!r.data?._deleted&&(
  String(r.data?.project_id||'')===row.id||
  (Array.isArray(r.data?.project_ids)&&r.data.project_ids.includes(row.id))));
 if(linked.length)return notify('لا يمكن حذف '+projectName+'؛ توجد '+linked.length+' سجلات مرتبطة به. انقل الموظفين والمعاملات أولًا.');
 if(!window.confirm('هل تؤكد حذف المشروع «'+projectName+'» من سجل المشاريع؟ لن تتأثر المشاريع الأخرى، وسيُحفظ سجل تدقيق للحذف.'))return;
 const reason=window.prompt('أدخل سبب حذف المشروع «'+projectName+'» للتوثيق:');
 if(reason===null)return;
 if(!reason.trim())return notify('سبب حذف المشروع مطلوب');
 setSaving(true);
 try{
  await post({action:'delete_project',module:'projects',id:row.id,revision:row.revision,reason:reason.trim()});
  if(edit?.id===row.id)setEdit(null);
  await refresh();notify('تم حذف المشروع من السجل وتوثيق العملية');
 }catch(err){notify(err.message||'تعذر حذف المشروع');}
 finally{setSaving(false)}
}
async function deleteProjectManager(row){
 if(!row||row.module!=='project_managers'||user?.role!=='admin')return notify('حذف سجل مدير المشروع متاح للمدير العام فقط');
 const email=String(row.data?.email||'').trim().toLowerCase();
 const name=String(row.data?.name||email||'مدير المشروع');
 const linkedProject=rows.some(r=>r.module==='projects'&&r.company===row.company&&String(r.data?.manager_email||'').trim().toLowerCase()===email);
 const linkedEmployee=rows.some(r=>r.module==='employees'&&r.company===row.company&&(String(r.data?.direct_manager_id||'')===row.id||(email&&String(r.data?.manager_email||'').trim().toLowerCase()===email)));
 if(linkedProject||linkedEmployee)return notify('لا يمكن حذف «'+name+'» قبل نقل المشاريع والموظفين المرتبطين به إلى مدير آخر');
 if(!window.confirm('هل تؤكد حذف «'+name+'» من دليل مدراء المشاريع؟ سيُحفظ سجل تدقيق، ولن يُحذف حساب الدخول.'))return;
 const reason=window.prompt('أدخل سبب حذف سجل المدير «'+name+'» للتوثيق:');
 if(reason===null)return;
 if(!reason.trim())return notify('سبب حذف سجل المدير مطلوب');
 setSaving(true);
 try{
  await post({action:'delete_project_manager',module:'project_managers',id:row.id,revision:row.revision,reason:reason.trim()});
  if(edit?.id===row.id)setEdit(null);
  await refresh();notify('تم حذف المدير من الدليل وتوثيق العملية؛ حساب الدخول لم يتغير');
 }catch(err){notify(err.message||'تعذر حذف سجل مدير المشروع')}
 finally{setSaving(false)}
}
 async function save(e){e.preventDefault();if(module==='employees'&&employeeReadOnly){notify('انتقل إلى وضع التعديل أولًا');return;}
 if(module==='employees'&&edit.dual_source_id){
 if(!companies.includes(edit.company)||edit.company===edit.dual_source_company){notify('اختر شركة ثانية مختلفة عن الشركة الأصلية');return;}
 if(rows.some(r=>r.module==='employees'&&r.company===edit.company&&!r.data?._archived&&String(r.data?.identity||'').trim()&&String(r.data.identity).trim()===String(edit.data.identity||'').trim())){notify('يوجد سجل موظف بنفس الهوية في الشركة المختارة؛ افتحه بدل تكراره');return;}
 if(!window.confirm('تأكيد إضافة الموظف إلى '+edit.company+' بسجل وظيفي وراتب مستقلين دون نقل أو حذف سجله من '+edit.dual_source_company+'؟'))return;
 }
 if(module==='employees'){
 const salary=Number(edit.data.salary||0),bank=Number(edit.data.bank_amount||0);
 if(!Number.isFinite(salary)||salary<0||!Number.isFinite(bank)||bank<0||Math.round(bank*100)>Math.round(salary*100)){notify('مبلغ التحويل البنكي يجب ألا يتجاوز الراتب ولا يكون سالبًا');return;}
 }
 const originalProject=module==='projects'&&edit.id?rows.find(r=>r.id===edit.id&&r.module==='projects'):null;
 const managerEmail=String(edit?.data?.manager_email||'').trim().toLowerCase();
 const previousManagerEmail=String(originalProject?.data?.manager_email||'').trim().toLowerCase();
 const managerChanged=Boolean(originalProject&&managerEmail!==previousManagerEmail);
 if(managerChanged&&!managerEmail)return notify('لا يمكن إلغاء تكليف المدير من هذه النافذة؛ اختر مديرًا بديلًا أو تواصل مع الإدارة');
 if(managerChanged&&user?.role!=='admin')return notify('تغيير مدير المشروع يتطلب صلاحية المدير العام');
 if(managerChanged&&!window.confirm('تأكيد تعيين المدير الجديد لمشروع «'+(edit.data.name||edit.data.code)+'»؟ ستُحدّث صلاحيات المشروع والمدير المباشر للموظفين المرتبطين به.'))return;
 setFormError('');
 setSaving(true);
 let assignmentSaved=false;
 try{
  const payload=edit.id?{...edit}:{company:edit.company,data:{...edit.data},salary_edit_source:edit.salary_edit_source};
  if(managerChanged){
   await post({action:'assign_project_manager',project_id:edit.id,manager_email:managerEmail,revision:edit.revision});
   payload.revision=edit.revision+1;assignmentSaved=true;
  }
  const result=await post({action:'save',module,...payload});
 setEdit(null);
 if(module==='employees'&&!edit.id&&result.employee_code){notify('تم تسجيل الموظف بنجاح، الرقم الوظيفي: '+result.employee_code);await refresh();return;}
 notify(result.company_transferred?(result.linked_account_review_required?'تم نقل تبعية الموظف وحفظ التاريخ؛ راجع نطاق صلاحيات حساب دخوله':'تم نقل تبعية الموظف مع الاحتفاظ بالسجلات السابقة'):(result.payroll_synced?'حُفظ الراتب وتم تحديث '+result.payroll_synced+' سجل في المسيرات المفتوحة؛ يلزم إعادة المراجعة':'تم حفظ جميع بيانات السجل'));

 await refresh();
 }catch(err){if(assignmentSaved){setEdit(null);await refresh();notify('تم حفظ تعيين المدير وتحديث الموظفين، لكن تعذر حفظ باقي تعديلات المشروع: '+err.message)}else{setFormError(err.message||'تعذر حفظ السجل');notify(err.message||'تعذر حفظ السجل')}}finally{setSaving(false)}}
function openEmployee(row,readOnly=true){setEmployeeProjectSearch('');setEmployeeReadOnly(readOnly);setEdit({...row,data:{...row.data}})}
function cloneEmployeeToSecondCompany(row){
 if(!permittedWrite(user||{},'employees')||!['admin','hr'].includes(user?.role)){notify('إضافة موظف إلى شركة ثانية تتطلب صلاحية المدير أو شؤون الموظفين');return;}
 const current=rows.find(r=>r.module==='employees'&&r.id===row.id)||row;
 row=current;
 const employeeCode=String(row.data.code||row.code||'').trim();
 const available=companies.filter(c=>c!==row.company);
 if(!available.length){notify('لا توجد شركات أخرى متاحة');return;}
 const previousNotes=String(row.data.notes||'').trim();
 const note='توظيف إضافي مستقل - المرجع: '+employeeCode+' / '+row.company+' / '+row.id+'؛ تحفظ جميع معاملات الشركة الأصلية دون تعديل.';
 setEmployeeProjectSearch('');setEmployeeReadOnly(false);
 setEdit({company:available[0],dual_source_id:row.id,dual_source_company:row.company,dual_source_code:employeeCode,data:{...row.data,code:'',project_id:'',notes:[previousNotes,note].filter(Boolean).join('\\n')}});
 notify('اختر الشركة الثانية، وسيُولّد رقم وظيفي مستقل تلقائيًا عند الحفظ؛ راجع الراتب والبدلات والتحويل البنكي');
}
async function archiveEmployee(row,restore=false){
 if(!permittedWrite(user||{},'employees')||!['admin','hr'].includes(user?.role))return notify('ليس لديك صلاحية حذف أو استعادة الموظفين');
 const reason=restore?'':window.prompt('سبب حذف الموظف من القائمة (سيُحفظ السجل للأرشفة ولن تُحذف مستحقاته أو طلباته):');
 if(!restore&&!reason?.trim())return;
 if(!window.confirm(restore?'استعادة الموظف إلى سجل الموظفين؟':'أرشفة الموظف وإخفاؤه من القائمة النشطة مع الحفاظ على سجلاته المرتبطة؟'))return;
 setSaving(true);
 try{await post({action:restore?'restore_employee':'archive_employee',module:'employees',id:row.id,revision:row.revision,reason});
  notify(restore?'تمت استعادة الموظف':'تم حذف الموظف من القائمة النشطة ونقله للأرشيف');await refresh();
 }catch(err){notify(err.message)}finally{setSaving(false)}
}
async function disburse(row){const reference=window.prompt('مرجع صرف السلفة الفعلي — لا يتم تنفيذ تحويل بنكي');if(!reference)return;setSaving(true);try{await post({action:'disburse',module,id:row.id,revision:row.revision,reference});notify('تم توثيق الصرف');await refresh()}catch(e){notify(e.message)}finally{setSaving(false)}}
async function transition(row,decision='approve',note=''){setSaving(true);try{await post({action:'transition',module,id:row.id,revision:row.revision,decision,note,medical_verified:row.data.leave_type==='sick'?window.confirm('هل راجعت المرفق الطبي وتحققت من صحته؟'):false});notify('تم تحديث مرحلة الاعتماد');await refresh()}catch(e){notify(e.message)}finally{setSaving(false)}}
const normalizeSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\s+/g,' ').trim();
let scoped=rows.filter(r=>!company||r.company===company),spec=modules[module];
const searchWords=normalizeSearch(search).split(' ').filter(Boolean);
const employeeFilterFields=[{key:'company',label:'الشركة'},...employeeRegisterFields,...(modules.employees.fields||[]).filter(f=>['iqama_expiry','contract_expiry','notes'].includes(f.key))];
const availableEmployeeFields=employeeFilterFields.filter(f=>f.key==='company'||!['project_manager','projects_director'].includes(user?.role)||['name','code','job','department','project_id','employment_status'].includes(f.key));
const activeEmployeeFilters=Object.entries(employeeFieldFilters).filter(([key,value])=>value&&availableEmployeeFields.some(f=>f.key===key));
const employeeFilterMatch=(r)=>activeEmployeeFilters.every(([key,expected])=>{
 const raw=key==='company'?r.company:employeeRegisterValue(r,key,rows);
 const field=modules.employees.fields.find(f=>f.key===key);
 const shown=field&&enumOptions[field.type]?(enumOptions[field.type].find(o=>o[0]===raw)?.[1]||raw):raw;
 return normalizeSearch(shown).includes(normalizeSearch(expected));
});

const list=scoped.filter(r=>{
 if(r.module!==module)return false;
 if(module==='employees'&&Boolean(r.data?._archived)!==showArchivedEmployees)return false;
 if(module==='employees'&&!employeeFilterMatch(r))return false;
 if(linkedEmployee&&r.data?.employee_id!==linkedEmployee.id)return false;
 if(!searchWords.length)return true;
 const visibleValues=module==='employees'?[...employeeRegisterFields,...modules.employees.fields].map(f=>employeeRegisterValue(r,f.key,rows)):spec.fields.map(f=>{
   const value=r.data?.[f.key];
   if(relationModules[f.type]){
     const linked=rows.find(x=>x.id===value);
     return [linked?.data?.name,linked?.data?.code,linked?.data?.identity,linked?.data?.phone,linked?.data?.project_name].filter(Boolean).join(' ');
   }
   if(enumOptions[f.type])return [value,enumOptions[f.type].find(o=>o[0]===value)?.[1]].filter(Boolean).join(' ');
   return value;
 });
 const employee=rows.find(x=>x.id===r.data?.employee_id&&x.module==='employees');
 const haystack=normalizeSearch([r.company,companyDisplayName(r.company),r.code,r.data?.name,r.data?.code,JSON.stringify(r.data),employee?.data?.name,employee?.data?.code,employee?.data?.identity,...visibleValues].join(' '));
 return searchWords.every(word=>haystack.includes(word));
});
const name=id=>rows.find(r=>r.id===id)?.data.name||'غير متاح';
const registerDisplay=(row,f)=>{const value=employeeRegisterValue(row,f.key,rows);const original=modules.employees.fields.find(x=>x.key===f.key);return original&&enumOptions[original.type]?(enumOptions[original.type].find(o=>o[0]===value)?.[1]||'—'):value===0?'0':value||'—';};
const display=(row,f)=>row.module==='projects'&&f.key==='manager_name'?projectManagerName(row):relationModules[f.type]?name(row.data[f.key]):f.type==='number'?money(row.data[f.key]):enumOptions[f.type]?(enumOptions[f.type].find(o=>o[0]===row.data[f.key])?.[1]||'—'):row.data[f.key]||'—';
const title=row=>row.data.name||(row.data.employee_id?name(row.data.employee_id):row.data.reference||row.code||modules[row.module]?.singular||'سجل');
const fieldsFor=spec?spec.fields.filter(f=>f.type!=='internal'&&(!['project_manager','projects_director'].includes(user?.role)||module!=='employees'||['name','code','job','department','project_id','employment_status'].includes(f.key))):[];
const leaveBalanceFor=(employeeId,companyName,request=null)=>{
 const employee=rows.find(x=>x.module==='employees'&&x.id===employeeId&&x.company===companyName);
 if(!employee)return {entitled:null,used:null,remaining:null,after:null,reason:'بيانات الموظف غير متاحة'};
 const d=employee.data||{},service=annualLeave(d.hire_date);
 if(d.sponsorship==='yes'&&!service)return {entitled:null,used:null,remaining:null,after:null,reason:'يجب استكمال تاريخ التعيين'};
 const entitled=d.sponsorship==='yes'?service.accrued+Number(d.opening_leave||0):Number(d.opening_leave||0)+Number(d.legacy_ledger_adjustment||0);
 const used=rows.filter(x=>x.module==='leave'&&x.company===companyName&&x.status==='approved'&&x.data?.employee_id===employeeId&&(x.data.balance_deducted??(!x.data.leave_type||x.data.leave_type==='annual'))).reduce((sum,x)=>sum+Number(x.data.days||0),0);
 const remaining=Math.round((entitled-used)*100)/100;
 const deductible=request&&(request.balance_deducted??(!request.leave_type||request.leave_type==='annual'));
 const alreadyApproved=request?.id&&rows.some(x=>x.id===request.id&&x.module==='leave'&&x.status==='approved');
 return {entitled:Math.round(entitled*100)/100,used,remaining,after:Math.round((remaining-(deductible&&!alreadyApproved?Number(request.days||0):0))*100)/100};
};
// Keep the email stored for approval routing, but display the assigned manager's name.
const projectManagerName=row=>{
 const email=String(row.data?.manager_email||'').trim().toLowerCase();
 const manager=rows.find(r=>r.module==='project_managers'&&r.company===row.company&&String(r.data?.email||'').trim().toLowerCase()===email);
 return manager?.data?.name||row.data?.manager_name||(email?'بحاجة لمراجعة':'غير معيّن');
};
const projectRegisterFields=fieldsFor.map(f=>module==='projects'&&f.key==='manager_email'?{...f,key:'manager_name',label:'اسم مدير المشروع'}:f);
const tableFields=module==='employees'?[...employeeRegisterFields,...spec.fields.filter(f=>['iqama_expiry','contract_expiry','notes'].includes(f.key))].filter(f=>!['project_manager','projects_director'].includes(user?.role)||['name','code','job','department','project_id','employment_status'].includes(f.key)):projectRegisterFields.slice(0,7);
// Payroll previews use the imported employee source of truth. A preview is not a paid or approved payroll.
const payrollCompanies=[...new Set(rows.filter(r=>r.module==='employees').map(r=>r.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
const payrollEmployees=rows.filter(r=>r.module==='employees'&&(payrollCompany==='__all__'||r.company===payrollCompany)&&['active','نشط','على رأس العمل','علي راس العمل'].includes(String(r.data?.employment_status||r.data?.employee_status||'').trim()));
const payrollNumber=(...values)=>{const item=values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');const n=Number(item??0);return Number.isFinite(n)?n:0};
const payrollEntries=payrollEmployees.map(emp=>{
 const d=emp.data||{};
 const matched=rows.filter(r=>r.module==='payroll'&&r.data?.employee_id===emp.id&&r.data?.month===payrollMonth).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0];
 const p=matched?.data||{};
 const base=payrollNumber(d.basic,d.basic_salary);
 const housing=payrollNumber(d.housing,d.housing_allowance);
 const transport=payrollNumber(d.transport,d.transport_allowance);
 const gross=payrollNumber(d.salary,d.total_monthly_salary,base+housing+transport);
 const bonus=payrollNumber(p.bonus)+payrollNumber(p.extra_allowance);
 const deductions=payrollNumber(p.absence_deduction)+payrollNumber(p.advance_deduction)+payrollNumber(p.deductions);
 const net=matched&&p.net!==undefined?Number(p.net):Math.round((gross+bonus+payrollNumber(p.overtime)-deductions)*100)/100;
 const status=String(d.employment_status||d.employee_status||'');
 return {id:emp.id,company:emp.company,code:String(d.code||d.employee_number||emp.code||''),name:String(d.name||d.employee_name||''),status:status==='active'||status==='علي راس العمل'?'على رأس العمل':status==='inactive'||status==='موقوف'?'غير نشط':status||'غير محدد',base,housing,transport,gross,bonus,deductions,net,record:matched,payment:p.method||d.payment_method||'',cash:matched?payrollNumber(p.cash_amount):null,bank:matched?payrollNumber(p.bank_amount):null};
});
const payrollSums=payrollEntries.reduce((x,e)=>({count:x.count+1,base:x.base+e.base,housing:x.housing+e.housing,transport:x.transport+e.transport,gross:x.gross+e.gross,bonus:x.bonus+e.bonus,deductions:x.deductions+e.deductions,net:x.net+e.net,existing:x.existing+(e.record?1:0),cash:x.cash+(e.cash||0),bank:x.bank+(e.bank||0),approved:x.approved+(e.record?.status==='approved'?1:0)}),{count:0,base:0,housing:0,transport:0,gross:0,bonus:0,deductions:0,net:0,existing:0,cash:0,bank:0,approved:0});

function payrollNetDraft(d,gross,basic){
 const overtime=Math.round(Number(d.overtime_hours||0)*(gross/30/8+0.5*basic/30/8)*100)/100;
 return Math.round((gross+Number(d.bonus||0)+Number(d.extra_allowance||0)+overtime-Number(d.absence_deduction||0)-Number(d.advance_deduction||0)-Number(d.deductions||0))*100)/100;
}
function startPayrollReview(e){
 if(!canWrite(user?.role,'payroll')||!permission(user||{},'payroll','edit')){notify('ليس لديك صلاحية التعديل');return;}
 if(e.record&&e.record.status!=='draft'){notify('أعد المسير إلى المسودة أولاً');return;}
 const p=e.record?.data||{};
 setPayrollEdit({id:e.record?.id,revision:e.record?.revision,company:e.company,name:e.name,code:e.code,gross:e.gross,basic:e.base,
 data:{employee_id:e.id,month:payrollMonth,bonus:p.bonus??0,extra_allowance:p.extra_allowance??0,overtime_hours:p.overtime_hours??0,absence_days:p.absence_days??0,absence_deduction:p.absence_deduction??0,advance_deduction:p.advance_deduction??0,deductions:p.deductions??0,cash_amount:p.cash_amount??0,bank_amount:p.bank_amount??e.net,method:p.method??'bank',notes:p.notes??''}});
}
async function savePayrollReview(ev){
 ev.preventDefault();const e=payrollEdit;if(!e)return;
 const d=e.data,net=payrollNetDraft(d,e.gross,e.basic),cash=Number(d.cash_amount),bank=Number(d.bank_amount),cents=n=>Math.round(n*100);
 if(!Number.isFinite(net)||net<0||!Number.isFinite(cash)||!Number.isFinite(bank)||cash<0||bank<0||cents(cash)+cents(bank)!==cents(net)){notify('مجموع الكاش والتحويل يجب أن يساوي صافي الراتب');return;}
 setSaving(true);try{
 await post({action:'save',module:'payroll',company:e.company,...(e.id?{id:e.id,revision:e.revision}:{}),data:{...d,method:cash>0&&bank>0?'mixed':cash>0?'cash':'bank'}});
 setPayrollEdit(null);notify('تم حفظ المسير للمراجعة');await refresh();
 }catch(err){notify(err.message)}finally{setSaving(false)}
}
async function changePayrollApproval(e,decision='approve'){
 if(!e.record||!permission(user||{},'payroll','approve'))return;
 const s=e.record.status;
 if(!['draft','hr','finance'].includes(s)||user.role!=='admin'&&((s==='draft'&&!permittedWrite(user||{},'payroll'))||(s!=='draft'&&s!==user.role))){notify('هذه المرحلة ليست ضمن صلاحياتك');return;}
 let note='';
 if(decision==='return'){note=window.prompt('سبب إعادة المسير للتعديل:')||'';if(!note.trim())return;}
 if(decision==='approve'&&s==='finance'&&!window.confirm('اعتماد مستحق راتب الموظف للصرف؟ لا تُنفذ حوالة بنكية تلقائيًا.'))return;
 setSaving(true);try{await post({action:'transition',module:'payroll',id:e.record.id,revision:e.record.revision,decision,note});notify(decision==='return'?'تمت إعادة المسير للمراجعة':s==='finance'?'تم اعتماد مستحق الراتب':'تم إرسال المسير للمرحلة التالية');await refresh();}catch(err){notify(err.message)}finally{setSaving(false)}
}

function exportPayrollPreview(){
 const headers=['الشركة','الرقم الوظيفي','اسم الموظف','حالة الموظف','الراتب الأساسي','بدل السكن','بدل النقل','إجمالي الأجر','مكافآت وبدلات إضافية مسجلة','الخصومات المسجلة','صافي الاستحقاق','صرف كاش','تحويل بنكي','طريقة الصرف','شهر المسير','حالة مسير الموظف'];
 const data=payrollEntries.map(e=>[e.company,e.code,e.name,e.status,e.base,e.housing,e.transport,e.gross,e.bonus,e.deductions,e.net,e.cash??'',e.bank??'',e.payment,payrollMonth,e.record?(states[e.record.status]||e.record.status):'مبدئي غير معتمد']);
 const bytes=workbookBytes([headers,...data]);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download='مسير-الرواتب-'+(payrollCompany==='__all__'?'جميع-الشركات':payrollCompany)+'-'+payrollMonth+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const ksaMonth=new Date(Date.now()+3*3600000).toISOString().slice(0,7);
const cycleBatches=rows.filter(r=>r.module==='payroll_batches'&&r.data?.month===payrollMonth&&(payrollCompany==='__all__'||r.company===payrollCompany)).sort((a,b)=>a.company.localeCompare(b.company,'ar'));
const visibleCycleBatches=cycleBatches.filter(b=>payrollStage==='__all__'||b.status===payrollStage);
const visibleCycleIds=new Set(visibleCycleBatches.map(b=>b.id));
const cycleBatchIds=new Set(cycleBatches.map(r=>r.id));
const cyclePayroll=rows.filter(r=>r.module==='payroll'&&cycleBatchIds.has(r.data?.batch_id)).sort((a,b)=>a.company.localeCompare(b.company,'ar')||String(a.data?.employee_name||'').localeCompare(String(b.data?.employee_name||''),'ar'));
const payrollEmployeeIsActive=id=>rows.some(e=>e.module==='employees'&&e.id===id&&['active','نشط','على رأس العمل','علي راس العمل'].includes(String(e.data?.employment_status||e.data?.employee_status||'').trim()));
const cycleRowShouldShow=row=>{const batch=cycleBatches.find(b=>b.id===row.data?.batch_id);return batch?.status==='paid'||payrollEmployeeIsActive(row.data?.employee_id)};
const visibleCyclePayroll=cyclePayroll.filter(r=>visibleCycleIds.has(r.data?.batch_id)&&cycleRowShouldShow(r));
const cycleBatchFor=row=>cycleBatches.find(b=>b.id===row.data?.batch_id);
const payrollManagedBatch=cycleBatches.find(b=>b.id===payrollManageBatchId);
const payrollManagedRows=payrollManagedBatch?cyclePayroll.filter(row=>row.data.batch_id===payrollManagedBatch.id&&cycleRowShouldShow(row)):[];
const payrollManagedIncluded=payrollManagedRows.filter(row=>!row.data.excluded);
const payrollManagedReviewed=payrollManagedIncluded.filter(row=>row.data.split_confirmed).length;
const payrollStages=['draft','manager_review','projects_review','finance_review','paid'];
const payrollStageLabels=['مساعد الإدارة','مدراء المشاريع','إدارة المشاريع','المالية / الصرف'];
const payrollBatchReady=b=>{const items=cyclePayroll.filter(r=>r.data.batch_id===b.id),inCount=items.filter(r=>!r.data.excluded);return !!inCount.length&&items.length===Number(b.data.employee_count)&&inCount.every(r=>r.data.split_confirmed&&Number.isFinite(Number(r.data.net))&&Math.round((Number(r.data.cash_amount||0)+Number(r.data.bank_amount||0))*100)===Math.round(Number(r.data.net)*100)&&(!r.data.needs_review||r.data.exception_note));};
const payrollAvailableEmployees=payrollManagedBatch?rows.filter(row=>row.module==='employees'&&row.company===payrollManagedBatch.company
 &&['active','نشط','على رأس العمل','علي راس العمل'].includes(String(row.data?.employment_status||row.data?.employee_status||'').trim())
 &&!payrollManagedRows.some(item=>item.data.employee_id===row.id)):[];

const cycleNumeric=n=>Number.isFinite(Number(n))?Number(n):0;
const cycleTotals=cyclePayroll.filter(r=>!r.data.excluded).reduce((a,r)=>({count:a.count+1,gross:a.gross+cycleNumeric(r.data.salary),net:a.net+cycleNumeric(r.data.net),cash:a.cash+cycleNumeric(r.data.cash_amount),bank:a.bank+cycleNumeric(r.data.bank_amount),reviewed:a.reviewed+(r.data.split_confirmed?1:0)}),{count:0,gross:0,net:0,cash:0,bank:0,reviewed:0});
const cycleStatus={draft:'مساعد الإدارة · قيد التجهيز',manager_review:'مدراء المشاريع · تحت المراجعة',projects_review:'إدارة المشاريع · تحت الاعتماد',finance_review:'الإدارة المالية · المراجعة والصرف',paid:'تم الاعتماد والصرف',admin_review:'مرحلة سابقة · تتطلب ترحيل',finance:'مرحلة سابقة · تتطلب ترحيل'};
async function cyclePost(payload){const response=await fetch('/api/payroll-cycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,workflow_version:2})});const result=await response.json();if(!response.ok)throw Error(result.error||'تعذر تنفيذ طلب المسير');return result;}
async function cycleGenerate(){
 if(payrollMonth!==ksaMonth){notify('يسمح بتوليد مسير الشهر الحالي فقط. الأشهر السابقة للعرض دون إنشاء.');return;}
 if(!window.confirm('توليد مسير '+payrollMonth+' لمرة واحدة '+(payrollCompany==='__all__'?'لجميع الشركات':'لشركة '+payrollCompany)+'؟'))return;
 setSaving(true);try{const result=await cyclePost({action:'generate',company:payrollCompany,month:payrollMonth});notify('تم توليد '+result.generated.length+' مسير شهري للمراجعة');await refresh();}catch(e){notify(e.message);}finally{setSaving(false);}
}
function cycleEditEmployee(row){
 const b=cycleBatchFor(row);
 if(row.data.excluded){notify('أعد الموظف المستبعد إلى المسير قبل تعديله');return;}
 if(!b||!((b.status==='draft'&&['admin','administrative_assistant'].includes(user?.role))||(b.status==='manager_review'&&['admin','project_manager'].includes(user?.role)))){notify('التعديل متاح لمساعد الإدارة في التجهيز ولمدير المشروع في المراجعة فقط');return;}
 setCycleEdit({row_id:row.id,batch_id:b.id,revision:row.revision,company:row.company,name:row.data.employee_name,employee_number:row.data.employee_number,
   status:row.data.employment_status,data:{...row.data}});
}
function cycleSalarySummary(d){
 const n=k=>Number(d[k]??0);
 const round=v=>Math.round((v+Number.EPSILON)*100)/100;
 const basic=n('basic'),housing=n('housing'),transport=n('transport');
 const gross=round(basic+housing+transport);
 const overtime=round(n('overtime_hours')*(gross/30/8+0.5*basic/30/8));
 const additions=round(n('bonus')+n('extra_allowance')+overtime);
 const deductions=round(n('absence_deduction')+n('advance_deduction')+n('deductions'));
 const net=round(gross+additions-deductions);
 const bank=n('bank_amount'),cash=round(net-bank),allocated=round(cash+bank);
 const values=[gross,overtime,additions,deductions,net,cash,bank];
 const valid=values.every(Number.isFinite)&&values.every(v=>v>=0)&&round(net-allocated)===0;
 return {gross,overtime,additions,deductions,net,cash,bank,allocated,difference:round(net-allocated),valid};
}
function cyclePreviewNet(d){return cycleSalarySummary(d).net;}
async function cycleSave(ev){
 ev.preventDefault();if(!cycleEdit)return;
 const summary=cycleSalarySummary(cycleEdit.data);
 if(!summary.valid){notify('تحقق من المبالغ: يجب أن يساوي مجموع الكاش والتحويل صافي الراتب وألا توجد مبالغ سالبة');return;}
 setSaving(true);try{await cyclePost({action:'update',batch_id:cycleEdit.batch_id,row_id:cycleEdit.row_id,revision:cycleEdit.revision,data:{...cycleEdit.data,cash_amount:summary.cash,bank_amount:summary.bank}});setCycleEdit(null);notify('تم حفظ تعديل الموظف في مسير الشهر فقط');await refresh();}catch(e){notify(e.message)}finally{setSaving(false)}
}
async function cycleAddEmployee(){
 const batch=payrollManagedBatch;
 if(!batch||batch.status!=='draft'||!['admin','administrative_assistant'].includes(user?.role))return notify('الإضافة متاحة لمساعد الإدارة قبل الإرسال فقط');
 if(!payrollAddEmployeeId)return notify('اختر الموظف المطلوب إضافته');
 if(!window.confirm('إضافة الموظف إلى مسير '+batch.company+' لشهر '+batch.data.month+'؟ يجب مراجعة توزيعه المالي قبل الإرسال.'))return;
 setSaving(true);
 try{await cyclePost({action:'add_employee',batch_id:batch.id,batch_revision:batch.revision,employee_id:payrollAddEmployeeId});
  setPayrollAddEmployeeId('');notify('تم إضافة الموظف إلى مسير الشركة؛ راجع الراتب والكاش والتحويل');await refresh();
 }catch(err){notify(err.message)}finally{setSaving(false)}
}
async function cycleExcludeEmployee(row){
 const batch=cycleBatchFor(row);
 if(!batch||batch.status!=='draft'||!['admin','administrative_assistant'].includes(user?.role))return;
 const reason=window.prompt('سبب استبعاد الموظف من مسير '+batch.data.month+' (لن تُحذف بياناته الأساسية من شؤون الموظفين):');
 if(!reason?.trim())return;
 if(!window.confirm('تأكيد استبعاد '+row.data.employee_name+' من مسير '+batch.company+' للشهر الحالي؟ ستظل بيانات الموظف الأصلية محفوظة، ويمكن إعادته قبل الاعتماد.'))return;
 setSaving(true);
 try{await cyclePost({action:'exclude',batch_id:batch.id,row_id:row.id,revision:row.revision,reason});notify('تم استبعاد الموظف من مسير الشهر دون حذف ملفه الوظيفي');await refresh();}
 catch(e){notify(e.message)}finally{setSaving(false)}
}
async function cycleRestoreEmployee(row){
 const batch=cycleBatchFor(row);
 if(!batch||batch.status!=='draft'||!['admin','administrative_assistant'].includes(user?.role))return;
 setSaving(true);
 try{await cyclePost({action:'restore',batch_id:batch.id,row_id:row.id,revision:row.revision});notify('أعيد الموظف إلى مسير الشهر؛ راجع مبالغ الصرف قبل الإرسال');await refresh();}
 catch(e){notify(e.message)}finally{setSaving(false)}
}
async function cycleTransition(b,action){
 let extras={};
 if(action==='return'){const note=window.prompt('سبب إعادة المسير إلى التجهيز:');if(!note?.trim())return;extras.note=note;}
 if(action==='finance_pay'){const reference=window.prompt('مرجع إثبات صرف الرواتب (الحوالة/سند الصرف):');if(!reference?.trim())return;if(!window.confirm('هل تؤكد صرف جميع مستحقات مسير '+b.company+' لشهر '+b.data.month+' بالفعل؟ سيُفتح إصدار سندات الاستلام بعد التأكيد.'))return;extras.reference=reference;extras.confirm_payment=true;}
 if(action==='managers_approve'&&!window.confirm('هل اكتملت مراجعة جميع مدراء المشاريع وإرسال المسير لإدارة المشاريع؟'))return;
 
 if(action==='projects_approve'&&!window.confirm('اعتماد إدارة المشاريع وإرسال المسير إلى الإدارة المالية للمراجعة والصرف؟'))return;
 setSaving(true);try{await cyclePost({action,batch_id:b.id,...extras});notify(action==='finance_pay'?'تم توثيق الصرف وإتاحة سندات الاستلام':'تم تحديث مرحلة اعتماد المسير');await refresh();return true;}catch(e){notify(e.message);return false;}finally{setSaving(false);}
}
async function cycleBulkSubmit(){
 const selected=cycleBatches.filter(b=>payrollBulkSelected.includes(b.id));
 if(!selected.length)return notify('حدد مسير شركة واحدة على الأقل');
 if(selected.some(b=>b.status!=='draft'||!payrollBatchReady(b)))return notify('بعض المسيرات المختارة لم تكتمل مراجعة بياناتها');
 if(!window.confirm('إرسال '+selected.length+' مسير شركات دفعة واحدة إلى مدراء المشاريع؟'))return;
 setSaving(true);
 try{const result=await cyclePost({action:'bulk_submit',month:payrollMonth,batch_ids:selected.map(b=>b.id),revisions:Object.fromEntries(selected.map(b=>[b.id,b.revision]))});
  notify('تم إرسال '+result.submitted+' مسير بنجاح لمدراء المشاريع');setPayrollBulkSelected([]);await refresh();
 }catch(e){notify(e.message)}finally{setSaving(false)}
}
function cycleExport(){
 const head=['الشركة','الشهر','الرقم الوظيفي','اسم الموظف','الراتب الأساسي','بدل السكن','بدل النقل','المكافآت','بدلات أخرى','ساعات إضافية','قيمة الإضافي','خصم الغياب','خصم السلف','خصومات أخرى','الصافي','التحويل البنكي (المبلغ المدخل)','المتبقي كاش (محسوب)','حالة المراجعة','حالة إدراج الموظف','حالة المسير'];
 const data=cyclePayroll.map(r=>{const d=r.data,b=cycleBatchFor(r);return [r.company,d.month,d.employee_number,d.employee_name,d.basic,d.housing,d.transport,d.bonus,d.extra_allowance,d.overtime_hours,d.overtime,d.absence_deduction,d.advance_deduction,d.deductions,d.net,d.excluded?0:Number(d.bank_amount||0),d.excluded?0:Math.round((Number(d.net||0)-Number(d.bank_amount||0))*100)/100,d.split_confirmed?'مراجع':'غير مراجع',d.excluded?'مستبعد من المسير':'مدرج',cycleStatus[b?.status]||b?.status||''];});
 const bytes=workbookBytes([head,...data]);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download='مسيرات-'+payrollMonth+'-'+(payrollCompany==='__all__'?'جميع-الشركات':payrollCompany)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function cyclePrint(){
 if(!cyclePayroll.length){notify('لا توجد بيانات لمسير الشهر المختار للطباعة');return;}
 const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const lines=cyclePayroll.filter(r=>!r.data.excluded);
 const total=k=>lines.reduce((n,r)=>n+Number(r.data[k]||0),0);
 const title=payrollCompany==='__all__'?'جميع الشركات':payrollCompany;
 const header=['م','الشركة','الرقم الوظيفي','اسم الموظف','الحالة','الأساسي','بدل السكن','بدل النقل','إجمالي الأجر','مكافآت وبدلات','الساعات الإضافية','قيمة الساعات الإضافية','الخصومات','صافي الاستحقاق','كاش','تحويل بنكي','المراجعة'];
 const tr=(cells,cls='')=>'<tr class="'+cls+'">'+cells.map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>';
 const detail=lines.map((r,i)=>{const d=r.data;return tr([i+1,r.company,d.employee_number,d.employee_name,(['inactive','موقوف','غير نشط'].includes(String(d.employment_status)))?'غير نشط':'نشط',money(d.basic),money(d.housing),money(d.transport),money(d.salary),money(Number(d.bonus||0)+Number(d.extra_allowance||0)),money(d.overtime_hours),money(d.overtime),money(Number(d.absence_deduction||0)+Number(d.advance_deduction||0)+Number(d.deductions||0)),money(d.net),money(d.cash_amount),money(d.bank_amount),d.split_confirmed?'مراجع':'غير مراجع'])}).join('');
 const totalRow=tr(['الإجمالي','','',lines.length+' موظف','',money(total('basic')),money(total('housing')),money(total('transport')),money(total('salary')),money(total('bonus')+total('extra_allowance')),money(total('overtime_hours')),money(total('overtime')),money(total('absence_deduction')+total('advance_deduction')+total('deductions')),money(total('net')),money(total('cash_amount')),money(total('bank_amount')),''],'total');
 const printableLogo=title==='جميع الشركات'?'':companyLogoPath(title,rows);
 const logosrc=printableLogo?safe(window.location.origin+printableLogo):'';
 const printableCompanyName=title==='جميع الشركات'?'مسير رواتب جميع الشركات':companyOfficialName(title,rows);
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مسير رواتب ${safe(title)} - ${safe(payrollMonth)}</title><style>
 @page{size:A3 landscape;margin:10mm}body{font:11px Tajawal,Tahoma,Arial,sans-serif;color:#23332e;padding:8px;direction:rtl}header{display:grid;grid-template-columns:1fr 105px 1.4fr;gap:20px;align-items:center;border-top:1px solid #e7e1d4;margin-bottom:15px;padding:12px 0}header img{width:105px;height:90px;object-fit:contain}header .brand{text-align:center;border-bottom:2px solid #b3a06a;padding-bottom:8px}header .reg{text-align:center;border-bottom:2px solid #b3a06a;padding-bottom:8px}h1{font-size:19px;margin:4px 0}p{margin:6px 0}table{border-collapse:collapse;width:100%;font-size:9px;table-layout:auto}th,td{border:1px solid #b9aa88;padding:6px 4px;text-align:center;white-space:normal}th{background:#eee7d6}tr:nth-child(even){background:#fbfaf6}.total{background:#e8dec3;font-weight:bold}.sign{display:flex;justify-content:space-around;gap:20px;margin-top:34px}.sign>div{border-top:1px solid #8a8a8a;padding-top:9px;flex:1;text-align:center;min-height:35px}footer{font-size:10px;margin-top:12px}button{padding:9px 16px;background:#b39247;border:0}@media print{button{display:none}}
 </style></head><body><header><div class="reg">سجل تجاري: ${safe(title==='مسكن الكيان'?'7028881634':'—')}</div>${logosrc?'<img src="'+logosrc+'" alt="شعار الشركة"/>':''}<div class="brand"><strong style="font-size:18px">${safe(printableCompanyName)}</strong><p style="font-size:11px;font-weight:bold">${safe(title)}</p></div></header><h1 style="text-align:center">مسير الرواتب الشهري</h1><div style="display:flex;justify-content:space-between;border:1px solid #777;padding:10px;margin:10px 0"><span>الشركة: ${safe(title)}</span><span>الشهر: ${safe(payrollMonth)}</span><span>عدد الموظفين: ${lines.length}</span></div><p>حالة الاعتماد: ${safe(cycleBatches.map(b=>b.company+': '+(cycleStatus[b.status]||b.status)).join(' | '))}</p>
 <table><thead><tr>${header.map(h=>'<th>'+safe(h)+'</th>').join('')}</tr></thead><tbody>${detail}${totalRow}</tbody></table>
 <div class="sign"><div>إعداد مساعد الإدارة</div><div>مراجعة مدراء المشاريع</div><div>اعتماد إدارة المشاريع</div><div>مراجعة وصرف المالية</div></div>
 <footer>هذه طباعة من سجل المنصة في تاريخ ${safe(new Date().toLocaleString('ar-SA'))}. لا تُعد دليلًا على صرف المبالغ ما لم تكن حالة المسير «تم الصرف».</footer>
 <button onclick="window.print()">طباعة / حفظ PDF</button></body></html>`;
 const w=window.open('','_blank');if(!w){notify('يرجى السماح بالنوافذ المنبثقة للطباعة');return;}w.document.open();w.document.write(html);w.document.close();
}
function cycleReceipt(row){
 const b=cycleBatchFor(row);
 if(!b||b.status!=='paid'||row.data.excluded){notify('لا يمكن توليد سند استلام لموظف مستبعد أو قبل توثيق الصرف');return;}
 const d=row.data||{};
 const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const val=(name,value)=>'<tr><th>'+safe(name)+'</th><td>'+safe(value)+'</td></tr>';
 const receiptLogo=companyLogoPath(b.company,rows);
 const logoUrl=receiptLogo?safe(window.location.origin+receiptLogo):'';
 const receipt='SAL-'+b.data.month.replace('-','')+'-'+String(d.employee_number||row.id).replace(/[^a-zA-Z0-9-]/g,'');
 const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>سند استلام راتب ${safe(receipt)}</title><style>
 @page{size:A4;margin:16mm}body{font-family:Tajawal,Tahoma,Arial,sans-serif;color:#183b33;padding:12px;direction:rtl}header{text-align:center;border-bottom:3px solid #b89756;padding-bottom:16px;margin-bottom:22px}header img{width:85px;height:75px;object-fit:contain}
 h1{font-size:23px;margin:10px}h2{font-size:17px}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #d3ccb8;padding:10px;text-align:right}th{width:40%;background:#f4efe2}.foot{border-top:1px solid #d2c6a9;margin-top:25px;padding-top:15px;display:grid;grid-template-columns:1fr 1fr;gap:22px}.sign{border-bottom:1px dotted #888;height:48px;margin-top:18px}.note{background:#faf5e9;padding:12px}button{padding:10px 20px;background:#ad8a42;border:0;cursor:pointer}@media print{button{display:none}}
 </style></head><body><header>${logoUrl?'<img src="'+logoUrl+'" alt="شعار الشركة">':''}<h2>${safe(companyOfficialName(b.company,rows))}</h2><h1>سند استلام راتب شهري</h1><p>سند رقم: ${safe(receipt)} | شهر: ${safe(b.data.month)}</p></header>
 <table>${val('اسم الموظف',d.employee_name)}${val('الرقم الوظيفي',d.employee_number)}${val('الشركة',b.company)}${val('الراتب الأساسي',money(d.basic)+' ريال')}${val('بدل السكن',money(d.housing)+' ريال')}${val('بدل النقل',money(d.transport)+' ريال')}${val('عدد الساعات الإضافية',money(d.overtime_hours)+' ساعة')}${val('قيمة الساعات الإضافية',money(d.overtime)+' ريال')}${val('إجمالي الاستحقاق الصافي',money(d.net)+' ريال')}${val('المبلغ المستلم نقدًا',money(d.cash_amount)+' ريال')}${val('المبلغ المحول بنكيًا',money(d.bank_amount)+' ريال')}${val('مرجع إثبات الصرف',b.data.payment_reference)}${val('تاريخ الصرف',new Date(b.data.paid_at).toLocaleDateString('ar-SA'))}</table>
 <p class="note">أقر أنا الموظف الموضحة بياناته أعلاه باستلام مبالغ راتب الشهر حسب طريقتَي الصرف الموضحتين، مع مراعاة مطابقة التحويل البنكي لكشف البنك الفعلي.</p>
 <div class="foot">${['الموظف المستلم','المسؤول المباشر / مدير المشروع','شؤون الموظفين','المدير المخوّل'].map(n=>'<div><strong>'+n+'</strong><div class="sign"></div>الاسم: ...........................<p>التاريخ: ........................</p></div>').join('')}</div>
 <p style="font-size:11px;margin-top:22px">صُدر هذا السند من منصة شؤون الموظفين بعد توثيق الصرف؛ ولا يغني عن إثبات التحويل البنكي أو توقيع استلام النقد.</p><button onclick="window.print()">طباعة السند / حفظ PDF</button></body></html>`;
 const w=window.open('','_blank');if(!w){notify('فعّل السماح بالنوافذ المنبثقة لطباعة السند');return;}w.document.open();w.document.write(html);w.document.close();
}
const approved=scoped.filter(r=>r.status==='approved'),employeeCount=scoped.filter(r=>r.module==='employees').length,projectCount=scoped.filter(r=>r.module==='leave'&&r.status==='approved').length,contractTotal=scoped.filter(r=>r.module==='payroll').reduce((n,r)=>n+Number(r.data.net||0),0),pending=scoped.filter(r=>!['draft','approved','cancelled'].includes(r.status)).length;
function linkedEmployeeFor(form){
 if(!form)return null;
 const leave=form.data?.leave_id?rows.find(r=>r.id===form.data.leave_id&&r.module==='leave'&&r.company===form.company):null;
 const employeeId=form.data?.employee_id||leave?.data.employee_id;
 return rows.find(r=>r.module==='employees'&&r.id===employeeId&&r.company===form.company)||null;
}
function applyEmployeeToForm(employeeId){
 const employee=rows.find(r=>r.module==='employees'&&r.id===employeeId&&r.company===edit.company);
 const d=employee?.data||{};
 const changes={employee_id:employeeId};
 if(module==='settlements'&&employee){
  Object.assign(changes,{monthly_salary:String(d.salary||0),beneficiary_name:d.name||'',beneficiary_identity:d.identity||'',bank_name:d.bank||'',iban:d.iban||''});
 }
 if(module==='leave'&&employee)changes.contact_phone=d.phone||'';
 if(module==='appointments'&&employee){
  const project=rows.find(r=>r.module==='projects'&&r.id===d.project_id&&r.company===edit.company);
  changes.direct_manager=project?.data.manager_name||d.manager||'';
  changes.work_location=project?.data.name||d.department||'';
 }
 setEdit({...edit,data:{...edit.data,...changes,project_id:d.project_id||''}});
}
function applyLeaveToForm(leaveId){
 const leave=rows.find(r=>r.module==='leave'&&r.id===leaveId&&r.company===edit.company);
 const employee=leave?rows.find(r=>r.module==='employees'&&r.id===leave.data.employee_id&&r.company===edit.company):null;
 const next={...edit.data,leave_id:leaveId};
 if(module==='leave_dues'){
  next.employee_id=employee?.id||'';
  next.salary_basis=employee?String(employee.data.salary||0):'0';
  next.days=leave?String(leave.data.days||0):'0';
 }
 if(module==='returns')next.employee_id=employee?.id||'';
 setEdit({...edit,data:next});
}
function applyLeaveField(key,value){
 const next={...edit.data,[key]:value};
 const fixed=fixedLeaveDays(next.leave_type);
 if(fixed!==null&&(key==='leave_type'||key==='start')){
  const days=fixedLeaveDays(next.leave_type);
  next.days=String(days);next.end=leaveEndDate(next.start,days);
 }else if(key==='start'&&next.start&&next.end&&next.end<next.start)next.end=next.start;
 const raw=String(next.holiday_dates||'').split(',').filter(Boolean);
 if(next.start&&next.end){
  next.expected_return=leaveNextDate(next.end);
  next.holiday_dates=[...new Set(raw.filter(date=>date>=next.start&&date<=next.end))].sort().join(',');
  if(fixed!==null)next.holiday_policy='include';
  try{const days=leaveChargedDays(next.start,next.end,next.holiday_dates,next.holiday_policy||'include');next.days=days===null?'':String(days);}catch{next.days='';}
 }else {next.days='';next.expected_return='';}
 if(key==='ticket'&&value==='no')next.ticket_due_date='';
 setEdit({...edit,data:next});
}
function addLeaveHolidayDate(){
 if(!leaveHolidayCandidate||!edit?.data)return;
 const {start,end}=edit.data;
 if(!start||!end||leaveHolidayCandidate<start||leaveHolidayCandidate>end){notify('يجب أن يكون يوم العطلة داخل فترة الإجازة');return}
 const dates=String(edit.data.holiday_dates||'').split(',').filter(Boolean);
 if(dates.includes(leaveHolidayCandidate)){notify('هذا اليوم مضاف مسبقًا');return}
 applyLeaveField('holiday_dates',[...dates,leaveHolidayCandidate].sort().join(','));
 setLeaveHolidayCandidate('');
}
const managerDirectoryForRequest=(record,companyName)=>{
 const employee=rows.find(r=>r.id===record?.data?.employee_id&&r.module==='employees');
 const employeeData=employee?.data||{};
 const directRef=employeeData.direct_manager_id||record?.data?.employee_snapshot?.direct_manager_id;
 const directRow=rows.find(r=>r.id===directRef&&r.company===companyName&&r.module==='project_managers');
 const projectId=record?.data?.project_id||employeeData.project_id;
 const project=rows.find(r=>r.id===projectId&&r.module==='projects'&&(r.company===companyName||Array.isArray(r.data?._shared_companies)&&r.data._shared_companies.includes(companyName)));
 if(!project)return {project:'غير محدد',name:'',email:'',phone:'',direct_name:directRow?.data.name||employeeData.manager||'',direct_email:directRow?.data.email||employeeData.manager_email||''};
 const projectManager=rows.find(r=>r.module==='project_managers'&&r.company===companyName&&String(r.data.email||'').toLowerCase()===String(project.data.manager_email||'').toLowerCase());
 return {project:project.data.name||'',name:projectManager?.data.name||project.data.manager_name||'',email:project.data.manager_email||'',phone:projectManager?.data.phone||project.data.manager_phone||'',direct_name:projectManager?.data.name||project.data.manager_name||directRow?.data.name||employeeData.manager||'',direct_email:project.data.manager_email||directRow?.data.email||employeeData.manager_email||''};
};
function startEdit(row){
 setFormError('');
 if(module==='projects'){setProjectCompanySearch('');setProjectManagerSearch('')}
 if(module==='project_managers')setManagerRecordSearch('');
 if(module==='employees'){setEmployeeReadOnly(false);setEmployeeProjectSearch('');setEmployeeManagerSearch('')}
 if(!company&&!row){notify('اختر الشركة أولاً، ثم أضف السجل');return}
 if(row){setLeaveHolidayCandidate('');setEdit({...row,data:{...row.data,holiday_policy:row.data.holiday_policy||'include',ticket:row.data.ticket==='نعم'?'yes':row.data.ticket==='لا'?'no':row.data.ticket||'no',expected_return:module==='leave'?leaveNextDate(row.data.end):row.data.expected_return}});return}
 // A genuinely new employee must never inherit an existing record id, revision, or transfer details.
 const defaultData=Object.fromEntries(spec.fields.map(f=>[f.key,f.type==='number'?'0':f.type==='date'?saudiDate():f.type==='month'?saudiDate().slice(0,7):f.type==='sponsorship'?'yes':f.type==='method'?'bank':f.type==='employment'?'active':f.type==='leave_type'?'annual':f.type==='warning_type'?'first':f.type==='case_status'?'draft':'']));
 if(module==='leave'){defaultData.holiday_policy='include';defaultData.holiday_dates='';defaultData.days='1';defaultData.ticket='no';defaultData.ticket_due_date='';defaultData.expected_return=leaveNextDate(defaultData.end);}if(module==='advances'){defaultData.installments='1';defaultData.first_month=saudiDate().slice(0,7);}setLeaveHolidayCandidate('');setEdit({company,data:defaultData});
}
function exportRows(){const fields=module==='employees'?tableFields:projectRegisterFields,extras=[...new Set(list.flatMap(r=>Object.keys(r.data.extra_fields||{})))];const financial=false;const headers=['الشركة',...fields.map(f=>f.label),...(financial?['الراتب الأساسي (65%)','بدل السكن (25%)','بدل الترحيل (10%)','الاستحقاق السنوي الحالي','الرصيد المتبقي الحالي']:[]),...extras,'مرحلة الاعتماد'];const data=list.map(r=>{const used=rows.filter(x=>x.module==='leave'&&x.status==='approved'&&(x.data.balance_deducted??(!x.data.leave_type||x.data.leave_type==='annual'))&&x.data.employee_id===r.id).reduce((n,x)=>n+Number(x.data.days),0);const service=annualLeave(r.data.hire_date);const balance=r.data.sponsorship==='yes'?(service?service.accrued+Number(r.data.opening_leave||0)-used:'أكمل تاريخ التعيين'):Number(r.data.opening_leave||0)+Number(r.data.legacy_ledger_adjustment||0)-used;return [r.company,...fields.map(f=>module==='employees'?employeeRegisterValue(r,f.key,rows):module==='projects'&&f.key==='manager_name'?projectManagerName(r):r.data[f.key]??''),...(financial?[Number(r.data.basic||0),Number(r.data.housing||0),Number(r.data.transport||0),r.data.sponsorship==='yes'?(service?.annual??''):r.data.annual_days||'',balance]:[]),...extras.map(k=>r.data.extra_fields?.[k]??''),states[r.status]||r.status]});const bytes=workbookBytes([headers,...data]);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download=module+'-export.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function printModuleRegister(){
 if(!spec)return;
 const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const chosenCompany=company||'جميع الشركات';
 const profile=rows.find(r=>r.module==='company_profiles'&&r.company===company);
 const companyName=company?companyOfficialName(company,rows):chosenCompany;
 const fields=module==='employees'?tableFields:projectRegisterFields;
 const limited=fields.slice(0,8);
 const tableHeaders=['م','الشركة',...limited.map(f=>f.label),'الحالة'];
 const cells=entry=>[entry.index+1,entry.row.company,...limited.map(f=>module==='employees'?registerDisplay(entry.row,f):display(entry.row,f)),states[entry.row.status]||entry.row.status||'—'];
 const td=(value,tag='td')=>'<'+tag+'>'+safe(value)+'</'+tag+'>';
 const tableRows=list.map((row,index)=>'<tr>'+cells({row,index}).map(value=>td(value)).join('')+'</tr>').join('');
 const emptyBody='<tr><td colspan="'+tableHeaders.length+'" class="empty-state">لا توجد سجلات مسجلة ضمن الشركة أو الفلاتر المحددة. هذا نموذج استعراض فارغ وليس مستندًا معتمدًا.</td></tr>';
 const contact=[profile?.data.phone,profile?.data.mobile,profile?.data.email,profile?.data.website,profile?.data.address].filter(Boolean).map(safe).join(' | ');
 const registerLogoPath=company?companyLogoPath(company,rows):'';
 const logo=registerLogoPath?safe(window.location.origin+registerLogoPath):'';
 const registrationLogo=logo?'<img src="'+logo+'" alt="شعار '+safe(companyName)+'">':'';
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(spec.label)} - ${safe(chosenCompany)}</title><style>
 @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:13px/1.6 Tahoma,Arial,sans-serif;color:#272821;direction:rtl;margin:0;padding:12px}header{display:grid;grid-template-columns:170px minmax(0,1fr);gap:16px;align-items:center;min-height:100px;padding:9px 0 13px;border-bottom:2px solid #b3a06a;direction:rtl}header .brand-block{display:flex;align-items:center;gap:16px;min-width:0}header>div{min-width:0}header img{width:104px;height:82px;flex:0 0 104px;object-fit:contain}header .brand{text-align:right;padding:0 8px 7px;min-width:0;flex:1;overflow-wrap:normal;word-break:normal}header .brand strong{display:block;font-size:20px;line-height:1.55;font-weight:800;white-space:normal;word-break:normal}header .brand small{display:block;font:700 12px Tahoma,Arial,sans-serif;margin-top:3px;line-height:1.5}header .registration{text-align:right;font-size:12px;color:#5c523c}h1{text-align:center;font-size:21px;margin:12px 0 4px;font-weight:800}h2{text-align:center;font-size:13px;color:#957839;margin:0 0 12px}.info{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #555;background:#fff;margin-bottom:15px;gap:0}.info span{padding:11px;text-align:center;border-left:1px solid #555;font-weight:700}.info span:last-child{border-left:0}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #8e8c80;padding:10px 8px;text-align:right;overflow-wrap:anywhere;font-size:12px;line-height:1.65}th{background:#eae3d0;color:#282820;font-weight:bold}tr{break-inside:avoid}tbody tr:nth-child(even){background:#fcfaf5}.empty-state{text-align:center;height:65px;color:#796d56;font-size:13px}.approval-title{margin-top:19px;border:1px solid #777;background:#fff;padding:10px;text-align:center;font-weight:700}.approval{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #777;border-top:0}.approval>div{min-height:108px;padding:12px;border-left:1px solid #777}.approval>div:last-child{border-left:0}.approval p{margin-top:18px;border-bottom:1px dotted #888;width:90%}footer{border-top:2px solid #ad985f;margin-top:16px;padding:10px;text-align:center;font-size:11px;overflow-wrap:anywhere}.notice{font-size:11px;color:#797265;margin-top:10px;text-align:center}button{background:#b9964b;color:#1e1b13;border:0;padding:10px 15px;margin:20px 0;cursor:pointer}@media print{button{display:none}body{padding:0}th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 </style></head><body><header><div class="registration">سجل تجاري: ${safe(profile?.data.commercial_registration||(company==='مسكن الكيان'?'7028881634':'—'))}</div><div class="brand-block">${registrationLogo}<div class="brand"><strong>${safe(companyName)}</strong><small>${company==='مسكن الكيان'?'MASKAN ALKAYAN CONTRACTING CO.':safe(companyName)}</small></div></div></header><div class="party" style="display:flex;justify-content:space-between;margin:13px 0;font-weight:bold"><span>السادة: ${safe(companyName)}</span><span>المحترمون</span></div><h1>${safe(spec.label)}</h1><h2>${safe(spec.singular)} | سجل النماذج</h2><div class="info"><span>الشركة: ${safe(chosenCompany)}</span><span>عدد السجلات: ${list.length}</span><span>تاريخ الإصدار: ${safe(new Date().toLocaleDateString('ar-SA'))}</span></div><table><thead><tr>${tableHeaders.map(h=>td(h,'th')).join('')}</tr></thead><tbody>${tableRows||emptyBody}</tbody></table><div class="approval-title">الاعتماد والتوقيع / APPROVAL & SIGNATURE</div><div class="approval">${['إعداد شؤون الموظفين','مدير المشروع','الجهة المختصة','الاعتماد'].map(t=>'<div><b>'+safe(t)+'</b><p>الاسم:</p><p>التوقيع:</p></div>').join('')}</div><div class="notice">الاعتمادات الورقية لا تغيّر حالة اعتماد السجلات الإلكترونية. لا يُعد هذا التقرير دليلًا على الصرف.</div><footer>${contact||safe(companyName)+' | إدارة شؤون الموظفين'}</footer><button onclick="window.print()">طباعة / حفظ PDF</button></body></html>`;
 const win=window.open('','_blank');if(!win){notify('اسمح بالنوافذ المنبثقة لفتح قالب الطباعة الرسمي');return;}
 win.document.open();win.document.write(html);win.document.close();
}
function template(){const bytes=workbookBytes([['الشركة',...(module==='employees'?[...new Set([...employeeRegisterFields.map(f=>f.label),...spec.fields.map(f=>f.label)])]:spec.fields.map(f=>f.label))]]);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download=module+'-template.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function readImport(file){try{if(!file)return;if(file.size>2e6)throw Error('الحد الأقصى 2 ميجابايت');const data=file.name.toLowerCase().endsWith('.xlsx')?readXlsx(new Uint8Array(await file.arrayBuffer())):csvParse(await file.text()),headers=data.shift();if(!headers.includes('الشركة'))throw Error('استخدم القالب الذي يتضمن عمود الشركة');if(data.length>500)throw Error('الحد الأقصى 500 سجل لكل دفعة');const aliases={code:['الرقم الوظيفي'],name:['اسم الموظف','الاسم الكامل'],identity:['الهوية أو الإقامة','رقم الهوية/الإقامة'],home_phone:['هاتف الموظف في البلد الأم'],payment_method:['طريقة الصرف'],hire_date:['تاريخ التعيين'],opening_leave:['رصيد افتتاحي للإجازات'],annual_days:['الاستحقاق السنوي'],sponsorship:['حالة الكفالة'],salary:['الأجر الشهري الإجمالي'],job:['المسمى الوظيفي'],project_id:['رقم المشروع','اسم المشروع'],bank:['البنك'],method:['طريقة الصرف']};const prepared=data.map((r,i)=>({line:i+2,company:canonicalCompany(r[headers.indexOf('الشركة')]),data:Object.fromEntries(spec.fields.map(f=>{let j=headers.indexOf(f.label);if(j<0)j=headers.findIndex(h=>(aliases[f.key]||[]).includes(h));let v=r[j]??'';if(relationModules[f.type]&&v){const target=rows.filter(row=>row.module===relationModules[f.type]&&(row.company===canonicalCompany(r[headers.indexOf('الشركة')])||(row.data._shared_companies||[]).includes(canonicalCompany(r[headers.indexOf('الشركة')])))&&(row.id===v||String(row.data._legacy?.id)===String(v)||row.data.code===v||row.data.name===v));if(target.length===1)v=target[0].id;}if(f.type==='date'&&/^\d+(\.\d+)?$/.test(v)&&Number(v)>20000)v=new Date(Date.UTC(1899,11,30)+Number(v)*86400000).toISOString().slice(0,10);if(enumOptions[f.type])v=enumOptions[f.type].find(o=>o[0]===v||o[1]===v)?.[0]||v||({sponsorship:'unknown',employment:'needs_review',method:'bank'}[f.type]||'');return [f.key,v]}))}));setImportRows(prepared)}catch(e){notify(e.message)}}
async function confirmImport(){setSaving(true);let ok=0,failed=[];for(const r of importRows){try{await post({action:'save',module,...r});ok++}catch(e){failed.push({...r,error:e.message})}}setImportRows(failed.length?failed:null);notify(`تم حفظ ${ok} سجل. تعذر حفظ ${failed.length} سجل.`);setSaving(false);await refresh()}
const memberRoleLabel={admin:'المدير العام',administrative_assistant:'مساعد الإدارة',hr:'شؤون الموظفين',finance:'الإدارة المالية',project_manager:'مدير مشروع',projects_director:'إدارة المشاريع',administrative_manager:'المدير الإداري',employee:'موظف'};
const memberSearchText=x=>[x.email,x.username||'',memberRoleLabel[x.role]||x.role,x.role,x.companies||'',x.projects||'',...Object.entries(permissionMap(x.permissions)).map(([key,value])=>key+':'+value)].join(' ').toLocaleLowerCase('ar');
const financePermissions=(role,raw,action)=>{const p=permissionMap(raw);if(role==='admin')return true;const v=p['client_finance:'+action];if(typeof v==='boolean')return v;return action==='view'?['finance','hr','projects_director'].includes(role):action==='edit'?role==='finance':false};
const financeModules=[...Object.keys(modules),'client_finance'];
const memberPermissionRows=m=>financeModules.map(k=>{const stored=permissionMap(m.permissions);const permitted=(action)=>k==='client_finance'?financePermissions(m.role,stored,action):m.role==='admin'||(action==='view'?permittedRead(m,k):action==='edit'?permittedWrite(m,k):permittedRead(m,k)&&permissionChoice(m.role,stored,k,'approve'));return {key:k,label:modules[k]?.label||'المطالبات المالية واستحقاقات العملاء',source:['view','edit','approve'].some(a=>typeof stored[k+':'+a]==='boolean')?'مخصص':'افتراضي للدور',view:permitted('view'),edit:permitted('edit'),approve:permitted('approve'),saved:stored}});
const visibleMembers=members.filter(m=>(!memberSearch||memberSearchText(m).includes(memberSearch.trim().toLocaleLowerCase('ar')))&&(!memberRoleFilter||m.role===memberRoleFilter)&&(!memberUserFilter||(memberUserFilter==='named'?!!m.username:!m.username))&&(!memberStatusFilter||(memberStatusFilter==='active'?m.is_active!==false:memberStatusFilter==='inactive'?m.is_active===false:false)));
function memberExport(){const data=[['البريد الإلكتروني','اسم المستخدم','الدور','الشركات','المشاريع'],...visibleMembers.map(m=>[m.email,m.username||'',memberRoleLabel[m.role]||m.role,m.companies,m.projects])];const csv=data.map(row=>row.map(csvEscape).join(',')).join('\\r\\n');download('maskan_hr_users.csv',csv);}
function memberPrint(){window.print();}
const allowed=Object.keys(modules).filter(k=>k!=='payroll_batches'&&user&&permittedRead(user,k));
const clientFinanceAuthorized=user&&financePermissions(user.role,user.permissions,'view');
const pendingRequestTypes=['leave','advances','payroll_batches','resignations','returns','terminations','leave_dues','settlements','warnings','appointments'];
const accessiblePendingTypes=pendingRequestTypes.filter(k=>user&&permittedRead(user,k));
const approvalStages=[{id:'draft',label:'إعداد الطلب'},{id:'project_manager',label:'مدير المشروع'},{id:'projects_director',label:'إدارة المشاريع'},{id:'hr',label:'شؤون الموظفين'},{id:'finance',label:'المالية'},{id:'approved',label:'معتمد'}];
 const approvalStateIndex=stage=>Math.max(0,approvalStages.findIndex(x=>x.id===stage));
 const pendingStages=['draft','returned','project_manager','projects_director','hr','finance','manager_review','projects_review','finance_review'];
const pendingRecordIndex=new Map(rows.map(r=>[r.id,r]));
const pendingRequestRows=rows.filter(r=>user?.role!=='project_manager'||(r.module==='payroll_batches'&&r.status==='manager_review')||r.status==='project_manager').filter(r=>accessiblePendingTypes.includes(r.module)&&pendingStages.includes(r.status)&&(!company||r.company===company)&&(!pendingType||r.module===pendingType)&&(!pendingStage||r.status===pendingStage)).filter(r=>r.module!=='payroll_batches'||(rows.some(item=>item.module==='payroll'&&item.data?.batch_id===r.id&&!item.data?.excluded))).filter(r=>{
 if(!pendingSearch.trim())return true;
 const emp=pendingRecordIndex.get(r.data?.employee_id||pendingRecordIndex.get(r.data?.leave_id)?.data?.employee_id);
 return normalizeSearch([r.company,modules[r.module]?.label,r.code,states[r.status]||cycleStatus[r.status],r.data?.month,emp?.data?.name,emp?.data?.code,r.data?.name,r.data?.notes].join(' ')).includes(normalizeSearch(pendingSearch));
}).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
const pendingEmployeeName=r=>{
 const id=r.data?.employee_id||pendingRecordIndex.get(r.data?.leave_id)?.data?.employee_id;
 const employee=pendingRecordIndex.get(id);
 return r.module==='payroll_batches'?'مسير '+(r.data?.month||'شهري'):employee?.data?.name||r.data?.employee_snapshot?.name||r.data?.name||'—';
};

return <div className="app"><aside><a className="brand" href="/"><div className="brand-mark"><img src="/maskan-logo.jpg" alt="شعار مسكن الكيان"/></div><div><b>شؤون الموظفين</b><small>MASKAN HR · V57 · CLOUD</small></div></a><div className="nav-label">مساحة العمل</div><button className={'nav '+(module==='overview'?'active':'')} onClick={()=>setModule('overview')}><LayoutDashboard size={19}/>نظرة عامة</button>{accessiblePendingTypes.length>0&&<button className={'nav '+(module==='pending_requests'?'active':'')} onClick={()=>setModule('pending_requests')}><FileText size={19}/>الطلبات قيد الإجراء <span style={{marginInlineStart:'auto',fontWeight:700}}>{rows.filter(r=>(user?.role!=='project_manager'||r.module==='payroll_batches'&&r.status==='manager_review'||r.status==='project_manager')&&accessiblePendingTypes.includes(r.module)&&pendingStages.includes(r.status)&&(!company||r.company===company)).length}</span></button>}{['شؤون الموظفين','المالية','الإدارة والإعدادات'].map(g=><div key={g}><div className="nav-label">{g}</div>{allowed.filter(k=>modules[k].group===g).map(k=>{const Icon=icons[modules[k].icon];return <button key={k} className={'nav '+(module===k?'active':'')} onClick={()=>setModule(k)}><Icon size={19}/>{modules[k].label}<ChevronLeft size={13}/></button>})}</div>)}{clientFinanceAuthorized&&<><div className="nav-label nav-label-finance">العقود والمطالبات المالية</div><button className={'nav '+(module==='client_finance'?'active':'')} onClick={()=>setModule('client_finance')}><FileText size={18}/>المطالبات المالية واستحقاقات العملاء<ChevronLeft size={13}/></button></>}{user&&<button className={'nav '+(module==='attendance'?'active':'')} onClick={()=>setModule('attendance')}><MapPin size={18}/>الحضور والانصراف</button>}{user?.role==='admin'&&<><div className="nav-label">إدارة المنصة</div><button className={'nav '+(module==='members'?'active':'')} onClick={()=>setModule('members')}><ShieldCheck size={18}/>المستخدمون والصلاحيات</button><button className={'nav '+(module==='audit'?'active':'')} onClick={()=>setModule('audit')}><FileText size={18}/>سجل العمليات</button></>}{user?.role==='admin'&&<button className={'nav '+(module==='migration'?'active':'')} onClick={()=>setModule('migration')}><Upload size={18}/>نقل بيانات V38</button>}<form action="/api/auth/logout" method="post"><button className="nav" type="submit"><LogOut size={18}/>تسجيل الخروج</button></form><div className="sidebar-bottom"><Cloud size={18}/><span>قاعدة بيانات سحابية مشتركة<br/><small>أربع شركات، مساحة واحدة</small></span></div></aside>
<div className="workspace"><header><div className="crumb">شؤون الموظفين <ChevronLeft size={14}/><b>{spec?.label||({overview:'لوحة التحكم',members:'المستخدمون والصلاحيات',audit:'سجل العمليات',attendance:'الحضور والانصراف',migration:'نقل بيانات V38',pending_requests:'الطلبات قيد الإجراء',client_finance:'المطالبات المالية واستحقاقات العملاء'}[module])}</b></div><div className="account"><span className={'connection '+(error?'offline':'')}>{loading?'جارٍ الاتصال':error?'تعذر الاتصال':'متصل بالسحابة'}</span><span className="avatar">{user?.name?.[0]||'م'}</span><span>{user?.name||'تسجيل الدخول'}<small>{{admin:'مدير المنصة',administrative_assistant:'مساعد الإدارة',hr:'شؤون الموظفين',finance:'الإدارة المالية',project_manager:'مدير مشروع',projects_director:'إدارة المشاريع',administrative_manager:'المدير الإداري'}[user?.role]}</small></span></div></header>
<main><div className="page-heading"><div><div className="eyebrow">إدارة موحّدة · رؤية أوضح</div><h1>{spec?.label||({overview:'موظفو شركاتك، في مكان واحد.',members:'المستخدمون والصلاحيات',audit:'سجل العمليات',attendance:'الحضور والانصراف',migration:'نقل بيانات V38',pending_requests:'الطلبات قيد الإجراء'}[module])}</h1><p>{module==='overview'?'أدر الموظفين والإجازات والرواتب من مساحة عمل سحابية واحدة.':'بيانات فعلية محفوظة ومترابطة بين الشركات والإدارات.'}</p></div><div className="company-picker"><label>الشركة الحالية</label><select value={company} onChange={e=>setCompany(e.target.value)}><option value="">جميع الشركات</option>{[...companies,'غير محددة'].map(c=><option key={c} value={c}>{companyDisplayName(c)}</option>)}</select></div></div>
{error&&<div className="error-box">{error}<button onClick={refresh}>إعادة المحاولة</button></div>}
{['leave','advances'].includes(module)&&<section className="panel request-approval-guide" aria-label="مسار اعتماد الإجازات والسلف" dir="rtl">
 <div className="request-approval-top"><strong>دورة الاعتماد والصلاحيات</strong><small>الإجازات والسلف: إعداد الطلب ← مدير المشروع ← إدارة المشاريع ← شؤون الموظفين ← الإدارة المالية</small></div>
 <div className="request-approval-flow">{approvalStages.map((step,i)=><div className="request-approval-step" key={step.id}><span>{i+1}</span><b>{step.label}</b></div>)}</div>
 <small>يرسل الطلب إلى مدير المشروع المسجل في بيانات المشروع، ويعتمده فقط المدير المخوّل. تراجع الصلاحيات من المستخدمين والصلاحيات.</small>
 </section>}
 {module==='project_managers'&&user?.role==='admin'&&<section className="panel" dir="rtl" style={{padding:16,marginBottom:12}}>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
 <div><h3 style={{margin:0}}>ربط مدراء المشاريع وإنشاء حسابات الدخول</h3><small>اختر مديرًا موجودًا أو أضف اسمًا جديدًا، ثم حدد مشاريعه. كل مشروع يرتبط بمدير واحد فقط.</small></div>
 <button className="primary" type="button" onClick={()=>setManagerSetup({employeeId:'',name:'',email:'',username:'',phone:'',ids:[]})}><Plus size={16}/> إضافة مدير وربطه بالمشاريع</button></div>
 </section>}
 {module==='project_managers'&&managerSetup&&<div className="modal-backdrop" role="presentation"><section className="modal" dir="rtl" role="dialog" aria-modal="true" aria-label="ربط مدير مباشر بالمشاريع" style={{width:'min(94vw,620px)',maxHeight:'88vh',overflowY:'auto',padding:20}}>
 <div className="modal-head"><div><h2 style={{marginBottom:3}}>تعيين مدير مشروع</h2><small>اختر المدير المباشر المسجل مسبقًا، ثم حدد مشاريعه</small></div><button type="button" disabled={managerSetupBusy} onClick={()=>setManagerSetup(null)} aria-label="إغلاق"><X/></button></div>
 <form onSubmit={saveManagerSetup} style={{display:'grid',gap:11}}>
 {(()=>{const directory=rows.filter(r=>r.module==='project_managers'&&(!company||r.company===company));
  const staff=rows.filter(r=>r.module==='employees'&&(!company||r.company===company)&&!r.data?._archived);
  const companiesForRoster=company?[company]:companies;
  const choices=companiesForRoster.flatMap(co=>preferredProjectManagers.map(profile=>{
   const registered=directory.filter(r=>r.company===co&&preferredManagerForName(r.data?.name)?.id===profile.id);
   const related=staff.filter(r=>r.company===co&&(preferredManagerForName(r.data?.manager)?.id===profile.id||registered.some(d=>d.id===r.data?.direct_manager_id)));
   const emails=[...new Set([...registered.map(r=>r.data?.email),...related.map(r=>r.data?.manager_email)].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean))];
   const email=emails.length===1?emails[0]:'';
   return {profileId:profile.id,label:profile.name,name:registered[0]?.data?.name||related[0]?.data?.manager||profile.name,email,company:co,phone:registered[0]?.data?.phone||related[0]?.data?.manager_phone||'',ambiguous:emails.length>1};
  }));
  const keyOf=m=>m.company+'|'+m.profileId;
  const found=choices.filter(m=>!managerSetup.managerSearch||normalizeSearch([m.label,m.name,m.email,m.company].join(' ')).includes(normalizeSearch(managerSetup.managerSearch)));
  const selected=choices.find(m=>keyOf(m)===(managerSetup.choiceKey||''));
  return <div style={{display:'grid',gap:7}}>
   <label>اختيار مدير المشروع من القائمة المعتمدة
    <input type="search" aria-label="فلترة المدراء المباشرين" placeholder="بحث بالاسم أو البريد" value={managerSetup.managerSearch||''} onChange={e=>setManagerSetup(p=>({...p,managerSearch:e.target.value}))}/>
    <select aria-label="اختيار المدير المباشر لتعيينه مدير مشروع" value={selected?keyOf(selected):''} onChange={e=>{
      const m=choices.find(x=>keyOf(x)===e.target.value);
      const employee=m?.email&&staff.find(x=>String(x.data?.email||'').trim().toLowerCase()===m.email&&x.company===m.company&&preferredManagerForName(x.data?.name)?.id===m.profileId);
      const account=m?.email&&members.find(x=>String(x.email||'').trim().toLowerCase()===m.email);
      const identity=employee?.data||{};
      const suggested=m?suggestedProjectsForManager(rows,m.profileId,m.company,m.email):[];
      setManagerSetup(p=>({...p,choiceKey:m?keyOf(m):'',employeeId:employee?.id||'',name:identity.name||m?.name||'',email:m?.email||'',phone:m?.phone||identity.phone||'',username:account?.username||'',ids:suggested,showDetails:!m?.email||!account,selectedCompany:m?.company||'',managerSearch:''}));
    }}>
     <option value="">اختر أحد المدراء الستة…</option>
     {found.map(m=><option key={keyOf(m)} value={keyOf(m)}>{m.label} — {companyDisplayName(m.company)}{m.ambiguous?' · راجع تكرار البريد':!m.email?' · يتطلب ربط بريد':''}</option>)}
     {selected&&!found.some(m=>keyOf(m)===keyOf(selected))&&<option value={keyOf(selected)}>{selected.label} — {companyDisplayName(selected.company)}</option>}
    </select>
   </label>
   <small>{found.length} خيار مطابق من قائمة المدراء الستة. تُحدد مشاريع المدير تلقائيًا بناءً على «المدير المباشر» في سجل الموظفين، ويمكن مراجعتها وتعديلها قبل الحفظ. لا يُنشأ حساب دون بريد حقيقي.</small>
  </div>;
 })()}
 {managerSetup.email&&!managerSetup.showDetails&&<div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',background:'#f7f2e7',padding:10,borderRadius:8,fontSize:13}}>
 <span><b>{managerSetup.name}</b> · <span dir="ltr">{managerSetup.email}</span></span>
 <button type="button" onClick={()=>setManagerSetup(p=>({...p,showDetails:true}))}>مراجعة بيانات الحساب</button>
 </div>}
 <button type="button" style={{justifySelf:'start',fontSize:12}} onClick={()=>setManagerSetup(p=>({...p,showDetails:!p.showDetails}))}>{managerSetup.showDetails?'إخفاء البيانات الإضافية':'إضافة مدير جديد أو استكمال بيانات الدخول'}</button>
 {managerSetup.showDetails&&<div style={{display:'grid',gap:9,padding:10,border:'1px solid #e6d5b6',borderRadius:8}}>
 <label>اختيار أحد الموظفين لتعيينه مدير مشروع
 <select value={managerSetup.employeeId||''} onChange={e=>{
  const employee=rows.find(r=>r.module==='employees'&&r.id===e.target.value);
  const d=employee?.data||{};const email=String(d.email||'').trim().toLowerCase();const account=members.find(m=>String(m.email||'').toLowerCase()===email);
  setManagerSetup(p=>({...p,choiceKey:'',employeeId:employee?.id||'',name:d.name||'',email,phone:d.phone||'',username:account?.username||'',ids:[],selectedCompany:employee?.company||''}));
 }}><option value="">مدير مستقل غير مرتبط بسجل موظف</option>{rows.filter(r=>r.module==='employees'&&!r.data?._archived&&['active','نشط','على رأس العمل','علي راس العمل'].includes(String(r.data?.employment_status||r.data?.employee_status||'').trim())&&(!company||r.company===company)).map(r=><option value={r.id} key={r.id}>{r.data?.name} — {r.data?.code||r.code} — {companyDisplayName(r.company)}</option>)}</select></label>
 <label>مدير مشروع لديه حساب سابق
 <select disabled={!!managerSetup.employeeId} value={members.some(m=>m.email===managerSetup.email&&m.role==='project_manager')?managerSetup.email:'new'} onChange={e=>{const email=e.target.value;const account=members.find(x=>x.email===email);const directory=rows.find(r=>r.module==='project_managers'&&r.data?.email===email);setManagerSetup(p=>({...p,choiceKey:'',employeeId:'',email:account?.email||'',name:directory?.data?.name||account?.display_name||'',username:account?.username||'',phone:directory?.data?.phone||'',ids:[]}))}}><option value="new">+ مدير مشروع جديد</option>{members.filter(m=>m.role==='project_manager'&&m.is_active!==false).map(m=><option value={m.email} key={m.email}>{rows.find(r=>r.module==='project_managers'&&r.data?.email===m.email)?.data?.name||m.display_name||m.username||m.email}</option>)}</select></label>
 <div className="form-grid">
 <label>اسم المدير<input required readOnly={!!managerSetup.employeeId} minLength={3} value={managerSetup.name} onChange={e=>setManagerSetup(p=>({...p,name:e.target.value}))}/></label>
 <label>البريد الإلكتروني<input required type="email" dir="ltr" value={managerSetup.email} onChange={e=>setManagerSetup(p=>({...p,email:e.target.value}))}/></label>
 <label>اسم المستخدم<input required={!members.some(m=>m.email===managerSetup.email)} value={managerSetup.username} onChange={e=>setManagerSetup(p=>({...p,username:e.target.value}))}/></label>
 <label>رقم الهاتف<input type="tel" dir="ltr" value={managerSetup.phone} onChange={e=>setManagerSetup(p=>({...p,phone:e.target.value}))}/></label>
 </div></div>}
 <fieldset style={{padding:10}}><legend>ربط المدير بمشروع واحد أو عدة مشاريع</legend>
 {(()=>{
  const allProjects=rows.filter(r=>r.module==='projects'&&(!company||r.company===company)&&(!managerSetup.selectedCompany||r.company===managerSetup.selectedCompany)).filter((r,i,all)=>all.findIndex(x=>x.id===r.id)===i);
  const employeeCompany=rows.find(e=>e.module==='employees'&&e.id===managerSetup.employeeId)?.company||'';
  const isEligible=r=>canSelectManagerProject(r,employeeCompany);
  const eligible=allProjects.filter(isEligible);
  const shown=allProjects.filter(r=>!managerSetup.projectSearch||normalizeSearch([r.data?.name,r.data?.code,r.code].join(' ')).includes(normalizeSearch(managerSetup.projectSearch)));
  const linkedEmployees=rows.filter(r=>r.module==='employees'&&!r.data?._archived&&managerSetup.ids.includes(String(r.data?.project_id||''))&&allProjects.some(p=>p.id===r.data.project_id&&p.company===r.company));
  const shownEligible=shown.filter(isEligible);
  return <>
   <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
    <strong style={{fontSize:13}}>المشاريع المختارة: {managerSetup.ids.length} من {eligible.length} متاحة</strong>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
     <button type="button" disabled={!shownEligible.length} onClick={()=>setManagerSetup(p=>({...p,ids:[...new Set([...p.ids,...shownEligible.map(r=>r.id)])]}))}>تحديد كل المشاريع المعروضة</button>
     <button type="button" disabled={!managerSetup.ids.length} onClick={()=>setManagerSetup(p=>({...p,ids:[]}))}>إلغاء التحديد</button>
    </div>
   </div>
   <input type="search" aria-label="فلترة مشاريع المدير" placeholder="بحث باسم المشروع أو رمزه" value={managerSetup.projectSearch||''} onChange={e=>setManagerSetup(p=>({...p,projectSearch:e.target.value}))}/>
   <div style={{maxHeight:265,overflowY:'auto',display:'grid',gap:5,marginTop:8}}>
    {shown.map(r=>{
     const assigned=String(r.data?.manager_email||'').trim().toLowerCase();
     const other=assigned&&assigned!==String(managerSetup.email||'').trim().toLowerCase();
     const employees=rows.filter(e=>e.module==='employees'&&e.company===r.company&&!e.data?._archived&&String(e.data?.project_id||'')===r.id);
     return <div key={r.id} style={{padding:'8px 9px',border:'1px solid #e8ddc8',borderRadius:7,opacity:isEligible(r)?1:0.6,display:'grid',gap:4}}>
      <label style={{display:'flex',alignItems:'center',gap:9,fontSize:13,cursor:isEligible(r)?'pointer':'not-allowed'}}>
       <input type="checkbox" disabled={!isEligible(r)} checked={managerSetup.ids.includes(r.id)} onChange={e=>setManagerSetup(p=>({...p,ids:e.target.checked?[...new Set([...p.ids,r.id])]:p.ids.filter(id=>id!==r.id)}))}/>
       <span style={{flex:1}}><strong>{r.data?.name||r.code}</strong> <small>· {employees.length} موظف · {other?'مرتبط بمدير آخر — يتطلب تأكيد النقل':assigned?'مرتبط بهذا المدير':'متاح للتعيين'}</small></span>
      </label>
      {!!employees.length&&<details style={{fontSize:12,paddingInlineStart:25}}><summary style={{cursor:'pointer'}}>عرض أسماء موظفي المشروع ({employees.length})</summary><div style={{padding:'6px 0',lineHeight:1.9}}>{employees.slice(0,30).map(e=><span key={e.id} style={{display:'inline-block',marginInlineEnd:10}}>{e.data?.name||e.data?.code||'غير مسمى'}{e.data?.code?' ('+e.data.code+')':''}</span>)}{employees.length>30&&<small>و{employees.length-30} موظف آخر</small>}</div></details>}
     </div>;
    })}
    {!shown.length&&<small>لا توجد مشاريع مطابقة لبحثك</small>}
   </div>
   <div style={{display:'grid',gap:4,padding:'9px 10px',background:'#f7f2e7',borderRadius:8,fontSize:13}}>
    <strong>ملخص الربط: {managerSetup.ids.length} مشروع · {linkedEmployees.length} موظف</strong>
    <small>يمكن اختيار المشاريع قبل إدخال البريد. عند نقل مشروع من مدير آخر سيُطلب تأكيد صريح قبل الحفظ، ثم تُحدَّث بيانات المدير المباشر لموظفي المشروع.</small>
    {linkedEmployees.length>0&&<details><summary style={{cursor:'pointer'}}>أسماء الموظفين الذين سيُربطون بهذا المدير</summary><div style={{paddingTop:5,lineHeight:1.8}}>{linkedEmployees.slice(0,35).map(e=><span key={e.id} style={{display:'inline-block',marginInlineEnd:9}}>{e.data?.name||e.data?.code||'غير مسمى'}</span>)}{linkedEmployees.length>35&&<small>و{linkedEmployees.length-35} موظف آخر</small>}</div></details>}
   </div>
  </>;
 })()}</fieldset>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',justifyContent:'flex-start'}}>
 <button className="primary" type="submit" disabled={managerSetupBusy}>{managerSetupBusy?'جارٍ الحفظ…':'حفظ وتعيين المدير'}</button>
 <button type="button" disabled={managerSetupBusy} onClick={()=>setManagerSetup(null)}>إلغاء</button>
 </div></form></section></div>}
 {module==='pending_requests'&&<section className="panel" dir="rtl" style={{padding:20}}>
 <div className="panel-head"><div><h2>الطلبات قيد الإجراء</h2><span>قائمة موحّدة للطلبات غير المكتملة ضمن صلاحيات حسابك والشركات المتاحة له</span></div><span className="members-count">{pendingRequestRows.length} طلب</span></div>
 <div className="form-grid" style={{margin:'16px 0'}}>
 <label>نوع الطلب<select value={pendingType} onChange={e=>setPendingType(e.target.value)}><option value="">جميع أنواع الطلبات</option>{accessiblePendingTypes.map(k=><option key={k} value={k}>{modules[k].label}</option>)}</select></label>
 <label>مرحلة الاعتماد<select value={pendingStage} onChange={e=>setPendingStage(e.target.value)}><option value="">جميع المراحل الجارية</option>{pendingStages.map(status=><option key={status} value={status}>{states[status]||cycleStatus[status]||status}</option>)}</select></label>
 <label>بحث عن الموظف أو الطلب<input type="search" value={pendingSearch} onChange={e=>setPendingSearch(e.target.value)} placeholder="اسم الموظف أو رقمه أو بيانات الطلب"/></label>
 </div>
 <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap'}}><small>تعرض هذه النافذة المسودات والطلبات قيد المراجعة والمعادة للتصحيح. لا تشمل المعتمدة أو المصروفة أو المرفوضة.</small><button type="button" onClick={()=>{setPendingType('');setPendingStage('');setPendingSearch('')}}>مسح الفلاتر</button></div>
 <div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr><th>الشركة</th><th>نوع الطلب</th><th>الموظف</th><th>المرحلة الحالية</th><th>مدير المشروع المختص</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead><tbody>
 {pendingRequestRows.map(r=><tr key={r.id}><td>{companyDisplayName(r.company)}</td><td>{modules[r.module]?.singular||r.module}</td><td>{pendingEmployeeName(r)}</td><td><span className={'badge '+r.status}>{states[r.status]||cycleStatus[r.status]||r.status}</span></td><td>{r.module==='payroll_batches'?'حسب المشاريع المرتبطة بالمسير':r.data?.project_manager?.name||managerDirectoryForRequest(r,r.company)?.name||'غير محدد'}</td><td>{r.updated_at?new Date(r.updated_at).toLocaleDateString('ar-SA'):'—'}</td><td><button type="button" onClick={()=>{if(r.module==='payroll_batches'){setPayrollMonth(r.data?.month||payrollMonth);setPayrollCompany(r.company);setPayrollManageBatchId(r.id);setModule('payroll');}else{setModule(r.module);setEdit({...r,data:{...r.data}})}}}>فتح الطلب ومراجعته</button></td></tr>)}
 {pendingRequestRows.length===0&&<tr><td colSpan={7} style={{padding:24,textAlign:'center'}}>لا توجد طلبات قيد الإجراء تطابق الفلاتر.</td></tr>}
 </tbody></table></div>
 </section>}
{module==='overview'&&<>{user?.role==='admin'&&<section className="panel" dir="rtl" style={{padding:16,marginBottom:16}}>
 <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
 <div><h2 style={{margin:0}}>الفحص التشغيلي وترابط البيانات</h2><small>فحص قراءة فقط للمشاريع والموظفين ومدراء المشاريع وطلبات الإجازات والسلف ومسيرات الرواتب، دون تغيير البيانات</small></div>
 <button type="button" disabled={integrityBusy} onClick={scanIntegrity}>{integrityBusy?'جارٍ الفحص…':'فحص الترابط الآن'}</button></div>
 {integrityReport&&<div style={{marginTop:12,display:'grid',gap:9}}>
 <strong>نتيجة الفحص: {integrityReport.issue_count} ملاحظة · {integrityReport.counts?.projects||0} مشروع · {integrityReport.counts?.employees||0} موظف · {integrityReport.counts?.requests||0} طلب</strong>
 {integrityReport.truncated&&<small>عرض أول 500 ملاحظة فقط؛ تحتاج بقية البيانات إلى فحص إضافي</small>}
 {integrityReport.issues?.length>0&&<div style={{maxHeight:250,overflowY:'auto'}}><table><thead><tr><th>الشركة</th><th>النافذة</th><th>السجل</th><th>الملاحظة</th></tr></thead><tbody>{integrityReport.issues.slice(0,100).map((issue,i)=><tr key={issue.record_id+'-'+issue.type+'-'+i}><td>{issue.company}</td><td>{modules[issue.module]?.label||issue.module}</td><td>{issue.name||issue.code||issue.record_id.slice(0,8)}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}
 {!integrityReport.issues?.length&&<small>لا توجد مشاكل ترابط مكتشفة ضمن أنواع البيانات المفحوصة. هذا لا يغني عن اختبار الحسابات والتدفقات فعليًا.</small>}
 </div>}</section>}<div className="stats">{[['الموظفون',employeeCount,'موظف مسجل',Users],['الإجازات المعتمدة',projectCount,'طلب إجازة معتمد',CalendarDays],['صافي الرواتب المسجلة',money(contractTotal),'ريال سعودي · كل الأشهر',Wallet],['بانتظار الاعتماد',pending,'معاملة ضمن مسار الاعتماد',FileText]].map(([label,value,note,Icon],i)=><div className="stat" key={label}><div className={'stat-icon i'+i}><Icon size={21}/></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><h2>الشركات التابعة</h2><span>رؤية مستقلة لكل شركة</span></div><div className="companies">{companies.map((c,i)=><button key={c} className="company-card" onClick={()=>setCompany(c)}><span className="company-monogram">{['ر','م','ب','ط'][i]}</span><div><b>{companyDisplayName(c)}</b><small>{rows.filter(r=>r.company===c&&r.module==='employees').length} موظف · {rows.filter(r=>r.company===c&&r.module==='leave').length} طلب إجازة</small></div><ArrowUpLeft size={18}/></button>)}</div></section><section className="panel next"><span className="eyebrow">من أين تبدأ؟</span><h2>حوّل بياناتك إلى عمل.</h2><p>اختر الشركة، أضف الموظفين، ثم تابع الإجازات والسلف والرواتب والطلبات.</p><button className="primary" onClick={()=>setModule(allowed.includes('employees')?'employees':allowed[0])}>فتح السجلات <ArrowUpLeft size={17}/></button><span className="start-note">تبدأ المنصة بدون بيانات تجريبية.</span></section></div><section className="panel"><div className="panel-head"><h2>آخر التحديثات</h2><span>من السجلات الفعلية</span></div>{scoped.length===0?<div className="empty"><FileText size={32}/><h3>المساحة جاهزة لأول سجل</h3><p>أضف بيانات الشركة أو استورد الموظفين من قالب CSV.</p></div>:<div className="activity-list">{scoped.slice(0,7).map(r=><button key={r.id} onClick={()=>setModule(r.module)}><span className="activity-dot"/><div><b>{title(r)}</b><small>{r.company} · {modules[r.module].label}</small></div><span className={'badge '+r.status}>{states[r.status]}</span><small>{new Date(r.updated_at).toLocaleDateString('ar-SA')}</small></button>)}</div>}</section><div className="footnote">الرواتب والسلف المسجلة لا تنفذ تحويلات بنكية. نقل بيانات النسخة المحلية يتطلب استيرادها.</div></>}
{spec&&<>{module!=='payroll'&&<div className="toolbar"><div className="search"><Search size={17}/><input type="search" dir="rtl" aria-label="البحث في السجلات" autoComplete="off" placeholder="ابحث بالاسم أو رقم الموظف أو نوع الإجازة…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="search-clear" aria-label="مسح البحث" onClick={()=>setSearch('')}>×</button>}</div><div className="tools"><button onClick={exportRows}><Download size={16}/>تصدير Excel</button><button onClick={printModuleRegister}><FileText size={16}/>طباعة النموذج الرسمي</button>{(permittedWrite(user||{},module))&&<><button onClick={template}><Download size={16}/>قالب Excel شامل</button>{module==='employees'&&<label className="upload"><Upload size={16}/>استيراد Excel / CSV<input type="file" accept=".csv,.xlsx" onChange={e=>readImport(e.target.files?.[0])}/></label>}<button className="primary" onClick={()=>startEdit(null)}><Plus size={17}/>إضافة {spec.singular}</button></>}</div></div>}
{module==='employees'&&<div className="employee-register-actions"><button type="button" onClick={()=>setEmployeeFilterOpen(true)}><Search size={16}/> فلاتر تفصيلية لكل حقل {activeEmployeeFilters.length?'('+activeEmployeeFilters.length+')':''}</button>{activeEmployeeFilters.length>0&&<button type="button" onClick={()=>setEmployeeFieldFilters({})}>مسح جميع الفلاتر</button>}<button type="button" onClick={()=>setShowArchivedEmployees(v=>!v)}>{showArchivedEmployees?'عرض الموظفين الحاليين':'عرض أرشيف الموظفين'}</button><small>{showArchivedEmployees?'الأرشيف للرجوع والاستعادة دون حذف البيانات المالية':'اضغط عرض للاطلاع، أو تعديل لتغيير بيانات الموظف، أو حذف لنقله للأرشيف'}</small></div>}
{module==='payroll'&&<section className="panel" style={{padding:20,marginBottom:18}}>
 <div className="panel-head payroll-main-heading"><div><h2>مركز مراجعة واعتماد مسيرات الرواتب</h2><span>لوحة موحدة لجميع الشركات · مراحل واضحة ومتابعة مباشرة</span></div><strong className="payroll-month-pill">شهر المسير: {new Date(payrollMonth+'-01T00:00:00').toLocaleDateString('ar-SA',{month:'long',year:'numeric'})}</strong></div>
 <div className="payroll-approval-flow" aria-label="تسلسل اعتماد مسير الرواتب">{payrollStageLabels.map((stage,i)=><div key={stage} className="payroll-flow-step"><span className="payroll-flow-num">{i+1}</span><span>{stage}</span></div>)}</div><div className="payroll-legend"><span><i className="dot complete"/>تم الاعتماد</span><span><i className="dot active"/>تحت الإجراء</span><span><i className="dot upcoming"/>مرحلة لاحقة</span></div>
 <p>يبدأ المسير لدى مساعد الإدارة، ثم يراجعه مدراء المشاريع ويحدّثون بيانات الموظفين وملاحظاتهم، ثم تعتمد إدارة المشاريع ويراجع قسم المالية ويصرف. يمكن مراجعة مسيرات جميع الشركات وإرسال المكتمل منها دفعة واحدة.</p>
 <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',margin:'16px 0'}}>
  <label>شهر المسير <input type="month" value={payrollMonth} max={ksaMonth} onChange={e=>setPayrollMonth(e.target.value)} style={{marginInlineStart:8}}/></label>
  <label>الشركة <select value={payrollCompany} onChange={e=>setPayrollCompany(e.target.value)} style={{marginInlineStart:8}}><option value="__all__">جميع الشركات</option>{payrollCompanies.map(co=><option key={co} value={co}>{co}</option>)}</select></label>
  <label>حالة المسير <select value={payrollStage} onChange={e=>setPayrollStage(e.target.value)} style={{marginInlineStart:8}}><option value="__all__">جميع الحالات</option>{Object.entries(cycleStatus).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  {['admin','administrative_assistant'].includes(user?.role)&&payrollMonth===ksaMonth&&(payrollCompany==='__all__'?payrollCompanies.every(co=>!cycleBatches.some(b=>b.company===co)):!cycleBatches.length)&&<button className="primary" disabled={saving} onClick={cycleGenerate}><Plus size={16}/>توليد مسير الشهر مرة واحدة</button>}
  <button type="button" className="payroll-all-open" onClick={()=>{setPayrollCompany('__all__');setPayrollStage('__all__');setPayrollAllOpen(true)}} disabled={!cycleBatches.length}>مراجعة مسيرات جميع الشركات في نافذة واحدة</button>
  <button onClick={cycleExport} disabled={!cyclePayroll.length}><Download size={16}/>تصدير المسير Excel</button>
  <button onClick={cyclePrint} disabled={!cyclePayroll.length}><FileText size={16}/>طباعة المسير / حفظ PDF</button>
 </div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:15}}>
 { [['الموظفون في المسيرات',cycleTotals.count],['تمت مراجعتهم',cycleTotals.reviewed],['إجمالي المستحق',money(cycleTotals.net)+' ر.س'],['الصرف النقدي',money(cycleTotals.cash)+' ر.س'],['التحويلات البنكية',money(cycleTotals.bank)+' ر.س']].map(([k,v])=><div key={k} style={{padding:12,border:'1px solid #d9c6a0',borderRadius:12,minWidth:135}}><small style={{display:'block'}}>{k}</small><b>{v}</b></div>)}
 </div>
 <div className="payroll-stage-actions">
  {visibleCycleBatches.map(b=>{const employees=cyclePayroll.filter(r=>r.data.batch_id===b.id);const eligible=employees.filter(r=>!r.data.excluded);const confirmed=eligible.filter(r=>r.data.split_confirmed).length;return <div className="payroll-stage-row" key={b.id}>
   <div className="payroll-batch-summary"><div><strong>{b.company}</strong><span className="payroll-month-mini">{b.data.month}</span><span className="payroll-status-chip">{cycleStatus[b.status]||b.status}</span></div><small>مراجعة الموظفين: {confirmed} من {eligible.length}</small><div className="payroll-compact-stages">{payrollStageLabels.map((label,i)=>{const step=Math.max(0,payrollStages.indexOf(b.status)),state=b.status==='paid'||i<step?'done':i===step?'current':'later';return <span key={label} className={'payroll-compact-stage '+state} title={label}>{state==='done'?'✓ ':state==='current'?'◉ ':'○ '}{label}</span>})}</div></div>
   <div className="row-actions">
    <button type="button" disabled={saving} onClick={()=>{setPayrollManageBatchId(b.id);setPayrollAddEmployeeId('')}}>فتح إدارة المسير</button>
    {b.status==='draft'&&['admin','administrative_assistant'].includes(user?.role)&&<button disabled={saving||confirmed!==eligible.length||!eligible.length} onClick={()=>cycleTransition(b,'submit')}>إرسال لمدراء المشاريع</button>}
    {b.status==='manager_review'&&['admin','projects_director'].includes(user?.role)&&<><button disabled={saving||eligible.some(e=>!e.data.manager_reviewed)} onClick={()=>cycleTransition(b,'managers_approve')}>إرسال لإدارة المشاريع بعد مراجعة المدراء</button></>}{b.status==='manager_review'&&['admin','project_manager'].includes(user?.role)&&<button disabled={saving} onClick={()=>cycleTransition(b,'return')}>إعادة للتجهيز</button>}
    {b.status==='projects_review'&&['admin','projects_director'].includes(user?.role)&&<><button disabled={saving} onClick={()=>cycleTransition(b,'projects_approve')}>اعتماد وإرسال للمالية</button><button disabled={saving} onClick={()=>cycleTransition(b,'return')}>إعادة للمراجعة</button></>}
    {b.status==='finance_review'&&['admin','finance'].includes(user?.role)&&<><button disabled={saving} onClick={()=>cycleTransition(b,'finance_pay')}>مراجعة واعتماد الصرف</button><button disabled={saving} onClick={()=>cycleTransition(b,'return')}>إعادة للمراجعة</button></>}
    {b.status==='paid'&&<b>مصروف · السندات متاحة</b>}
   </div>
  </div>})}
 </div>
 {!cycleBatches.length?<div className="empty"><h3>لم يتم توليد مسير لهذا الشهر</h3><p>{payrollMonth===ksaMonth?'اختر الشركة أو جميع الشركات واضغط توليد مسير الشهر مرة واحدة.':'لا يمكن إنشاء مسير جديد لشهر سابق؛ المتاح عرض المسيرات المسجلة فقط.'}</p></div>:<div className="table-wrap"><table><thead><tr>{['الشركة','الموظف','الرقم الوظيفي','الأساسي','السكن','النقل','الصافي','صرف كاش','تحويل بنكي','حالة المراجعة','الإجراء'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visibleCyclePayroll.map(row=>{const d=row.data,b=cycleBatchFor(row);return <tr key={row.id}><td>{row.company}</td><td>{d.employee_name}</td><td>{d.employee_number}</td><td>{money(d.basic)}</td><td>{money(d.housing)}</td><td>{money(d.transport)}</td><td>{money(d.net)}</td><td>{money(d.cash_amount)}</td><td>{money(d.bank_amount)}</td><td>{d.excluded?'مستبعد من المسير':d.split_confirmed?'مراجع':'بانتظار المراجعة'}</td><td><div className="row-actions">
 {((b?.status==='draft'&&['admin','administrative_assistant'].includes(user?.role))||(b?.status==='manager_review'&&['admin','project_manager'].includes(user?.role)))&&<>{!d.excluded?<><button disabled={saving} onClick={()=>cycleEditEmployee(row)}>تعديل ومراجعة</button>{b.status==='draft'&&<button disabled={saving} onClick={()=>cycleExcludeEmployee(row)}>استبعاد الموظف</button>}</>:b.status==='draft'&&<button disabled={saving} onClick={()=>cycleRestoreEmployee(row)}>إعادة الموظف</button>}</>}
 {b?.status==='paid'&&!d.excluded&&<button onClick={()=>cycleReceipt(row)}><FileText size={15}/>سند استلام</button>}
 </div></td></tr>})}</tbody></table></div>}
 </section>}
 {payrollAllOpen&&module==='payroll'&&<div className="modal-backdrop" role="presentation"><section className="modal payroll-all-modal" role="dialog" aria-modal="true" aria-label="مراجعة مسيرات جميع الشركات" dir="rtl">
  <div className="payroll-all-header"><div><h2>المراجعة الموحّدة لجميع الشركات</h2><p>شهر المسير: <strong className="payroll-month-pill">{new Date(payrollMonth+'-01T00:00:00').toLocaleDateString('ar-SA',{year:'numeric',month:'long'})}</strong></p></div><button type="button" onClick={()=>setPayrollAllOpen(false)}>إغلاق</button></div>
  <p>يمكن فتح مسير أي شركة للمراجعة، أو تحديد المسيرات المكتملة ثم إرسالها معًا إلى مدراء المشاريع بإجراء واحد.</p>
  <div className="payroll-all-list">{cycleBatches.map(batch=>{const items=cyclePayroll.filter(x=>x.data.batch_id===batch.id&&!x.data.excluded),reviewed=items.filter(x=>x.data.split_confirmed).length,ready=payrollBatchReady(batch);
   return <div className="payroll-all-company" key={batch.id}><label><input type="checkbox" disabled={saving||batch.status!=='draft'||!ready||!['admin','administrative_assistant'].includes(user?.role)} checked={payrollBulkSelected.includes(batch.id)} onChange={e=>setPayrollBulkSelected(p=>e.target.checked?[...p,batch.id]:p.filter(id=>id!==batch.id))}/><span><strong>{batch.company}</strong><small>{cycleStatus[batch.status]||batch.status} · {reviewed} / {items.length} تمت مراجعتهم</small></span></label><span className={'payroll-status-chip '+(ready?'complete':'pending')}>{ready?'مكتمل للمراجعة':'يحتاج مراجعة'}</span><button type="button" onClick={()=>{setPayrollAllOpen(false);setPayrollManageBatchId(batch.id)}}>فتح إدارة المسير</button></div>})}</div>
  <div className="payroll-all-footer"><small>{payrollBulkSelected.filter(id=>cycleBatches.some(b=>b.id===id)).length} مسير محدد للإرسال</small><button type="button" className="primary" disabled={saving||!payrollBulkSelected.some(id=>cycleBatches.some(b=>b.id===id))} onClick={cycleBulkSubmit}>إرسال المسيرات المحددة دفعة واحدة</button><button type="button" onClick={()=>setPayrollAllOpen(false)}>إغلاق</button></div>
 </section></div>}
 {payrollManagedBatch&&module==='payroll'&&<div className="modal-backdrop" role="presentation">
 <section className="modal payroll-management-modal" dir="rtl" role="dialog" aria-modal="true" aria-label="إدارة مسير الرواتب" style={{width:'95vw',maxWidth:1100,maxHeight:'93vh',overflowY:'auto',padding:24}}>
  <div className="panel-head"><h2>إدارة مسير الرواتب — {payrollManagedBatch.company}</h2><button type="button" onClick={()=>setPayrollManageBatchId(null)} disabled={saving}>إغلاق</button></div>
  <p>شهر المسير: <b>{payrollManagedBatch.data.month}</b> · المرحلة: <b>{cycleStatus[payrollManagedBatch.status]}</b> · تمت مراجعة <b>{payrollManagedReviewed}</b> من <b>{payrollManagedIncluded.length}</b> موظف مدرج</p>
  <div className="payroll-approval-flow">{payrollStageLabels.map((v,i)=><span className="payroll-flow-step" key={i}>{i+1}. {v}</span>)}</div>
  {payrollManagedBatch.status==='draft'&&['admin','administrative_assistant'].includes(user?.role)&&<div className="payroll-management-add">
   <label>إضافة موظف إلى المسير بعد مراجعة ملفه الوظيفي
    <select value={payrollAddEmployeeId} onChange={e=>setPayrollAddEmployeeId(e.target.value)}><option value="">اختر موظفًا نشطًا غير مدرج</option>{payrollAvailableEmployees.map(emp=><option key={emp.id} value={emp.id}>{emp.data.name||emp.data.employee_name} · {emp.data.code||emp.data.employee_number||emp.code}</option>)}</select>
   </label>
   <button type="button" disabled={saving||!payrollAddEmployeeId} onClick={cycleAddEmployee}>إضافة الموظف</button>
  </div>}
  <div className="table-wrap payroll-management-list"><table><thead><tr><th>الموظف</th><th>الرقم</th><th>الصافي</th><th>الكاش</th><th>التحويل</th><th>المراجعة</th><th>الإجراءات</th></tr></thead>
   <tbody>{payrollManagedRows.map(row=><tr key={row.id}><td>{row.data.employee_name}</td><td>{row.data.employee_number}</td><td>{money(row.data.net)}</td><td>{money(row.data.cash_amount)}</td><td>{money(row.data.bank_amount)}</td><td>{row.data.excluded?'مستبعد':row.data.split_confirmed?'تمت المراجعة':'بانتظار المراجعة'}</td><td><div className="row-actions">
     {payrollManagedBatch.status==='draft'&&['admin','administrative_assistant'].includes(user?.role)&&<>{row.data.excluded?<button type="button" disabled={saving} onClick={()=>cycleRestoreEmployee(row)}>إعادة الموظف</button>:<><button type="button" disabled={saving} onClick={()=>cycleEditEmployee(row)}>تعديل ومراجعة</button><button type="button" disabled={saving} onClick={()=>cycleExcludeEmployee(row)}>حذف من المسير (استبعاد)</button></>}</>}
     {payrollManagedBatch.status==='paid'&&!row.data.excluded&&<button type="button" onClick={()=>cycleReceipt(row)}>سند استلام</button>}
   </div></td></tr>)}</tbody></table></div>
  <div className="member-account-actions">
   {payrollManagedBatch.status==='draft'&&['admin','administrative_assistant'].includes(user?.role)&&<button type="button" className="primary" disabled={saving||payrollManagedIncluded.length===0||payrollManagedReviewed!==payrollManagedIncluded.length} onClick={async()=>{if(await cycleTransition(payrollManagedBatch,'submit'))setPayrollManageBatchId(null)}}>إرسال المسير إلى مدراء المشاريع</button>}
   <button type="button" onClick={()=>setPayrollManageBatchId(null)} disabled={saving}>إغلاق النافذة</button>
  </div>
  <small>الحذف هنا استبعاد قابل للإرجاع قبل إرسال المسير، ولا يحذف ملف الموظف. بعد الإرسال تتوقف الإضافة والتعديل والاستبعاد لحين إعادة المسير إلى التجهيز من صاحب صلاحية الاعتماد.</small>
 </section></div>}
 {cycleEdit&&<div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="مراجعة بيانات الموظف داخل المسير" style={{width:'95vw',maxWidth:780,padding:22,maxHeight:'90vh',overflowY:'auto'}}>
 <h2>تعديل بيانات الموظف داخل مسير الشهر: {cycleEdit.name}</h2>{cycleEdit.data.needs_review&&<p className="review-warning" role="alert">تنبيه للمراجعة: {cycleEdit.data.review_reason||'هناك بيانات تحتاج للتحقق قبل الاعتماد'}</p>}<p>{cycleEdit.company} · {cycleEdit.employee_number} · التعديلات خاصة بالمسير الحالي ولا تغيّر سجل الموظف الأساسي</p>
 <form onSubmit={cycleSave}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:10}}>
 { [['basic','الراتب الأساسي'],['housing','بدل السكن'],['transport','بدل النقل'],['bonus','مكافآت'],['extra_allowance','بدلات أخرى'],['overtime_hours','ساعات إضافية'],['absence_days','أيام الغياب'],['absence_deduction','خصم الغياب'],['advance_deduction','خصم السلف'],['deductions','خصومات أخرى'],['bank_amount','مبلغ التحويل البنكي فقط']].map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="0.01" required value={cycleEdit.data[key]??0} onChange={e=>setCycleEdit(p=>({...p,data:{...p.data,[key]:e.target.value}}))}/></label>)}<label>المتبقي للصرف كاش (محسوب تلقائيًا)<input type="text" readOnly value={money(cycleSalarySummary(cycleEdit.data).cash)} title="صافي الاستحقاق مطروحًا منه مبلغ التحويل البنكي"/></label>
 </div>
 {cycleBatches.find(b=>b.id===cycleEdit.batch_id)?.status==='manager_review'&&<label style={{display:'block',marginTop:10}}>ملاحظات مدير المشروع على بيانات الموظف<textarea value={cycleEdit.data.manager_notes||''} onChange={e=>setCycleEdit(p=>({...p,data:{...p.data,manager_notes:e.target.value}}))} placeholder="أدخل ملاحظات المراجعة والتعديل قبل الإرسال لإدارة المشاريع"/></label>}
 {cycleEdit.data.needs_review&&<label style={{display:'block',marginTop:10}}>مبرر استثناء الموظف (حالة التوظيف أو اختلاف الأجر)<textarea required value={cycleEdit.data.exception_note||''} onChange={e=>setCycleEdit(p=>({...p,data:{...p.data,exception_note:e.target.value}}))}/></label>}
 <label style={{display:'block',marginTop:10}}>ملاحظات التعديل<textarea value={cycleEdit.data.notes||''} onChange={e=>setCycleEdit(p=>({...p,data:{...p.data,notes:e.target.value}}))}/></label>
 <div className="payroll-net-summary" role="status" aria-live="polite">
  <div className="payroll-net-summary-heading"><span>صافي راتب الموظف بعد التعديلات</span><strong>{Number.isFinite(cycleSalarySummary(cycleEdit.data).net)?money(cycleSalarySummary(cycleEdit.data).net):'—'} <small>ر.س</small></strong></div>
  <div className="payroll-net-breakdown">
    <span>إجمالي الراتب <b>{money(cycleSalarySummary(cycleEdit.data).gross)}</b></span>
    <span>إضافات ومكافآت وساعات إضافية <b>+ {money(cycleSalarySummary(cycleEdit.data).additions)}</b></span>
    <span>خصم الغياب والسلف والخصومات الأخرى <b>− {money(cycleSalarySummary(cycleEdit.data).deductions)}</b></span>
    <span>تحويل بنكي <b>{money(cycleSalarySummary(cycleEdit.data).bank)}</b> · المتبقي كاش <b>{money(cycleSalarySummary(cycleEdit.data).cash)}</b></span>
  </div>
  <div className={cycleSalarySummary(cycleEdit.data).valid?'payroll-net-check ok':'payroll-net-check warning'}>
    {cycleSalarySummary(cycleEdit.data).valid?'✓ التحويل البنكي والمتبقي كاش يساويان صافي الراتب':'مبلغ التحويل البنكي يجب ألا يتجاوز صافي الراتب أو يكون سالبًا'}
  </div>
  <small className="payroll-net-explanation">يُحتسب الصافي تلقائيًا من الرواتب والإضافات والخصومات المدخلة. أيام الغياب وحدها لا تُخصم ماليًا إلا بعد تحديد مبلغ «خصم الغياب».</small>
 </div>
 <div style={{display:'flex',gap:10}}><button className="primary" type="submit" disabled={saving}>حفظ ومراجعة بيانات الموظف</button><button type="button" disabled={saving} onClick={()=>setCycleEdit(null)}>إلغاء</button></div></form></section></div>}
 {importRows&&<section className="panel import-panel"><h2>معاينة الاستيراد — {importRows.length} سجل</h2><p>يدعم XLSX بالقيم فقط أو CSV UTF-8 من Excel. لا تستورد بيانات حتى تضغط التأكيد.</p><div className="table-wrap"><table><thead><tr><th>الصف</th><th>الشركة</th><th>الاسم / الرقم</th><th>الملاحظة</th></tr></thead><tbody>{importRows.map((r,i)=><tr key={i}><td>{r.line}</td><td>{r.company}</td><td>{r.data.name} / {r.data.code}</td><td>{r.error||'بانتظار التحقق والحفظ'}</td></tr>)}</tbody></table></div><button className="primary" disabled={saving} onClick={confirmImport}>تأكيد الاستيراد</button><button disabled={saving} onClick={()=>setImportRows(null)}>إلغاء</button></section>}
{linkedEmployee&&['leave','advances','warnings','resignations','returns','terminations','leave_dues','settlements'].includes(module)&&<div className="panel" style={{padding:12,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><span>عرض السجلات المرتبطة بالموظف: <b>{linkedEmployee.name}</b></span><button type="button" onClick={()=>setLinkedEmployee(null)}>عرض جميع السجلات</button></div>}
{module!=='payroll'&&<section className="panel records"><div className="panel-head"><h2>سجل {spec.label}</h2><span>{list.length} سجل · {company||'جميع الشركات'}</span></div>{!list.length?<div className="empty"><Building2 size={34}/><h3>{loading?'جارٍ تحميل البيانات…':'لا توجد سجلات بعد'}</h3><p>اختر الشركة وأضف {spec.singular} لبدء العمل.</p></div>:<div className="table-wrap"><table className={module==='employees'?'employee-register':undefined}><thead><tr><th>الشركة</th>{tableFields.map(f=><th key={f.key}>{f.label}</th>)}{module==='project_managers'&&<th>المشاريع والموظفون المرتبطون</th>}{module==='payroll'&&<th>صافي الراتب</th>}{module==='advances'&&<th>الرصيد المتبقي</th>}{module==='leave'&&<><th>عدد أيام الإجازة</th><th>الرصيد المستحق</th><th>الرصيد المتبقي بعد الطلب</th></>}<th>{module==='employees'?'حالة الموظف':'الحالة'}</th><th>الإجراء</th></tr></thead><tbody>{list.map(row=>{const service=annualLeave(row.data.hire_date);const used=rows.filter(r=>r.module==='leave'&&r.status==='approved'&&(r.data.balance_deducted??(!r.data.leave_type||r.data.leave_type==='annual'))&&r.data.employee_id===row.id).reduce((n,r)=>n+Number(r.data.days),0);const approvable=permission(user||{},module,'approve')&&!operationalModules.includes(module)&&module!=='repayments'&&!['approved','paid','rejected','completed','cancelled'].includes(row.status)&&(user?.role==='admin'||row.status==='draft'&&(permittedWrite(user||{},module))||row.status===user?.role);return <tr key={row.id}><td><span className="company-tag">{companyDisplayName(row.company)}</span></td>{tableFields.map(f=><td key={f.key}>{module==='employees'?registerDisplay(row,f):display(row,f)}</td>)}{module==='project_managers'&&<td>{(()=>{
 const email=String(row.data?.email||'').trim().toLowerCase();
 const assignedProjects=rows.filter(p=>p.module==='projects'&&p.company===row.company&&String(p.data?.manager_email||'').trim().toLowerCase()===email);
 const associatedEmployees=rows.filter(e=>e.module==='employees'&&!e.data?._archived&&e.company===row.company&&assignedProjects.some(p=>p.id===e.data?.project_id));
 return <details style={{minWidth:205,fontSize:12}}><summary style={{cursor:'pointer',fontWeight:600}}>{assignedProjects.length} مشروع · {associatedEmployees.length} موظف</summary>
 <div style={{display:'grid',gap:8,maxHeight:230,overflowY:'auto',padding:6}}>
 {assignedProjects.map(p=>{const employees=associatedEmployees.filter(e=>e.data?.project_id===p.id);return <div key={p.id} style={{borderBottom:'1px solid #e8dfce',paddingBottom:5}}><strong>{p.data?.name||p.code}</strong><small style={{display:'block'}}>{employees.length} موظف</small>{employees.slice(0,15).map(e=><div key={e.id}>{e.data?.name||e.data?.code||'غير مسمى'}</div>)}{employees.length>15&&<small>و{employees.length-15} موظف آخر</small>}</div>})}
 {!assignedProjects.length&&<small>لم تُربط مشاريع بهذا المدير بعد</small>}
 </div></details>;
 })()}</td>}{module==='payroll'&&<td>{money(row.data.net)} ر.س</td>}{module==='advances'&&<td>{money(Number(row.data.amount)-rows.filter(r=>r.module==='repayments'&&r.data.advance_id===row.id).reduce((n,r)=>n+Number(r.data.amount),0))} ر.س</td>}{module==='leave'&&<>{(()=>{const b=leaveBalanceFor(row.data.employee_id,row.company,{...row.data,id:row.id});return <><td>{row.data.days??'—'} يوم</td><td>{b.entitled===null?'غير متاح':b.entitled.toFixed(2)+' يوم'}</td><td>{b.after===null?'غير متاح':b.after.toFixed(2)+' يوم'}</td></>})()}</>}<td><div className={module==='employees'?'employee-status-horizontal':'record-status-stack'}><span className={'badge '+row.status}>{module==='employees'?registerDisplay(row,{key:'employment_status'}):operationalModules.includes(module)?'مسجل':states[row.status]||row.status}</span>{row.data._review_flags?.length>0&&<small className="review-warning">تحتاج {row.data._review_flags.length} بيانات للمراجعة</small>}</div></td><td><div className={module==='employees'?'row-actions employee-actions-horizontal':'row-actions'}>{module==='employees'?<>
 <button type="button" onClick={()=>openEmployee(row,true)}>عرض</button>
 {permittedWrite(user||{},'employees')&&<button type="button" onClick={()=>openEmployee(row,false)}>تعديل</button>}
 {permittedWrite(user||{},'employees')&&['admin','hr'].includes(user?.role)&&<button type="button" disabled={saving} onClick={()=>archiveEmployee(row,Boolean(row.data?._archived))}>{row.data?._archived?'استعادة الموظف':'حذف'}</button>}
 </>:<><button onClick={()=>setEdit({...row,data:{...row.data}})}>{row.status==='draft'&&(permittedWrite(user||{},module))?'فتح / تعديل':'عرض'}</button>{module==='projects'&&user?.role==='admin'&&<button type="button" className="danger-action" disabled={saving} onClick={()=>deleteProject(row)}>حذف المشروع</button>}{module==='project_managers'&&user?.role==='admin'&&<button type="button" className="danger-action" disabled={saving} onClick={()=>deleteProjectManager(row)}>حذف المدير</button>}{row.status==='draft'&&['leave','advances','resignations','warnings'].includes(module)&&['admin','hr'].includes(user?.role)&&permittedWrite(user||{},module)&&permission(user||{},module,'edit')&&<button type="button" className="danger-action" disabled={saving} onClick={()=>deleteDraftRequest(row)}>حذف الطلب</button>}{module==='advances'&&row.status==='approved'&&['admin','finance'].includes(user?.role)&&<button disabled={saving} onClick={()=>disburse(row)}>توثيق صرف السلفة</button>}{approvable&&<button disabled={saving} onClick={()=>transition(row)}>{row.status==='draft'?'إرسال للاعتماد':'اعتماد المرحلة'}</button>}{approvable&&row.status!=='draft'&&<button disabled={saving} onClick={()=>{const note=window.prompt('سبب الإعادة للمراجعة');if(note)transition(row,'return',note)}}>إعادة للمراجعة</button>}{approvable&&row.status!=='draft'&&<button disabled={saving} onClick={()=>{const note=window.prompt('سبب الرفض');if(note)transition(row,'reject',note)}}>رفض</button>}</>}</div></td></tr>})}</tbody></table></div>}</section>}{module!=='payroll'&&<div className="footnote">{module==='leave'?'المتبقي = المتراكم منذ التعيين + تسوية الرصيد الافتتاحي − الإجازات المعتمدة. راجع الافتتاحي لمنع تكرار الاستحقاق.':module==='payroll'?'صافي الراتب = الأجر الشهري + المكافآت − الخصميات المدخلة. هذا سجل مستحقات ولا ينفذ دفعًا بنكيًا.':'التعديل متاح للمسودات. تسلسل الاعتماد: مدير المشروع ← إدارة المشاريع ← شؤون الموظفين ← الإدارة المالية.'}</div>}</>}
{module==='client_finance'&&clientFinanceAuthorized&&<ClientFinance user={user} company={company} profiles={rows} companyList={companies} projectManagers={rows.filter(r=>r.module==='project_managers').map(r=>r.data?.name||r.data?.display_name).filter(Boolean)}/>}
{module==='attendance'&&<Attendance rows={rows} user={user} company={company} notify={notify}/>}
{module==='migration'&&user?.role==='admin'&&<Migration notify={notify} onDone={refresh}/>}
{module==='members'&&<section className="panel members-directory" dir="rtl">
 <div className="members-head"><div><h2>دليل المستخدمين</h2><span className="members-count">{members.length} مستخدم</span></div><div className="members-head-actions"><button type="button" onClick={memberExport}><Download size={15}/> تصدير Excel / CSV</button><button type="button" onClick={memberPrint}><FileText size={15}/> طباعة / PDF</button><button type="button" className="primary" onClick={()=>setMemberFormOpen(v=>!v)}><Plus size={16}/> {memberFormOpen?'إغلاق إضافة المستخدم':'إضافة مستخدم'}</button></div></div>
 <div className="members-filter-panel">
  <div className="members-filter-grid">
   <label>بحث سريع<input type="search" placeholder="ابحث داخل القائمة..." value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/></label>
   <label>حسب نوع الحساب<select value={memberRoleFilter} onChange={e=>setMemberRoleFilter(e.target.value)}><option value="">جميع الأدوار</option>{Object.entries(memberRoleLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>حسب الحالة<select value={memberStatusFilter} onChange={e=>setMemberStatusFilter(e.target.value)}><option value="">جميع الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option></select></label>
   <label>حسب المستخدم<select value={memberUserFilter} onChange={e=>setMemberUserFilter(e.target.value)}><option value="">جميع المستخدمين</option><option value="named">له اسم مستخدم</option><option value="unnamed">بدون اسم مستخدم</option></select></label>
  </div>
  <div className="members-filter-foot"><span>عرض {visibleMembers.length} من {members.length} سجل</span><button type="button" onClick={()=>{setMemberSearch('');setMemberRoleFilter('');setMemberStatusFilter('');setMemberUserFilter('');}}>مسح الفلاتر</button></div>
 </div>
 {memberFormOpen&&<div className="members-add-panel"><div className="members-add-heading"><h3>إضافة مستخدم وصلاحيات الدخول</h3><span>بريد الدخول فريد لكل مستخدم، ويمكن تكرار بريد التواصل. بعد الحفظ تظهر كلمة المرور المؤقتة مرة واحدة</span></div><form className="member-form" onSubmit={async e=>{e.preventDefault();try{if(members.some(m=>m.email?.toLowerCase()===memberEmail.trim().toLowerCase()))throw Error('المستخدم موجود مسبقًا. استخدم تعديل الصلاحية من دليل المستخدمين بدل إضافة حساب مكرر.');if(!memberUsername.trim())throw Error('اسم المستخدم مطلوب لتوليد كلمة مرور مستقلة');if(memberRole==='project_manager'&&memberProject!=='*'&&!memberSelectedProjects.length)throw Error('اختر مشروعًا واحدًا على الأقل لتخصيص صلاحيات المدير');await post({action:'member',email:memberEmail,contact_email:memberContactEmail||memberEmail,role:memberRole,username:memberUsername,employee_id:memberEmployee,companies:memberCompany==='*'?'*':[memberCompany],projects:memberRole==='project_manager'?(memberProject==='*'?'*':memberSelectedProjects):memberProject==='*'?'*':[memberProject],permissions:memberPermissions});let linkMessage='';try{const result=await post({action:'generate_temporary_password',email:memberEmail});if(result.password){setCredentialPhone('');setNewMemberCredential({email:memberEmail,username:result.username,password:result.password});linkMessage='؛ تم إنشاء كلمة مرور مؤقتة'}else{setNewMemberCredential({email:memberEmail,username:memberUsername.trim(),password:null,error:'لم تُرجع خدمة المصادقة كلمة المرور'});linkMessage='؛ لم يتم إنشاء كلمة المرور. أعد المحاولة من نافذة بيانات الدخول'}}catch(err){setNewMemberCredential({email:memberEmail,username:memberUsername.trim(),password:null,error:err.message});linkMessage='؛ تم حفظ الصلاحية ولم تُنشأ كلمة المرور. افتح نافذة بيانات الدخول لإعادة المحاولة'}const response=await (await fetch('/api/erp?module=members',{cache:'no-store'})).json();if(!Array.isArray(response.rows))throw Error('تعذر تحديث سجل الصلاحيات');setMembers(response.rows);setMemberEmail('');setMemberContactEmail('');setMemberUsername('');setMemberSelectedProjects([]);notify('تم حفظ الصلاحية'+linkMessage)}catch(e){notify(e.message)}}}><input required type="email" placeholder="بريد الدخول الفريد (لا يُكرر)" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)}/><input type="email" placeholder="بريد التواصل المشترك (اختياري)" value={memberContactEmail} onChange={e=>setMemberContactEmail(e.target.value)}/><input required type="text" minLength={3} maxLength={64} placeholder="اسم المستخدم (عربي أو إنجليزي)" dir="auto" value={memberUsername} onChange={e=>setMemberUsername(e.target.value)}/><select value={memberRole} onChange={e=>{const role=e.target.value;setMemberRole(role);setMemberProject(role==='project_manager'?'selected':'*');setMemberSelectedProjects([])}}><option value="hr">شؤون الموظفين</option><option value="administrative_assistant">مساعد الإدارة</option><option value="finance">الإدارة المالية</option><option value="project_manager">مدير مشروع</option><option value="projects_director">إدارة المشاريع</option><option value="administrative_manager">المدير الإداري</option><option value="employee">موظف — بوابة الحضور</option></select><select value={memberEmployee} onChange={e=>setMemberEmployee(e.target.value)}><option value="">ربط سجل موظف للحضور — اختياري</option>{rows.filter(r=>r.module==='employees').map(r=><option key={r.id} value={r.id}>{r.data.name} · {r.data.code}</option>)}</select><select value={memberCompany} onChange={e=>setMemberCompany(e.target.value)}><option value="*">صلاحية جميع الشركات</option>{companies.map(c=><option key={c}>{c}</option>)}</select>{memberRole==='project_manager'&&<ManagerProjectPicker projects={rows} managerEmail={memberEmail} companies={memberCompany==='*'?'*':[memberCompany]} mode={memberProject==='*'?'all':'selected'} selected={memberSelectedProjects} onModeChange={mode=>setMemberProject(mode==='all'?'*':'selected')} onSelectedChange={setMemberSelectedProjects}/>}
 <details className="permission-grid"><summary>تفصيل الصلاحيات حسب النافذة</summary>{financeModules.map(k=><div key={k}><b>{modules[k]?.label||'المطالبات المالية واستحقاقات العملاء'}</b>{[['view','عرض'],['edit','تعديل'],['approve','اعتماد']].map(([action,label])=><label key={action}><input type="checkbox" checked={k==='client_finance'?financePermissions(memberRole,memberPermissions,action):permissionChoice(memberRole,memberPermissions,k,action)} onChange={e=>setMemberPermissions({...memberPermissions,[k+':'+action]:e.target.checked})}/>{label}</label>)}</div>)}</details><div className="member-account-actions"><button type="submit" className="primary">حفظ الحساب والصلاحيات</button><button type="button" disabled title="أضف المستخدم واحفظه أولًا ثم افتح إدارة الحساب">إعادة تعيين كلمة المرور</button><button type="button" disabled title="يُرسل رابط الإعداد تلقائيًا بعد حفظ مستخدم له اسم مستخدم">إرسال رابط الاستعادة عبر البريد</button></div></form></div>}
 <div className="members-table-scroll"><table className="members-directory-table"><thead><tr><th>م</th><th>المستخدم</th><th>المسمى</th><th>نوع الحساب</th><th>نوع الشركة</th><th>نطاق المشاريع</th><th>الحالة</th><th>الصلاحيات</th><th>إدارة</th></tr></thead><tbody>{visibleMembers.map((m,i)=><Fragment key={m.email}><tr><td className="members-number">{i+1}</td><td><strong>{m.username||m.email.split('@')[0]}</strong><small dir="ltr">{m.email}</small></td><td>{memberRoleLabel[m.role]||m.role}</td><td>{memberRoleLabel[m.role]||m.role}</td><td><span className="members-soft-pill">{m.companies==='*'?'الشركات':'محددة'}</span></td><td><span className="members-project-pill">{m.projects==='*'?'الكل':(()=>{try{return JSON.parse(m.projects).length}catch{return 'محدد'}})()}</span></td><td><span className={m.is_active!==false?"members-active-pill":"members-soft-pill"}>{m.is_active!==false?"نشط":"غير نشط"}</span>{!m.auth_ready&&<small>لم يُنشأ حساب الدخول</small>}{m.auth_ready&&!m.auth_confirmed&&<small>لم يُؤكد البريد</small>}</td><td><button type="button" className="members-permissions-toggle" aria-expanded={expandedPermissions===m.email} onClick={()=>setExpandedPermissions(p=>p===m.email?null:m.email)}>{expandedPermissions===m.email?'إخفاء الصلاحيات':'عرض جميع الصلاحيات'} ({memberPermissionRows(m).filter(p=>p.view||p.edit||p.approve).length}/{Object.keys(modules).length})</button></td><td><div className="row-actions"><button type="button" onClick={()=>startMemberEdit(m)}>تعديل الصلاحية</button><button type="button" disabled={memberBusy} onClick={()=>openCredentialManager(m)}>بيانات الدخول / واتساب</button><button type="button" disabled={memberBusy||!m.username} title={!m.username?'احفظ اسم المستخدم أولًا':undefined} onClick={()=>sendMemberPasswordLink(m.email,m.username)}>رابط كلمة المرور</button><button type="button" disabled={memberBusy||m.role==='admin'} onClick={async()=>{if(!window.confirm(m.is_active===false?'تفعيل المستخدم؟':'تعطيل هذا المستخدم ومنعه من الوصول إلى المنصة؟'))return;setMemberBusy(true);try{const result=await post({action:'set_member_status',email:m.email,is_active:m.is_active===false});setMembers(old=>old.map(x=>x.email===m.email?{...x,is_active:result.is_active}:x));notify(result.is_active?'تم تفعيل المستخدم':'تم تعطيل المستخدم')}catch(err){notify(err.message||'تعذر تعديل الحالة')}finally{setMemberBusy(false)}}}>{m.is_active===false?'تفعيل المستخدم':'تعطيل المستخدم'}</button><button type="button" disabled={m.role==='admin'} onClick={async()=>{if(!window.confirm('إزالة صلاحية هذا المستخدم؟'))return;try{await post({action:'remove_member',email:m.email});setMembers(members.filter(x=>x.email!==m.email))}catch(e){notify(e.message)}}}>إزالة الصلاحية</button></div></td></tr>{expandedPermissions===m.email&&<tr className="members-permissions-expanded"><td colSpan={9}><div className="members-permissions-panel"><div className="members-permissions-title"><strong>جميع صلاحيات المستخدم: {m.username||m.email}</strong><small>تفاصيل كل نافذة، بما فيها النوافذ غير المسموح بها. «مخصص» يعني وجود إعداد محفوظ يختلف عن الافتراضي أو يؤكده.</small></div><div className="members-permissions-scroll"><table className="members-permissions-matrix"><thead><tr><th>النافذة</th><th>عرض</th><th>تعديل</th><th>اعتماد*</th><th>مصدر الإعداد</th></tr></thead><tbody>{memberPermissionRows(m).map(p=><tr key={p.key}><td>{p.label}</td>{[['view','عرض'],['edit','تعديل'],['approve','اعتماد']].map(([key,label])=><td key={key}><span className={p[key]?'permission-yes':'permission-no'} aria-label={label+': '+(p[key]?'مسموح':'غير مسموح')}>{p[key]?'✓ مسموح':'—'}</span></td>)}<td>{p.source}</td></tr>)}</tbody></table></div><small className="members-permission-note">* اعتماد الطلبات مشروط أيضًا بتسلسل الاعتماد والمرحلة الحالية. الصلاحيات التشغيلية الخاصة بالمنصة (إدارة المستخدمين وسجل العمليات والنقل) مقصورة على المدير ولا تمنحها هذه المصفوفة.</small><button type="button" className="members-edit-from-matrix" onClick={()=>startMemberEdit(m)}>{m.role==='admin'?'تعديل بيانات المدير':'تعديل هذه الصلاحيات'}</button></div></td></tr>}</Fragment>)}{!visibleMembers.length&&<tr><td colSpan={9} className="members-empty">لا توجد نتائج مطابقة. جرّب تعديل الفلاتر.</td></tr>}</tbody></table></div>
 <p className="members-footer-note">الصلاحيات تُطبّق وفق الدور ونطاق الشركات وإعدادات النوافذ. إنشاء كلمة المرور يتم برابط آمن ولا تُخزَّن داخل المنصة.</p>
 </section>}
{memberEdit&&module==='members'&&<div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="تعديل صلاحيات المستخدم" style={{width:'min(95vw,820px)',maxHeight:'90vh',overflowY:'auto',padding:22}}>
 <h2>تعديل جميع بيانات المستخدم وصلاحياته</h2><p>يمكن تعديل البريد واسم المستخدم (بالعربية أو الإنجليزية) والدور وسجل الموظف ونطاق الشركات والمشاريع وصلاحيات النوافذ. يمكن تحديث اسم مستخدم المدير وربطه بموظف، بينما يظل دوره وصلاحياته وبريده محمية.</p>
 <form onSubmit={saveMemberEdit}>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
   <label>البريد الإلكتروني<input type="email" dir="ltr" required disabled={memberEdit.role==='admin'} value={memberEdit.email} onChange={e=>setMemberEdit(p=>({...p,email:e.target.value}))}/></label>
   <label>بريد التواصل (يمكن مشاركته)<input type="email" dir="ltr" required value={memberEdit.contact_email||''} onChange={e=>setMemberEdit(p=>({...p,contact_email:e.target.value}))}/></label><label>اسم المستخدم<input type="text" dir="ltr" minLength={3} maxLength={64} value={memberEdit.username||''} onChange={e=>setMemberEdit(p=>({...p,username:e.target.value}))} placeholder="username"/></label>
   <label>الدور الوظيفي<select disabled={memberEdit.role==='admin'} value={memberEdit.role} onChange={e=>setMemberEdit(p=>({...p,role:e.target.value}))}>{[['hr','شؤون الموظفين'],['administrative_assistant','مساعد الإدارة'],['finance','الإدارة المالية'],['project_manager','مدير مشروع'],['projects_director','إدارة المشاريع'],['administrative_manager','المدير الإداري'],['employee','موظف']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>سجل الموظف المرتبط<select value={memberEdit.employee_id||""} onChange={e=>setMemberEdit(p=>({...p,employee_id:e.target.value}))}><option value="">بدون ربط بموظف</option>{rows.filter(x=>x.module==='employees').map(x=><option key={x.id} value={x.id}>{x.data.name||x.data.employee_name||x.data.code} · {x.data.code||x.code}</option>)}</select></label>
   <label>نطاق الشركات<select disabled={memberEdit.role==='admin'} value={memberEdit.companyMode} onChange={e=>setMemberEdit(p=>({...p,companyMode:e.target.value}))}><option value="all">جميع الشركات</option><option value="selected">شركات محددة</option></select></label>
   {memberEdit.companyMode==='selected'&&<fieldset className="member-scope-picker"><legend>حدد الشركات المسموحة</legend>{companies.map(c=><label key={c}><input type="checkbox" disabled={memberEdit.role==='admin'} checked={memberEdit.selectedCompanies.includes(c)} onChange={e=>setMemberEdit(p=>({...p,selectedCompanies:e.target.checked?[...p.selectedCompanies,c]:p.selectedCompanies.filter(x=>x!==c)}))}/>{c}</label>)}</fieldset>}
   {memberEdit.role!=='project_manager'&&<label>نطاق المشاريع<select disabled={memberEdit.role==='admin'} value={memberEdit.projectMode} onChange={e=>setMemberEdit(p=>({...p,projectMode:e.target.value}))}><option value="all">جميع المشاريع</option><option value="selected">مشاريع محددة</option></select></label>}
   {memberEdit.role==='project_manager'&&<ManagerProjectPicker projects={rows} managerEmail={memberEdit.email} companies={memberEdit.companyMode==='all'?'*':memberEdit.selectedCompanies} mode={memberEdit.projectMode} selected={memberEdit.selectedProjects} disabled={memberBusy} onModeChange={mode=>setMemberEdit(p=>({...p,projectMode:mode}))} onSelectedChange={ids=>setMemberEdit(p=>({...p,selectedProjects:ids}))}/>}
   {memberEdit.role!=='project_manager'&&memberEdit.projectMode==='selected'&&<fieldset className="member-scope-picker"><legend>حدد المشاريع المسموحة</legend>{rows.filter(x=>x.module==='projects'&&(memberEdit.companyMode==='all'||memberEdit.selectedCompanies.includes(x.company))).map(x=><label key={x.id}><input type="checkbox" disabled={memberEdit.role==='admin'} checked={memberEdit.selectedProjects.includes(x.id)} onChange={e=>setMemberEdit(p=>({...p,selectedProjects:e.target.checked?[...p.selectedProjects,x.id]:p.selectedProjects.filter(id=>id!==x.id)}))}/>{x.data.name||x.code||x.id}</label>)}{!rows.some(x=>x.module==='projects')&&<span>لا توجد مشاريع ظاهرة في السجلات.</span>}</fieldset>}
  </div>
  <p style={{marginTop:15}}>تحديد صلاحيات كل نافذة (عرض / تعديل / اعتماد)</p>
  <div className="permission-grid" style={{display:'grid',gap:10,maxHeight:300,overflowY:'auto'}}>{financeModules.map(k=><div key={k} style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',padding:'8px 0',borderBottom:'1px solid #e4e0d5'}}><b style={{minWidth:170}}>{modules[k]?.label||'المطالبات المالية واستحقاقات العملاء'}</b>{[['view','عرض'],['edit','تعديل'],['approve','اعتماد']].map(([action,label])=><label key={action} style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" disabled={memberBusy||memberEdit.role==='admin'} checked={k==='client_finance'?financePermissions(memberEdit.role,memberEditPermissions,action):permissionChoice(memberEdit.role,memberEditPermissions,k,action)} onChange={e=>setMemberEditPermissions(p=>({...p,[k+':'+action]:e.target.checked}))}/>{label}</label>)}</div>)}</div>
  <div className="member-account-actions">
 <button type="submit" className="primary" disabled={memberBusy}>حفظ الحساب والصلاحيات</button>
 <button type="button" disabled={memberBusy||!memberEdit.username||memberEdit.email!==memberEdit.original_email} onClick={()=>openCredentialManager(memberEdit)} title={!memberEdit.username?'احفظ اسم المستخدم أولًا':memberEdit.email!==memberEdit.original_email?'احفظ البريد الجديد أولًا':undefined}>إعادة تعيين كلمة المرور</button>
 <button type="button" disabled={memberBusy||!memberEdit.username||memberEdit.email!==memberEdit.original_email} onClick={()=>sendMemberPasswordLink(memberEdit.email,memberEdit.username)} title={!memberEdit.username?'احفظ اسم المستخدم أولًا':memberEdit.email!==memberEdit.original_email?'احفظ البريد الجديد أولًا':undefined}>إرسال رابط الاستعادة عبر البريد</button>
 <button type="button" className="member-close-action" disabled={memberBusy} onClick={()=>setMemberEdit(null)}>إغلاق</button>
 </div>
 </form>
 <small>بعد حفظ اسم المستخدم اضغط «إرسال رابط تعيين كلمة المرور». إذا غيّرت البريد فاحفظ التعديل أولًا. لا تُعرض كلمة المرور للمدير.</small>
 </section></div>}
{newMemberCredential&&module==='members'&&<div className="modal-backdrop" role="presentation"><section className="modal member-reset-dialog" role="dialog" aria-modal="true" aria-label="كلمة مرور المستخدم الجديد"><h2>تم إنشاء بيانات دخول المستخدم</h2><p>كلمة المرور مؤقتة وتظهر مرة واحدة فقط. استخدم قناة خاصة آمنة لمشاركتها ولا ترسلها بالبريد كنص صريح.</p><p><b>اسم المستخدم:</b> {newMemberCredential.username}</p><p><b>بريد الدخول:</b> <span dir="ltr">{newMemberCredential.email}</span></p><label className="credential-whatsapp-phone">رقم جوال واتساب (مع رمز الدولة)<input type="tel" dir="ltr" inputMode="tel" placeholder="9665xxxxxxxx" value={credentialPhone} onChange={e=>setCredentialPhone(e.target.value)}/></label>{newMemberCredential.password?<div className="member-generated-password"><b>كلمة المرور المؤقتة (تظهر مرة واحدة):</b><code dir="ltr">{newMemberCredential.password}</code><button type="button" onClick={()=>navigator.clipboard.writeText(newMemberCredential.password).then(()=>notify('تم نسخ كلمة المرور')).catch(()=>notify('انسخ كلمة المرور يدويًا'))}>نسخ كلمة المرور</button></div>:<div className="member-generated-password"><b>لم يتم إنشاء كلمة مرور بعد</b><small>{newMemberCredential.error||'حساب الصلاحية محفوظ، لكن حساب تسجيل الدخول لم يكتمل.'}</small><button type="button" disabled={memberBusy} onClick={async()=>{setMemberBusy(true);try{const result=await post({action:'generate_temporary_password',email:newMemberCredential.email});if(!result.password)throw Error('لم تُرجع خدمة المصادقة كلمة مرور');setNewMemberCredential({...newMemberCredential,password:result.password,error:null});notify('تم توليد كلمة المرور وعرضها')}catch(err){setNewMemberCredential(old=>({...old,error:err.message}));notify(err.message)}finally{setMemberBusy(false)}}}>إعادة محاولة إنشاء كلمة المرور</button></div>}<div className="member-account-actions"><button type="button" disabled={!newMemberCredential.password} onClick={()=>shareMemberOnWhatsApp(newMemberCredential)}>مشاركة بيانات الدخول عبر واتساب</button><button type="button" onClick={async()=>{try{const response=await post({action:'send_password_link',email:newMemberCredential.email});notify(response.ok?'تم طلب إرسال رابط الاستعادة':'تعذر الإرسال')}catch(err){notify(err.message)}}}>إرسال رابط استعادة آمن</button><button type="button" className="primary" onClick={()=>setNewMemberCredential(null)}>إغلاق بعد حفظ البيانات</button></div></section></div>}{passwordResetDialog&&module==='members'&&<div className="modal-backdrop" role="presentation" onClick={()=>{if(!memberBusy){setGeneratedPassword(null);setPasswordResetDialog(null)}}}><section className="modal member-reset-dialog" role="dialog" aria-modal="true" aria-label="إعادة تعيين كلمة المرور" onClick={e=>e.stopPropagation()}>
 <h2>بيانات دخول المستخدم ومشاركتها</h2>
 <p>أنشئ كلمة مرور مؤقتة للحساب أو أرسل رابط الاستعادة إلى بريد المستخدم. كلمة المرور الجديدة تظهر هنا مرة واحدة فقط بعد إنشائها.</p>
 <p><b>اسم المستخدم:</b> {passwordResetDialog.username||'لم يُحفظ اسم مستخدم بعد'}</p><p><b>بريد الدخول:</b> <span dir="ltr">{passwordResetDialog.email}</span></p>
 <label className="credential-whatsapp-phone">رقم جوال واتساب (مع رمز الدولة)<input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="9665xxxxxxxx" value={credentialPhone} onChange={e=>setCredentialPhone(e.target.value)}/></label>
 {generatedPassword&&<div className="member-generated-password"><b>كلمة المرور المؤقتة (تظهر مرة واحدة):</b><code dir="ltr">{generatedPassword.password}</code><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(generatedPassword.password);notify('تم نسخ كلمة المرور')}catch{notify('حدد كلمة المرور وانسخها يدويًا')}}}>نسخ كلمة المرور</button><small>شاركها مع المستخدم عبر قناة خاصة، واطلب منه تغييرها بعد الدخول. لا تُحفظ في سجل الصلاحيات.</small></div>}
 <div className="member-account-actions"><button type="button" disabled={memberBusy||!generatedPassword?.password||!passwordResetDialog.username} onClick={()=>shareMemberOnWhatsApp({username:passwordResetDialog.username,password:generatedPassword?.password})}>مشاركة بيانات الدخول عبر واتساب</button><button type="button" className="primary" disabled={memberBusy||passwordResetDialog.role==='admin'} title={passwordResetDialog.role==='admin'?'حساب المدير يُستعاد عن طريق البريد الإلكتروني فقط':undefined} onClick={generateMemberPassword}>توليد كلمة مرور مؤقتة</button><button type="button" disabled={memberBusy} onClick={async()=>{await sendMemberPasswordLink(passwordResetDialog.email,passwordResetDialog.username)}}>إرسال رابط الاستعادة عبر البريد</button><button type="button" disabled={memberBusy} onClick={()=>{setGeneratedPassword(null);setPasswordResetDialog(null)}}>إغلاق</button></div>
 </section></div>}
{module==='audit'&&<section className="panel"><div className="panel-head"><h2>سجل العمليات</h2><span>آخر 100 عملية</span></div><div className="table-wrap"><table><thead><tr><th>المستخدم</th><th>العملية</th><th>الوقت</th><th>التفاصيل</th></tr></thead><tbody>{audit.map(r=><tr key={r.id}><td>{r.actor}</td><td>{{create:'إضافة',update:'تعديل',transition:'تغيير مرحلة',member:'صلاحية مستخدم'}[r.action]||r.action}</td><td>{new Date(r.at).toLocaleString('ar-SA')}</td><td>{(()=>{try{const d=JSON.parse(r.details);return [d.module?modules[d.module]?.label:'',d.company,d.from?'من '+(states[d.from]||d.from):'',d.to?'إلى '+(states[d.to]||d.to):'',d.note,d.reference,d.name].filter(Boolean).join(' · ')||'عملية مسجلة'}catch{return 'عملية مسجلة'}})()}</td></tr>)}</tbody></table></div></section>}
<footer><span>شؤون الموظفين <b>HR · V57</b></span><span>رياح الاعمار · مسكن الكيان · البلد المتحدة · احواض الطاقة</span><a href="/signout-with-chatgpt?return_to=/" target="_top"><LogOut size={14}/>خروج</a></footer></main></div>
{module==='employees'&&employeeFilterOpen&&<div className="modal-backdrop" onClick={()=>setEmployeeFilterOpen(false)}>
 <section className="modal" role="dialog" aria-modal="true" aria-label="فلاتر سجل الموظفين" onClick={e=>e.stopPropagation()} style={{maxWidth:900,width:'min(96vw,900px)',maxHeight:'90vh',overflowY:'auto'}}>
  <div className="modal-head"><div><span className="eyebrow">بحث متقدم</span><h2>فلاتر سجل الموظفين لكل حقل</h2></div><button type="button" onClick={()=>setEmployeeFilterOpen(false)} aria-label="إغلاق الفلاتر"><X/></button></div>
  <p>يمكن تصفية الموظفين بأي حقل أو بعدة حقول معًا. تُطبَّق الفلاتر على الجدول والطباعة وتصدير Excel دون تعديل سجلات الموظفين.</p>
  <div className="form-grid">{availableEmployeeFields.map(f=><label key={f.key}>{f.label}
   {f.key==='company'||['employment_status','sponsorship','payment_method'].includes(f.key)?
    <select value={employeeFieldFilters[f.key]||''} onChange={e=>setEmployeeFieldFilters(old=>({...old,[f.key]:e.target.value}))}><option value="">جميع القيم</option>{[...new Set(rows.filter(r=>r.module==='employees').map(r=>{
     const v=f.key==='company'?r.company:employeeRegisterValue(r,f.key,rows);
     const type=modules.employees.fields.find(x=>x.key===f.key)?.type;
     return type&&enumOptions[type]?enumOptions[type].find(opt=>opt[0]===v)?.[1]||v:v;
    }).filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(String))].sort((a,b)=>a.localeCompare(b,'ar')).map(v=><option key={v} value={v}>{v}</option>)}</select>:
    <input type="search" value={employeeFieldFilters[f.key]||''} placeholder={'بحث في '+f.label} onChange={e=>setEmployeeFieldFilters(old=>({...old,[f.key]:e.target.value}))}/>}
  </label>)}</div>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',paddingTop:20}}>
   <small>النتائج المطابقة حاليًا: {list.length} موظف · فلاتر نشطة: {activeEmployeeFilters.length}</small>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" onClick={()=>setEmployeeFieldFilters({})}>مسح الكل</button><button className="primary" type="button" onClick={()=>setEmployeeFilterOpen(false)}>عرض النتائج</button></div>
  </div>
 </section>
</div>}
{edit&&spec&&<div className="modal-backdrop" onClick={()=>!saving&&setEdit(null)}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{edit.id?'بيانات السجل':'سجل جديد'}</span><h2>{module==='employees'?(edit.id?(employeeReadOnly?'عرض بيانات الموظف':'تعديل بيانات الموظف'):'إضافة موظف جديد'):spec.singular}</h2></div><button disabled={saving} onClick={()=>setEdit(null)} aria-label="إغلاق"><X/></button></div>{module==='employees'&&edit.id&&<div className="employee-edit-mode"><span>{employeeReadOnly?'وضع العرض: الحقول للقراءة فقط':'وضع التعديل: يمكن تغيير البيانات ثم حفظ السجل'}</span>{employeeReadOnly&&permittedWrite(user||{},'employees')&&<button type="button" disabled={saving} onClick={()=>setEmployeeReadOnly(false)}>تفعيل تعديل بيانات الموظف</button>}</div>}{module==='employees'&&edit.id&&['admin','hr'].includes(user?.role)&&permittedWrite(user||{},'employees')&&<div style={{padding:'8px 0 12px',display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="primary" disabled={saving} onClick={()=>cloneEmployeeToSecondCompany(edit)}>إضافة الموظف إلى شركة ثانية (سجل مستقل)</button><small>للنقل الكامل: فعّل التعديل، ثم اختر الشركة الجديدة من حقل الشركة. يحتفظ النظام بمعاملات الشركة السابقة.</small></div>}{module==='employees'&&edit.dual_source_id&&<div className="employee-company-transfer-note" role="status"><strong>إضافة توظيف ثانٍ مستقل</strong><span>الأصل: {edit.dual_source_company} / رقم {edit.dual_source_code}. اختر شركة مختلفة؛ وسيتم توليد رقم وظيفي جديد تلقائيًا عند الحفظ. بيانات الهوية منسوخة للمراجعة، بينما الراتب والبدلات والتحويل البنكي قابلة للتعديل باستقلال. لن يتغير سجل الشركة الأولى.</span></div>}{module==='employees'&&edit.id&&<div style={{padding:'12px 0',display:'flex',gap:8,flexWrap:'wrap'}}>{[['leave','الإجازات'],['advances','السلف'],['warnings','الإنذارات'],['resignations','الاستقالات'],['returns','المباشرة'],['terminations','إنهاء الخدمة'],['leave_dues','مستحقات الإجازة'],['settlements','المخالصات']].filter(([key])=>allowed.includes(key)).map(([key,label])=><button key={key} type="button" disabled={saving} onClick={()=>{setLinkedEmployee({id:edit.id,name:edit.data.name||edit.data.employee_name||edit.data.code||'الموظف'});setEdit(null);setModule(key);}}>{label} ({rows.filter(x=>x.module===key&&x.data?.employee_id===edit.id).length})</button>)}</div>}{edit&&['leave','advances','resignations','returns','terminations','leave_dues','settlements','warnings','appointments'].includes(module)&&managerDirectoryForRequest(edit,edit.company)&&<div className="employee-payout-summary" role="status"><strong>مسؤولية المدير والموافقات</strong><div>المدير المباشر للموظف: {managerDirectoryForRequest(edit,edit.company).direct_name||'لم يربط بعد'}</div><div>بريد المدير المباشر: {managerDirectoryForRequest(edit,edit.company).direct_email||'غير محدد'}</div><div>{'المشروع: '+managerDirectoryForRequest(edit,edit.company).project}</div><div>{'مدير المشروع: '+(managerDirectoryForRequest(edit,edit.company).name||'لم يتم تعيينه')}</div><div>{'بريد المدير: '+(managerDirectoryForRequest(edit,edit.company).email||'غير محدد')}</div><small>تُرسل الإجازات والسلف إلى مدير المشروع المعين على مشروع الموظف، حتى إن اختلف عن المدير المباشر؛ يراجع المدير المخوّل فقط ثم إدارة المشاريع وشؤون الموظفين والمالية.</small></div>}{edit&&['leave','advances'].includes(module)&&<div className="request-approval-summary" role="status"><strong>دورة اعتماد الطلب</strong>
 <div className="request-approval-flow">{approvalStages.map((step,i)=>{const currentIndex=edit.status?approvalStateIndex(edit.status):0;return <div key={step.id} className={'request-approval-step '+(i<currentIndex?'done':i===currentIndex?'current':'future')}><span>{i<currentIndex?'✓':i+1}</span><b>{step.label}</b></div>})}</div>
 <small>المدير المخوّل: {managerDirectoryForRequest(edit,edit.company)?.name||'غير محدد؛ عيّن مدير مشروع نشطًا على المشروع قبل الإرسال'} · المرحلة: {states[edit.status||'draft']||'إعداد الطلب'}</small></div>}
 {edit.data._review_flags?.length>0&&<div className="review-warning-box"><b>بيانات تحتاج استكمال</b>{edit.data._source_company&&<p>الشركة كما وردت في المصدر: {edit.data._source_company}</p>}<ul>{edit.data._review_flags.map((f,i)=><li key={i}>{f}</li>)}</ul></div>}<form onSubmit={save}><fieldset disabled={saving||(module==='employees'?(employeeReadOnly||!permittedWrite(user||{},'employees')):(!!edit.id&&(edit.status!=='draft'||!permittedWrite(user||{},module))))}><label className="full">الشركة{module==='projects'&&<input type="search" aria-label="بحث الشركة" placeholder="ابحث عن الشركة بالاسم" value={projectCompanySearch} onChange={e=>setProjectCompanySearch(e.target.value)} style={{marginBottom:8}}/>}<select required value={edit.company} disabled={module!=='employees'&&!!edit.id&&edit.company!=='غير محددة'} onChange={e=>{
 const nextCompany=e.target.value;
 if(nextCompany===edit.company)return;
 if(module==='employees'&&edit.id){
  const originalCompany=rows.find(row=>row.id===edit.id)?.company||edit.company;
  if(nextCompany!==originalCompany){
   const reason=window.prompt('سبب نقل أو تصحيح شركة الموظف (سيُحفظ في سجل التدقيق، وستظل المسيرات والطلبات السابقة على شركاتها الأصلية):',edit.transfer_reason||'تصحيح تبعية الموظف');
   if(!reason?.trim())return;
   setEdit({...edit,company:nextCompany,transfer_reason:reason.trim(),data:{...edit.data,project_id:'',direct_manager_id:'',manager_email:'',supervisor_account:''}});
   return;
  }
 }
 setEdit({...edit,company:nextCompany,transfer_reason:'',data:module==='employees'?{...edit.data,project_id:'',direct_manager_id:'',manager_email:'',supervisor_account:''}:{...edit.data,employee_id:'',leave_id:'',project_id:'',contract_id:'',...(module==='leave_dues'?{salary_basis:'0',days:'0'}:{})}});
 }}>{[...companies,'غير محددة'].filter(c=>module!=='projects'||!projectCompanySearch.trim()||normalizeSearch(companyDisplayName(c)).includes(normalizeSearch(projectCompanySearch))||c===edit.company).map(c=><option key={c} value={c}>{companyDisplayName(c)}</option>)}</select>{module==='projects'&&<small>اختر الشركة قبل ربط المشروع ومديره. تظهر نتائج مطابقة للبحث.</small>}</label>{module==='employees'&&edit.id&&edit.company!==rows.find(r=>r.id===edit.id)?.company&&<div className="employee-company-transfer-note" role="status"><strong>تغيير تبعية الشركة</strong><span>سيُحدّث السجل الحالي للموظف مع الإبقاء على الرواتب والطلبات السابقة دون تغيير. يجب استبعاد الموظف من أي مسير غير مصروف قبل النقل، ومراجعة حساب الدخول المرتبط إن وجد.</span><small>السبب: {edit.transfer_reason}</small></div>} {module==='leave'&&fixedLeaveDays(edit.data.leave_type)!==null&&<p role="status" style={{fontSize:12,color:'#465f50',margin:'8px 0'}}>مدة هذه الإجازة محددة بسياسة الشركة: {fixedLeaveDays(edit.data.leave_type)} يومًا تقويميًا؛ تُحسب النهاية تلقائيًا من تاريخ البداية ولا تخصم من رصيد الإجازة السنوية.</p>}{module==='leave_dues'&&<div className="employee-payout-summary" style={{marginBottom:12}}><strong>اختيار الموظف من الشركة</strong><select aria-label="اختيار موظف مستحقات الإجازة" value={edit.data.employee_id||''} onChange={e=>{const employeeId=e.target.value;setEdit({...edit,data:{...edit.data,employee_id:employeeId,leave_id:'',salary_basis:employeeId?String(rows.find(r=>r.id===employeeId&&r.company===edit.company)?.data.salary||0):'0',days:'0'}})}}><option value="">اختر الموظف أولًا…</option>{rows.filter(r=>r.module==='employees'&&r.company===edit.company&&!r.data._archived).map(r=><option key={r.id} value={r.id}>{r.data.name} · {r.data.code||r.code}</option>)}</select><small>بعد اختيار الموظف تظهر طلبات إجازته المعتمدة فقط. يُسحب أساس الراتب والأيام تلقائيًا ويمكن مراجعة المبالغ قبل الحفظ.</small></div>}
{module!=='employees'&&['leave','advances','warnings','resignations','returns','terminations','leave_dues','settlements','appointments'].includes(module)&&linkedEmployeeFor(edit)&&<div className="employee-payout-summary" aria-live="polite"><strong>بيانات الموظف المسحوبة من السجل</strong><div className="employee-payout-grid">{[['الاسم',linkedEmployeeFor(edit)?.data.name],['الرقم الوظيفي',linkedEmployeeFor(edit)?.data.code],['القسم',linkedEmployeeFor(edit)?.data.department],['المسمى الوظيفي',linkedEmployeeFor(edit)?.data.job],['المشروع',rows.find(r=>r.id===linkedEmployeeFor(edit)?.data.project_id)?.data.name||'غير محدد'],['المدير المباشر',linkedEmployeeFor(edit)?.data.manager],['الهوية / الإقامة',linkedEmployeeFor(edit)?.data.identity],['تاريخ التعيين',linkedEmployeeFor(edit)?.data.hire_date],['الأجر الشهري',money(linkedEmployeeFor(edit)?.data.salary)+' ر.س'],['الأساسي',money(linkedEmployeeFor(edit)?.data.basic)+' ر.س'],['بدل السكن',money(linkedEmployeeFor(edit)?.data.housing)+' ر.س'],['بدل النقل',money(linkedEmployeeFor(edit)?.data.transport)+' ر.س'],['التحويل البنكي',money(linkedEmployeeFor(edit)?.data.bank_amount)+' ر.س']].map(([label,value])=><span key={label}>{label}: <b>{value||'—'}</b></span>)}</div><small>بيانات مرجعية تلقائية من سجل الموظفين؛ يتم حفظ نسخة منها مع الطلب لحفظ تاريخ المعاملة.</small></div>}
{module==='project_managers'&&<div style={{display:'grid',gap:3,padding:'9px 12px',background:'#f8f3e9',borderRadius:8,marginBottom:12}}><strong>اختيار مدير مشروع من القائمة</strong><small>ابحث عن المدير واختر القسم، ثم احفظ السجل دون إدخال بيانات الحساب يدويًا.</small></div>}
<div className="form-grid">{fieldsFor.filter(f=>module!=='project_managers'||['name','email','department'].includes(f.key)).map(f=><label className={f.type==='textarea'?'full':''} key={f.key}>{f.label}{f.required&&!((module==='employees'||module==='projects')&&!edit.id&&f.key==='code')&&<span className="required"> *</span>}{module==='projects'&&f.key==='manager_email'?<div style={{display:'grid',gap:8}}>
 <strong>مدير المشروع المسؤول</strong>
 <input type="search" aria-label="فلتر مدير المشروع" placeholder="ابحث باسم المدير أو بريده الإلكتروني" value={projectManagerSearch} onChange={e=>setProjectManagerSearch(e.target.value)}/>
 <select aria-label="اختيار مدير المشروع" value={edit.data.manager_email||''} onChange={e=>{setEdit({...edit,data:{...edit.data,manager_email:e.target.value}});setProjectManagerSearch('')}}><option value="">اختر من المدراء الستة المعتمدين…</option>{directManagerChoices(rows,members,edit.company).filter(m=>!projectManagerSearch.trim()||normalizeSearch([m.name,m.email].join(' ')).includes(normalizeSearch(projectManagerSearch))||m.email===edit.data.manager_email).map(m=><option value={m.email||'pending:'+m.id} key={m.id} disabled={!m.eligible}>{m.name}{m.eligible?' — '+m.email:m.ambiguous?' — يحتاج مراجعة حسابات مكررة':' — يحتاج ربط بريد وصلاحية مدير مشروع'}</option>)}{edit.data.manager_email&&!directManagerChoices(rows,members,edit.company).some(m=>m.email===String(edit.data.manager_email).toLowerCase())&&<option value={edit.data.manager_email}>{edit.data.manager_name||edit.data.manager_email} — تعيين سابق</option>}</select>
 <small>الأسماء الستة معتمدة للاختيار. المدير غير المفعّل يظهر في القائمة لكنه يحتاج ربط حساب وبريد وصلاحية قبل حفظ تعيينه. عند التعيين يتحدّث المدير المباشر لموظفي المشروع تلقائيًا.</small>
 </div>:module==='project_managers'&&f.key==='name'?(()=>{
 const directory=rows.filter(r=>r.module==='project_managers'&&r.company===edit.company);
 const staff=rows.filter(r=>r.module==='employees'&&r.company===edit.company&&!r.data?._archived);
 const candidates=members.filter(m=>m.role==='project_manager'&&m.is_active!==false&&(!m.companies||m.companies==='*'||(()=>{try{return JSON.parse(m.companies).includes(edit.company)}catch{return false}})())).map(m=>{
  const email=String(m.email||'').trim().toLowerCase();
  const listed=directory.find(r=>String(r.data?.email||'').trim().toLowerCase()===email);
  const employee=staff.find(r=>String(r.data?.email||'').trim().toLowerCase()===email);
  const managed=staff.find(r=>String(r.data?.manager_email||'').trim().toLowerCase()===email);
  return {email,name:listed?.data?.name||employee?.data?.name||managed?.data?.manager||m.display_name||m.username||email,department:listed?.data?.department||employee?.data?.department||'',phone:listed?.data?.phone||employee?.data?.phone||'',job:listed?.data?.job||employee?.data?.job||'مدير مشاريع'};
 }).filter(m=>preferredManagerForName(m.name)||m.email===String(edit.data.email||'').trim().toLowerCase());
 const choices=candidates.filter(m=>!managerRecordSearch||normalizeSearch([m.name,m.email,m.department].join(' ')).includes(normalizeSearch(managerRecordSearch)));
 const current=candidates.find(m=>m.email===String(edit.data.email||'').toLowerCase());
 return <div style={{display:'grid',gap:7}}>
  <input type="text" aria-label="اسم مدير المشروع المحدد" readOnly value={edit.data.name||''} placeholder="اختر الاسم من القائمة أدناه"/>
  <input type="search" aria-label="فلترة أسماء مدراء المشاريع" placeholder="ابحث بالاسم أو البريد أو القسم لتصفية القائمة" value={managerRecordSearch} onChange={e=>setManagerRecordSearch(e.target.value)}/>
  <select required aria-label="اختيار اسم مدير المشروع من القائمة" value={edit.data.email||''} onChange={e=>{
   const m=candidates.find(x=>x.email===e.target.value);
   setFormError('');
   if(!m){setEdit({...edit,data:{...edit.data,name:'',email:'',department:''}});setManagerRecordSearch('');return}
   const existingRecord=directory.find(r=>String(r.data?.email||'').trim().toLowerCase()===m.email);
   if(existingRecord&&existingRecord.id!==edit.id){
    setEdit({...existingRecord,data:{...existingRecord.data}});
    notify('هذا المدير مسجل لدى الشركة؛ تم فتح سجله الحالي للتعديل');
   }else if(edit.id&&String(edit.data.email||'').trim().toLowerCase()!==m.email){
    setEdit({company:edit.company,data:{name:m.name,email:m.email,department:m.department,phone:m.phone,job:m.job}});
    notify('تم إعداد سجل جديد للمدير المختار دون تعديل حساب المدير السابق');
   }else setEdit({...edit,data:{...edit.data,name:m.name,email:m.email,department:edit.data.department||m.department,phone:edit.data.phone||m.phone,job:edit.data.job||m.job}});
   setManagerRecordSearch('');
  }}><option value="">اختر مدير المشروع…</option>{preferredProjectManagers.map(p=>{const matching=choices.filter(m=>preferredManagerForName(m.name)?.id===p.id),active=matching.length===1?matching[0]:null;return <option key={p.id} value={active?.email||'pending:'+p.id} disabled={!active}>{p.name}{active?' — '+active.email:matching.length>1?' — حسابات متكررة تحتاج مراجعة':' — يحتاج ربط حساب نشط'}</option>})}{current&&!preferredManagerForName(current.name)&&<option value={current.email}>{current.name} — {current.email}</option>}{edit.data.email&&!current&&<option value={edit.data.email}>{edit.data.name||edit.data.email} — حساب غير متاح أو غير نشط</option>}</select>
  <small>الاسم المحدد: <b>{edit.data.name||'لم يُحدّد بعد'}</b> · {choices.length} حساب مطابق. تظهر الأسماء الستة كاملة، ولا يمكن اختيار اسم دون حساب نشط ومخوّل للشركة.</small>
  {formError&&<div role="alert" style={{color:'#a12724',background:'#fff1ee',border:'1px solid #dfaaa2',borderRadius:8,padding:'9px 12px',fontSize:13}}>{formError}</div>}
 </div>;
})():module==='project_managers'&&f.key==='email'?<input type="email" dir="ltr" readOnly aria-label="بريد حساب المدير المحدد" value={edit.data.email||''} placeholder="يُملأ عند اختيار الاسم"/>:module==='project_managers'&&f.key==='department'?(()=>{
 const directory=rows.filter(r=>r.module==='project_managers'&&r.company===edit.company);
 const employees=rows.filter(r=>r.module==='employees'&&r.company===edit.company&&!r.data?._archived);
 const account=String(edit.data.email||'').trim().toLowerCase();
 const associated=employees.filter(r=>String(r.data?.email||'').trim().toLowerCase()===account||String(r.data?.manager_email||'').trim().toLowerCase()===account);
 const departments=[...new Set([...associated.map(r=>r.data?.department),...directory.map(r=>r.data?.department),...employees.map(r=>r.data?.department),'إدارة المشاريع'].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
 return <select required aria-label="اختيار الإدارة والقسم من القائمة" value={edit.data.department||''} onChange={e=>setEdit({...edit,data:{...edit.data,department:e.target.value}})}><option value="">اختر الإدارة / القسم…</option>{departments.map(value=><option key={value} value={value}>{value}</option>)}</select>;
})():module==='projects'&&f.key==='name'?<div style={{display:'grid',gap:8}}>
 <input type="search" list="project-name-suggestions" aria-label="فلتر اسم المشروع" placeholder="اكتب اسم المشروع أو اختره من الاقتراحات" required value={edit.data.name||''} onChange={e=>setEdit({...edit,data:{...edit.data,name:e.target.value}})}/>
 <datalist id="project-name-suggestions">{[...new Set(rows.filter(r=>r.module==='projects'&&r.company===edit.company).map(r=>r.data.name).filter(Boolean))].filter(v=>!edit.data.name||normalizeSearch(v).includes(normalizeSearch(edit.data.name))).slice(0,100).map(v=><option key={v} value={v}/>)}</datalist>
 <small>يمكن البحث في أسماء مشاريع الشركة أو كتابة اسم مشروع جديد.</small>
 </div>:module==='appointments'&&['direct_manager','work_location','work_hours','form_status','contract_type','probation'].includes(f.key)?<div style={{display:'grid',gap:6}}>
 <input type="search" list={'appointment-options-'+f.key} aria-label={'فلتر '+f.label} placeholder={'ابحث أو اختر '+f.label} value={edit.data[f.key]||''} onChange={e=>setEdit({...edit,data:{...edit.data,[f.key]:e.target.value}})} autoComplete="off"/>
 <datalist id={'appointment-options-'+f.key}>{[...new Set([
 ...(f.key==='direct_manager'?rows.filter(r=>r.module==='projects'&&r.company===edit.company).map(r=>r.data.manager_name).concat(rows.filter(r=>r.module==='project_managers'&&r.company===edit.company).map(r=>r.data.name)):[]),
 ...(f.key==='work_location'?rows.filter(r=>r.module==='projects'&&r.company===edit.company).map(r=>r.data.name):[]),
 ...(f.key==='work_hours'?['8','6','7','9','10','12']:[]),
 ...(f.key==='contract_type'?['عقد دوام ثابت','عقد محدد المدة','عقد غير محدد المدة','عقد دوام جزئي','عقد مؤقت']:[]),
 ...(f.key==='probation'?['بدون فترة تجربة','30 يومًا','60 يومًا','90 يومًا','180 يومًا','3 شهور','6 شهور']:[]),
 ...(f.key==='form_status'?['قيد التجهيز','جاهز للاعتماد','مكتمل','ملغي']:[]),
 ...rows.filter(r=>r.module==='appointments'&&r.company===edit.company).map(r=>r.data[f.key])
 ].map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')).map(value=><option key={value} value={value}/>)}</datalist>
 </div>:module==='projects'&&f.key==='code'?<div style={{display:'grid',gap:6}}>
 <input type="text" aria-label="رمز المشروع التسلسلي" value={edit.id?(edit.data.code||''):'يُولّد تلقائيًا عند الحفظ'} readOnly disabled={!edit.id} style={{direction:'ltr',textAlign:'center'}}/>
 <small>رمز مختصر من 4 أرقام، فريد على مستوى المنصة، ولا يُغيّر يدويًا.</small>
 </div>:module==='employees'&&!edit.id&&f.key==='code'?<input type="text" value="يُولّد تلقائيًا عند الحفظ" disabled aria-label="الرقم الوظيفي يُولّد تلقائيًا عند الحفظ"/>:
module==='employees'&&f.key==='department'?<><input type="search" list="employee-department-choices" placeholder="ابحث أو اختر القسم" autoComplete="off" value={edit.data.department||''} onChange={e=>setEdit({...edit,data:{...edit.data,department:e.target.value}})}/><datalist id="employee-department-choices">{[...new Set(rows.filter(r=>r.module==='employees'&&r.company===edit.company).map(r=>String(r.data.department||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')).map(value=><option key={value} value={value}/>)}</datalist></>:
module==='employees'&&f.key==='manager'?<div className="employee-manager-picker">
 <input type="search" aria-label="بحث المدير المباشر" placeholder="ابحث باسم المدير أو رقم الجوال أو البريد" value={employeeManagerSearch} onChange={e=>setEmployeeManagerSearch(e.target.value)} autoComplete="off"/>
 {(()=>{const available=rows.filter(r=>r.module==='project_managers'&&r.company===edit.company&&members.some(m=>m.role==='project_manager'&&m.is_active!==false&&String(m.email||'').toLowerCase()===String(r.data.email||'').toLowerCase()));
 const matches=available.filter(r=>!employeeManagerSearch||normalizeSearch([r.data.name,r.data.email,r.data.phone,r.data.department].join(' ')).includes(normalizeSearch(employeeManagerSearch)));
 const chosenProject=rows.find(r=>r.module==='projects'&&r.id===edit.data.project_id);
 const projectManagerEmail=String(chosenProject?.data?.manager_email||'').trim().toLowerCase();
 const linkedManager=available.find(r=>String(r.data.email||'').trim().toLowerCase()===projectManagerEmail);
 const chosen=linkedManager||available.find(r=>r.id===edit.data.direct_manager_id);
 return <><select aria-label="اختيار المدير المباشر من الدليل" value={linkedManager?.id||''} disabled={!!projectManagerEmail} onChange={e=>{const m=available.find(x=>x.id===e.target.value);setEdit({...edit,data:{...edit.data,direct_manager_id:m?.id||'',manager:m?.data.name||'',manager_email:m?.data.email||'',manager_phone:m?.data.phone||'',supervisor_account:m?.data.email||''}});}}><option value="">اختر المدير المباشر المرتبط بالمشروع…</option>{(projectManagerEmail?available.filter(r=>String(r.data.email||'').trim().toLowerCase()===projectManagerEmail):matches).map(r=><option value={r.id} key={r.id}>{r.data.name} · {r.data.phone||r.data.email}</option>)}{linkedManager&&!matches.some(r=>r.id===linkedManager.id)&&<option value={linkedManager.id}>{linkedManager.data.name}</option>}</select>
 {linkedManager?<small>المدير المباشر ومدير المشروع: {linkedManager.data.name} · {linkedManager.data.email}. تتبع صلاحيات الاعتماد تكليف المشروع.</small>:projectManagerEmail?<small>مدير المشروع محدد لكنه غير مسجل في دليل هذه الشركة؛ راجع دليل مدراء المشاريع.</small>:chosenProject?<small>لم يُعيّن مدير للمشروع بعد. اربط المدير من بيانات المشروع أولًا.</small>:chosen?<small>المدير السابق: {chosen.data.name}. اختر المشروع لتوحيد المسؤولية.</small>:<small>اختر المشروع أولًا لتحديد مديره المباشر تلقائيًا لجميع الطلبات.</small>}
 </>})()}
 </div>:
 module==='employees'&&f.key==='project_id'?<div style={{display:'grid',gap:8}}>
 <input type="search" placeholder="اكتب اسم المشروع أو رقمه، ثم اختر النتيجة" aria-label="فلتر المشاريع حسب الاسم" value={employeeProjectSearch} onChange={e=>setEmployeeProjectSearch(e.target.value)} autoComplete="off"/>
 {(()=>{const projects=rows.filter(r=>r.module==='projects'&&(r.company===edit.company||Array.isArray(r.data._shared_companies)&&r.data._shared_companies.includes(edit.company)));
 const found=projects.filter(r=>!employeeProjectSearch.trim()||normalizeSearch([r.data.name,r.data.reference,r.data.project_number,r.data.code,r.data.address].join(' ')).includes(normalizeSearch(employeeProjectSearch.trim())));
 const chosen=projects.find(r=>r.id===edit.data.project_id);
 return <>
 {chosen&&<div style={{fontSize:12,padding:8,background:'#f9f4e8',borderRadius:6}}>المشروع المحدد: <b>{chosen.data.name||chosen.data.reference||chosen.id.slice(0,8)}</b><button type="button" style={{marginInlineStart:8}} onClick={()=>setEdit({...edit,data:{...edit.data,project_id:'',direct_manager_id:'',manager_email:'',manager_phone:'',supervisor_account:''}})}>إلغاء الاختيار</button></div>}
 <div role="listbox" aria-label="نتائج البحث عن المشاريع" style={{maxHeight:190,overflowY:'auto',border:'1px solid #d5b978',borderRadius:8,padding:4}}>
 {found.map(r=><button type="button" role="option" aria-selected={edit.data.project_id===r.id} key={r.id} onClick={()=>{const email=String(r.data.manager_email||'').trim().toLowerCase();const manager=rows.find(x=>x.module==='project_managers'&&x.company===edit.company&&String(x.data.email||'').trim().toLowerCase()===email);setEdit({...edit,data:{...edit.data,project_id:r.id,direct_manager_id:manager?.id||'',manager:manager?.data.name||r.data.manager_name||'',manager_email:email,manager_phone:manager?.data.phone||r.data.manager_phone||'',supervisor_account:email}});setEmployeeProjectSearch('')}} style={{display:'block',width:'100%',textAlign:'right',padding:'9px 12px',borderRadius:6,border:edit.data.project_id===r.id?'1px solid #b38e3d':'1px solid transparent',background:edit.data.project_id===r.id?'#f5edda':'transparent',cursor:'pointer'}}>{r.data.name||r.data.reference||r.id.slice(0,8)}{r.data.project_number?' · '+r.data.project_number:r.data.code?' · '+r.data.code:''}</button>)}
 {found.length===0&&<p style={{padding:'10px',margin:0,fontSize:12}}>{projects.length===0?'لا توجد مشاريع لهذه الشركة؛ راجع صلاحيات المشاريع أو سجل المشاريع.':'لا توجد نتائج مطابقة، حاول كتابة جزء من اسم المشروع.'}</p>}
 </div>
 <small role="status">{'المشاريع المطابقة: '+found.length+' من '+projects.length}</small>
 {employeeProjectSearch&&<button type="button" onClick={()=>setEmployeeProjectSearch('')}>مسح بحث المشاريع</button>}
 </>;
 })()}</div>:
module==='leave'&&f.key==='ticket_due_date'&&edit.data.ticket!=='yes'?<input type="text" disabled value="غير مستحق — لا يوجد تاريخ" aria-label="تاريخ التذكرة غير مطلوب"/>:
 module==='leave'&&f.key==='holiday_dates'?<div className="leave-holidays-control">
  <div className="leave-holiday-add"><input aria-label="تاريخ يوم العطلة" type="date" min={edit.data.start||undefined} max={edit.data.end||undefined} value={leaveHolidayCandidate} onChange={e=>setLeaveHolidayCandidate(e.target.value)} disabled={fixedLeaveDays(edit.data.leave_type)!==null}/><button type="button" disabled={!leaveHolidayCandidate||fixedLeaveDays(edit.data.leave_type)!==null} onClick={addLeaveHolidayDate}>إضافة يوم عطلة</button></div>
  <div className="leave-holiday-tags">{String(edit.data.holiday_dates||'').split(',').filter(Boolean).map(date=><span key={date}>{date}<button type="button" aria-label={'إزالة عطلة '+date} onClick={()=>applyLeaveField('holiday_dates',String(edit.data.holiday_dates||'').split(',').filter(x=>x&&x!==date).join(','))}>×</button></span>)}</div>
  <small>حدد أيام العطلة داخل الفترة. تُحسب أو تُستبعد وفق الخيار المحدد. لا يمكن استبعاد أيام من الإجازة النظامية ذات المدة الثابتة.</small>
 </div>:
 relationModules[f.type]?<select required={f.required} value={edit.data[f.key]||''} onChange={e=>f.type==='employee'?applyEmployeeToForm(e.target.value):f.type==='leave'?applyLeaveToForm(e.target.value):setEdit({...edit,data:{...edit.data,[f.key]:e.target.value}})}><option value="">اختر…</option>{rows.filter(r=>(r.company===edit.company||f.type==='project'&&(r.data._shared_companies||[]).includes(edit.company))&&r.module===relationModules[f.type]&&(!['leave','advance'].includes(f.type)||['approved','paid'].includes(r.status))&&(f.type!=='leave'||!['leave_dues','returns'].includes(module)||!edit.data.employee_id||r.data.employee_id===edit.data.employee_id)).map(r=><option value={r.id} key={r.id}>{r.data.name||r.data.reference||name(r.data.employee_id)||r.id.slice(0,8)} {r.data.code?'· '+r.data.code:''}</option>)}</select>:enumOptions[f.type]?<select value={edit.data[f.key]} onChange={e=>module==='leave'&&['leave_type','holiday_policy','ticket'].includes(f.key)?applyLeaveField(f.key,e.target.value):setEdit({...edit,data:{...edit.data,[f.key]:e.target.value}})}>{enumOptions[f.type].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:f.type==='textarea'?<textarea required={f.required} value={edit.data[f.key]} onChange={e=>setEdit({...edit,data:{...edit.data,[f.key]:e.target.value}})}/>:<input required={f.required} type={f.type} step={f.type==='number'?'0.01':undefined} min={f.type==='number'&&f.key!=='opening_leave'?0:undefined} readOnly={(module==='employees'&&f.key==='cash_amount')||(module==='leave'&&(f.key==='days'||f.key==='expected_return'||f.key==='end'&&fixedLeaveDays(edit.data.leave_type)!==null))} value={module==='employees'&&f.key==='cash_amount'?Math.max(0,(Math.round(Number(edit.data.salary||0)*100)-Math.round(Number(edit.data.bank_amount||0)*100))/100):edit.data[f.key]??''} onChange={e=>{
 if(module==='employees'&&['salary','basic'].includes(f.key)){
  const incoming=e.target.value,amount=Number(incoming||0);
  const rounded=value=>Math.round(value*100)/100;
  if(f.key==='basic'){
   const adjustedSalary=rounded(amount/.65);
   setEdit({...edit,salary_edit_source:'basic',data:{...edit.data,basic:incoming,salary:String(adjustedSalary)}});
  }else{
   const nextBasic=rounded(amount*.65);
   setEdit({...edit,salary_edit_source:'salary',data:{...edit.data,salary:incoming,basic:String(nextBasic)}});
  }
 }else if(module==='leave'&&['start','end'].includes(f.key))applyLeaveField(f.key,e.target.value);
 else setEdit({...edit,data:{...edit.data,[f.key]:e.target.value}});
 }}/>}</label>)}</div>{module==='leave'&&edit.data.employee_id&&<div className="leave-balance-summary" role="status">{(()=>{const b=leaveBalanceFor(edit.data.employee_id,edit.company,{...edit.data,id:edit.id});return <><strong>رصيد الإجازات للموظف</strong><span>المستحق حتى اليوم: <b>{b.entitled===null?'غير متاح':b.entitled.toFixed(2)+' يوم'}</b></span><span>المستهلك من الإجازات المعتمدة: <b>{b.used===null?'—':b.used.toFixed(2)+' يوم'}</b></span><span>المتبقي الحالي: <b>{b.remaining===null?'غير متاح':b.remaining.toFixed(2)+' يوم'}</b></span><span>المتوقع بعد اعتماد الطلب: <b>{b.after===null?'غير متاح':b.after.toFixed(2)+' يوم'}</b></span><small>المسودات لا تخصم من الرصيد إلا بعد الاعتماد. الأرصدة تعتمد على السجلات المسموح بعرضها.</small></>})()}</div>}{module==='advances'&&<div className="leave-days-preview" role="status">{(()=>{const amount=Math.round(Number(edit.data.amount||0)*100),count=Number(edit.data.installments||0);if(!(amount>0&&Number.isInteger(count)&&count>=1&&count<=60))return 'أدخل قيمة السلفة وعدد الأقساط الصحيح لعرض خطة السداد.';const regular=Math.floor(amount/count),last=amount-regular*(count-1);return <>عدد الأقساط: <b>{count}</b> · القسط الدوري: <b>{(regular/100).toFixed(2)}</b> ر.س · القسط الأخير: <b>{(last/100).toFixed(2)}</b> ر.س · الإجمالي: <b>{(amount/100).toFixed(2)}</b> ر.س</>})()}</div>}{module==='leave'&&<div className="leave-days-preview" role="status">المدة التقويمية: <b>{leaveCalendarDays(edit.data.start,edit.data.end)??'—'}</b> يوم · أيام العطلة المحددة: <b>{String(edit.data.holiday_dates||'').split(',').filter(Boolean).length}</b> · أيام الإجازة المحتسبة: <b>{edit.data.days||'—'}</b> · المباشرة المتوقعة: <b>{leaveNextDate(edit.data.end)||'—'}</b> · التذكرة: <b>{edit.data.ticket==='yes'?'مستحق':edit.data.ticket==='no'?'غير مستحق':'حدد الاستحقاق'}</b></div>}</fieldset>{module==='company_profiles'&&<section className="employee-payout-summary no-print" style={{marginTop:12}}>
 <strong>هوية الشركة وشعار النماذج</strong>
 <p>يُستخدم الشعار الخاص بهذه الشركة تلقائيًا في الإجازات والسلف والتعيين والمخالصات وسائر نماذج الطباعة.</p>
 {companyLogoPath(edit.company,rows)?<img src={edit.data.logo_file_id?'/api/files?id='+encodeURIComponent(edit.data.logo_file_id)+'&logo=1':companyLogoPath(edit.company,rows)} alt={'شعار '+edit.company} style={{width:115,height:85,objectFit:'contain'}}/>:<p>لم يُرفع شعار لهذه الشركة بعد؛ لن يُستخدم شعار شركة أخرى.</p>}
 {edit.id&&user?.role==='admin'?<label>رفع الشعار المعتمد (PNG / JPG / WebP – 1 MB)
 <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e=>{const file=e.target.files?.[0];if(file)uploadCompanyLogo(file)}}/>
 </label>:<small>احفظ بيانات هوية الشركة أولًا، ثم افتح السجل لرفع الشعار. الرفع متاح للمدير العام.</small>}
 </section>}{module==='employees'&&<div className="employee-payout-summary" aria-live="polite">
 <strong>توزيع الراتب الشهري</strong>
 <div className="employee-payout-grid">
  <span>صافي الراتب المرجعي <b>{money(edit.data.salary)} ر.س</b></span>
  <span>التحويل البنكي <b>{money(edit.data.bank_amount)} ر.س</b></span>
  <span>المبلغ كاش <b>{money(Math.max(0,(Math.round(Number(edit.data.salary||0)*100)-Math.round(Number(edit.data.bank_amount||0)*100))/100))} ر.س</b></span>
 </div>
 {Math.round(Number(edit.data.bank_amount||0)*100)>Math.round(Number(edit.data.salary||0)*100)?<small className="employee-payout-error">التحويل البنكي أكبر من الراتب، يرجى تعديل المبلغ.</small>:<small>✓ المبلغ كاش + التحويل البنكي = الراتب المرجعي. الخصومات والمكافآت الشهرية تُحتسب داخل مسير الرواتب مستقلاً.</small>}
 </div>}{module==='employees'&&<div className="calculation">توزيع الأجر: أساسي {money(edit.salary_edit_source==='basic'?Number(edit.data.basic||0):Math.round(Number(edit.data.salary||0)*65)/100)} · سكن {money(Number(edit.data.salary||0)*.25)} · نقل {money(Math.round((Number(edit.data.salary||0)-(edit.salary_edit_source==='basic'?Number(edit.data.basic||0):Math.round(Number(edit.data.salary||0)*65)/100)-Math.round(Number(edit.data.salary||0)*25)/100)*100)/100)} ريال</div>}{edit.id&&<button type="button" className="no-print" onClick={()=>window.print()}>طباعة النموذج باسم الشركة</button>}{(module==='employees'?(!employeeReadOnly&&permittedWrite(user||{},'employees')):((!edit.id||edit.status==='draft')&&permittedWrite(user||{},module)))&&<button className="primary save" disabled={saving}>{saving?'جارٍ الحفظ…':'حفظ السجل'}<Check size={17}/></button>}</form>{module==='employees'&&['admin','hr'].includes(user?.role)&&!employeeReadOnly&&<section className="attachments"><h3>بيانات إضافية مفهومة</h3>{Object.entries(edit.data.extra_fields||{}).filter(([k])=>!/^([A-Z]{1,3}|source_.*)$/.test(k)).map(([k,v])=><label key={k}>{k}<input value={v} onChange={e=>setEdit({...edit,data:{...edit.data,extra_fields:{...edit.data.extra_fields,[k]:e.target.value}}})}/></label>)}<button type="button" onClick={()=>{const k=window.prompt('اسم البيان الإضافي');if(k)setEdit({...edit,data:{...edit.data,extra_fields:{...edit.data.extra_fields,[k]:''}}})}}>إضافة بيان إضافي</button></section>}{edit.id&&<><Attachments record={edit.id} notify={notify}/><RecordHistory record={edit.id}/></>}{edit.id&&<RecordPaper row={{...edit,module}} spec={{...spec,fields:fieldsFor}} rows={rows} display={display}/>}</section></div>}{toast&&<div className="toast" role="status">{toast}</div>}</div>}
