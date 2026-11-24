// @ts-nocheck
import {env} from './runtime.ts';
import {currentUser} from './runtime.ts';
import {modules,companies,normalize,workflow,canWrite,canRead,annualLeave,operationalModules,relationModules,visible,permission,saudiDate,permittedRead,permittedWrite,isRequestStageActor,isRequestFinanceActor,requestApprovalOwners} from './modules.mjs';
import {isReturnEligibleLeave,employeeOnLeave} from '../lib/return-to-work.mjs';
import {calculateScheduledAdvances,advanceCents} from '../lib/payroll-advance-schedule.mjs';
import {returnPeriodAttendance,salaryAbsenceDeduction} from '../lib/payroll-attendance.mjs';
import {employeeDirectManagerOptions,normalizeManagerName,magdiGeneralManagerEmail,magdiProjectManagerName,isMagdiGeneralManagerAccount,isAuthorizedProjectManagerAccount,preferredManagerForName} from './project-manager-roster.mjs';
export const dynamic='force-dynamic';
async function calculateAnnualLeaveSplit(db:any,employeeId:string,company:string,total:number){
 const record=await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(employeeId,company).first<any>();
 if(!record)throw Error('الموظف المحدد غير موجود');
 const e=JSON.parse(record.data||'{}');
 const at=e.contract_expiry_mode==='manual'&&e.contract_expiry?e.contract_expiry:saudiDate();
 const accrued=annualLeave(e.hire_date,at);
 if((e.contract_expiry_mode==='manual'||e.leave_balance_mode!=='manual')&&!accrued&&e.opening_leave_confirmed!=='yes')throw Error('أكمل تاريخ التعيين أو اعتمد رصيد الإجازات المرحّل');
 const entitled=e.contract_expiry_mode!=='manual'&&e.leave_balance_mode==='manual'?Number(e.manual_leave_entitlement||0):(accrued?.accrued||0)+(e.opening_leave_confirmed==='yes'?Number(e.opening_leave||0):0);
 const approved=(await db.prepare("SELECT data FROM records WHERE module='leave' AND status='approved' AND company=?").bind(company).all()).results;
 const used=approved.map((r:any)=>JSON.parse(r.data||'{}')).filter((d:any)=>d.employee_id===employeeId&&(d.balance_deducted??(!d.leave_type||d.leave_type==='annual'))).reduce((n:number,d:any)=>n+Number(d.paid_days??Math.max(0,Number(d.days||0)-Number(d.unpaid_days||0))),0);
 const available=Math.max(0,entitled-used);
 const paid=Math.min(total,Math.floor(available+1e-8)),unpaid=total-paid;
 return {paid_days:paid,unpaid_days:unpaid,leave_payment:unpaid===0?'paid':paid===0?'unpaid':'mixed',balance_deducted:paid>0,available:entitled-used};
}
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const projectManagerContactEmail='mskn.kayan@gmail.com';
async function resolveEmployeeDirectManager(db:any,company:string,emailValue:string,fallbackName='',requireActive=true){
 const email=String(emailValue||'').trim().toLowerCase();
 if(!email)return {email:'',name:fallbackName,phone:'',directory_id:''};
 const account=await db.prepare("SELECT email,username,role,is_active,companies FROM members WHERE lower(email)=?").bind(email).first<any>();
 if(!isAuthorizedProjectManagerAccount(account,fallbackName)){
  if(!requireActive)return {email:'',name:fallbackName,phone:'',directory_id:''};
  throw Error('المدير المباشر المختار ليس حساب مدير مشروع نشطًا');
 }
 if(account.companies&&account.companies!=='*'){
  let scope:any=[];try{scope=JSON.parse(account.companies||'[]')}catch{}
  if(!Array.isArray(scope)||!scope.includes(company)){
   if(!requireActive)return {email:'',name:fallbackName,phone:'',directory_id:''};
   throw Error('حساب المدير المباشر لا يملك صلاحية شركة الموظف');
  }
 }
 const directory=(await db.prepare("SELECT id,data FROM records WHERE module='project_managers' AND company=?").bind(company).all()).results.find((r:any)=>{
  const data=JSON.parse(r.data||'{}');return !data._deleted&&String(data.email||'').trim().toLowerCase()===email;
 });
 const details=directory?JSON.parse(directory.data||'{}'):{};
 return {email,name:isMagdiGeneralManagerAccount(account,fallbackName)?magdiProjectManagerName:String(details.name||fallbackName||account.username||email),phone:String(details.phone||''),directory_id:directory?.id||''};
}
async function availableEmployeeDirectManagers(db:any,company:string){
 const records=(await db.prepare("SELECT id,module,company,data FROM records WHERE module IN ('projects','employees','project_managers')").all()).results.map(parse);
 const members=(await db.prepare("SELECT email,username,role,is_active,companies FROM members WHERE role IN ('project_manager','admin','hr') AND is_active=true").all()).results;
 return employeeDirectManagerOptions(records,members,company);
}
function setEmployeeDirectManager(data:any,manager:any,manual:boolean){
 data.manager=manager.name;data.manager_email=manager.email;data.manager_phone=manager.phone;
 data.direct_manager_id=manager.directory_id;data.supervisor_account=manager.email;
 data._direct_manager_manual=manual;
}
export async function identity(){const u=currentUser();if(!u)throw Error('401');const row=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(u.email.toLowerCase()).first();if(!row||row.is_active===false)throw Error('403');return {...u,...row};}
const parse=(r:any)=>({...r,data:JSON.parse(r.data)});
export async function GET(req:Request){try{const u=await identity();const db=env.DB!;const query=new URL(req.url).searchParams;const mod=query.get('module');if(mod==='audit'){if(u.role!=='admin')throw Error('403');return json({rows:(await db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT 100').all()).results});}if(mod==='record_history'){const all=(await db.prepare('SELECT * FROM records').all()).results.map(parse);const row=all.find((r:any)=>r.id===query.get('id'));if(!row||!permittedRead(u,row.module)||!visible(u,row,all))throw Error('403');const current=(await db.prepare('SELECT * FROM audit WHERE record_id=? ORDER BY at').bind(row.id).all()).results.map((r:any)=>({at:r.at,actor:r.actor,action:r.action,details:r.details,source:'cloud'}));const old=row.data._legacy;if(old){const archive=(await db.prepare('SELECT table_name,payload FROM legacy WHERE source=?').bind(old.source).all()).results.map((r:any)=>({...r,payload:JSON.parse(r.payload)}));const users=Object.fromEntries(archive.filter((r:any)=>r.table_name==='users').map((r:any)=>[r.payload.id,r.payload.display_name]));for(const item of archive){const r=item.payload;let match=item.table_name==='approval_events'&&((old.table==='leave_requests'&&r.leave_request_id===old.id)||(old.table==='advance_requests'&&r.advance_request_id===old.id))||item.table_name==='resignation_events'&&old.table==='resignation_requests'&&r.resignation_id===old.id;if(match)current.push({at:r.decided_at,actor:users[r.actor_user_id]||'مستخدم مرحّل',action:r.decision,details:JSON.stringify({step:r.step,note:r.note}),source:'python'});}}return json({rows:current.sort((a:any,b:any)=>String(a.at).localeCompare(String(b.at)))});}if(mod==='project_manager_choices'){
 if(!['admin','hr','projects_director'].includes(u.role))throw Error('403');
 const result=(await db.prepare("SELECT email,username,contact_email,role,is_active,companies FROM members WHERE is_active=true AND role IN ('project_manager','admin','hr')").all()).results.filter((m:any)=>isAuthorizedProjectManagerAccount(m,magdiProjectManagerName));
 return json({rows:result.filter((m:any)=>{
  const userScope=u.companies==='*'||!u.companies?null:(()=>{try{return JSON.parse(u.companies)}catch{return []}})();
  const managerScope=m.companies==='*'||!m.companies?null:(()=>{try{return JSON.parse(m.companies)}catch{return []}})();
  return !userScope||!managerScope||userScope.some((company:string)=>managerScope.includes(company));
 })});
}
if(mod==='integrity_report'){
 if(u.role!=='admin')throw Error('403');
 const records=(await db.prepare("SELECT id,module,company,code,data FROM records WHERE module IN ('projects','employees','project_managers','leave','advances','payroll','payroll_batches')").all()).results.map((r:any)=>({...r,data:JSON.parse(r.data||'{}')})).filter((r:any)=>!r.data._deleted);
 const projects=records.filter((r:any)=>r.module==='projects');
 const employees=records.filter((r:any)=>r.module==='employees'&&!r.data._archived);
 const directory=records.filter((r:any)=>r.module==='project_managers');
 const requests=records.filter((r:any)=>['leave','advances'].includes(r.module));
 const payrolls=records.filter((r:any)=>r.module==='payroll');
 const batches=records.filter((r:any)=>r.module==='payroll_batches');
 const issues:any[]=[];
 const add=(type:string,record:any,message:string)=>{if(issues.length<500)issues.push({type,record_id:record.id,module:record.module,company:record.company,code:record.data.code||record.code||'',name:record.data.name||'',message})};
 for(const e of employees){
  if(!e.data.project_id)continue;
  const p=projects.find((x:any)=>x.id===e.data.project_id);
  if(!p){add('missing_project',e,'الموظف مرتبط بمشروع غير موجود');continue}
  if(p.company!==e.company&&!(Array.isArray(p.data._shared_companies)&&p.data._shared_companies.includes(e.company)))add('company_mismatch',e,'شركة الموظف غير مرتبطة بشركة المشروع');
  const manager=String(p.data.manager_email||'').trim().toLowerCase();
  if(!manager)add('unassigned_manager',e,'لا يوجد مدير معتمد للمشروع');
  else if(!e.data._direct_manager_manual&&String(e.data.manager_email||'').trim().toLowerCase()!==manager)add('manager_mismatch',e,'التعيين التلقائي للمدير المباشر لا يطابق مدير المشروع');
 }
 for(const p of projects){
  const manager=String(p.data.manager_email||'').trim().toLowerCase();
  if(!manager)continue;
  if(!directory.some((d:any)=>d.company===p.company&&String(d.data.email||'').trim().toLowerCase()===manager))add('missing_manager_directory',p,'مدير المشروع غير مسجل في دليل الشركة');
 }
 for(const r of requests){
  const employee=employees.find((x:any)=>x.id===r.data.employee_id&&x.company===r.company);
  if(!employee)add('missing_request_employee',r,'طلب مرتبط بموظف غير موجود أو مؤرشف');
 }
 for(const p of payrolls){
  if(!batches.some((b:any)=>b.id===p.data.batch_id&&b.company===p.company))add('missing_payroll_batch',p,'سطر راتب غير مرتبط بمسير شهري موجود');
 }
 return json({ok:true,generated_at:new Date().toISOString(),counts:{projects:projects.length,employees:employees.length,directory:directory.length,requests:requests.length,payroll:payrolls.length,batches:batches.length},issues,issue_count:issues.length,truncated:issues.length===500});
}
if(mod==='members'){if(u.role!=='admin')throw Error('403');return json({rows:(await db.prepare('SELECT m.*, EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=lower(m.email)) AS auth_ready, EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=lower(m.email) AND a.email_confirmed_at IS NOT NULL) AS auth_confirmed FROM members m ORDER BY m.email').all()).results});}
const all=(await db.prepare('SELECT * FROM records ORDER BY updated_at DESC LIMIT 10000').all()).results.map(parse);const rows=all.filter((r:any)=>!r.data?._deleted&&(modules as any)[r.module]&&permittedRead(u,r.module)&&visible(u,r,all)).map((r:any)=>{if(!['project_manager','projects_director'].includes(u.role))return r;if(r.module==='employees')return {...r,data:{name:r.data.name,code:r.data.code,job:r.data.job,project_id:r.data.project_id,manager:r.data.manager||''}};if(r.data?.employee_snapshot){const {employee_snapshot,...safeData}=r.data;return {...r,data:safeData};}return r;});return json({user:{name:u.displayName,email:u.email,role:u.role,employee_id:u.employee_id,companies:u.companies,projects:u.projects,permissions:u.permissions},rows,companies});}catch(e:any){return json({error:e.message==='401'?'يرجى تسجيل الدخول':e.message==='403'?'الحساب غير مخوّل':'تعذر قراءة البيانات'},['401','403'].includes(e.message)?Number(e.message):500);}}
export async function POST(req:Request){try{// Same-origin CSRF checks occur at the Next.js proxy before forwarding.
// Supabase edge routing rewrites req.url, so its origin is not the browser origin.
// JWT, active session, and module/role permission checks remain mandatory.
const u=await identity();const db=env.DB!;const raw=await req.text();if(raw.length>1000000)throw Error('الطلب كبير');const body=JSON.parse(raw);const now=new Date().toISOString();const mutation=crypto.randomUUID();
if(body.action==='set_company_logo'){
 if(u.role!=='admin')throw Error('403');
 const recordId=String(body.record_id||'');
 const fileId=String(body.file_id||'');
 const record=await db.prepare("SELECT id,module,company,data,revision FROM records WHERE id=?").bind(recordId).first<any>();
 if(!record||record.module!=='company_profiles')throw Error('هوية الشركة غير موجودة');
 if(record.revision!==Number(body.revision))throw Error('تغير سجل هوية الشركة؛ أعد فتحه');
 const file=await db.prepare('SELECT id,record_id,mime,size FROM files WHERE id=?').bind(fileId).first<any>();
 if(!file||file.record_id!==recordId||!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.size>1024*1024)throw Error('شعار غير صالح، ارفع PNG أو JPG أو WebP بحجم لا يزيد على 1 ميجابايت');
 const details={...JSON.parse(record.data),logo_file_id:fileId};
 const result=await db.batch([
  db.prepare('UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?').bind(JSON.stringify(details),now,mutation,recordId,record.revision),
  db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,recordId,'company_logo_updated',now,JSON.stringify({company:record.company,file_id:fileId}))
 ]);
 if(!result[0].meta.changes)throw Error('تغير السجل؛ أعد المحاولة');
 return json({ok:true});
}
if(body.action==='generate_temporary_password'){
 if(u.role!=='admin')throw Error('403');
 const email=String(body.email||'').trim().toLowerCase();
 const member=await db.prepare('SELECT email,username,role FROM members WHERE email=?').bind(email).first();
 if(!member||!member.username)throw Error('احفظ اسم المستخدم في سجل الصلاحيات أولاً');
 if(member.role==='admin'||email===u.email.toLowerCase())throw Error('لا يمكن توليد كلمة مرور حساب المدير من إدارة المستخدمين');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!service)throw Error('تعذر توليد كلمة المرور: مفتاح إدارة المصادقة غير مهيأ على الخادم');
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
 const values=new Uint8Array(24);crypto.getRandomValues(values);
 const password=Array.from(values,x=>alphabet[x%alphabet.length]).join('');
 const base=Deno.env.get('SUPABASE_URL')!;
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const existing=await db.prepare('SELECT id FROM auth.users WHERE lower(email)=? LIMIT 1').bind(email).first();
 const url=base+'/auth/v1/admin/users'+(existing?'/'+encodeURIComponent(existing.id):'');
 const response=await fetch(url,{method:existing?'PUT':'POST',headers,body:JSON.stringify({email,password,...(!existing?{email_confirm:true}:{})}),cache:'no-store'});
 if(!response.ok)throw Error('فشل توليد كلمة المرور في خدمة المصادقة. راجع إعدادات مدير الحسابات');
 await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,email,'temporary_password',now,JSON.stringify({generated:true})).run();
 return json({ok:true,username:member.username,password});
}
if(body.action==='send_password_link'){
 if(u.role!=='admin')throw Error('403');
 const email=String(body.email||'').trim().toLowerCase();
 const target=await db.prepare('SELECT email,username FROM members WHERE email=?').bind(email).first();
 if(!target)throw Error('المستخدم غير موجود');
 if(!target.username)throw Error('يرجى إدخال وحفظ اسم المستخدم أولاً');
 const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const account=await db.prepare('SELECT id FROM auth.users WHERE lower(email)=? LIMIT 1').bind(email).first();
 let response;
 if(account){
   response=await fetch(base+'/auth/v1/recover',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email}),cache:'no-store'});
 }else{
   const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!service)throw Error('خدمة دعوات الحسابات غير مهيأة؛ راجع إعدادات المصادقة');
   response=await fetch(base+'/auth/v1/invite?redirect_to='+encodeURIComponent('https://maskan-hr-cloud.vercel.app/reset'),{
     method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
     body:JSON.stringify({email}),cache:'no-store'
   });
 }
 if(!response.ok)throw Error(account?'تعذر إرسال رابط إعادة تعيين كلمة المرور':'تعذر إرسال دعوة إنشاء كلمة المرور؛ تحقق من إعدادات المصادقة والبريد');
 await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,email,'password_link',now,JSON.stringify({method:account?'recovery_email':'invite_email'})).run();
 return json({ok:true,method:account?'recovery':'invitation'});
}
if(body.action==='update_member'){
 if(u.role!=='admin')throw Error('403');
 const oldEmail=String(body.original_email||'').trim().toLowerCase();
 const email=String(body.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('البريد الإلكتروني غير صالح');const contactEmail=body.role==='project_manager'?projectManagerContactEmail:String(body.contact_email||email).trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw Error('بريد التواصل غير صالح');
 const row=await db.prepare('SELECT * FROM members WHERE email=?').bind(oldEmail).first();
 if(!row)throw Error('المستخدم المراد تعديله غير موجود');
 if(row.role==='admin'||oldEmail===u.email.toLowerCase()){
 if(row.role!=='admin'||oldEmail!==u.email.toLowerCase()||email!==oldEmail||body.role!=='admin'||body.companies!=='*'||body.projects!=='*')throw Error('حساب المدير محمي: لا يمكن تغيير بريده أو دوره أو نطاق صلاحياته من هذه النافذة');
 const currentPermissions=typeof row.permissions==='string'?JSON.parse(row.permissions||'{}'):row.permissions||{};
 if(JSON.stringify(body.permissions||{})!==JSON.stringify(currentPermissions))throw Error('لا يمكن تعديل صلاحيات المدير الأساسية');
 const adminUsername=String(body.username||'').trim().replace(/\s+/g,' ').toLowerCase();
 if(adminUsername&&(!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(adminUsername)||adminUsername.includes('  ')))throw Error('اسم المستخدم غير صالح');
 await db.batch([
  db.prepare('UPDATE members SET username=?,employee_id=? WHERE email=? AND role=\'admin\'').bind(adminUsername||null,body.employee_id||null,oldEmail),
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,oldEmail,'member',now,JSON.stringify({admin_profile:true,username_changed:adminUsername!==row.username}))
 ]);
 return json({ok:true,admin_profile:true});
}
 const username=String(body.username||'').trim().replace(/\s+/g,' ').toLowerCase();
 if(username&&(!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(username)||username.includes('  ')))throw Error('اسم المستخدم من 3 إلى 64 حرفًا، ويمكن استخدام الاسم العربي أو الإنجليزي مع المسافات');
 if(!['hr','administrative_assistant','finance','procurement','administrative_manager','project_manager','projects_director','employee'].includes(body.role))throw Error('الدور غير صالح');
 if(body.permissions&&(typeof body.permissions!=='object'||Array.isArray(body.permissions)||Object.entries(body.permissions).some(([k,v])=>typeof v!=='boolean'||!/^([a-z_]+):(view|edit|approve)$/.test(k))))throw Error('صلاحيات غير صالحة');
 if(body.companies!=='*'&&(!Array.isArray(body.companies)||body.companies.some(c=>!companies.includes(c))))throw Error('نطاق الشركات غير صالح');
 if(body.projects!=='*'&&(!Array.isArray(body.projects)||body.projects.some(id=>typeof id!=='string')))throw Error('نطاق المشاريع غير صالح');
 if(body.role==='project_manager'&&body.projects!=='*'){
 if(!Array.isArray(body.projects)||!body.projects.length)throw Error('حدد مشروعًا واحدًا على الأقل لمدير المشروع');
 if(new Set(body.projects).size!==body.projects.length)throw Error('لا يجوز تكرار نفس المشروع ضمن صلاحيات مدير المشروع');
 const projectRows=(await db.prepare("SELECT id,company,data FROM records WHERE module='projects'").all()).results;
 const allowedCompanies=body.companies==='*'||body.companies===undefined?null:body.companies;
 if(body.projects.some((id:string)=>!projectRows.some((r:any)=>{
  if(r.id!==id)return false;
  const d=JSON.parse(r.data||'{}');
  const shared=Array.isArray(d._shared_companies)?d._shared_companies:[];
  const allowed=!allowedCompanies||allowedCompanies.includes(r.company)||allowedCompanies.some((c:string)=>shared.includes(c));
  return allowed&&String(d.manager_email||'').trim().toLowerCase()===email;
 })))throw Error('يمكن منح المدير صلاحية المشاريع المعيّن مديرًا لها فقط، وضمن شركاته المسموحة');
}

 if(email!==oldEmail&&await db.prepare('SELECT email FROM members WHERE email=?').bind(email).first())throw Error('البريد الجديد مسجل لمستخدم آخر');
 const oldAuth=await db.prepare('SELECT id FROM auth.users WHERE lower(email)=? LIMIT 1').bind(oldEmail).first();
 if(email!==oldEmail&&await db.prepare('SELECT id FROM auth.users WHERE lower(email)=? LIMIT 1').bind(email).first())throw Error('البريد الجديد مستخدم بالفعل في نظام الدخول');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 let authChanged=false;
 if(email!==oldEmail&&oldAuth){
   if(!service)throw Error('خدمة تعديل بريد الحساب غير مهيأة');
   const changed=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/admin/users/'+encodeURIComponent(oldAuth.id),{
     method:'PUT',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
     body:JSON.stringify({email,email_confirm:true}),cache:'no-store'
   });
   if(!changed.ok)throw Error('تعذر تحديث بريد حساب الدخول؛ لم يتم تعديل صلاحيات المستخدم');
   authChanged=true;
 }
 try{
  await db.batch([
   db.prepare('UPDATE members SET email=?,role=?,employee_id=?,companies=?,projects=?,permissions=?,username=?,contact_email=? WHERE email=?').bind(
    email,body.role,body.employee_id||null,
    body.companies==='*'?'*':JSON.stringify(body.companies),
    body.projects==='*'?'*':JSON.stringify(body.projects),
    JSON.stringify(body.permissions||{}),username||null,contactEmail,oldEmail),
   db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,oldEmail,'member',now,JSON.stringify({new_email:email,role:body.role,updated:true}))
  ]);
 }catch(error){
  if(authChanged)await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/admin/users/'+encodeURIComponent(oldAuth.id),{
    method:'PUT',headers:{apikey:service!,Authorization:'Bearer '+service,'Content-Type':'application/json'},
    body:JSON.stringify({email:oldEmail,email_confirm:true}),cache:'no-store'
  }).catch(()=>{});
  throw error;
 }
 return json({ok:true,requires_relogin:email!==oldEmail});
}
if(body.action==='assign_project_manager'){
 if(u.role!=='admin')throw Error('403');
 const projectId=String(body.project_id||'').trim();
 const email=String(body.manager_email||'').trim().toLowerCase();
 if(!projectId||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))throw Error('حدد المشروع ومديرًا مسجلًا بصلاحيات صحيحة');
 const project=await db.prepare("SELECT id,company,data,revision FROM records WHERE id=? AND module='projects'").bind(projectId).first<any>();
 if(!project)throw Error('المشروع غير موجود');
 if(project.revision!==Number(body.revision))throw Error('تغير المشروع بواسطة مستخدم آخر؛ حدّث السجل قبل إعادة التعيين');
 const manager=await db.prepare('SELECT email,role,is_active,companies,projects FROM members WHERE lower(email)=?').bind(email).first<any>();
 if(!isAuthorizedProjectManagerAccount(manager,magdiProjectManagerName))throw Error('يجب اختيار حساب مدير مشروع نشط');
 if(manager.companies!=='*'){
  let companyScope:any=[];try{companyScope=JSON.parse(manager.companies||'[]')}catch{}
  if(!Array.isArray(companyScope)||!companyScope.includes(project.company))throw Error('المدير غير مخوّل لشركة المشروع');
 }
 const directoryRow=(await db.prepare("SELECT id,data FROM records WHERE module='project_managers' AND company=?").bind(project.company).all()).results.find((r:any)=>String(JSON.parse(r.data||'{}').email||'').trim().toLowerCase()===email);
 const adminMagdi=isMagdiGeneralManagerAccount(manager);
 if(!directoryRow&&!adminMagdi)throw Error('أضف المدير إلى دليل مدراء المشاريع لهذه الشركة أولًا');
 const directory=directoryRow?JSON.parse(directoryRow.data):{name:magdiProjectManagerName,phone:''};
 if(adminMagdi&&preferredManagerForName(directory.name)?.id!=='magdi')throw Error('حساب المدير العام مرتبط حصريًا بم. مجدي محجوب');
 const prior=JSON.parse(project.data||'{}');
 const previousManager=String(prior.manager_email||'').trim().toLowerCase();
 if(previousManager===email&&(!adminMagdi||(preferredManagerForName(prior.manager_name)?.id==='magdi'&&directoryRow)))return json({ok:true,unchanged:true});
 const updated={...prior,manager_email:email,manager_name:String(directory.name||''),manager_phone:String(directory.phone||'')};
 let scope:any=[];
 if(manager.projects!=='*'){try{scope=JSON.parse(manager.projects||'[]')}catch{};if(!Array.isArray(scope))scope=[];}
 const statements:any[]=[
  db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='projects' AND revision=?")
    .bind(JSON.stringify(updated),now,mutation,projectId,project.revision)
 ];
 const newDirectoryId=directoryRow?.id||crypto.randomUUID();
 if(adminMagdi&&!directoryRow)statements.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,'project_managers',?,?,?,'draft',1,?,?,?,?)")
  .bind(newDirectoryId,project.company,null,JSON.stringify({name:magdiProjectManagerName,email,phone:'',job:'مدير مشاريع',department:'إدارة المشاريع'}),u.email,now,now,mutation));
 if(!adminMagdi&&manager.projects!=='*'&&!scope.includes(projectId)){
  statements.push(db.prepare("UPDATE members SET projects=? WHERE lower(email)=? AND role='project_manager' AND is_active=true").bind(JSON.stringify([...new Set([...scope,projectId])]),email));
 }
 if(previousManager&&previousManager!==email){
  const priorMember=await db.prepare("SELECT projects FROM members WHERE lower(email)=? AND role='project_manager'").bind(previousManager).first<any>();
  if(priorMember&&priorMember.projects!=='*'){
   let oldScope:any=[];try{oldScope=JSON.parse(priorMember.projects||'[]')}catch{}
   if(Array.isArray(oldScope)&&oldScope.includes(projectId))statements.push(db.prepare("UPDATE members SET projects=? WHERE lower(email)=? AND role='project_manager'").bind(JSON.stringify(oldScope.filter((id:string)=>id!==projectId)),previousManager));
  }
 }
 const affected=(await db.prepare("SELECT id,company,data,revision FROM records WHERE module='employees' AND company=?").bind(project.company).all()).results.filter((r:any)=>{
  const d=JSON.parse(r.data||'{}');
  return !d._archived&&String(d.project_id||'')===projectId;
 });
 if(affected.length>1500)throw Error('عدد الموظفين في المشروع كبير؛ راجع إدارة المشاريع قبل إعادة التعيين');
 for(const employee of affected){
  const d=JSON.parse(employee.data||'{}');
  if(d._direct_manager_manual)continue;
  const updatedEmployee={...d,manager:String(directory.name||''),manager_email:email,manager_phone:String(directory.phone||''),supervisor_account:email,direct_manager_id:newDirectoryId};
  statements.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
   .bind(JSON.stringify(updatedEmployee),now,mutation,employee.id,employee.revision));
 }
 statements.push(db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)")
  .bind(crypto.randomUUID(),u.email,projectId,'assign_project_manager',now,JSON.stringify({company:project.company,from:previousManager||null,to:email,employees_linked:affected.length})));
 const result=await db.batch(statements);
 if(result.slice(0,-1).some((item:any)=>item?.meta?.changes!==1))throw Error('تعذر تحديث المشروع أو الصلاحيات؛ أعد تحديث الصفحة');
 return json({ok:true,manager_name:updated.manager_name,project_id:projectId,employees_linked:affected.length});
