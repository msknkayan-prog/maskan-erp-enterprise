// @ts-nocheck
import {env} from './runtime.ts';
import {currentUser} from './runtime.ts';
import {modules,companies,normalize,workflow,canWrite,canRead,annualLeave,operationalModules,relationModules,visible,permission,saudiDate,permittedRead,permittedWrite} from './modules.mjs';
import {employeeDirectManagerOptions,normalizeManagerName} from './project-manager-roster.mjs';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const projectManagerContactEmail='mskn.kayan@gmail.com';
async function resolveEmployeeDirectManager(db:any,company:string,emailValue:string,fallbackName='',requireActive=true){
 const email=String(emailValue||'').trim().toLowerCase();
 if(!email)return {email:'',name:fallbackName,phone:'',directory_id:''};
 const account=await db.prepare("SELECT email,username,role,is_active,companies FROM members WHERE lower(email)=?").bind(email).first<any>();
 if(!account||account.role!=='project_manager'||account.is_active===false){
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
 return {email,name:String(details.name||fallbackName||account.username||email),phone:String(details.phone||''),directory_id:directory?.id||''};
}
async function availableEmployeeDirectManagers(db:any,company:string){
 const records=(await db.prepare("SELECT id,module,company,data FROM records WHERE module IN ('projects','employees','project_managers')").all()).results.map(parse);
 const members=(await db.prepare("SELECT email,username,role,is_active,companies FROM members WHERE role='project_manager' AND is_active=true").all()).results;
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
 const result=(await db.prepare("SELECT email,username,contact_email,role,is_active,companies FROM members WHERE role='project_manager' AND is_active=true").all()).results;
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
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('يجب اختيار حساب مدير مشروع نشط');
 if(manager.companies!=='*'){
  let companyScope:any=[];try{companyScope=JSON.parse(manager.companies||'[]')}catch{}
  if(!Array.isArray(companyScope)||!companyScope.includes(project.company))throw Error('المدير غير مخوّل لشركة المشروع');
 }
 const directoryRow=(await db.prepare("SELECT id,data FROM records WHERE module='project_managers' AND company=?").bind(project.company).all()).results.find((r:any)=>String(JSON.parse(r.data||'{}').email||'').trim().toLowerCase()===email);
 if(!directoryRow)throw Error('أضف المدير إلى دليل مدراء المشاريع لهذه الشركة أولًا');
 const directory=JSON.parse(directoryRow.data);
 const prior=JSON.parse(project.data||'{}');
 const previousManager=String(prior.manager_email||'').trim().toLowerCase();
 if(previousManager===email)return json({ok:true,unchanged:true});
 const updated={...prior,manager_email:email,manager_name:String(directory.name||''),manager_phone:String(directory.phone||'')};
 let scope:any=[];
 if(manager.projects!=='*'){try{scope=JSON.parse(manager.projects||'[]')}catch{};if(!Array.isArray(scope))scope=[];}
 const statements:any[]=[
  db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='projects' AND revision=?")
    .bind(JSON.stringify(updated),now,mutation,projectId,project.revision)
 ];
 if(manager.projects!=='*'&&!scope.includes(projectId)){
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
  const updatedEmployee={...d,manager:String(directory.name||''),manager_email:email,manager_phone:String(directory.phone||''),supervisor_account:email,direct_manager_id:directoryRow.id};
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
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('اختر حساب مدير مشروع نشطًا');
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
 if(existing&&(existing.is_active===false||!['project_manager',...(employeeId?['employee']:[])].includes(existing.role)))throw Error('البريد مرتبط بحساب آخر لا يمكن تحويله إلى مدير مشروع نشط');
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
 }else{
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
   commands.push(db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='project_managers'")
    .bind(JSON.stringify({...d,name,email,phone:phone||d.phone||'',employee_id:employeeId||d.employee_id||null}),now,mutation,recorded.id));
  }else{
   commands.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,'project_managers',?,?,?,'draft',1,?,?,?,?)")
    .bind(directoryIds.get(co),co,null,JSON.stringify({name,email,phone,job:'مدير مشروع',employee_id:employeeId||null}),u.email,now,now,mutation));
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
   .bind(JSON.stringify({...data,manager_email:email,manager_name:name,manager_phone:phone}),now,mutation,project.id,project.revision));
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
const mod=body.module;if(!(modules as any)[mod])throw Error('نافذة غير معروفة');const old=body.id?await db.prepare('SELECT * FROM records WHERE id=? AND module=?').bind(body.id,mod).first<any>():null;if(body.id&&!old)throw Error('السجل غير موجود');if(old&&!visible(u,parse(old),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('403');if(old&&old.revision!==body.revision)throw Error('تغير السجل؛ حدّث الصفحة');
if(old&&JSON.parse(old.data)?._deleted)throw Error('هذا الطلب محذوف ولا يمكن تعديله أو إرساله للاعتماد');
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
 if(body.action==='disburse'){if(mod!=='advances'||!old||old.status!=='approved'||!['admin','finance'].includes(u.role))throw Error('403');const reference=String(body.reference||'').trim();if(!reference||reference.length>200)throw Error('مرجع الصرف مطلوب');const data={...JSON.parse(old.data),payment_reference:reference,paid_at:now};const result=await db.batch([db.prepare("UPDATE records SET data=?,status='paid',revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?").bind(JSON.stringify(data),now,mutation,old.id,old.revision),db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,old.id,'record_disbursement',now,JSON.stringify({reference}),old.id,mutation)]);if(!result[0].meta.changes)throw Error('تغير السجل؛ حدّث الصفحة');return json({ok:true});}
if(body.action==='transition'){if(['payroll','payroll_batches'].includes(mod))throw Error('اعتماد المسيرات الشهرية يتم حصريًا من نافذة المسير الشهري');if(!permission(u,mod,'approve'))throw Error('403');if(!old)throw Error('السجل غير موجود');if(operationalModules.includes(mod)||['repayments'].includes(mod))throw Error('هذا السجل لا يتطلب مسار اعتماد');const current=old.status;let next=mod==='payroll'?(current==='draft'?'hr':current==='hr'?'finance':current==='finance'?'approved':null):(current==='draft'?workflow[1]:workflow[workflow.indexOf(current)+1]);const decision=body.decision||'approve';if(decision==='return')next='draft';if(decision==='reject')next='rejected';if(!['approve','return','reject'].includes(decision))throw Error('قرار غير صالح');if(decision!=='approve'&&!String(body.note||'').trim())throw Error('سبب الإعادة أو الرفض مطلوب');if(!next)throw Error('السجل مغلق');if(current==='draft'&&decision!=='approve')throw Error('القرار غير متاح للمسودة');if(current==='draft'){if(!permittedWrite(u,mod))throw Error('403');}else if(u.role!=='admin'&&u.role!==current)throw Error('403');const details=JSON.parse(old.data);
if(current==='draft'&&decision==='approve'&&next==='project_manager'){
 const employeeRecord=details.employee_id?await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(details.employee_id,old.company).first<any>():null;
 const projectId=String(details.project_id|| (employeeRecord?JSON.parse(employeeRecord.data).project_id:'') ||'').trim();
 if(!projectId)throw Error('يجب ربط الموظف بمشروع قبل إرسال الطلب إلى مدير المشروع');
 const project=await db.prepare("SELECT company,data FROM records WHERE id=? AND module='projects'").bind(projectId).first<any>();
 if(!project)throw Error('المشروع غير مسجل في وحدة المشاريع والتكليفات');
 const pd=JSON.parse(project.data||'{}');
 if(project.company!==old.company&&!(pd._shared_companies||[]).includes(old.company))throw Error('المشروع لا يتبع شركة الموظف');
 const employeeData=employeeRecord?JSON.parse(employeeRecord.data||'{}'):{};
 const delegatedEmail=String(employeeData.delegated_manager_email||'').trim().toLowerCase();
 const managerEmail=delegatedEmail||String(pd.manager_email||'').trim().toLowerCase();
 if(!managerEmail)throw Error('يجب تعيين مدير المشروع في ملف المشروع قبل إرسال الطلب');
 const manager=await db.prepare('SELECT role,is_active,companies FROM members WHERE email=?').bind(managerEmail).first<any>();
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('مدير المشروع المعيّن ليس لديه حساب نشط بدور مدير مشروع');
 if(manager.companies&&manager.companies!=='*'){
  let authorized=false;
  try{authorized=JSON.parse(manager.companies).includes(old.company)}catch{}
  if(!authorized)throw Error('مدير المشروع لا يمتلك صلاحية الشركة التابعة للطلب');
 }
 const dir=(await db.prepare("SELECT data FROM records WHERE module='project_managers' AND company=?").bind(old.company).all()).results.map((r:any)=>JSON.parse(r.data)).find((r:any)=>String(r.email||'').trim().toLowerCase()===managerEmail);
 if(!dir&&!delegatedEmail)throw Error('بيانات مدير المشروع غير مسجلة في دليل مدراء المشاريع');
 details.project_id=projectId;
 details.project_manager={name:dir?.name||managerEmail,email:managerEmail,phone:dir?.phone||'',project_name:pd.name||''};
}
if(current==='project_manager'&&u.role!=='admin'){
 const employeeRecord=details.employee_id?await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(details.employee_id,old.company).first<any>():null;
 const projectId=String(details.project_id||(employeeRecord?JSON.parse(employeeRecord.data).project_id:'')||'').trim();
 if(!projectId)throw Error('الطلب غير مرتبط بمشروع محدد');
 const project=await db.prepare("SELECT data FROM records WHERE id=? AND module='projects'").bind(projectId).first<any>();
 const employeeData=employeeRecord?JSON.parse(employeeRecord.data||'{}'):{};
 const explicitManager=String(employeeData.delegated_manager_email||'').trim().toLowerCase();
 const assignedEmail=String(explicitManager||details.project_manager?.email||JSON.parse(project?.data||'{}').manager_email||'').trim().toLowerCase();
 if(!project||assignedEmail!==String(u.email||'').trim().toLowerCase())throw Error('الطلب يخص مدير مشروع آخر');
 if(!explicitManager&&u.projects&&u.projects!=='*'&&!JSON.parse(u.projects).includes(projectId))throw Error('ليس لديك صلاحية مراجعة طلبات هذا المشروع');
 if(explicitManager&&details.project_manager?.email!==explicitManager){
  const directory=await db.prepare("SELECT data FROM records WHERE module='project_managers' AND company=?").bind(old.company).all();
  const assigned=directory.results.map((r:any)=>JSON.parse(r.data||'{}')).find((d:any)=>String(d.email||'').trim().toLowerCase()===explicitManager);
  details.project_manager={...details.project_manager,email:explicitManager,name:assigned?.name||explicitManager,phone:assigned?.phone||''};
 }
}
if(mod==='payroll'&&decision==='approve'){
 const rounded=n=>Math.round(Number(n||0)*100);
 if(!Number.isFinite(Number(details.net))||rounded(details.cash_amount)+rounded(details.bank_amount)!==rounded(details.net))throw Error('لا يمكن اعتماد مسير غير موزع بالكامل بين الكاش والتحويل البنكي');
 if(next==='approved'&&u.role!=='admin'&&u.role!=='finance')throw Error('الاعتماد النهائي للمالية فقط');
}
let balanceCondition='';let balanceArgs:any[]=[];
if(mod==='leave'&&current==='hr'&&JSON.parse(old.data).leave_type==='sick'&&next!=='draft'&&next!=='rejected'){const count=await db.prepare('SELECT count(*) n FROM files WHERE record_id=?').bind(old.id).first<any>();if(!count?.n||body.medical_verified!==true)throw Error('تحقق من المرفق الطبي وأكّد مراجعته قبل الاعتماد');}if(mod==='leave'&&next==='approved'){const employee=await db.prepare('SELECT data FROM records WHERE id=? AND module=? AND company=?').bind(details.employee_id,'employees',old.company).first<any>();if(!employee)throw Error('الموظف غير موجود');const e=JSON.parse(employee.data);const service=annualLeave(e.hire_date);const leaves=(await db.prepare("SELECT data FROM records WHERE module='leave' AND status='approved' AND company=?").bind(old.company).all()).results;const used=leaves.map((r:any)=>JSON.parse(r.data)).filter((d:any)=>d.employee_id===details.employee_id&&(d.balance_deducted??(!d.leave_type||d.leave_type==='annual'))).reduce((n:number,d:any)=>n+Number(d.days),0);if(details.balance_deducted??(!details.leave_type||details.leave_type==='annual')){if(e.sponsorship==='yes'&&!service)throw Error('استكمل تاريخ التعيين قبل اعتماد الإجازة السنوية');const available=(e.sponsorship==='yes'?(service?.accrued||0):Number(e.legacy_ledger_adjustment||0))+Number(e.opening_leave||0);if(details.days>available-used)throw Error('رصيد الإجازة غير كاف');balanceCondition=" AND (COALESCE((SELECT SUM(CAST(json_extract(data,'$.days') AS REAL)) FROM records WHERE module='leave' AND status='approved' AND json_extract(data,'$.employee_id')=? AND coalesce(json_extract(data,'$.balance_deducted'),CASE WHEN coalesce(json_extract(data,'$.leave_type'),'annual')='annual' THEN 1 ELSE 0 END)=1),0)+?<=?)";balanceArgs=[details.employee_id,Number(details.days),available];}}
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
if(!permittedWrite(u,mod)||!permission(u,mod,'edit'))throw Error('403');if(old&&old.status!=='draft'&&mod!=='employees')throw Error('التعديل متاح للمسودات فقط');if(mod==='employees'&&old&&JSON.parse(old.data)._archived)throw Error('يجب استعادة الموظف من الأرشيف قبل تعديل بياناته');const previous=old?JSON.parse(old.data):null;
if(mod==='employees'&&!old)body.data={...(body.data||{}),code:'AUTO'};
if(mod==='projects'&&!old)body.data={...(body.data||{}),code:'AUTO'};
const data={...(previous||{}),...normalize(mod,body)};
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
 if(!member||member.role!=='project_manager'||member.is_active===false)throw Error('يجب ربط بيانات المدير بحساب نشط بصلاحية مدير مشروع');
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
 const canonicalName=String(recordData?.name||matchingEmployee?.name||managedEmployee?.manager||member.username||data.email).trim();
 if(!canonicalName||String(data.name||'').trim()!==canonicalName)throw Error('يجب اختيار اسم المدير من القائمة المعتمدة، ولا يمكن إدخال اسم مختلف');
 const department=String(data.department||'').trim();
 const registeredDepartments=new Set([...employees.map((e:any)=>String(e.department||'').trim()),...records.map((r:any)=>String(JSON.parse(r.data||'{}').department||'').trim()),'إدارة المشاريع'].filter(Boolean));
 if(!department||!registeredDepartments.has(department))throw Error('اختر الإدارة أو القسم من القائمة المسجلة');
 data.name=canonicalName;data.department=department;
 data.job=String(recordData?.job||matchingEmployee?.job||data.job||'مدير مشاريع');
 if(records.some((r:any)=>r.id!==old?.id&&String(JSON.parse(r.data).email||'').trim().toLowerCase()===data.email))throw Error('مدير المشروع مسجل مسبقًا لدى الشركة؛ عدّل سجله الموجود');
}
if(mod==='projects'&&String(data.manager_email||'').trim()){
 const managerEmail=String(data.manager_email).trim().toLowerCase();
 const manager=await db.prepare('SELECT role,is_active,companies FROM members WHERE email=?').bind(managerEmail).first<any>();
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('اختر مدير مشروع يمتلك حساب دخول نشط بصلاحية مدير مشروع');
 if(manager.companies&&manager.companies!=='*'){
  let authorized=false;
  try{authorized=JSON.parse(manager.companies).includes(body.company)}catch{}
  if(!authorized)throw Error('مدير المشروع لا يمتلك صلاحية الشركة المحددة؛ عدّل نطاق حسابه أولًا');
 }
 const managerRecord=(await db.prepare("SELECT data FROM records WHERE module='project_managers' AND company=?").bind(body.company).all()).results.map((r:any)=>JSON.parse(r.data)).find((r:any)=>String(r.email||'').trim().toLowerCase()===managerEmail);
 if(!managerRecord)throw Error('سجّل بيانات مدير المشروع أولًا في دليل مدراء المشاريع للشركة');
 data.manager_name=managerRecord.name;
 data.manager_phone=managerRecord.phone||'';
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
 if(data._direct_manager_manual){
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
for(const field of (modules as any)[mod].fields){if((relationModules as any)[field.type]&&data[field.key]){const target=(relationModules as any)[field.type];const linked=await db.prepare('SELECT * FROM records WHERE id=? AND module=?').bind(data[field.key],target).first<any>();if(!linked||(linked.company!==body.company&&!(target==='projects'&&(JSON.parse(linked.data)._shared_companies||[]).includes(body.company)))||!visible(u,parse(linked),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('المرجع لا يتبع الشركة أو النطاق المختار');if(field.type==='employee')data.project_id=JSON.parse(linked.data).project_id||'';if(field.type==='employee'&&mod==='terminations'){const employeeData=JSON.parse(linked.data);if(employeeData.hire_date&&data.date<employeeData.hire_date)throw Error('إنهاء الخدمة لا يسبق تاريخ التعيين');if(data.case_status==='completed'&&data.date>saudiDate())throw Error('لا يكتمل التسجيل بتاريخ مستقبلي');if(data.resignation_id){const resignation=await db.prepare("SELECT data FROM records WHERE module='resignations' AND (id=? OR code=?) AND status='approved'").bind(data.resignation_id,data.resignation_id).first<any>();if(!resignation||JSON.parse(resignation.data).employee_id!==data.employee_id)throw Error('مرجع الاستقالة غير معتمد لهذا الموظف');}}if(field.type==='leave'){const leave=JSON.parse(linked.data);data.employee_id=leave.employee_id;data.project_id=leave.project_id||'';if(mod==='returns'){if(linked.status!=='approved'||leave.start>saudiDate()||data.actual_return<leave.start||data.actual_return>saudiDate())throw Error('المباشرة لإجازة معتمدة بدأت، وبتاريخ بين بدايتها واليوم');if(old&&!data.notes)throw Error('سبب تصحيح المباشرة مطلوب');}if(mod==='leave_dues'){if(linked.status!=='approved')throw Error('لا يمكن إنشاء مستحقات إلا لإجازة معتمدة');if(!Number(data.days))data.days=Number(leave.days||0);if(data.days>Number(leave.days))throw Error('أيام المستحقات تتجاوز طلب الإجازة');data.net=Math.round((data.salary_basis/30*data.days+data.travel_amount+data.other_amount-data.deductions)*100)/100;if(data.net<0)throw Error('صافي المستحقات سالب');}}if(field.type==='advance'){if(linked.status!=='paid')throw Error('يجب توثيق صرف السلفة قبل تسجيل السداد');data.employee_id=JSON.parse(linked.data).employee_id;data.project_id=JSON.parse(linked.data).project_id||'';const repayments=(await db.prepare("SELECT id,data FROM records WHERE module='repayments'").all()).results.map((r:any)=>({...JSON.parse(r.data),id:r.id})).filter((r:any)=>r.advance_id===linked.id&&r.id!==old?.id);if(data.amount+repayments.reduce((n:number,r:any)=>n+Number(r.amount||0),0)>Number(JSON.parse(linked.data).amount)+.001)throw Error('السداد يتجاوز الرصيد المتبقي');}if(field.type==='employee'&&mod==='payroll'){const e=JSON.parse(linked.data);data.salary=Number(e.salary??e.total_monthly_salary??0);data.basic=Number(e.basic??e.basic_salary??0);data.housing=Number(e.housing??e.housing_allowance??0);data.transport=Number(e.transport??e.transport_allowance??0);
data.overtime=Math.round(Number(data.overtime_hours||0)*(data.salary/30/8+.5*data.basic/30/8)*100)/100;
data.net=Math.round((data.salary+Number(data.bonus||0)+Number(data.extra_allowance||0)+data.overtime-Number(data.deductions||0)-Number(data.absence_deduction||0)-Number(data.advance_deduction||0))*100)/100;
if(data.net<0)throw Error('صافي الراتب سالب');
const cents=x=>Math.round(Number(x||0)*100);
if(cents(data.cash_amount)+cents(data.bank_amount)!==cents(data.net))throw Error('مجموع الكاش والتحويل البنكي يجب أن يساوي صافي الراتب');
data.method=cents(data.cash_amount)>0&&cents(data.bank_amount)>0?'mixed':cents(data.cash_amount)>0?'cash':'bank';}}}
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
 if(!serial?.code||!/^\\d{4,8}$/.test(String(serial.code)))throw Error('تعذر توليد رمز تسلسلي للمشروع');
 data.code=String(serial.code);
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
 ?db.prepare('UPDATE records SET company=?,data=?,code=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?')
   .bind(body.company,JSON.stringify(data),code,now,mutation,id,old.revision)
 :mod==='employees'
  ?db.prepare(employeeInsertSql).bind(id,body.company,JSON.stringify(data),u.email,now,now,mutation)
  :db.prepare('INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,mod,body.company,code,JSON.stringify(data),'draft',1,u.email,now,now,mutation);
const result=await db.batch([stmt,...linkedPayrollUpdates,db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,id,old?'update':'create',now,JSON.stringify({module:mod,company:body.company,salary_changed:salaryFieldsChanged,synced_payroll_count:synchronizedMonths.length,...(transferringEmployee?{transfer_from:old.company,transfer_to:body.company,historical_records_preserved:true,linked_account_review_required:linkedAccount}:{})}),id,mutation)]);if(!result[0].meta.changes||linkedPayrollUpdates.some((_:any,i:number)=>i%2===0&&!result[1+i]?.meta?.changes))throw Error('تغير سجل الموظف أو المسير أثناء الحفظ؛ أعد تحميل الصفحة');return json({ok:true,id,...(mod==='employees'&&!old?{employee_code:result[0]?.results?.[0]?.code}:{}),payroll_synced:synchronizedMonths.length,company_transferred:transferringEmployee,linked_account_review_required:linkedAccount});}catch(e:any){return json({error:['401','403'].includes(e.message)?'غير مصرح':e.message?.includes('UNIQUE')?'الرقم أو السجل موجود مسبقًا':e.message||'تعذر الحفظ'},['401','403'].includes(e.message)?Number(e.message):400);}}