if(body.action==='assign_manager_employees'){
 if(u.role!=='admin')throw Error('403');
 const email=String(body.email||'').trim().toLowerCase();
 const manager=await db.prepare('SELECT email,role,is_active,companies FROM members WHERE lower(email)=?').bind(email).first<any>();
 if(!isAuthorizedProjectManagerAccount(manager,magdiProjectManagerName))throw Error('اختر حساب مدير مشروع نشطًا');
 const ids=body.employee_ids;
 if(!Array.isArray(ids)||ids.length>2000||ids.some((id:any)=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw Error('قائمة الموظفين المحددين غير صالحة');
 const companyScope=manager.companies==='*'?null:(()=>{try{return JSON.parse(manager.companies||'[]')}catch{return []}})();
 if(companyScope!==null&&(!Array.isArray(companyScope)||companyScope.some((co:any)=>typeof co!=='string')))throw Error('نطاق شركات المدير غير صالح');
 const employeeRows=(await db.prepare("SELECT id,company,data,revision FROM records WHERE module='employees'").all()).results;
 const projectRows=(await db.prepare("SELECT id,company,data FROM records WHERE module='projects'").all()).results;
 const eligible=employeeRows.filter((row:any)=>{
  const data=JSON.parse(row.data||'{}');
  if(data._deleted||data._archived||companyScope&&!companyScope.includes(row.company)||!data.project_id)return false;
  const project=projectRows.find((p:any)=>p.id===data.project_id);
  if(!project)return false;
  const pd=JSON.parse(project.data||'{}');
  return !pd._deleted&&(project.company===row.company||Array.isArray(pd._shared_companies)&&pd._shared_companies.includes(row.company));
 });
 if(ids.some((id:string)=>!eligible.some((row:any)=>row.id===id)))throw Error('أحد الموظفين خارج شركات المدير أو ليس مرتبطًا بمشروع صالح');
 const selected=new Set(ids),changes:any[]=[],conflicts:string[]=[];
 for(const row of eligible){
  const data=JSON.parse(row.data||'{}');
  const previous=String(data.delegated_manager_email||'').trim().toLowerCase();
  const wants=selected.has(row.id);
  if((!wants&&previous!==email)||(wants&&previous===email))continue;
  if(wants&&previous&&previous!==email)conflicts.push(String(data.name||data.code||row.id));
  const updated={...data};
  if(wants)updated.delegated_manager_email=email;
  else delete updated.delegated_manager_email;
  changes.push({row,updated,from:previous,to:wants?email:''});
 }
 if(conflicts.length&&!body.confirm_reassign)throw Error('يوجد موظفون مكلفون لمدير آخر؛ أكد نقل التكليف أولًا: '+conflicts.slice(0,4).join('، '));
 if(changes.length>1000)throw Error('عدد تغييرات التكليف كبير؛ قسّم العملية إلى دفعات أصغر');
 if(!changes.length)return json({ok:true,changed:0,selected:ids.length});
 const statements=changes.map(change=>db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
  .bind(JSON.stringify(change.updated),now,mutation,change.row.id,change.row.revision));
 statements.push(db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),u.email,email,'manager_employees_assigned',now,JSON.stringify({manager:email,selected:ids.length,changes:changes.map(c=>({employee_id:c.row.id,from:c.from,to:c.to}))})));
 const applied=await db.batch(statements);
 if(applied.slice(0,-1).some((result:any)=>result?.meta?.changes!==1))throw Error('تغير أحد الموظفين أثناء الحفظ؛ حدّث السجل وأعد المحاولة');
 return json({ok:true,changed:changes.length,selected:ids.length});
}
}
if(body.action==='onboard_project_manager'){
 if(u.role!=='admin')throw Error('403');
 const email=String(body.email||'').trim().toLowerCase();
 const name=String(body.name||'').trim();
 const phone=String(body.phone||'').trim();
 const username=String(body.username||'').trim().replace(/\s+/g,' ').toLowerCase();
 const ids=body.project_ids;
 const employeeId=String(body.employee_id||'').trim();
 let employeeRow:any=null;
 let employeeData:any=null;
 if(employeeId){
  employeeRow=await db.prepare("SELECT id,company,data,revision FROM records WHERE id=? AND module='employees'").bind(employeeId).first<any>();
  if(!employeeRow)throw Error('سجل الموظف المحدد غير موجود');
  employeeData=JSON.parse(employeeRow.data||'{}');
  if(employeeData._archived||!['active','نشط','على رأس العمل','علي راس العمل'].includes(String(employeeData.employment_status||employeeData.employee_status||'').trim()))throw Error('يمكن تعيين الموظفين النشطين فقط كمدراء مشاريع');
  if(String(employeeData.name||'').trim()!==name)throw Error('اسم المدير يجب أن يطابق الموظف المختار من السجل');
  const storedEmail=String(employeeData.email||'').trim().toLowerCase();
  if(storedEmail&&storedEmail!==email)throw Error('بريد المدير لا يطابق البريد المحفوظ في سجل الموظف؛ صحح سجل الموظف أولاً');
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<3||name.length>160)throw Error('الاسم والبريد الإلكتروني مطلوبان وبصيغة صحيحة');
 if(username&&!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(username))throw Error('اسم المستخدم غير صالح');
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('حدد مشاريع غير مكررة لمدير المشروع');
 const allProjects=(await db.prepare("SELECT id,company,data,revision FROM records WHERE module='projects'").all()).results;
 const selected=ids.map((id:string)=>allProjects.find((p:any)=>p.id===id));
 if(selected.some((p:any)=>!p))throw Error('أحد المشاريع المحددة غير موجود');
 const existing=await db.prepare('SELECT * FROM members WHERE lower(email)=?').bind(email).first<any>();
 const adminMagdi=isMagdiGeneralManagerAccount(existing,name);
 if(existing&&!adminMagdi&&(existing.is_active===false||!['project_manager',...(employeeId?['employee']:[])].includes(existing.role)))throw Error('البريد مرتبط بحساب آخر لا يمكن تحويله إلى مدير مشروع نشط');
 if(email===magdiGeneralManagerEmail&&!adminMagdi)throw Error('حساب المدير العام يمكن ربطه باسم م. مجدي محجوب فقط دون تغيير صلاحياته');
 if(adminMagdi&&employeeId)throw Error('ربط حساب المدير العام بسجل موظف يحتاج مراجعة مستقلة؛ اربطه بالمشاريع مباشرة');
 if(employeeId&&existing?.employee_id&&existing.employee_id!==employeeId)throw Error('هذا الحساب مرتبط بموظف آخر، ولا يمكن إعادة استخدامه');
 if(employeeId){
  const other=await db.prepare('SELECT email FROM members WHERE employee_id=? AND lower(email)<>?').bind(employeeId,email).first();
  if(other)throw Error('الموظف مرتبط بحساب دخول آخر؛ استخدم حسابه الحالي بدل إنشاء حساب مكرر');
 }
 const allowedCompanies=[...new Set(selected.map((p:any)=>p.company))];
 if(employeeId&&!allowedCompanies.includes(employeeRow.company))throw Error('اختر مشروعًا تابعًا لشركة الموظف؛ لا يمكن ربط حسابه بمشروع شركة مختلفة من هذه النافذة');
 const transferredProjects=new Map<string,string[]>();
 for(const p of selected){
  const data=JSON.parse(p.data||'{}');
  const assigned=String(data.manager_email||'').trim().toLowerCase();
  if(assigned&&assigned!==email&&!body.confirm_reassign)throw Error('المشروع '+(data.name||p.id)+' مرتبط بمدير آخر؛ يلزم تأكيد إعادة التكليف');
  if(assigned&&assigned!==email)transferredProjects.set(assigned,[...(transferredProjects.get(assigned)||[]),p.id]);
 }
 const currentScope=existing?.role==='employee'?[]:existing?.companies==='*'?'*':(()=>{try{return JSON.parse(existing?.companies||'[]')}catch{return []}})();
 const nextCompanies=currentScope==='*'?'*':[...new Set([...(Array.isArray(currentScope)?currentScope:[]),...allowedCompanies])];
 const currentProjects=existing?.role==='employee'?[]:existing?.projects==='*'?'*':(()=>{try{return JSON.parse(existing?.projects||'[]')}catch{return []}})();
 const nextProjects=currentProjects==='*'?'*':[...new Set([...(Array.isArray(currentProjects)?currentProjects:[]),...ids])];
 const duplicateDirectory=(await db.prepare("SELECT id,company,data FROM records WHERE module='project_managers'").all()).results;
 const directoryIds=new Map(allowedCompanies.map(co=>{
  const matching=duplicateDirectory.find((r:any)=>r.company===co&&String(JSON.parse(r.data||'{}').email||'').trim().toLowerCase()===email);
  return [co,matching?.id||crypto.randomUUID()];
 }));
 const linkedEmployees=(await db.prepare("SELECT id,company,data,revision FROM records WHERE module='employees'").all()).results;
 const syncEmployees:any[]=[];
 for(const employee of linkedEmployees){
  const d=JSON.parse(employee.data||'{}');
  if(d._archived||!ids.includes(String(d.project_id||'')))continue;
  if(d._direct_manager_manual)continue;
  const project=selected.find((p:any)=>p.id===d.project_id);
  const projectData=JSON.parse(project.data||'{}');
  if(project.company!==employee.company)continue;
  const updated={...d,manager:name,manager_email:email,manager_phone:phone,supervisor_account:email,direct_manager_id:directoryIds.get(employee.company)||''};
  syncEmployees.push({record:employee,data:updated});
 }
 if(syncEmployees.length>1500)throw Error('عدد الموظفين كبير؛ قسّم ربط المشاريع إلى دفعات أصغر');
 const commands:any[]=[];
 if(!existing){
  if(!username)throw Error('اسم مستخدم مطلوب لإنشاء حساب مدير المشروع');
  const clash=await db.prepare('SELECT email FROM members WHERE lower(username)=?').bind(username).first();
  if(clash)throw Error('اسم المستخدم مستخدم بالفعل');
  commands.push(db.prepare('INSERT INTO members(email,role,employee_id,companies,projects,permissions,username,contact_email) VALUES(?,?,?,?,?,?,?,?)')
   .bind(email,'project_manager',employeeId||null,JSON.stringify(allowedCompanies),JSON.stringify(ids),'{}',username,projectManagerContactEmail));
 }else if(!adminMagdi){
  if(username&&username!==existing.username){
   const clash=await db.prepare('SELECT email FROM members WHERE lower(username)=? AND lower(email)<>?').bind(username,email).first();
   if(clash)throw Error('اسم المستخدم مستخدم بالفعل');
  }
  commands.push(db.prepare("UPDATE members SET role='project_manager',employee_id=?,companies=?,projects=?,username=?,contact_email=? WHERE email=? AND role IN ('project_manager','employee') AND is_active=true")
    .bind(employeeId||existing.employee_id||null,nextCompanies==='*'?'*':JSON.stringify(nextCompanies),nextProjects==='*'?'*':JSON.stringify(nextProjects),username||existing.username,projectManagerContactEmail,email));
 }
 // Reassigned projects must also be removed from the previous managers'
 // explicit scopes; '*' scopes are checked against live project ownership.
 for(const [previousEmail,projectIds] of transferredProjects){
  const previous=await db.prepare("SELECT projects FROM members WHERE lower(email)=? AND role='project_manager'").bind(previousEmail).first<any>();
  if(!previous||previous.projects==='*')continue;
  let scope:any=[];try{scope=JSON.parse(previous.projects||'[]')}catch{}
  if(!Array.isArray(scope)||!scope.some((id:string)=>projectIds.includes(id)))continue;
  commands.push(db.prepare("UPDATE members SET projects=? WHERE lower(email)=? AND role='project_manager'")
   .bind(JSON.stringify(scope.filter((id:string)=>!projectIds.includes(id))),previousEmail));
 }
 for(const co of allowedCompanies){
  const recorded=duplicateDirectory.find((r:any)=>r.company===co&&String(JSON.parse(r.data||'{}').email||'').trim().toLowerCase()===email);
  if(recorded){
   const d=JSON.parse(recorded.data);
   if(adminMagdi&&preferredManagerForName(d.name)?.id!=='magdi')throw Error('ملف المدير العام يحتوي على اسم غير مطابق؛ يلزم مراجعته أولًا');
   commands.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='project_managers'")
   .bind(JSON.stringify({...d,name:adminMagdi?magdiProjectManagerName:name,email,phone:phone||d.phone||'',employee_id:employeeId||d.employee_id||null}),now,mutation,recorded.id));
  }else{
   commands.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,'project_managers',?,?,?,'draft',1,?,?,?,?)")
    .bind(directoryIds.get(co),co,null,JSON.stringify({name:adminMagdi?magdiProjectManagerName:name,email,phone,job:'مدير مشروع',department:adminMagdi?'إدارة المشاريع':'',employee_id:employeeId||null}),u.email,now,now,mutation));
  }
 }
 if(employeeId){
  const linkedManagerRecord=syncEmployees.find(e=>e.record.id===employeeId);
  const revised={...employeeData,...(linkedManagerRecord?.data||{}),email:employeeData.email||email,project_manager_account:email,is_project_manager:true};
  commands.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
   .bind(JSON.stringify(revised),now,mutation,employeeId,employeeRow.revision));
 }
 for(const project of selected){
  const data=JSON.parse(project.data||'{}');
  commands.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='projects' AND revision=?")
   .bind(JSON.stringify({...data,manager_email:email,manager_name:adminMagdi?magdiProjectManagerName:name,manager_phone:phone}),now,mutation,project.id,project.revision));
 }
 for(const employee of syncEmployees.filter(e=>e.record.id!==employeeId)){
  commands.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
   .bind(JSON.stringify(employee.data),now,mutation,employee.record.id,employee.record.revision));
 }
 commands.push(db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),u.email,email,'project_manager_onboarding',now,JSON.stringify({project_ids:ids,companies:allowedCompanies,employee_id:employeeId||null,existing_account:!!existing,employees_linked:syncEmployees.length,reassigned_from:[...transferredProjects.keys()]})));
 const applied=await db.batch(commands);
 if(applied.slice(0,-1).some((result:any)=>result?.meta?.changes!==1))throw Error('تغير أحد المشاريع أثناء الربط؛ أعد تحديث البيانات');
 return json({ok:true,email,username:username||existing?.username||'',created:!existing,employee_id:employeeId||null,projects:ids.length,employees_linked:syncEmployees.length});
}
if(body.action==='member'){if(u.role!=='admin')throw Error('403');const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['hr','administrative_assistant','finance','procurement','administrative_manager','project_manager','projects_director','employee'].includes(body.role))throw Error('بيانات المستخدم غير صالحة');const username=String(body.username||'').trim().replace(/\s+/g,' ').toLowerCase();if(username&&(!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(username)||username.includes('  ')))throw Error('اسم المستخدم من 3 إلى 64 حرفًا ويقبل الحروف العربية والإنجليزية والمسافات');if(body.permissions&&(typeof body.permissions!=='object'||Array.isArray(body.permissions)||Object.entries(body.permissions).some(([k,v])=>typeof v!=='boolean'||!/^([a-z_]+):(view|edit|approve)$/.test(k))))throw Error('صلاحيات غير صالحة');if(body.projects!=='*'&&body.projects!==undefined&&(!Array.isArray(body.projects)||body.projects.some((id:any)=>typeof id!=='string')))throw Error('نطاق مشاريع غير صالح');
if(body.role==='project_manager'&&body.projects!=='*'){
 if(!Array.isArray(body.projects)||!body.projects.length)throw Error('حدد مشروعًا واحدًا على الأقل لمدير المشروع');
 if(new Set(body.projects).size!==body.projects.length)throw Error('لا يجوز تكرار نفس المشروع ضمن صلاحيات مدير المشروع');
 const projectRows=(await db.prepare("SELECT id,company,data FROM records WHERE module='projects'").all()).results;
 const allowedCompanies=body.companies==='*'||body.companies===undefined?null:body.companies;
 if(body.projects.some((id:string)=>!projectRows.some((r:any)=>{
  if(r.id!==id)return false;
  const d=JSON.parse(r.data||'{}');
  const shared=Array.isArray(d._shared_companies)?d._shared_companies:[];
  const allowed=!allowedCompanies||allowedCompanies.includes(r.company)||allowedCompanies.some((c:string)=>shared.includes(c));
  return allowed&&String(d.manager_email||'').trim().toLowerCase()===email;
 })))throw Error('يمكن منح المدير صلاحية المشاريع المعيّن مديرًا لها فقط، وضمن شركاته المسموحة');
}
if(body.companies!=='*'&&body.companies!==undefined&&(!Array.isArray(body.companies)||body.companies.some((c:any)=>!companies.includes(c))))throw Error('نطاق شركات غير صالح');const contactEmail=body.role==='project_manager'?projectManagerContactEmail:String(body.contact_email||email).trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw Error('بريد التواصل غير صالح');
if(await db.prepare('SELECT 1 FROM members WHERE email=?').bind(email).first())throw Error('بريد الدخول مسجل مسبقًا؛ استخدم بريد دخول مختلفًا واسم مستخدم فريدًا، ويمكن تكرار بريد التواصل');
if(await db.prepare('SELECT 1 FROM auth.users WHERE lower(email)=? LIMIT 1').bind(email).first())throw Error('بريد الدخول مستخدم في حساب مصادقة آخر');
await db.batch([db.prepare('INSERT INTO members(email,role,employee_id,companies,projects,permissions,username,contact_email) VALUES(?,?,?,?,?,?,?,?)').bind(email,body.role,body.employee_id||null,body.companies==='*'||body.companies===undefined?'*':JSON.stringify(body.companies),body.projects==='*'||body.projects===undefined?'*':JSON.stringify(body.projects),JSON.stringify(body.permissions||{}),username||null,contactEmail),db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,email,'member',now,JSON.stringify({role:body.role}))]);return json({ok:true});}
if(body.action==='set_member_status'){
 if(u.role!=='admin')throw Error('403');
 const email=String(body.email||'').trim().toLowerCase();
 const target=await db.prepare('SELECT email,role,is_active FROM members WHERE email=?').bind(email).first();
 if(!target)throw Error('المستخدم غير موجود');
 if(target.role==='admin'||email===u.email.toLowerCase())throw Error('لا يمكن تعطيل حساب المدير');
 if(typeof body.is_active!=='boolean')throw Error('حالة المستخدم غير صالحة');
 await db.batch([
 db.prepare('UPDATE members SET is_active=? WHERE email=? AND role<>\'admin\'').bind(body.is_active,email),
 db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,email,'member_status',now,JSON.stringify({is_active:body.is_active}))
 ]);
 return json({ok:true,is_active:body.is_active});
}
if(body.action==='remove_member'){if(u.role!=='admin')throw Error('403');const target=String(body.email||'').trim().toLowerCase();const existing=await db.prepare('SELECT role FROM members WHERE email=?').bind(target).first();if(!existing||existing.role==='admin'||target===u.email.toLowerCase())throw Error('لا يمكن إزالة حساب المدير');await db.prepare('DELETE FROM members WHERE email=?').bind(target).run();return json({ok:true});}
if(body.action==='hire_from_appointment'){
 if(!permittedWrite(u,'appointments')||!permission(u,'appointments','edit')||!permittedWrite(u,'employees')||!permission(u,'employees','edit'))throw Error('ليس لديك صلاحية التعيين وإنشاء سجل الموظف');
 const company=String(body.company||'').trim();
 if(!companies.includes(company))throw Error('شركة التعيين غير معتمدة');
 const rawHire=body.new_employee||{},rawForm=body.data||{};
 if(body.id||rawForm.employee_id)throw Error('التعيين الجديد لا يرتبط برقم موظف سابق؛ استخدم تعديل التعيين للموظف الموجود');
 const formDate=String(rawForm.date||saudiDate()),start=String(rawForm.actual_start||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||new Date(start).toISOString().slice(0,10)!==start)throw Error('تاريخ المباشرة غير صالح');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(formDate))throw Error('تاريخ النموذج غير صالح');
 const identity=String(rawHire.identity||'').trim();
 if(!identity||identity.length>40)throw Error('أدخل رقم هوية الموظف أو الإقامة لمنع تكرار السجل');
 const duplicate=await db.prepare("SELECT id FROM records WHERE module='employees' AND company=? AND data::jsonb->>'identity'=? AND COALESCE(data::jsonb->>'_archived','false')<>'true' LIMIT 1").bind(company,identity).first();
 if(duplicate)throw Error('يوجد موظف بنفس رقم الهوية لدى الشركة؛ افتح ملفه بدل إنشاء سجل مكرر');
 if(!String(rawHire.name||'').trim()||!String(rawHire.job||'').trim())throw Error('اسم الموظف ومسمّاه الوظيفي مطلوبان');
 if(!(Number(rawHire.salary)>0))throw Error('حدد الراتب الشهري الجديد بقيمة أكبر من صفر');
 const projectId=String(rawHire.project_id||'').trim();
 const scopedRows=(await db.prepare("SELECT * FROM records").all()).results.map(parse);
 if(!visible(u,{module:'employees',company,data:{project_id:projectId}},scopedRows)
 ||!visible(u,{module:'appointments',company,data:{project_id:projectId}},scopedRows))throw Error('403');

 if(projectId){
  const project=await db.prepare("SELECT company,data FROM records WHERE module='projects' AND id=?").bind(projectId).first();
  if(!project)throw Error('المشروع المختار غير موجود');
  const projectData=JSON.parse(project.data||'{}');
  if(project.company!==company&&!(projectData._shared_companies||[]).includes(company))throw Error('المشروع لا يتبع شركة التعيين');
 }
 const duration=String(rawForm.probation||'بدون فترة تجربة').trim();
 const days=({'بدون فترة تجربة':0,'30 يومًا':30,'60 يومًا':60,'90 يومًا':90,'180 يومًا':180,'3 شهور':90,'6 شهور':180} as Record<string,number>)[duration];
 if(days===undefined)throw Error('اختر مدة فترة التجربة من القائمة المعتمدة');
 const d=new Date(start+'T00:00:00.000Z');
 if(days)d.setUTCDate(d.getUTCDate()+days-1);
 const probationEnd=days?d.toISOString().slice(0,10):'';
 const employeeId=crypto.randomUUID(),appointmentId=crypto.randomUUID();
 const employeeInput={...rawHire,name:String(rawHire.name).trim(),identity,code:'AUTO',hire_date:start,employment_status:'active',working_company:company,sponsorship:rawHire.sponsorship||'unknown',leave_balance_mode:'auto',contract_expiry_mode:rawForm.contract_end?'manual':'auto',contract_expiry:rawForm.contract_end||'',opening_leave:'0',opening_leave_confirmed:'no',probation:duration,probation_start:start,probation_end:probationEnd,appointment_record_id:appointmentId};
 const employee=normalize('employees',{company,data:employeeInput,salary_edit_source:'salary'});
 employee.employment_status='active';employee.working_company=company;
 employee.probation=duration;employee.probation_start=start;employee.probation_end=probationEnd;employee.appointment_record_id=appointmentId;
 if(projectId)employee.project_id=projectId;
 const managerLabel=String(rawHire.manager||rawForm.direct_manager||'').trim();
 if(managerLabel){
  const choices=await availableEmployeeDirectManagers(db,company);
  const manager=choices.find((m:any)=>normalizeManagerName(m.name)===normalizeManagerName(managerLabel));
  if(!manager)throw Error('المدير المباشر غير موجود في القائمة المسجلة؛ اختره من نتائج البحث');
  if(manager.hasLogin&&manager.email){
   const verified=await resolveEmployeeDirectManager(db,company,manager.email,manager.name,true);
   setEmployeeDirectManager(employee,verified,true);
  }else{
   employee.manager=manager.name;
   employee.manager_email='';
   employee.manager_phone='';
   employee.direct_manager_id=manager.directory_id||'';
   employee.supervisor_account='';
   employee._direct_manager_manual=true;
   employee.direct_manager_pending_approval_link=true;
  }
 }

 const empSerial=(await db.prepare("SELECT nextval('hr.project_code_seq')::text AS serial").first<any>())?.serial;
 const aptSerial=(await db.prepare("SELECT nextval('hr.project_code_seq')::text AS serial").first<any>())?.serial;
 if(!/^\d{4,12}$/.test(String(empSerial||''))||!/^\d{4,12}$/.test(String(aptSerial||'')))throw Error('تعذر توليد رقم النموذج');
 employee.document_no='EMP-'+saudiDate().slice(0,4)+'-'+String(empSerial).padStart(6,'0');
 const form=normalize('appointments',{company,data:{...rawForm,employee_id:employeeId,date:formDate,actual_start:start,probation:duration}});
 form.document_no='APT-'+saudiDate().slice(0,4)+'-'+String(aptSerial).padStart(6,'0');
 form.probation_start=start;form.probation_end=probationEnd;
 form.employee_snapshot={employee_id:employeeId,company,name:employee.name,job:employee.job,identity:employee.identity,project_id:projectId,hire_date:start,salary:Number(employee.salary),probation:duration,probation_end:probationEnd};
 const employeeInsertSql=[
  "INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation)",
  "SELECT ?, 'employees', ?, next_code.code,",
 "replace(?::text, '\"code\":\"AUTO\"', '\"code\":\"' || next_code.code || '\"')::jsonb::text,",
  "'draft',1,?,?,?,? FROM (SELECT (COALESCE(MAX(CASE WHEN code ~ '^[0-9]{1,12}$' THEN code::bigint END),70000)+1)::text AS code FROM records WHERE module='employees') next_code RETURNING code"
 ].join(' ');
 const result=await db.batch([
  db.prepare(employeeInsertSql).bind(employeeId,company,JSON.stringify(employee),u.email,now,now,mutation),
  db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,'appointments',?,?,?,'draft',1,?,?,?,?)").bind(appointmentId,company,null,JSON.stringify(form),u.email,now,now,mutation),
  db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,employeeId,'employee_created_from_appointment',now,JSON.stringify({appointment_id:appointmentId,document_no:employee.document_no,probation_days:days})),
  db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,appointmentId,'appointment_hire_created',now,JSON.stringify({employee_id:employeeId,document_no:form.document_no}))
 ]);
 if(!result[0]?.meta?.changes||!result[1]?.meta?.changes)throw Error('تعذر حفظ التعيين والموظف معاً');
 return json({ok:true,id:appointmentId,employee_id:employeeId,employee_code:result[0]?.results?.[0]?.code,appointment_no:form.document_no,probation_end:probationEnd});
}
if(body.action==='backfill_appointment_numbers'){
 if(u.role!=='admin')throw Error('403');
 const legacy=(await db.prepare("SELECT id,company,data,revision,created_at FROM records WHERE module='appointments' ORDER BY created_at ASC,id ASC").all()).results;
 const missing=legacy.filter((r:any)=>!String(JSON.parse(r.data||'{}').document_no||'').trim());
 if(!missing.length)return json({ok:true,updated:0,message:'جميع نماذج التعيين مرقمة بالفعل'});
 if(missing.length>250)throw Error('عدد نماذج التعيين غير المرقمة يتجاوز حد الدفعة الآمنة؛ تواصل مع مسؤول النظام');
 const statements:any[]=[];
 for(const row of missing){
  const serial=(await db.prepare("SELECT nextval('hr.project_code_seq')::text AS serial").first<any>())?.serial;
  if(!serial||!/^\d{4,12}$/.test(String(serial)))throw Error('تعذر توليد الرقم التسلسلي للتعيين');
  const documentNo='APT-'+saudiDate().slice(0,4)+'-'+String(serial).padStart(6,'0');
  const data={...JSON.parse(row.data||'{}'),document_no:documentNo,document_no_backfilled_at:now,document_no_backfilled_by:u.email};
  statements.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='appointments' AND revision=? AND COALESCE(NULLIF(TRIM(data::jsonb->>'document_no'),''),'')=''").bind(JSON.stringify(data),now,mutation,row.id,row.revision));
  statements.push(db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)").bind(crypto.randomUUID(),u.email,row.id,'appointment_number_backfill',now,JSON.stringify({document_no:documentNo,company:row.company}),row.id,mutation));
 }
 const result=await db.batch(statements);
 if(result.some((item:any,i:number)=>i%2===0&&!item.meta?.changes))throw Error('تغيرت نماذج التعيين أثناء الترقيم؛ حدّث الصفحة وأعد المحاولة');
 return json({ok:true,updated:missing.length});
}
const mod=body.module;if(!(modules as any)[mod])throw Error('نافذة غير معروفة');const old=body.id?await db.prepare('SELECT * FROM records WHERE id=? AND module=?').bind(body.id,mod).first<any>():null;if(body.id&&!old)throw Error('السجل غير موجود');if(old&&!visible(u,parse(old),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('403');if(old&&old.revision!==body.revision)throw Error('تغير السجل؛ حدّث الصفحة');
if(old&&JSON.parse(old.data)?._deleted)throw Error('هذا الطلب محذوف ولا يمكن تعديله أو إرساله للاعتماد');


if(body.action==='configure_advance_schedule'){
 if(mod!=='advances'||!old||!['admin','finance'].includes(u.role)||!permission(u,'advances','edit'))throw Error('ليس لديك صلاحية تعديل جدولة السلف');
 if(!['approved','finance_approved','paid'].includes(old.status))throw Error('تعديل الجدولة متاح للسلف المعتمدة أو المصروفة فقط');
 const data=JSON.parse(old.data||'{}'),kind=String(body.kind||''),month=String(body.month||'');
 const todayMonth=saudiDate().slice(0,7);
 if(!['set_mode','set_amount','defer_installment','defer_loan','resume'].includes(kind))throw Error('إجراء الجدولة غير صالح');
 if(kind==='set_amount'){
   const cents=advanceCents(body.monthly_deduction),original=advanceCents(data.amount);
   if(!Number.isFinite(Number(body.monthly_deduction))||cents<=0||cents>original||!Number.isSafeInteger(cents))throw Error('مبلغ الاستقطاع الشهري غير صالح');
   const payrollRows=(await db.prepare("SELECT * FROM records WHERE module='payroll'").all()).results.map(parse).filter((r:any)=>r.data?.employee_id===data.employee_id&&Array.isArray(r.data?.advance_allocations)&&r.data.advance_allocations.some((item:any)=>item.advance_id===old.id));
   const batches=(await db.prepare("SELECT id,status FROM records WHERE module='payroll_batches'").all()).results;
   const paidBatches=new Set(batches.filter((b:any)=>b.status==='paid').map((b:any)=>b.id));
   if(payrollRows.some((r:any)=>!paidBatches.has(r.data.batch_id)&&r.data.month>=todayMonth))throw Error('يوجد مسير مفتوح مرتبط بالسلفة؛ اعتمد أو صحح خصمه قبل تعديل القسط');
   data.monthly_deduction=cents/100;
   data.installment_amount=cents/100;
 }else if(kind==='set_mode'){
  if(!['auto','manual'].includes(body.schedule_mode))throw Error('اختر جدولة تلقائية أو سدادًا يدويًا');
  if(body.schedule_mode==='auto'&&(!Number(data.installments)||!data.first_month))throw Error('حدد عدد الأقساط وشهر أول قسط قبل تفعيل الجدولة');
  data.schedule_mode=body.schedule_mode;
 }else{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<todayMonth)throw Error('حدد شهرًا حاليًا أو مستقبلًا صحيحًا');
  const endIndex=Number(month.slice(0,4))*12+Number(month.slice(5,7));
  const startIndex=Number(todayMonth.slice(0,4))*12+Number(todayMonth.slice(5,7));
  if(endIndex-startIndex>24)throw Error('لا يمكن جدولة التأجيل لأكثر من 24 شهرًا مقدمًا');
  const toMonth=n=>String(Math.floor((n-1)/12)).padStart(4,'0')+'-'+String((n-1)%12+1).padStart(2,'0');
  const requested=kind==='defer_loan'||kind==='resume'?Array.from({length:endIndex-startIndex+1},(_,i)=>toMonth(startIndex+i)):[month];
  const inPayroll=(await db.prepare("SELECT data FROM records WHERE module='payroll' AND data::jsonb->>'employee_id'=? AND data::jsonb->>'month'>=? AND data::jsonb->>'month'<=?").bind(String(data.employee_id||''),todayMonth,month).all()).results;
  const batchIds=[...new Set(inPayroll.map((r:any)=>JSON.parse(r.data||'{}').batch_id).filter(Boolean))];
  if(batchIds.length){
   const batches=(await db.prepare("SELECT id,status FROM records WHERE module='payroll_batches'").all()).results;
   if(batches.some((b:any)=>batchIds.includes(b.id)&&b.status!=='paid'))throw Error('يوجد مسير شهري منشأ للفترة المطلوبة؛ عدّل أو أجّل الخصم من المسير الحالي أولًا');
   if(kind!=='resume'&&inPayroll.some((r:any)=>{const x=JSON.parse(r.data||'{}');return !x.excluded&&Number(x.advance_deduction||0)>0&&Array.isArray(x.advance_allocations)&&x.advance_allocations.some((a:any)=>a.advance_id===old.id)}))throw Error('لا يمكن تأجيل قسط سبق خصمه بمسير معتمد');
  }
  const prior=new Set(Array.isArray(data.deferred_months)?data.deferred_months:[]);
  if(kind==='resume')requested.forEach((m:string)=>prior.delete(m));
  else requested.forEach((m:string)=>prior.add(m));
  data.deferred_months=[...prior].sort();
 }
 const res=await db.batch([
  db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='advances' AND revision=? AND status IN ('paid','approved','finance_approved')").bind(JSON.stringify(data),now,mutation,old.id,old.revision),
  db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,old.id,'advance_schedule_change',now,JSON.stringify({kind,month:month||null,schedule_mode:data.schedule_mode,monthly_deduction:data.monthly_deduction,deferred_months:data.deferred_months||[]}))
 ]);
 if(!res[0].meta.changes)throw Error('تم تعديل السلفة من مستخدم آخر؛ حدث الصفحة');
 return json({ok:true,deferred_months:data.deferred_months||[],schedule_mode:data.schedule_mode||'auto',monthly_deduction:data.monthly_deduction||data.installment_amount||0});
}

if(body.action==='record_opening_advance_repayment'){
 if(mod!=='repayments'||!['admin','finance','hr'].includes(u.role))throw Error('403');
 const companyName=String(body.company||'').trim();
 const employeeId=String(body.employee_id||'').trim();
 const amount=Number(body.amount);
 const paidDate=String(body.date||'').trim();
 const reference=String(body.reference||'').trim();
 if(!employeeId||!companies.includes(companyName))throw Error('حدد الموظف والشركة');
 if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100&&Math.abs(amount*100-Math.round(amount*100))>0.000001)throw Error('مبلغ السداد يجب أن يكون موجبًا بخانتين عشريتين كحد أقصى');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)||Number.isNaN(Date.parse(paidDate))||paidDate>saudiDate())throw Error('تاريخ السداد غير صالح أو في المستقبل');
 if(reference.length<3||reference.length>120)throw Error('أدخل مرجع السداد الافتتاحي (3 إلى 120 حرفًا) لمنع التسجيل المكرر');
 const records=(await db.prepare("SELECT * FROM records WHERE module IN ('employees','advances','repayments') AND company=?").bind(companyName).all()).results;
 const employee=records.find((r:any)=>r.module==='employees'&&r.id===employeeId);
 if(!employee||!visible(u,parse(employee),records.map(parse)))throw Error('الموظف غير متاح ضمن صلاحياتك');
 const repayments=records.filter((r:any)=>r.module==='repayments'&&!JSON.parse(r.data||'{}')._deleted).map((r:any)=>({id:r.id,data:JSON.parse(r.data||'{}')}));
 const loans=records.filter((r:any)=>r.module==='advances'&&['approved','paid'].includes(r.status)).map((r:any)=>({id:r.id,created_at:r.created_at,data:JSON.parse(r.data||'{}')})).filter((r:any)=>r.data.employee_id===employeeId&&!r.data._deleted).sort((a:any,b:any)=>String(a.data.date||a.created_at).localeCompare(String(b.data.date||b.created_at)));
 if(repayments.some((r:any)=>r.data._opening_employee_id===employeeId&&r.data._opening_reference===reference))throw Error('مرجع السداد الافتتاحي مسجل مسبقًا لهذا الموظف');
 const allocations=loans.map((loan:any)=>{const settled=repayments.filter((r:any)=>r.data.advance_id===loan.id).reduce((sum:number,r:any)=>sum+Number(r.data.amount||0),0);return {...loan,available:Math.max(0,Math.round((Number(loan.data.amount||0)-settled)*100)/100)}}).filter((r:any)=>r.available>0);
 const availableCents=allocations.reduce((sum:number,r:any)=>sum+Math.round(r.available*100),0);
 let remainingCents=Math.round(amount*100);
 if(!availableCents)throw Error('لا توجد سلف معتمدة أو مصروفة برصيد مستحق لهذا الموظف');
 if(remainingCents>availableCents)throw Error('السداد الافتتاحي يتجاوز المتبقي الفعلي من السلف');
 const group=crypto.randomUUID();
 const statements:any[]=[];
 let segments=0;
 for(const loan of allocations){
  if(remainingCents<=0)break;
  const part=Math.min(remainingCents,Math.round(loan.available*100));
  remainingCents-=part;
  const recordId=crypto.randomUUID();
  const repayment={advance_id:loan.id,amount:part/100,date:paidDate,code:'OPEN-'+group.slice(0,8)+'-'+(++segments),method:'opening',notes:'سداد افتتاحي سابق — '+reference,_opening_balance:true,_opening_reference:reference,_opening_employee_id:employeeId,_opening_group:group,_opening_created_by:u.email};
  statements.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,'repayments',?,?,?,'draft',1,?,?,?,?)").bind(recordId,companyName,repayment.code,JSON.stringify(repayment),u.email,now,now,mutation));
 }
 statements.push(db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,group,'opening_advance_repayment',now,JSON.stringify({company:companyName,employee_id:employeeId,amount,reference,date:paidDate,allocations:segments})));
 await db.batch(statements);
 return json({ok:true,recorded:amount,allocations:segments,reference});
}

 if(body.action==='set_employee_direct_manager'){
  if(mod!=='employees'||!old||!['admin','hr'].includes(u.role)||!permittedWrite(u,'employees')||!permission(u,'employees','edit'))throw Error('403');
  const original=JSON.parse(old.data||'{}');
  if(original._archived||original._deleted)throw Error('لا يمكن تعديل مدير موظف مؤرشف أو محذوف');
  const mode=String(body.direct_manager_mode||'');
  if(!['selected','project'].includes(mode))throw Error('اختر مديرًا مباشرًا أو ارجع إلى مدير المشروع');
  let resolved:any={email:'',name:'',phone:'',directory_id:''};
  if(mode==='selected'){
   const key=String(body.manager_key||'').trim();
   const email=String(body.manager_email||'').trim().toLowerCase();
   const options=await availableEmployeeDirectManagers(db,old.company);
   const match=options.find(m=>m.key===key||(email&&m.email===email));
   if(!match)throw Error('المدير المباشر غير موجود ضمن المدراء المسجلين؛ حدّث القائمة');
   resolved=match;
  }else if(original.project_id){
   const project=await db.prepare("SELECT company,data FROM records WHERE id=? AND module='projects'").bind(original.project_id).first<any>();
   if(!project)throw Error('مشروع الموظف غير مسجل');
   const projectData=JSON.parse(project.data||'{}');
   if(project.company!==old.company&&!(Array.isArray(projectData._shared_companies)&&projectData._shared_companies.includes(old.company)))throw Error('المشروع لا يتبع شركة الموظف');
   resolved=await resolveEmployeeDirectManager(db,old.company,String(projectData.manager_email||''),String(projectData.manager_name||''),false);
  }
  const updated={...original};setEmployeeDirectManager(updated,resolved,mode==='selected');
  const result=await db.batch([
   db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
    .bind(JSON.stringify(updated),now,mutation,old.id,old.revision),
   db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)')
    .bind(crypto.randomUUID(),u.email,old.id,'employee_direct_manager_updated',now,JSON.stringify({company:old.company,employee_id:old.id,previous_name:original.manager||'',next_name:resolved.name,previous_email:original.manager_email||'',next_email:resolved.email,manual:mode==='selected'}),old.id,mutation)
  ]);
  if(result[0]?.meta?.changes!==1)throw Error('تغير الموظف أثناء الحفظ؛ حدّث السجل وأعد المحاولة');
  return json({ok:true,manager_name:resolved.name,manager_email:resolved.email,mode});
 }
 if(body.action==='delete_project'){
  if(mod!=='projects'||!old||u.role!=='admin')throw Error('403');
  const reason=String(body.reason||'').trim().slice(0,1000);
  if(!reason)throw Error('سبب حذف المشروع مطلوب');
  const dependentRows=(await db.prepare('SELECT id,module,company,data FROM records WHERE id<>?').bind(old.id).all()).results;
  const linked=dependentRows.find((r:any)=>{
   const data=JSON.parse(r.data||'{}');
   return !data._deleted&&(String(data.project_id||'')===old.id||Array.isArray(data.project_ids)&&data.project_ids.includes(old.id));
  });
  if(linked)throw Error('لا يمكن حذف المشروع لوجود سجلات مرتبطة به ('+linked.module+'). انقل الموظفين والمعاملات إلى مشروع آخر أولًا');
  const original=JSON.parse(old.data||'{}');
  const updated={...original,_deleted:true,_deleted_at:now,_deleted_by:u.email,_delete_reason:reason};
  const accounts=(await db.prepare('SELECT email,projects FROM members WHERE projects IS NOT NULL AND projects<>?').bind('*').all()).results;
  const statements:any[]=[db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='projects' AND revision=?")
   .bind(JSON.stringify(updated),now,mutation,old.id,old.revision)];
  for(const account of accounts){
   let scope:any=[];try{scope=JSON.parse(account.projects||'[]')}catch{}
   if(!Array.isArray(scope)||!scope.includes(old.id))continue;
   statements.push(db.prepare('UPDATE members SET projects=? WHERE email=?').bind(JSON.stringify(scope.filter((id:string)=>id!==old.id)),account.email));
  }
  statements.push(db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)')
   .bind(crypto.randomUUID(),u.email,old.id,'project_deleted',now,JSON.stringify({project:original.name||old.code,company:old.company,reason}),old.id,mutation));
  const result=await db.batch(statements);
  if(result[0]?.meta?.changes!==1)throw Error('تغير المشروع؛ حدّث السجل قبل الحذف');
  return json({ok:true,deleted:true});
 }
 if(body.action==='delete_project_manager'){
  if(mod!=='project_managers'||!old||u.role!=='admin')throw Error('403');
  const reason=String(body.reason||'').trim().slice(0,1000);
  if(!reason)throw Error('سبب حذف سجل المدير مطلوب');
  const previous=JSON.parse(old.data||'{}');
  const email=String(previous.email||'').trim().toLowerCase();
  const related=(await db.prepare("SELECT id,module,data FROM records WHERE company=? AND module IN ('projects','employees')").bind(old.company).all()).results;
  const linked=related.find((record:any)=>{
   const data=JSON.parse(record.data||'{}');
   if(data._deleted)return false;
   if(record.module==='projects')return !!email&&String(data.manager_email||'').trim().toLowerCase()===email;
   return String(data.direct_manager_id||'')===old.id||(!!email&&String(data.manager_email||'').trim().toLowerCase()===email);
  });
  if(linked)throw Error('لا يمكن حذف مدير المشروع قبل نقل '+(linked.module==='projects'?'المشاريع':'الموظفين')+' المرتبطين به إلى مدير آخر');
  const updated={...previous,_deleted:true,_deleted_at:now,_deleted_by:u.email,_delete_reason:reason};
  const result=await db.batch([
   db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='project_managers' AND revision=?")
    .bind(JSON.stringify(updated),now,mutation,old.id,old.revision),
   db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)')
    .bind(crypto.randomUUID(),u.email,old.id,'project_manager_deleted',now,JSON.stringify({name:previous.name||'',email,company:old.company,reason}),old.id,mutation)
  ]);
  if(result[0]?.meta?.changes!==1)throw Error('تغير سجل المدير؛ حدّث الصفحة قبل الحذف');
  return json({ok:true,deleted:true});
 }
 if(body.action==='delete_draft_request'){
  if(!['leave','advances','resignations','warnings'].includes(mod))throw Error('حذف الطلب غير متاح لهذه النافذة');
  if(!old||old.status!=='draft')throw Error('يمكن حذف الطلبات المسودة فقط؛ الطلبات المعتمدة تتطلب إجراء إلغاء رسمي');
  if(!['admin','hr'].includes(u.role)||!permittedWrite(u,mod)||!permission(u,mod,'edit'))throw Error('403');
  const previous=JSON.parse(old.data);
  const updated={...previous,_deleted:true,_deleted_at:now,_deleted_by:u.email};
  const result=await db.batch([
   db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module=? AND status='draft' AND revision=?").bind(JSON.stringify(updated),now,mutation,old.id,mod,old.revision),
   db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,old.id,'draft_request_deleted',now,JSON.stringify({module:mod,company:old.company,employee_id:previous.employee_id||null}),old.id,mutation)
  ]);
  if(!result[0].meta.changes)throw Error('تغير الطلب؛ حدّث الصفحة قبل الحذف');
  return json({ok:true,deleted:true});
 }
 if(body.action==='approve_advance_finance')throw Error('تم إلغاء مرحلة المالية المنفصلة؛ يعتمد المدير العام السلفة ويقيدها مباشرة في سجل الموظف');
 if(body.action==='gm_approve_advance'||body.action==='disburse'){
 // The GM and named finance officer can finalize administratively approved advances; historical finance-approved rows remain supported.
 if(mod!=='advances'||!old||!isRequestFinanceActor(u)||!['approved','finance_approved'].includes(old.status))throw Error('السلفة قيد العمل حتى اكتمال اعتمادها الإداري، ويعتمد صرفها المدير العام أو مسؤول المالية المخول فقط');
 const source=JSON.parse(old.data||'{}');
 const reference='ADV-'+String(old.code||old.id).replace(/[^\p{L}\p{N}-]/gu,'').slice(0,40);
 if(!(Number(source.amount)>0)||!Number.isFinite(Number(source.amount)))throw Error('مبلغ السلفة غير صالح للاعتماد');
 const employee=await db.prepare("SELECT id,data,revision FROM records WHERE id=? AND module='employees' AND company=?").bind(String(source.employee_id||''),old.company).first<any>();
 if(!employee)throw Error('سجل الموظف المستفيد غير موجود في الشركة');
 const employeeData=JSON.parse(employee.data||'{}');
 if(employeeData._archived||employeeData._deleted)throw Error('لا يجوز اعتماد سلفة لموظف مؤرشف أو محذوف');
 const existingLedger=Array.isArray(employeeData.advance_disbursement_ledger)?employeeData.advance_disbursement_ledger:[];
 if(existingLedger.some((entry:any)=>String(entry.advance_id)===String(old.id)))throw Error('تم قيد هذه السلفة مسبقاً في حساب الموظف');
 const amount=Math.round(Number(source.amount)*100)/100;
 const entry={advance_id:old.id,amount,reference,approved_at:now,approved_by:u.email,company:old.company,project_id:source.project_id||employeeData.project_id||''};
 const updatedEmployee={...employeeData,advance_disbursement_ledger:[...existingLedger,entry],advance_total_received:Math.round((Number(employeeData.advance_total_received||0)+amount)*100)/100,last_advance_receipt_reference:reference,last_advance_receipt_at:now};
 const data={...source,payment_reference:reference,paid_at:now,paid_by:u.email,final_approved_at:now,final_approved_by:u.email,...(u.role==='admin'?{gm_approved_at:now,gm_approved_by:u.email}:{finance_approved_at:now,finance_approved_by:u.email}),advance_receipt_no:reference,advance_receipt_date:saudiDate(),advance_receipt_amount:amount,approval_accounting_type:u.role==='admin'?'general_manager_direct':'authorized_finance_direct',advance_recorded_in_employee_ledger:true};
 const paidLoans=(await db.prepare("SELECT * FROM records WHERE module='advances' AND status='paid'").all()).results.map(parse).filter((r:any)=>!r.data?._deleted);
 const repayments=(await db.prepare("SELECT * FROM records WHERE module='repayments'").all()).results.map(parse).filter((r:any)=>!r.data?._deleted);
 const sums=new Map();
 for(const payment of repayments)sums.set(payment.data.advance_id,(sums.get(payment.data.advance_id)||0)+advanceCents(payment.data.amount));
 const context={loans:[...paidLoans,{...old,status:'paid',data}],sums};
 const batches=(await db.prepare("SELECT id,status FROM records WHERE module='payroll_batches'").all()).results;
 const drafts=new Set(batches.filter((b:any)=>['draft','manager_review'].includes(b.status)).map((b:any)=>b.id));
 const payrollRows=(await db.prepare("SELECT * FROM records WHERE module='payroll'").all()).results;
 const synced:any[]=[];
 const statements=[
  db.prepare("UPDATE records SET data=?,status='paid',revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=? AND status IN ('approved','finance_approved')")
    .bind(JSON.stringify(data),now,mutation,old.id,old.revision),
  db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND company=? AND revision=?")
    .bind(JSON.stringify(updatedEmployee),now,mutation,employee.id,old.company,employee.revision)
 ];
 for(const row of payrollRows){
  const current=JSON.parse(row.data||'{}');
  if(current.employee_id!==data.employee_id||current.excluded||!drafts.has(current.batch_id))continue;
  const month=String(current.month||'');
  const gross=Number(current.salary||0)+Number(current.bonus||0)+Number(current.extra_allowance||0)+Number(current.overtime||0);
  const beforeLoan=Math.max(0,Math.round((gross-Number(current.absence_deduction||0)-Number(current.deductions||0))*100));
  const allocations=calculateScheduledAdvances(context,data.employee_id,month,beforeLoan);
  const discount=allocations.reduce((sum:number,a:any)=>sum+advanceCents(a.amount),0);
  const previousDiscount=advanceCents(current.advance_deduction);
  if(discount===previousDiscount&&JSON.stringify(allocations)===JSON.stringify(current.advance_allocations||[]))continue;
  const net=(beforeLoan-discount)/100;
  const bank=Math.min(Number(current.bank_amount||0),net);
  const updated={...current,advance_deduction:discount/100,advance_allocations:allocations,net,
    bank_amount:bank,cash_amount:Math.round((net-bank)*100)/100,split_confirmed:false,
    manager_reviewed:false,manager_reviewed_by:null,manager_reviewed_at:null,
    reviewed_by:null,reviewed_at:null,needs_review:true,
    review_reason:[current.review_reason,'تحديث تلقائي لقسط السلفة بعد توثيق صرفها؛ تجب مراجعة توزيع الراتب'].filter(Boolean).join('؛ '),
    advance_schedule_synced_at:now};
  statements.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll' AND revision=?")
  .bind(JSON.stringify(updated),now,mutation,row.id,row.revision));
  synced.push({row_id:row.id,month,discount:discount/100});
 }
 statements.push(db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)')
 .bind(crypto.randomUUID(),u.email,old.id,'record_disbursement',now,JSON.stringify({reference,payroll_synced:synced,employee_id:employee.id,amount,approved_by:u.email,approver_role:u.role}),old.id,mutation));
 const result=await db.batch(statements);
 if(result.slice(0,-1).some((v:any)=>!v.meta?.changes))throw Error('تغير سجل السلفة أو مسير الرواتب أثناء الحفظ؛ حدّث الصفحة ثم أعد المحاولة');
 const existingPayrollMonths=payrollRows.filter((row:any)=>{const d=JSON.parse(row.data||'{}');return String(d.employee_id)===String(data.employee_id)&&!d.excluded;}).map((row:any)=>{const d=JSON.parse(row.data||'{}');return {month:String(d.month||''),batch_id:d.batch_id,status:batches.find((b:any)=>b.id===d.batch_id)?.status||'unknown'};});
 const nextMonth=String(data.first_month||saudiDate().slice(0,7));
 return json({ok:true,status:'paid',employee_id:employee.id,receipt_no:reference,payroll_synced:synced.length,first_deduction_month:nextMonth,open_payroll_updated:synced,existing_payroll_months:existingPayrollMonths.filter((x:any)=>x.month>=nextMonth).slice(0,12),note:synced.length?'تم تحديث المسير المفتوح ويحتاج مراجعة جديدة قبل الصرف':'تم قيد السلفة؛ سيُحسب القسط عند توليد المسير القادم أو مزامنة مسير مفتوح. المسيرات المعتمدة لا تُعدل تلقائياً'});
}

if(body.action==='leave_dues_workflow'){
 if(mod!=='leave_dues'||!old)throw Error('بيان مستحقات الإجازة غير موجود');
 const decision=String(body.decision||'');
 const state=old.status;
 const details=JSON.parse(old.data||'{}');
 const canSubmit=permittedWrite(u,'leave_dues')&&permission(u,'leave_dues','edit');
 const isDirector=u.role==='projects_director'||u.role==='admin';
 const isFinance=isRequestFinanceActor(u)&&permission(u,'leave_dues','approve');
 let next='';
 if(decision==='submit'&&state==='draft'&&canSubmit)next='projects_director';
 else if(decision==='approve'&&state==='projects_director'&&isDirector&&permission(u,'leave_dues','approve'))next='approved';
 else if(decision==='return'&&state==='projects_director'&&isDirector&&permission(u,'leave_dues','approve'))next='draft';
 else if(decision==='reject'&&state==='projects_director'&&isDirector&&permission(u,'leave_dues','approve'))next='rejected';
 else if(decision==='pay'&&state==='approved'&&isFinance)next='paid';
 else throw Error('لا تملك صلاحية القرار أو أن البيان ليس في مرحلة الاعتماد المناسبة');
 const reason=String(body.note||'').trim().slice(0,1000);
 if(['return','reject'].includes(decision)&&!reason)throw Error('أدخل سبب الإعادة أو الرفض');
 const reference=String(body.reference||'').trim();
 const method=String(body.method||'bank');
 if(decision==='pay'&&(reference.length<3||reference.length>200||!['bank','cash'].includes(method)))throw Error('أدخل مرجع الصرف وطريقته قبل اعتماد الصرف');
 if(!details.leave_id)throw Error('بيان المستحقات غير مرتبط بطلب إجازة');
 const leave=await db.prepare("SELECT status,company,data FROM records WHERE module='leave' AND id=?").bind(String(details.leave_id)).first<any>();
 if(!leave||leave.company!==old.company||leave.status!=='approved')throw Error('يجب أن يرتبط المستحق بطلب إجازة معتمد من نفس الشركة');
 if(!Number.isFinite(Number(details.net))||Number(details.net)<0)throw Error('صافي المستحقات غير صالح');
 const tracking=details.dues_approval&&typeof details.dues_approval==='object'?details.dues_approval:{};
 if(decision==='submit')details.dues_approval={...tracking,submitted_by:u.email,submitted_at:now};
 if(decision==='approve')details.dues_approval={...tracking,director_by:u.email,director_at:now,director_name:magdiProjectManagerName};
 if(decision==='return'||decision==='reject')details.dues_approval={...tracking,decision_by:u.email,decision_at:now,decision_reason:reason,...(decision==='return'?{director_by:null,director_at:null}:{})};
 if(decision==='pay'){details.payment_reference=reference;details.payment_method=method;details.paid_at=now;details.paid_by=u.email;}
 // Atomically record approved payouts in the employee's monetary ledger, not the leave-days balance.
 const employeeId=String(JSON.parse(leave.data||'{}').employee_id||'');
 let employeeLedgerStatement:any=null;
 if(decision==='pay'){
  if(!employeeId)throw Error('طلب الإجازة غير مرتبط بموظف؛ لا يمكن توثيق الصرف');
  const employeeRecord=await db.prepare("SELECT id,data,revision FROM records WHERE id=? AND module='employees' AND company=?").bind(employeeId,old.company).first<any>();
  if(!employeeRecord)throw Error('سجل الموظف المستفيد غير موجود في الشركة');
  const employeeData=JSON.parse(employeeRecord.data||'{}');
  const paidAmount=Math.round(Number(details.net)*100)/100;
  const ledger=Array.isArray(employeeData.leave_payment_ledger)?employeeData.leave_payment_ledger:[];
  if(ledger.some((entry:any)=>String(entry.dues_id)===String(old.id)))throw Error('تم تسجيل صرف هذه المستحقات سابقًا في رصيد الموظف');
  const ledgerEntry={dues_id:old.id,leave_id:details.leave_id,amount:paidAmount,reference,method,at:now,by:u.email};
  const updatedEmployee={...employeeData,leave_payment_ledger:[...ledger,ledgerEntry],leave_dues_paid_total:Math.round((Number(employeeData.leave_dues_paid_total||0)+paidAmount)*100)/100,last_leave_payment_amount:paidAmount,last_leave_payment_at:now,last_leave_payment_reference:reference};
  employeeLedgerStatement=db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND company=? AND revision=?")
    .bind(JSON.stringify(updatedEmployee),now,mutation,employeeId,old.company,employeeRecord.revision);
 }
 const result=await db.batch([
  db.prepare("UPDATE records SET status=?,data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=? AND status=?").bind(next,JSON.stringify(details),now,mutation,old.id,old.revision,state),
  ...(employeeLedgerStatement?[employeeLedgerStatement]:[]),
  db.prepare("INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)").bind(crypto.randomUUID(),u.email,old.id,'leave_dues_'+decision,now,JSON.stringify({from:state,to:next,reason,reference:decision==='pay'?reference:undefined,amount:details.net}),old.id,mutation)
 ]);
 if(!result[0]?.meta?.changes||(employeeLedgerStatement&&!result[1]?.meta?.changes))throw Error('لم يكتمل حفظ مستحقات الإجازة ورصيد الموظف؛ أعد تحديث السجلات وتحقق من مرجع الصرف');
 return json({ok:true,status:next,employee_id:decision==='pay'?employeeId:undefined,employee_ledger_updated:decision==='pay'});
}
if(body.action==='transition'){if(mod==='leave_dues')throw Error('مستحقات الإجازة تعتمد حصريًا من المدير العام قبل المالية');if(['payroll','payroll_batches'].includes(mod))throw Error('اعتماد المسيرات الشهرية يتم حصريًا من نافذة المسير الشهري');if(!permission(u,mod,'approve'))throw Error('403');if(!old)throw Error('السجل غير موجود');if(operationalModules.includes(mod)||['repayments'].includes(mod))throw Error('هذا السجل لا يتطلب مسار اعتماد');const current=old.status;const routedRequest=['leave','advances','resignations'].includes(mod);let next=mod==='payroll'?(current==='draft'?'hr':current==='hr'?'finance':current==='finance'?'approved':null):(routedRequest&&current==='finance'?'approved':current==='draft'?workflow[1]:workflow[workflow.indexOf(current)+1]);const decision=body.decision||'approve';if(decision==='return')next='draft';if(decision==='reject')next='rejected';if(!['approve','return','reject'].includes(decision))throw Error('قرار غير صالح');if(decision!=='approve'&&!String(body.note||'').trim())throw Error('سبب الإعادة أو الرفض مطلوب');if(!next)throw Error('السجل مغلق');if(current==='draft'&&decision!=='approve')throw Error('القرار غير متاح للمسودة');if(current==='draft'){if(!permittedWrite(u,mod))throw Error('403');}else if(current==='finance'&&routedRequest&&!['admin','hr'].includes(u.role))throw Error('هذه مرحلة قديمة؛ ترحيل الطلب متاح لشؤون الموظفين أو المدير العام فقط');else if(current==='finance'&&!routedRequest&&!isRequestFinanceActor(u))throw Error('403');else if(routedRequest?(u.role!=='admin'&&!isRequestStageActor(u,current)):(u.role!=='admin'&&u.role!==current))throw Error('403');const details=JSON.parse(old.data);
if(routedRequest&&!details.employee_id)throw Error('لا يمكن توجيه طلب دون موظف مرتبط بمشروع');

if(routedRequest&&details.employee_id&&(current==='draft'||current==='project_manager')){
 const employeeRecord=await db.prepare("SELECT id,company,data FROM records WHERE id=? AND module='employees' AND company=?").bind(String(details.employee_id),old.company).first<any>();
 if(!employeeRecord)throw Error('الموظف المرتبط بالطلب غير موجود في الشركة');
 const employeeData=JSON.parse(employeeRecord.data||'{}');
 if(employeeData._archived||employeeData._deleted)throw Error('الموظف مؤرشف أو محذوف');
 const projectId=String(employeeData.project_id||details.project_id||'');
 if(!projectId)throw Error('يجب تحديد مشروع الموظف ومركز تكلفته');
 const projectRecord=await db.prepare("SELECT id,company,data FROM records WHERE id=? AND module='projects' AND company=?").bind(projectId,old.company).first<any>();
 if(!projectRecord)throw Error('مشروع الموظف غير موجود');
 const projectData=JSON.parse(projectRecord.data||'{}');
 // Approval follows the employee's explicitly assigned direct manager, independently of the project manager.
 const managerEmail=String(employeeData.manager_email||details.direct_manager?.email||'').trim().toLowerCase();
 const managerName=String(employeeData.manager||details.direct_manager?.name||'').trim();
 const adminOverride=u.role==='admin'&&u.is_active!==false;
 if(!managerEmail&&!adminOverride)throw Error('المدير المباشر للموظف لا يمتلك بريد اعتماد محدداً؛ حدّث سجل الموظف');
 const manager=managerEmail?await db.prepare('SELECT email,role,is_active,companies,projects,username FROM members WHERE lower(email)=?').bind(managerEmail).first<any>():null;
 if(!adminOverride&&(!manager||manager.is_active===false||!['project_manager','hr','admin','projects_director'].includes(manager.role)))throw Error('المدير المباشر لا يملك حساب اعتماد نشطاً');
 if(!adminOverride&&manager?.companies&&manager.companies!=='*'){
  let scope:any=[];try{scope=JSON.parse(manager.companies)}catch{}
  if(!Array.isArray(scope)||!scope.includes(old.company))throw Error('المدير المباشر لا يملك صلاحية شركة الموظف');
 }
 if(!adminOverride&&manager?.role==='project_manager'&&manager.projects&&manager.projects!=='*'){
  let scope:any=[];try{scope=JSON.parse(manager.projects)}catch{}
  if(!Array.isArray(scope)||!scope.includes(projectId))throw Error('المدير المباشر لا يملك صلاحية مشروع الموظف');
 }
 const actorEmail=String(u.email||'').trim().toLowerCase();
 const isDirector=u.role==='admin'&&u.is_active!==false;
 const isManager=actorEmail===managerEmail;
 if(current==='draft'){
  details.project_id=projectId;
  details.direct_manager={name:managerName||manager?.username||managerEmail||'المدير العام — اعتماد استثنائي',email:managerEmail||u.email,project_name:projectData.name||'',approval_role:'project_manager',...(adminOverride?{admin_override:true}: {})};
  if(isManager||isDirector){
   next='projects_director';
   details.manager_submitted_by=u.email;
   details.manager_submitted_at=now;
  }
 }else if(!isManager&&!isDirector){
  throw Error('هذا الطلب بانتظار اعتماد المدير المباشر المحدد في سجل الموظف');
 }
}

if(routedRequest&&current==='finance'&&decision==='approve'){details.legacy_finance_stage_migrated_at=now;details.legacy_finance_stage_migrated_by=u.email;}
if(routedRequest){
 // Save verified approver and timestamp for the horizontal status register.
 // Audit entries below remain the authoritative history of all decisions.
 if(decision==='approve'){
  const completed=current==='draft'?(next==='projects_director'?'project_manager':null):current;
  if(completed&&['project_manager','projects_director','hr'].includes(completed)){
   const tracking=details.approval_tracking&&typeof details.approval_tracking==='object'&&!Array.isArray(details.approval_tracking)?details.approval_tracking:{};
   details.approval_tracking={...tracking,[completed]:{actor:u.email,name:String(u.username||u.displayName||''),at:now,...(u.role==='admin'?{admin_override:true,stage:completed}: {})}};
  }
 }else if(decision==='return'){
  // A returned request must pass through the approval stages again.
  details.approval_tracking={};
  delete details.manager_submitted_at;
  delete details.manager_submitted_by;
 }
}
if(current==='finance'&&!routedRequest&&u.role==='admin'&&!isRequestFinanceActor(u))throw Error('الإدارة المالية وحدها مخولة بالاعتماد المالي');
if(mod==='payroll'&&decision==='approve'){
 const rounded=n=>Math.round(Number(n||0)*100);
 if(!Number.isFinite(Number(details.net))||rounded(details.cash_amount)+rounded(details.bank_amount)!==rounded(details.net))throw Error('لا يمكن اعتماد مسير غير موزع بالكامل بين الكاش والتحويل البنكي');
 if(next==='approved'&&u.role!=='admin'&&u.role!=='finance')throw Error('الاعتماد النهائي للمالية فقط');
}
if(mod==='leave'&&next==='approved'&&details.leave_type==='annual'){
 const split=await calculateAnnualLeaveSplit(db,details.employee_id,old.company,Number(details.days||0));
 Object.assign(details,{paid_days:split.paid_days,unpaid_days:split.unpaid_days,leave_payment:split.leave_payment,balance_deducted:split.balance_deducted});
}
let balanceCondition='';let balanceArgs:any[]=[];
if(mod==='leave'&&current==='hr'&&JSON.parse(old.data).leave_type==='sick'&&next!=='draft'&&next!=='rejected'){const count=await db.prepare('SELECT count(*) n FROM files WHERE record_id=?').bind(old.id).first<any>();if(!count?.n||body.medical_verified!==true)throw Error('تحقق من المرفق الطبي وأكّد مراجعته قبل الاعتماد');}if(mod==='leave'&&next==='approved'){const employee=await db.prepare('SELECT data FROM records WHERE id=? AND module=? AND company=?').bind(details.employee_id,'employees',old.company).first<any>();if(!employee)throw Error('الموظف غير موجود');const e=JSON.parse(employee.data);const service=annualLeave(e.hire_date,e.contract_expiry_mode==='manual'&&e.contract_expiry?e.contract_expiry:saudiDate());const leaves=(await db.prepare("SELECT data FROM records WHERE module='leave' AND status='approved' AND company=?").bind(old.company).all()).results;const used=leaves.map((r:any)=>JSON.parse(r.data)).filter((d:any)=>d.employee_id===details.employee_id&&(d.balance_deducted??(!d.leave_type||d.leave_type==='annual'))).reduce((n:number,d:any)=>n+Number(d.paid_days??d.days),0);if(details.balance_deducted??(!details.leave_type||details.leave_type==='annual')){if((e.contract_expiry_mode==='manual'||e.leave_balance_mode!=='manual')&&!service&&e.opening_leave_confirmed!=='yes')throw Error('استكمل تاريخ التعيين أو اعتمد رصيد الإجازة المرحّل');const available=e.contract_expiry_mode!=='manual'&&e.leave_balance_mode==='manual'?Number(e.manual_leave_entitlement||0):(service?.accrued||0)+(e.opening_leave_confirmed==='yes'?Number(e.opening_leave||0):0);const charge=Number(details.paid_days??details.days);if(charge>available-used)throw Error('رصيد الإجازة غير كاف');balanceCondition=" AND (COALESCE((SELECT SUM(CAST(COALESCE(json_extract(data,'$.paid_days'),json_extract(data,'$.days')) AS REAL)) FROM records WHERE module='leave' AND status='approved' AND json_extract(data,'$.employee_id')=? AND coalesce(json_extract(data,'$.balance_deducted'),CASE WHEN coalesce(json_extract(data,'$.leave_type'),'annual')='annual' THEN 1 ELSE 0 END)=1),0)+?<=?)";balanceArgs=[details.employee_id,charge,available];}}
const result=await db.batch([db.prepare('UPDATE records SET status=?,data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?'+balanceCondition).bind(next,JSON.stringify(details),now,mutation,old.id,old.revision,...balanceArgs),db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,old.id,'transition',now,JSON.stringify({from:current,to:next,note:String(body.note||'').slice(0,2000)}),old.id,mutation)]);if(!result[0].meta.changes)throw Error('تغير السجل أو الرصيد؛ حدّث الصفحة وأعد المحاولة');return json({ok:true});}
if(mod==='employees'&&['archive_employee','restore_employee'].includes(body.action)){
 if(!permittedWrite(u,'employees')||!permission(u,'employees','edit')||!['admin','hr'].includes(u.role))throw Error('403');
 if(!old)throw Error('الموظف غير موجود');
 if(!visible(u,parse(old),(await db.prepare("SELECT * FROM records").all()).results.map(parse)))throw Error('403');
 if(old.revision!==Number(body.revision))throw Error('تغير سجل الموظف؛ أعد تحميل الصفحة');
 const prior=JSON.parse(old.data),archived=body.action==='archive_employee';
 if(Boolean(prior._archived)===archived)throw Error(archived?'الموظف مؤرشف بالفعل':'الموظف غير مؤرشف');
 const reason=String(body.reason||'').trim().slice(0,1000);
 if(archived&&!reason)throw Error('سبب حذف الموظف من القائمة مطلوب');
 if(archived){
  const batches=(await db.prepare("SELECT id,status,data FROM records WHERE module='payroll_batches' AND status<>'paid'").all()).results;
  const activeBatchIds=new Set(batches.map((b:any)=>b.id));
  const payrolls=(await db.prepare("SELECT data FROM records WHERE module='payroll'").all()).results;
  if(payrolls.some((r:any)=>{const x=JSON.parse(r.data);return x.employee_id===old.id&&activeBatchIds.has(x.batch_id)&&!x.excluded}))throw Error('الموظف مدرج في مسير لم يصرف بعد؛ استبعده من المسير أو أكمل إجراءات المسير أولًا');
 }
 const changed={...prior,_archived:archived,_archived_at:archived?now:null,_archived_by:archived?u.email:null,_archive_reason:archived?reason:null,
  _previous_employment_status:archived?(prior.employment_status||prior.employee_status||'active'):prior._previous_employment_status,
  employment_status:archived?'inactive':(prior._previous_employment_status||prior.employment_status||'active')};
 const res=await db.batch([
  db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?").bind(JSON.stringify(changed),now,mutation,old.id,old.revision),
  db.prepare("INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)").bind(crypto.randomUUID(),u.email,old.id,body.action,now,JSON.stringify({reason,company:old.company}),old.id,mutation)
 ]);
 if(!res[0].meta.changes)throw Error('تعذر تعديل السجل؛ حدّث الصفحة');
 return json({ok:true,archived,employee_id:old.id});
}
if(['payroll','payroll_batches'].includes(mod))throw Error('إنشاء وتعديل مسيرات الرواتب الشهرية يتم حصريًا من نافذة المسير الشهري');
if(old&&mod==='repayments'&&JSON.parse(old.data||'{}')._payroll_batch_id)throw Error('سداد السلفة المرتبط بمسير مدفوع مقفل؛ أي تصحيح يتم بسجل تسوية مالي مستقل');
if(!permittedWrite(u,mod)||!permission(u,mod,'edit'))throw Error('403');if(old&&old.status!=='draft'&&mod!=='employees'&&!(mod==='returns'&&u.role==='admin'&&old.status==='completed'))throw Error('التعديل متاح للمسودات فقط؛ ويجوز لمدير النظام تصحيح مباشرة مكتملة بسبب موثق');if(mod==='employees'&&old&&JSON.parse(old.data)._archived)throw Error('يجب استعادة الموظف من الأرشيف قبل تعديل بياناته');const previous=old?JSON.parse(old.data):null;
if(mod==='employees'&&!old)body.data={...(body.data||{}),code:'AUTO'};
if(mod==='projects'&&!old)body.data={...(body.data||{}),code:'AUTO'};
const data={...(previous||{}),...normalize(mod,body)};
if(mod==='appointments'&&!data.employee_id)throw Error('اختر الموظف الموجود أو استخدم خيار تعيين موظف جديد لإنشاء سجل الموظف تلقائيًا');
if(mod==='employees'&&!old){data.opening_leave='0';data.opening_leave_confirmed='no';}
if(mod==='employees'&&old&&previous?.opening_leave_confirmed==='yes'&&!Object.prototype.hasOwnProperty.call(body.data||{},'opening_leave')){data.opening_leave=previous.opening_leave;data.opening_leave_confirmed='yes';}
if(mod==='employees'&&typeof body.data?._direct_manager_manual==='boolean'){
 data._direct_manager_manual=body.data._direct_manager_manual;
 if(data._direct_manager_manual)data.manager_email=String(body.data.manager_email||'').trim().toLowerCase();
}
if(mod==='projects'&&old)data.code=String(previous.code||old.code||'');
if(mod==='projects'&&old&&String(data.manager_email||'').trim().toLowerCase()!==String(previous.manager_email||'').trim().toLowerCase())throw Error('احفظ تعيين مدير المشروع من نافذة المشروع باستخدام إجراء الربط المعتمد');

if(mod==='employees'&&previous&&body.salary_edit_source!=='basic'&&Number(previous.salary??previous.total_monthly_salary)===Number(data.salary))for(const key of ['basic','housing','transport'])if(previous[key]!==undefined)data[key]=previous[key];if(mod==='employees'){data._review_flags=[...(!data.hire_date?['تاريخ التعيين يحتاج استكمال']:[]),...(data.company==='غير محددة'?['الشركة تحتاج مراجعة']:[])];}if(mod==='warnings'&&data.warning_type!=='notice'&&!Number(data.sequence)){data.sequence=({first:1,second:2,final:3} as any)[data.warning_type];}if(!visible(u,{module:mod,company:body.company,data},(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('403');if(mod==='project_managers'){
 if(!['admin','hr'].includes(u.role))throw Error('403');
 data.email=String(data.email||'').trim().toLowerCase();
 const member=await db.prepare('SELECT email,role,is_active,companies,username FROM members WHERE lower(email)=?').bind(data.email).first<any>();
 if(!isAuthorizedProjectManagerAccount(member,data.name))throw Error('يجب ربط بيانات المدير بحساب نشط بصلاحية مدير مشروع');
 if(member.companies&&member.companies!=='*'){
  let valid=false;try{valid=JSON.parse(member.companies).includes(body.company)}catch{}
  if(!valid)throw Error('حساب المدير لا يملك صلاحية الشركة المحددة');
 }
 const records=(await db.prepare("SELECT id,company,data FROM records WHERE module='project_managers' AND company=?").bind(body.company).all()).results;
 const employees=(await db.prepare("SELECT data FROM records WHERE module='employees' AND company=?").bind(body.company).all()).results.map((r:any)=>JSON.parse(r.data||'{}')).filter((e:any)=>!e._archived);
 const currentEntry=records.find((r:any)=>r.id===old?.id);
 const matchingEmployee=employees.find((e:any)=>String(e.email||'').trim().toLowerCase()===data.email);
 const managedEmployee=employees.find((e:any)=>String(e.manager_email||'').trim().toLowerCase()===data.email);
 const recordData=currentEntry?JSON.parse(currentEntry.data||'{}'):null;
 if(recordData&&String(recordData.email||'').trim().toLowerCase()!==data.email)throw Error('لا يمكن تغيير حساب مدير مشروع مسجل إلى حساب آخر؛ افتح سجل المدير الآخر أو أنشئ سجلًا جديدًا');
 const canonicalName=isMagdiGeneralManagerAccount(member,data.name)?magdiProjectManagerName:String(recordData?.name||matchingEmployee?.name||managedEmployee?.manager||member.username||data.email).trim();
 if(!canonicalName||String(data.name||'').trim()!==canonicalName)throw Error('يجب اختيار اسم المدير من القائمة المعتمدة، ولا يمكن إدخال اسم مختلف');
 const department=String(data.department||'').trim();
 const registeredDepartments=new Set([...employees.map((e:any)=>String(e.department||'').trim()),...records.map((r:any)=>String(JSON.parse(r.data||'{}').department||'').trim()),'إدارة المشاريع','قسم التكييف'].filter(Boolean));
 if(!department||!registeredDepartments.has(department))throw Error('اختر الإدارة أو القسم من القائمة المسجلة');
 data.name=canonicalName;data.department=department;
 data.job=String(recordData?.job||matchingEmployee?.job||data.job||'مدير مشاريع');
 if(records.some((r:any)=>r.id!==old?.id&&String(JSON.parse(r.data).email||'').trim().toLowerCase()===data.email))throw Error('مدير المشروع مسجل مسبقًا لدى الشركة؛ عدّل سجله الموجود');
}
if(mod==='projects'&&String(data.manager_email||'').trim()){
 const managerEmail=String(data.manager_email).trim().toLowerCase();
 const manager=await db.prepare('SELECT role,is_active,companies FROM members WHERE email=?').bind(managerEmail).first<any>();
 if(!isAuthorizedProjectManagerAccount(manager,data.manager_name||magdiProjectManagerName))throw Error('اختر مدير مشروع يمتلك حساب دخول نشط بصلاحية مدير مشروع');
 if(manager.companies&&manager.companies!=='*'){
  let authorized=false;
  try{authorized=JSON.parse(manager.companies).includes(body.company)}catch{}
  if(!authorized)throw Error('مدير المشروع لا يمتلك صلاحية الشركة المحددة؛ عدّل نطاق حسابه أولًا');
 }
 const managerRecord=(await db.prepare("SELECT data FROM records WHERE module='project_managers' AND company=?").bind(body.company).all()).results.map((r:any)=>JSON.parse(r.data)).find((r:any)=>String(r.email||'').trim().toLowerCase()===managerEmail);
 if(!managerRecord&&!isMagdiGeneralManagerAccount(manager,data.manager_name))throw Error('سجّل بيانات مدير المشروع أولًا في دليل مدراء المشاريع للشركة');
 if(isMagdiGeneralManagerAccount(manager,data.manager_name)&&managerRecord&&preferredManagerForName(managerRecord.name)?.id!=='magdi')throw Error('اسم حساب المدير العام غير متطابق مع ملف مجدي محجوب');
 data.manager_name=isMagdiGeneralManagerAccount(manager,data.manager_name)?magdiProjectManagerName:managerRecord.name;
 data.manager_phone=managerRecord?.phone||'';
 data.manager_email=managerEmail;
}
const transferringEmployee=mod==='employees'&&Boolean(old)&&old.company!==body.company;
if(mod==='employees'){
 const changingProject=Boolean(old)&&String(previous?.project_id||'')!==String(data.project_id||'');
 // The approval delegate is tied to this exact employment/project assignment.
 if(old&&(transferringEmployee||changingProject))delete data.delegated_manager_email;
 if(transferringEmployee)data._direct_manager_manual=false;
 let projectOwnerEmail='',projectOwnerName='';
 if(data.project_id){
  const project=await db.prepare("SELECT data,company FROM records WHERE module='projects' AND id=?").bind(data.project_id).first<any>();
  if(!project)throw Error('مشروع الموظف غير موجود');
  const details=JSON.parse(project.data||'{}');
  if(project.company!==body.company&&!(Array.isArray(details._shared_companies)&&details._shared_companies.includes(body.company)))throw Error('المشروع لا يتبع شركة الموظف');
  projectOwnerEmail=String(details.manager_email||'').trim().toLowerCase();
  projectOwnerName=String(details.manager_name||'').trim();
 }
 let resolved:any=null;
 // Imported employee assignments may reference legacy managers no longer present in
 // the active directory. Keep the already saved assignment on unrelated edits.
 const managerAssignmentUnchanged=Boolean(old&&old.company===body.company
  &&String(previous?.project_id||'')===String(data.project_id||'')
  &&String(previous?.manager||'')===String(data.manager||'')
  &&String(previous?.manager_email||'').trim().toLowerCase()===String(data.manager_email||'').trim().toLowerCase()
  &&String(previous?.direct_manager_id||'')===String(data.direct_manager_id||'')
  &&Boolean(previous?._direct_manager_manual)===Boolean(data._direct_manager_manual));
 if(managerAssignmentUnchanged){
  for(const key of ['manager','manager_email','direct_manager_id','_direct_manager_manual','delegated_manager_email']){
   if(Object.prototype.hasOwnProperty.call(previous,key))data[key]=previous[key];
  }
 }else if(data._direct_manager_manual){
  const choices=await availableEmployeeDirectManagers(db,body.company);
  resolved=choices.find(m=>normalizeManagerName(m.name)===normalizeManagerName(data.manager));
  if(!resolved)throw Error('المدير المباشر المحدد غير مسجل ضمن قائمة المدراء؛ أعد اختياره');
 }else if(data.project_id){
  resolved=await resolveEmployeeDirectManager(db,body.company,projectOwnerEmail,projectOwnerName,false);
 }else if(data.direct_manager_id){
  const directory=await db.prepare("SELECT data FROM records WHERE id=? AND module='project_managers' AND company=?").bind(data.direct_manager_id,body.company).first<any>();
  if(!directory)throw Error('المدير المباشر غير مسجل لهذه الشركة');
  const details=JSON.parse(directory.data||'{}');
  resolved=await resolveEmployeeDirectManager(db,body.company,String(details.email||''),String(details.name||''),false);
  data._direct_manager_manual=true;
 }
 if(resolved){
  setEmployeeDirectManager(data,resolved,Boolean(data._direct_manager_manual));
 }
}
let linkedAccount=false;
if(old&&old.company!==body.company){
 if(mod!=='employees')throw Error('لا تغيّر شركة المعاملة بعد إنشائها');
 if(!companies.includes(body.company))throw Error('الشركة الجديدة غير معتمدة');
 if(!['admin','hr'].includes(u.role))throw Error('نقل الموظف بين الشركات يتطلب صلاحية مدير المنصة أو شؤون الموظفين');
 if(!visible(u,parse(old),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('غير مصرح بالوصول إلى شركة الموظف الحالية');
 if(!String(body.transfer_reason||'').trim())throw Error('سبب تغيير الشركة مطلوب لحفظ سجل النقل');
 const activeBatches=(await db.prepare("SELECT id,company,status FROM records WHERE module='payroll_batches' AND status<>'paid'").all()).results;
 const pendingIds=new Set(activeBatches.map((b:any)=>b.id));
 const payrollRows=(await db.prepare("SELECT company,data FROM records WHERE module='payroll'").all()).results;
 const activePayroll=payrollRows.some((r:any)=>{
  const d=JSON.parse(r.data||'{}');
  return d.employee_id===old.id&&!d.excluded&&pendingIds.has(d.batch_id);
 });
 if(activePayroll)throw Error('الموظف مدرج في مسير رواتب غير مصروف؛ استبعده من المسير أولًا أو أكمل الصرف ثم أعد تغيير الشركة');
 linkedAccount=Boolean(await db.prepare("SELECT 1 FROM members WHERE employee_id=? LIMIT 1").bind(old.id).first());
 if(linkedAccount&&u.role!=='admin')throw Error('الموظف مرتبط بحساب دخول؛ نقل الشركة يتطلب مدير المنصة لمراجعة نطاق صلاحيات الحساب');
 const history=Array.isArray(previous?._company_transfers)?previous._company_transfers:[];
 data._company_transfers=[...history,{from:old.company,to:body.company,at:now,by:u.email,reason:String(body.transfer_reason||'تصحيح بيانات الشركة').trim().slice(0,500)}];
 data._previous_company=old.company;
 data._linked_account_review_required=linkedAccount;
}
let returnLeaveRecord:any=null;
for(const field of (modules as any)[mod].fields){if((relationModules as any)[field.type]&&data[field.key]){const target=(relationModules as any)[field.type];const linked=await db.prepare('SELECT * FROM records WHERE id=? AND module=?').bind(data[field.key],target).first<any>();if(!linked||(linked.company!==body.company&&!(target==='projects'&&(JSON.parse(linked.data)._shared_companies||[]).includes(body.company)))||!visible(u,parse(linked),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('المرجع لا يتبع الشركة أو النطاق المختار');if(field.type==='employee')data.project_id=JSON.parse(linked.data).project_id||'';if(field.type==='employee'&&mod==='terminations'){const employeeData=JSON.parse(linked.data);if(employeeData.hire_date&&data.date<employeeData.hire_date)throw Error('إنهاء الخدمة لا يسبق تاريخ التعيين');if(data.case_status==='completed'&&data.date>saudiDate())throw Error('لا يكتمل التسجيل بتاريخ مستقبلي');if(data.resignation_id){const resignation=await db.prepare("SELECT data FROM records WHERE module='resignations' AND (id=? OR code=?) AND status='approved'").bind(data.resignation_id,data.resignation_id).first<any>();if(!resignation||JSON.parse(resignation.data).employee_id!==data.employee_id)throw Error('مرجع الاستقالة غير معتمد لهذا الموظف');}}if(field.type==='leave'){const leave=JSON.parse(linked.data);data.employee_id=leave.employee_id;data.project_id=leave.project_id||'';if(mod==='returns'){
 returnLeaveRecord=linked;
 if(!isReturnEligibleLeave({...linked,data:leave})||leave.start>saudiDate()||data.actual_return<leave.start||data.actual_return>saudiDate())throw Error('المباشرة تتطلب إجازة معتمدة بدأت بالفعل، وتاريخ حضور فعلي بين بدايتها واليوم');
 if(old&&!String(data.notes||'').trim())throw Error('سبب تصحيح تاريخ المباشرة مطلوب عند تعديل محضر قائم');
 data.leave_start=String(leave.start||'');
 data.leave_end=String(leave.end||'');
 data.expected_return=String(leave.expected_return||'');
 if(data.actual_return&&data.expected_return)data.return_difference_days=Math.round((Date.parse(data.actual_return)-Date.parse(data.expected_return))/86400000);
}if(mod==='leave_dues'){
 if(linked.status!=='approved')throw Error('لا يمكن إنشاء مستحقات إلا لإجازة معتمدة');
 // The request, not a manually entered field, owns the eligible paid-day count.
 const paidDays=leave.leave_type==='annual'?Number(leave.paid_days??leave.days):leave.leave_type==='unpaid'?0:Number(leave.days||0);
 data.days=Math.max(0,paidDays);
 if(!old){const linkedExisting=await db.prepare("SELECT id FROM records WHERE module='leave_dues' AND company=? AND json_extract(data,'$.leave_id')=? LIMIT 1").bind(body.company,linked.id).first<any>();if(linkedExisting)throw Error('مستحقات هذه الإجازة مسجلة بالفعل؛ افتح السجل الحالي لتعديله');}
 data.net=Math.round((data.salary_basis/30*data.days+data.travel_amount+data.other_amount-data.deductions)*100)/100;
 if(data.net<0)throw Error('صافي مستحقات الإجازة سالب');
}}if(field.type==='advance'){if(linked.status!=='paid')throw Error('يجب توثيق صرف السلفة قبل تسجيل السداد');data.employee_id=JSON.parse(linked.data).employee_id;data.project_id=JSON.parse(linked.data).project_id||'';const repayments=(await db.prepare("SELECT id,data FROM records WHERE module='repayments'").all()).results.map((r:any)=>({...JSON.parse(r.data),id:r.id})).filter((r:any)=>r.advance_id===linked.id&&r.id!==old?.id);if(data.amount+repayments.reduce((n:number,r:any)=>n+Number(r.amount||0),0)>Number(JSON.parse(linked.data).amount)+.001)throw Error('السداد يتجاوز الرصيد المتبقي');}if(field.type==='employee'&&mod==='payroll'){const e=JSON.parse(linked.data);data.salary=Number(e.salary??e.total_monthly_salary??0);data.basic=Number(e.basic??e.basic_salary??0);data.housing=Number(e.housing??e.housing_allowance??0);data.transport=Number(e.transport??e.transport_allowance??0);
data.overtime=Math.round(Number(data.overtime_hours||0)*(data.salary/30/8+.5*data.basic/30/8)*100)/100;
data.net=Math.round((data.salary+Number(data.bonus||0)+Number(data.extra_allowance||0)+data.overtime-Number(data.deductions||0)-Number(data.absence_deduction||0)-Number(data.advance_deduction||0))*100)/100;
if(data.net<0)throw Error('صافي الراتب سالب');
const cents=x=>Math.round(Number(x||0)*100);
if(cents(data.cash_amount)+cents(data.bank_amount)!==cents(data.net))throw Error('مجموع الكاش والتحويل البنكي يجب أن يساوي صافي الراتب');
data.method=cents(data.cash_amount)>0&&cents(data.bank_amount)>0?'mixed':cents(data.cash_amount)>0?'cash':'bank';}}}
if(mod==='leave'&&data.leave_type==='annual'){
 const split=await calculateAnnualLeaveSplit(db,data.employee_id,body.company,Number(data.days||0));
 Object.assign(data,{paid_days:split.paid_days,unpaid_days:split.unpaid_days,leave_payment:split.leave_payment,balance_deducted:split.balance_deducted});
}
// Persist a compact historical snapshot from the canonical employee record,
// not from values supplied by the browser. Reviewable payout fields stay editable.
if(mod!=='employees'&&['leave','advances','warnings','resignations','returns','terminations','leave_dues','settlements','appointments','payroll'].includes(mod)&&data.employee_id){
 const employeeRecord=await db.prepare("SELECT id,company,data FROM records WHERE id=? AND module='employees' AND company=?").bind(data.employee_id,body.company).first<any>();
 if(!employeeRecord)throw Error('الموظف المختار غير موجود في الشركة');
 const employee=JSON.parse(employeeRecord.data);
 const snapshot={employee_id:employeeRecord.id,company:body.company,name:String(employee.name||''),code:String(employee.code||''),job:String(employee.job||''),department:String(employee.department||''),project_id:String(employee.project_id||''),manager:String(employee.manager||''),direct_manager_id:String(employee.direct_manager_id||''),manager_email:String(employee.manager_email||''),manager_phone:String(employee.manager_phone||''),identity:String(employee.identity||''),nationality:String(employee.nationality||''),hire_date:String(employee.hire_date||''),salary:Number(employee.salary||0),basic:Number(employee.basic||0),housing:Number(employee.housing||0),transport:Number(employee.transport||0),bank_amount:Number(employee.bank_amount||0),cash_amount:Number(employee.cash_amount||0),bank:String(employee.bank||''),iban:String(employee.iban||'')};
 snapshot.working_company=String(employee.working_company||body.company);
 if(!old||previous?.employee_id!==data.employee_id||!previous?.employee_snapshot)data.employee_snapshot=snapshot;
  data.direct_manager={name:snapshot.manager,email:snapshot.manager_email,phone:snapshot.manager_phone,directory_id:snapshot.direct_manager_id};
 if(employee.project_id){
  const project=await db.prepare("SELECT company,data FROM records WHERE module='projects' AND id=?").bind(employee.project_id).first<any>();
  if(project){
   const projectDetails=JSON.parse(project.data);
   const managerEmail=String(projectDetails.manager_email||'').trim().toLowerCase();
   const manager=(await db.prepare("SELECT data FROM records WHERE module='project_managers' AND company=?").bind(body.company).all()).results.map((r:any)=>JSON.parse(r.data)).find((r:any)=>String(r.email||'').trim().toLowerCase()===managerEmail);
   if(managerEmail){
    data.project_id=employee.project_id;
    data.project_manager={name:manager?.name||projectDetails.manager_name||'',email:managerEmail,phone:manager?.phone||'',project_name:projectDetails.name||''};
   }
  }
 }
 if(mod==='leave_dues'){
  if(!Number(data.salary_basis))data.salary_basis=snapshot.salary;
  data.net=Math.round((Number(data.salary_basis)/30*Number(data.days)+Number(data.travel_amount||0)+Number(data.other_amount||0)-Number(data.deductions||0))*100)/100;
  if(data.net<0)throw Error('صافي مستحقات الإجازة سالب');
 }
 if(mod==='settlements'){
  if(!data.monthly_salary)data.monthly_salary=snapshot.salary;
  if(!data.beneficiary_name)data.beneficiary_name=snapshot.name;
  if(!data.beneficiary_identity)data.beneficiary_identity=snapshot.identity;
  if(!data.bank_name)data.bank_name=snapshot.bank;
  if(!data.iban)data.iban=snapshot.iban;
 }
}
if(mod==='projects'&&(Number(data.radius)<20||Number(data.radius)>5000))throw Error('نطاق الحضور من 20 إلى 5000 متر');if(mod==='payroll'&&(Number(data.absence_days)>31||Number(data.overtime_hours)>300))throw Error('الغياب أو ساعات الإضافي تتجاوز الحدود');if(mod==='settlements'){data.net=Math.round((Number(data.amount)-Number(data.deductions))*100)/100;if(data.net<0)throw Error('الخصم يتجاوز المستحقات');}if(mod==='payroll'&&!old){
 const duplicate=await db.prepare("SELECT id FROM records WHERE module='payroll' AND company=? AND code=?").bind(body.company,`${data.employee_id}:${data.month}`).first();
 if(duplicate)throw Error('مسير الموظف لهذا الشهر موجود بالفعل؛ افتحه للتعديل بدل إنشاء سجل مكرر');
}
const id=old?.id||crypto.randomUUID();
const returnSyncUpdates:any[]=[];
const returnPayrollSync={updated:0,created:0,status:'none'};
if(mod==='returns'){
 if(!returnLeaveRecord)throw Error('اختر إجازة معتمدة لتسجيل المباشرة');
 const leaveData=JSON.parse(returnLeaveRecord.data||'{}');
 const existingReturn=await db.prepare("SELECT id FROM records WHERE module='returns' AND company=? AND code=? LIMIT 1").bind(body.company,String(data.leave_id)).first<any>();
 if(existingReturn&&String(existingReturn.id)!==String(id))throw Error('تم تسجيل مباشرة هذه الإجازة مسبقًا؛ افتح محضر المباشرة الموجود');
 if(leaveData.return_record_id&&String(leaveData.return_record_id)!==String(id))throw Error('الإجازة مرتبطة مسبقًا بمحضر مباشرة آخر');
 const employeeRecord=await db.prepare("SELECT id,data,revision FROM records WHERE id=? AND module='employees' AND company=?").bind(data.employee_id,body.company).first<any>();
 if(!employeeRecord)throw Error('تعذر الوصول إلى سجل الموظف المرتبط بالإجازة');
 const employeeData=JSON.parse(employeeRecord.data||'{}');
 const currentPayrollMonth=String(data.actual_return||'').slice(0,7);
 const returnAttendance=returnPeriodAttendance(leaveData,data.actual_return,currentPayrollMonth);
 if(!returnAttendance.valid)throw Error('لا يمكن احتساب المباشرة؛ تحقق من بداية الإجازة ونهايتها وتاريخ العودة الفعلي');
 const referenceSalary=Number(employeeData.salary||Number(employeeData.basic||0)+Number(employeeData.housing||0)+Number(employeeData.transport||0));
 const updatedLeave={...leaveData,return_record_id:id,return_status:'completed',actual_return:data.actual_return,return_recorded_at:now,return_recorded_by:u.email,return_last_updated_by:u.email,return_last_updated_at:now};
 returnSyncUpdates.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='leave' AND revision=? AND COALESCE(data::jsonb->>'return_record_id','') IN ('',?)")
 .bind(JSON.stringify(updatedLeave),now,mutation,returnLeaveRecord.id,returnLeaveRecord.revision,id));
 // Older returns must not overwrite a later actual return on the employee profile.
 if(!employeeData.last_return_date||String(employeeData.last_return_leave_id||'')===String(data.leave_id)||data.actual_return>=employeeData.last_return_date){
  const updatedEmployee={...employeeData,last_return_date:data.actual_return,last_return_leave_id:data.leave_id,last_return_absence_days:returnAttendance.absence_days,last_return_payable_days:returnAttendance.payable_days,last_return_absence_amount:salaryAbsenceDeduction(referenceSalary,returnAttendance.absence_days),last_return_payroll_month:currentPayrollMonth,employment_status:employeeData.employment_status==='terminated'||employeeData.employment_status==='inactive'?employeeData.employment_status:'active',employee_status:employeeData.employee_status==='terminated'||employeeData.employee_status==='inactive'?employeeData.employee_status:'active',return_recorded_at:now};
  returnSyncUpdates.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='employees' AND revision=?")
   .bind(JSON.stringify(updatedEmployee),now,mutation,employeeRecord.id,employeeRecord.revision));
 }
 // The return-to-work event updates the current open payroll in the same transaction.
 // Approved, paid, and prior-month batches remain untouched.
 const month=String(data.actual_return).slice(0,7);
 const attendance=returnAttendance;
 data.absence_days=attendance.absence_days;
 data.payable_days=attendance.payable_days;
 data.unpaid_leave_days=attendance.unpaid_leave_days;
 data.late_days=attendance.late_days;
 const workCompany=String(employeeData.working_company||body.company);
 const openBatches=(await db.prepare("SELECT * FROM records WHERE module='payroll_batches' AND company=?").bind(workCompany).all()).results;
 const monthlyBatch=openBatches.find((b:any)=>{const d=JSON.parse(b.data||'{}');return d.month===month});
 const payrollRows=(await db.prepare("SELECT * FROM records WHERE module='payroll'").all()).results;
 const matched=payrollRows.filter((r:any)=>{const d=JSON.parse(r.data||'{}');return String(d.employee_id)===String(data.employee_id)&&String(d.month)===month});
 const current=matched.find((r:any)=>monthlyBatch&&JSON.parse(r.data||'{}').batch_id===monthlyBatch.id);
 data.payroll_sync_month=month;
 // Reconcile the month of actual attendance; never rewrite a different (current) payroll month.
 if(monthlyBatch&&['draft','manager_review'].includes(monthlyBatch.status)&&current){
  const prior=JSON.parse(current.data||'{}');
  if(prior.excluded){
   data.payroll_sync_status='excluded_needs_restore';returnPayrollSync.status='excluded_needs_restore';
  }else{
   const monthlySalary=Number(prior.basic||0)+Number(prior.housing||0)+Number(prior.transport||0);
   const newAbsenceDeduction=salaryAbsenceDeduction(monthlySalary,attendance.absence_days);
   const newNet=Math.round((monthlySalary+Number(prior.bonus||0)+Number(prior.extra_allowance||0)+Number(prior.overtime||0)-newAbsenceDeduction-Number(prior.advance_deduction||0)-Number(prior.deductions||0))*100)/100;
   if(newNet<0)throw Error('الخصومات تتجاوز المستحق بعد المباشرة؛ يلزم تصحيح المسير');
   const bank=Math.min(Number(prior.bank_amount||0),newNet);
   const updated={...prior,employment_status:'active',return_to_work_at:data.actual_return,return_record_id:id,
    cost_project_id:employeeData.project_id||prior.project_id||'',
    absence_days:attendance.absence_days,absence_deduction:newAbsenceDeduction,
    return_payable_days:attendance.payable_days,return_unpaid_leave_days:attendance.unpaid_leave_days,
    return_late_days:attendance.late_days,net:newNet,bank_amount:bank,cash_amount:Math.round((newNet-bank)*100)/100,
    split_confirmed:false,manager_reviewed:false,manager_reviewed_by:null,manager_reviewed_at:null,
    reviewed_by:null,reviewed_at:null,
    review_reason:[prior.review_reason,'اعتماد مباشرة الموظف؛ يلزم مراجعة حضور الشهر وتوزيع الراتب'].filter(Boolean).join('؛ ')};
   returnSyncUpdates.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll' AND revision=?")
    .bind(JSON.stringify(updated),now,mutation,current.id,current.revision));
   returnPayrollSync.updated++;returnPayrollSync.status='updated';
   data.payroll_sync_status='updated';
  }
 }else if(monthlyBatch&&monthlyBatch.status==='draft'&&!matched.some((r:any)=>!JSON.parse(r.data||'{}').excluded)){
  const basic=Number(employeeData.basic??employeeData.basic_salary??0);
  const housing=Number(employeeData.housing??employeeData.housing_allowance??0);
  const transport=Number(employeeData.transport??employeeData.transport_allowance??0);
  const salary=Math.round(Number(employeeData.salary??employeeData.total_monthly_salary??basic+housing+transport)*100)/100;
  const loans=(await db.prepare("SELECT * FROM records WHERE module='advances' AND status='paid'").all()).results.map((r:any)=>({...r,data:JSON.parse(r.data||'{}')})).filter((r:any)=>!r.data._deleted);
  const repayments=(await db.prepare("SELECT * FROM records WHERE module='repayments'").all()).results;
  const sums=new Map();
  for(const r of repayments){const d=JSON.parse(r.data||'{}');if(!d._deleted)sums.set(d.advance_id,(sums.get(d.advance_id)||0)+advanceCents(d.amount));}
  const allocations=calculateScheduledAdvances({loans,sums},data.employee_id,month,advanceCents(salary));
  const loanDeduction=allocations.reduce((n:number,a:any)=>n+advanceCents(a.amount),0)/100;
  const employeePayrollId=crypto.randomUUID();
  const line={batch_id:monthlyBatch.id,employee_id:data.employee_id,source_company:body.company,working_company:workCompany,month,
   employee_name:employeeData.name||'',employee_number:employeeData.code||employeeRecord.id,
   employment_status:'active',project_id:employeeData.project_id||'',cost_company:workCompany,cost_project_id:employeeData.project_id||'',
   manager_reviewed:false,manager_notes:'',basic,housing,transport,salary,bonus:0,extra_allowance:0,overtime_hours:0,overtime:0,
   absence_days:attendance.absence_days,absence_deduction:salaryAbsenceDeduction(salary,attendance.absence_days),return_payable_days:attendance.payable_days,return_unpaid_leave_days:attendance.unpaid_leave_days,return_late_days:attendance.late_days,advance_deduction:loanDeduction,advance_allocations:allocations,deductions:0,
   net:Math.round((salary-salaryAbsenceDeduction(salary,attendance.absence_days)-loanDeduction)*100)/100,cash_amount:0,bank_amount:0,split_confirmed:false,excluded:false,
   exception_note:'',needs_review:false,review_reason:'أضيف إلى المسير بعد تسجيل المباشرة؛ راجع استحقاق الشهر والغياب والسلف والتوزيع',
   notes:'',method:'bank',return_to_work_at:data.actual_return,return_record_id:id,
   added_to_batch_at:now,added_to_batch_by:u.email,added_reason:'approved_return_to_work'};
  const batchData=JSON.parse(monthlyBatch.data||'{}');
  returnSyncUpdates.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll_batches' AND revision=? AND status='draft'")
    .bind(JSON.stringify({...batchData,employee_count:Number(batchData.employee_count||0)+1}),now,mutation,monthlyBatch.id,monthlyBatch.revision));
  returnSyncUpdates.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) SELECT ?,'payroll',?,?,?,'draft',1,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM records WHERE module='payroll' AND data::jsonb->>'employee_id'=? AND data::jsonb->>'month'=? AND COALESCE(data::jsonb->>'excluded','false')<>'true')")
    .bind(employeePayrollId,workCompany,data.employee_id+':'+month+':'+monthlyBatch.id,JSON.stringify(line),u.email,now,now,mutation,data.employee_id,month));
  returnPayrollSync.created++;returnPayrollSync.status='created';data.payroll_sync_status='created';
 }else{
  data.payroll_sync_status=monthlyBatch?monthlyBatch.status==='paid'?'paid_batch_unchanged':monthlyBatch.status==='draft'?'excluded_needs_restore':'requires_payroll_return_to_draft':'next_payroll_generation';
  returnPayrollSync.status=data.payroll_sync_status;
 }
}

const centsOf=(value:any)=>Math.round(Number(value||0)*100);
const salaryFieldsChanged=mod==='employees'&&Boolean(old)&&['basic','housing','transport','salary'].some(k=>centsOf(previous?.[k])!==centsOf(data[k]));
const linkedPayrollUpdates:any[]=[];
const synchronizedMonths:string[]=[];
if(salaryFieldsChanged){
 const active=(await db.prepare("SELECT * FROM records WHERE module='payroll_batches'").all()).results;
 const batches=new Map(active.map((r:any)=>[r.id,r]));
 const rows=(await db.prepare("SELECT * FROM records WHERE module='payroll'").all()).results;
 for(const r of rows){
  const d=JSON.parse(r.data||'{}');
  if(d.employee_id!==old.id)continue;
  const batch:any=batches.get(d.batch_id);
  if(!batch)throw Error('تعذر تحديد مسير الرواتب المرتبط بالموظف، يرجى مراجعة المالية');
  if(batch.status==='paid')continue;
  if(!['draft','manager_review'].includes(batch.status))throw Error('تغيير الراتب يتطلب إعادة مسير '+(JSON.parse(batch.data||'{}').month||'')+' إلى مرحلة التجهيز أو مراجعة مدراء المشاريع قبل حفظه');
  const base=Number(data.basic),housing=Number(data.housing),transport=Number(data.transport),salary=Number(data.salary);
  const hours=Number(d.overtime_hours||0),bonus=Number(d.bonus||0),additional=Number(d.extra_allowance||0);
  const overtime=Math.round(hours*(salary/30/8+0.5*base/30/8)*100)/100;
  const net=Math.round((salary+bonus+additional+overtime-Number(d.absence_deduction||0)-Number(d.advance_deduction||0)-Number(d.deductions||0))*100)/100;
  const bank=Number(d.bank_amount||0);
  if(!Number.isFinite(net)||net<0||centsOf(bank)>centsOf(net))throw Error('الراتب الجديد أقل من التحويل البنكي أو الخصومات في مسير '+(JSON.parse(batch.data||'{}').month||'')+'؛ عدّل توزيع الصرف أو الخصومات أولًا');
  const cash=(centsOf(net)-centsOf(bank))/100;
  const revised={...d,basic:base,housing,transport,salary,overtime,net,cash_amount:cash,
    split_confirmed:false,manager_reviewed:false,manager_reviewed_by:null,manager_reviewed_at:null,
    reviewed_by:null,reviewed_at:null,needs_review:true,
    review_reason:[d.review_reason,'تغير الراتب الأساسي أو مكونات الراتب من سجل الموظفين؛ يلزم إعادة المراجعة'].filter(Boolean).join('؛ '),
    employee_salary_synced_at:now,employee_salary_synced_by:u.email,employee_salary_source_revision:old.revision+1};
  linkedPayrollUpdates.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll' AND revision=? AND EXISTS(SELECT 1 FROM records b WHERE b.id=? AND b.status IN ('draft','manager_review'))")
    .bind(JSON.stringify(revised),now,mutation,r.id,r.revision,batch.id));
  linkedPayrollUpdates.push(db.prepare("INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)")
    .bind(crypto.randomUUID(),u.email,r.id,'payroll_salary_sync',now,JSON.stringify({employee_id:old.id,month:d.month,old_basic:d.basic,new_basic:base,old_salary:d.salary,new_salary:salary,old_net:d.net,new_net:net,requires_review:true}),r.id,mutation));
  synchronizedMonths.push(d.month||JSON.parse(batch.data||'{}').month||'');
 }
 data._last_salary_change={at:now,by:u.email,from_basic:previous?.basic,to_basic:data.basic,from_salary:previous?.salary,to_salary:data.salary,synchronized_payroll_months:synchronizedMonths};
}
if(mod==='projects'&&!old){
 const serial=await db.prepare("SELECT nextval('hr.project_code_seq')::text AS code").first<any>();
 if(!serial?.code||!/^\d{4,8}$/.test(String(serial.code)))throw Error('تعذر توليد رمز تسلسلي للمشروع');
 data.code=String(serial.code);
}
// Allocate one database-backed serial for every newly saved HR form. The sequence is
// shared across modules so concurrent writes cannot reuse a document number.
// Existing records retain their original references; business keys (leave id, payroll
// period, employee number) continue to serve their existing lookup semantics.
if(old){
 const originalNo=String(previous?.document_no||'').trim();
 if(originalNo)data.document_no=originalNo;
 if(['appointments','employees'].includes(mod)&&!originalNo){
  const serial=(await db.prepare("SELECT nextval('hr.project_code_seq')::text AS serial").first<any>())?.serial;
  if(!serial||!/^\d{4,12}$/.test(String(serial)))throw Error('تعذر توليد رقم النموذج');
  data.document_no=(mod==='employees'?'EMP':'APT')+'-'+saudiDate().slice(0,4)+'-'+String(serial).padStart(6,'0');
 }
}else{
 const serial=(await db.prepare("SELECT nextval('hr.project_code_seq')::text AS serial").first<any>())?.serial;
 if(!serial||!/^\d{4,12}$/.test(String(serial)))throw Error('تعذر توليد رقم النموذج؛ أعد المحاولة');
 const prefix=({appointments:'APT',leave:'LEV',advances:'ADV',warnings:'WRN',resignations:'RES',returns:'RTW',leave_dues:'LDU',settlements:'SET',terminations:'TER',repayments:'RPA',payroll:'PAY',payroll_batches:'PBA',employees:'EMP',projects:'PRJ',project_managers:'MGR',company_profiles:'CMP'} as Record<string,string>)[mod]||'HR';
 data.document_no=prefix+'-'+saudiDate().slice(0,4)+'-'+String(serial).padStart(6,'0');
}
const code=mod==='warnings'&&data.warning_type!=='notice'?data.employee_id+':'+data.sequence:['returns','leave_dues'].includes(mod)?data.leave_id:mod==='company_profiles'?body.company:mod==='payroll'?`${data.employee_id}:${data.month}`:data.code||null;
const employeeInsertSql=[
 "INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation)",
 "SELECT ?, 'employees', ?, next_code.code,",
 "replace(?::text, '\"code\":\"AUTO\"', '\"code\":\"' || next_code.code || '\"')::jsonb::text,",
 "'draft', 1, ?, ?, ?, ?",
 "FROM (SELECT (COALESCE(MAX(CASE WHEN code ~ '^[0-9]{1,12}$'",
 "THEN code::bigint END),70000)+1)::text AS code",
 "FROM records WHERE module='employees') next_code RETURNING code"
].join(' ');
const stmt=old
 ?db.prepare(mod==='returns'?'UPDATE records SET company=?,data=?,code=?,status=\'completed\',revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?':'UPDATE records SET company=?,data=?,code=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?')
   .bind(body.company,JSON.stringify(data),code,now,mutation,id,old.revision)
 :mod==='employees'
  ?db.prepare(employeeInsertSql).bind(id,body.company,JSON.stringify(data),u.email,now,now,mutation)
  :db.prepare('INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,mod,body.company,code,JSON.stringify(data),mod==='returns'?'completed':'draft',1,u.email,now,now,mutation);
const result=await db.batch([...returnSyncUpdates,stmt,...linkedPayrollUpdates,db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,id,old?'update':'create',now,JSON.stringify({module:mod,company:body.company,leave_id:mod==='returns'?data.leave_id:undefined,actual_return:mod==='returns'?data.actual_return:undefined,return_payroll_sync:mod==='returns'?returnPayrollSync:undefined,salary_changed:salaryFieldsChanged,synced_payroll_count:synchronizedMonths.length,...(transferringEmployee?{transfer_from:old.company,transfer_to:body.company,historical_records_preserved:true,linked_account_review_required:linkedAccount}:{})}),id,mutation)]);if(returnSyncUpdates.some((_:any,i:number)=>!result[i]?.meta?.changes)||!result[returnSyncUpdates.length]?.meta?.changes||linkedPayrollUpdates.some((_:any,i:number)=>i%2===0&&!result[returnSyncUpdates.length+1+i]?.meta?.changes))throw Error('تغير سجل الإجازة أو المباشرة أثناء الحفظ؛ حدّث الصفحة وأعد المحاولة');return json({ok:true,id,...(mod==='employees'&&!old?{employee_code:result[0]?.results?.[0]?.code}:{}),payroll_synced:synchronizedMonths.length,return_payroll_sync:mod==='returns'?returnPayrollSync:undefined,company_transferred:transferringEmployee,linked_account_review_required:linkedAccount});}catch(e:any){return json({error:['401','403'].includes(e.message)?'غير مصرح':e.message?.includes('UNIQUE')?'الرقم أو السجل موجود مسبقًا':e.message||'تعذر الحفظ'},['401','403'].includes(e.message)?Number(e.message):400);}}