// @ts-nocheck
import {env} from './runtime.ts';
import {currentUser} from './runtime.ts';
import {modules,companies,normalize,workflow,canWrite,canRead,annualLeave,operationalModules,relationModules,visible,permission,saudiDate,permittedRead,permittedWrite} from './modules.mjs';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function identity(){const u=currentUser();if(!u)throw Error('401');const row=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(u.email.toLowerCase()).first();if(!row||row.is_active===false)throw Error('403');return {...u,...row};}
const parse=(r:any)=>({...r,data:JSON.parse(r.data)});
export async function GET(req:Request){try{const u=await identity();const db=env.DB!;const query=new URL(req.url).searchParams;const mod=query.get('module');if(mod==='audit'){if(u.role!=='admin')throw Error('403');return json({rows:(await db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT 100').all()).results});}if(mod==='record_history'){const all=(await db.prepare('SELECT * FROM records').all()).results.map(parse);const row=all.find((r:any)=>r.id===query.get('id'));if(!row||!permittedRead(u,row.module)||!visible(u,row,all))throw Error('403');const current=(await db.prepare('SELECT * FROM audit WHERE record_id=? ORDER BY at').bind(row.id).all()).results.map((r:any)=>({at:r.at,actor:r.actor,action:r.action,details:r.details,source:'cloud'}));const old=row.data._legacy;if(old){const archive=(await db.prepare('SELECT table_name,payload FROM legacy WHERE source=?').bind(old.source).all()).results.map((r:any)=>({...r,payload:JSON.parse(r.payload)}));const users=Object.fromEntries(archive.filter((r:any)=>r.table_name==='users').map((r:any)=>[r.payload.id,r.payload.display_name]));for(const item of archive){const r=item.payload;let match=item.table_name==='approval_events'&&((old.table==='leave_requests'&&r.leave_request_id===old.id)||(old.table==='advance_requests'&&r.advance_request_id===old.id))||item.table_name==='resignation_events'&&old.table==='resignation_requests'&&r.resignation_id===old.id;if(match)current.push({at:r.decided_at,actor:users[r.actor_user_id]||'مستخدم مرحّل',action:r.decision,details:JSON.stringify({step:r.step,note:r.note}),source:'python'});}}return json({rows:current.sort((a:any,b:any)=>String(a.at).localeCompare(String(b.at)))});}if(mod==='members'){if(u.role!=='admin')throw Error('403');return json({rows:(await db.prepare('SELECT m.*, EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=lower(m.email)) AS auth_ready, EXISTS(SELECT 1 FROM auth.users a WHERE lower(a.email)=lower(m.email) AND a.email_confirmed_at IS NOT NULL) AS auth_confirmed FROM members m ORDER BY m.email').all()).results});}
const all=(await db.prepare('SELECT * FROM records ORDER BY updated_at DESC LIMIT 10000').all()).results.map(parse);const rows=all.filter((r:any)=>(modules as any)[r.module]&&permittedRead(u,r.module)&&visible(u,r,all)).map((r:any)=>r.module==='employees'&&['project_manager','projects_director'].includes(u.role)?{...r,data:{name:r.data.name,code:r.data.code,job:r.data.job}}:r);return json({user:{name:u.displayName,email:u.email,role:u.role,employee_id:u.employee_id,companies:u.companies,projects:u.projects,permissions:u.permissions},rows,companies});}catch(e:any){return json({error:e.message==='401'?'يرجى تسجيل الدخول':e.message==='403'?'الحساب غير مخوّل':'تعذر قراءة البيانات'},['401','403'].includes(e.message)?Number(e.message):500);}}
export async function POST(req:Request){try{// Same-origin CSRF checks occur at the Next.js proxy before forwarding.
// Supabase edge routing rewrites req.url, so its origin is not the browser origin.
// JWT, active session, and module/role permission checks remain mandatory.
const u=await identity();const db=env.DB!;const raw=await req.text();if(raw.length>1000000)throw Error('الطلب كبير');const body=JSON.parse(raw);const now=new Date().toISOString();const mutation=crypto.randomUUID();
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
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('البريد الإلكتروني غير صالح');const contactEmail=String(body.contact_email||email).trim().toLowerCase();
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
 if(!['hr','administrative_assistant','finance','administrative_manager','project_manager','projects_director','employee'].includes(body.role))throw Error('الدور غير صالح');
 if(body.permissions&&(typeof body.permissions!=='object'||Array.isArray(body.permissions)||Object.entries(body.permissions).some(([k,v])=>typeof v!=='boolean'||!/^([a-z_]+):(view|edit|approve)$/.test(k))))throw Error('صلاحيات غير صالحة');
 if(body.companies!=='*'&&(!Array.isArray(body.companies)||body.companies.some(c=>!companies.includes(c))))throw Error('نطاق الشركات غير صالح');
 if(body.projects!=='*'&&(!Array.isArray(body.projects)||body.projects.some(id=>typeof id!=='string')))throw Error('نطاق المشاريع غير صالح');
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
if(body.action==='member'){if(u.role!=='admin')throw Error('403');const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['hr','administrative_assistant','finance','administrative_manager','project_manager','projects_director','employee'].includes(body.role))throw Error('بيانات المستخدم غير صالحة');const username=String(body.username||'').trim().replace(/\s+/g,' ').toLowerCase();if(username&&(!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(username)||username.includes('  ')))throw Error('اسم المستخدم من 3 إلى 64 حرفًا ويقبل الحروف العربية والإنجليزية والمسافات');if(body.permissions&&(typeof body.permissions!=='object'||Array.isArray(body.permissions)||Object.entries(body.permissions).some(([k,v])=>typeof v!=='boolean'||!/^([a-z_]+):(view|edit|approve)$/.test(k))))throw Error('صلاحيات غير صالحة');if(body.projects!=='*'&&body.projects!==undefined&&(!Array.isArray(body.projects)||body.projects.some((id:any)=>typeof id!=='string')))throw Error('نطاق مشاريع غير صالح');if(body.companies!=='*'&&body.companies!==undefined&&(!Array.isArray(body.companies)||body.companies.some((c:any)=>!companies.includes(c))))throw Error('نطاق شركات غير صالح');const contactEmail=String(body.contact_email||email).trim().toLowerCase();
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
if(body.action==='disburse'){if(mod!=='advances'||!old||old.status!=='approved'||!['admin','finance'].includes(u.role))throw Error('403');const reference=String(body.reference||'').trim();if(!reference||reference.length>200)throw Error('مرجع الصرف مطلوب');const data={...JSON.parse(old.data),payment_reference:reference,paid_at:now};const result=await db.batch([db.prepare("UPDATE records SET data=?,status='paid',revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?").bind(JSON.stringify(data),now,mutation,old.id,old.revision),db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,old.id,'record_disbursement',now,JSON.stringify({reference}),old.id,mutation)]);if(!result[0].meta.changes)throw Error('تغير السجل؛ حدّث الصفحة');return json({ok:true});}
if(body.action==='transition'){if(['payroll','payroll_batches'].includes(mod))throw Error('اعتماد المسيرات الشهرية يتم حصريًا من نافذة المسير الشهري');if(!permission(u,mod,'approve'))throw Error('403');if(!old)throw Error('السجل غير موجود');if(operationalModules.includes(mod)||['repayments'].includes(mod))throw Error('هذا السجل لا يتطلب مسار اعتماد');const current=old.status;let next=mod==='payroll'?(current==='draft'?'hr':current==='hr'?'finance':current==='finance'?'approved':null):(current==='draft'?workflow[1]:workflow[workflow.indexOf(current)+1]);const decision=body.decision||'approve';if(decision==='return')next='draft';if(decision==='reject')next='rejected';if(!['approve','return','reject'].includes(decision))throw Error('قرار غير صالح');if(decision!=='approve'&&!String(body.note||'').trim())throw Error('سبب الإعادة أو الرفض مطلوب');if(!next)throw Error('السجل مغلق');if(current==='draft'&&decision!=='approve')throw Error('القرار غير متاح للمسودة');if(current==='draft'){if(!permittedWrite(u,mod))throw Error('403');}else if(u.role!=='admin'&&u.role!==current)throw Error('403');const details=JSON.parse(old.data);
if(current==='draft'&&decision==='approve'&&next==='project_manager'){
 const projectId=String(details.project_id||'').trim()||String((details.employee_id?(await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(details.employee_id,old.company).first<any>())?.data:null)?JSON.parse((await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(details.employee_id,old.company).first<any>()).data).project_id||'':'');
 if(!projectId)throw Error('يجب ربط الموظف بمشروع قبل إرسال الطلب إلى مدير المشروع');
 const project=await db.prepare("SELECT company,data FROM records WHERE id=? AND module='projects'").bind(projectId).first<any>();
 if(!project)throw Error('المشروع غير مسجل في وحدة المشاريع والتكليفات');
 const pd=JSON.parse(project.data||'{}');
 if(project.company!==old.company&&!(pd._shared_companies||[]).includes(old.company))throw Error('المشروع لا يتبع شركة الموظف');
 const managerEmail=String(pd.manager_email||'').trim().toLowerCase();
 if(!managerEmail)throw Error('يجب تعيين مدير المشروع في ملف المشروع قبل إرسال الطلب');
 const manager=await db.prepare('SELECT role,is_active FROM members WHERE email=?').bind(managerEmail).first<any>();
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('مدير المشروع المعيّن ليس لديه حساب نشط بدور مدير مشروع');
}
if(current==='project_manager'&&u.role!=='admin'){
 const projectId=String(details.project_id||'').trim();
 if(!projectId)throw Error('الطلب غير مرتبط بمشروع محدد');
 const project=await db.prepare("SELECT data FROM records WHERE id=? AND module='projects'").bind(projectId).first<any>();
 if(!project||String(JSON.parse(project.data).manager_email||'').trim().toLowerCase()!==String(u.email||'').trim().toLowerCase())throw Error('الطلب يخص مدير مشروع آخر');
}
if(mod==='payroll'&&decision==='approve'){
 const rounded=n=>Math.round(Number(n||0)*100);
 if(!Number.isFinite(Number(details.net))||rounded(details.cash_amount)+rounded(details.bank_amount)!==rounded(details.net))throw Error('لا يمكن اعتماد مسير غير موزع بالكامل بين الكاش والتحويل البنكي');
 if(next==='approved'&&u.role!=='admin'&&u.role!=='finance')throw Error('الاعتماد النهائي للمالية فقط');
}
let balanceCondition='';let balanceArgs:any[]=[];
if(mod==='leave'&&current==='hr'&&JSON.parse(old.data).leave_type==='sick'&&next!=='draft'&&next!=='rejected'){const count=await db.prepare('SELECT count(*) n FROM files WHERE record_id=?').bind(old.id).first<any>();if(!count?.n||body.medical_verified!==true)throw Error('تحقق من المرفق الطبي وأكّد مراجعته قبل الاعتماد');}if(mod==='leave'&&next==='approved'){const employee=await db.prepare('SELECT data FROM records WHERE id=? AND module=? AND company=?').bind(details.employee_id,'employees',old.company).first<any>();if(!employee)throw Error('الموظف غير موجود');const e=JSON.parse(employee.data);const service=annualLeave(e.hire_date);const leaves=(await db.prepare("SELECT data FROM records WHERE module='leave' AND status='approved' AND company=?").bind(old.company).all()).results;const used=leaves.map((r:any)=>JSON.parse(r.data)).filter((d:any)=>d.employee_id===details.employee_id&&(d.balance_deducted??(!d.leave_type||d.leave_type==='annual'))).reduce((n:number,d:any)=>n+Number(d.days),0);if(details.balance_deducted??(!details.leave_type||details.leave_type==='annual')){if(e.sponsorship==='yes'&&!service)throw Error('استكمل تاريخ التعيين قبل اعتماد الإجازة السنوية');const available=(e.sponsorship==='yes'?(service?.accrued||0):Number(e.legacy_ledger_adjustment||0))+Number(e.opening_leave||0);if(details.days>available-used)throw Error('رصيد الإجازة غير كاف');balanceCondition=" AND (COALESCE((SELECT SUM(CAST(json_extract(data,'$.days') AS REAL)) FROM records WHERE module='leave' AND status='approved' AND json_extract(data,'$.employee_id')=? AND coalesce(json_extract(data,'$.balance_deducted'),CASE WHEN coalesce(json_extract(data,'$.leave_type'),'annual')='annual' THEN 1 ELSE 0 END)=1),0)+?<=?)";balanceArgs=[details.employee_id,Number(details.days),available];}}
const result=await db.batch([db.prepare('UPDATE records SET status=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=?'+balanceCondition).bind(next,now,mutation,old.id,old.revision,...balanceArgs),db.prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND mutation=?)').bind(crypto.randomUUID(),u.email,old.id,'transition',now,JSON.stringify({from:current,to:next,note:String(body.note||'').slice(0,2000)}),old.id,mutation)]);if(!result[0].meta.changes)throw Error('تغير السجل أو الرصيد؛ حدّث الصفحة وأعد المحاولة');return json({ok:true});}
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
const data={...(previous||{}),...normalize(mod,body)};
if(mod==='employees'&&previous&&body.salary_edit_source!=='basic'&&Number(previous.salary??previous.total_monthly_salary)===Number(data.salary))for(const key of ['basic','housing','transport'])if(previous[key]!==undefined)data[key]=previous[key];if(mod==='employees'){data._review_flags=[...(!data.hire_date?['تاريخ التعيين يحتاج استكمال']:[]),...(data.company==='غير محددة'?['الشركة تحتاج مراجعة']:[])];}if(mod==='warnings'&&data.warning_type!=='notice'&&!Number(data.sequence)){data.sequence=({first:1,second:2,final:3} as any)[data.warning_type];}if(!visible(u,{module:mod,company:body.company,data},(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('403');if(mod==='projects'&&String(data.manager_email||'').trim()){
 const managerEmail=String(data.manager_email).trim().toLowerCase();
 const manager=await db.prepare('SELECT role,is_active FROM members WHERE email=?').bind(managerEmail).first<any>();
 if(!manager||manager.role!=='project_manager'||manager.is_active===false)throw Error('اختر مدير مشروع يمتلك حساب دخول نشط بصلاحية مدير مشروع');
 data.manager_email=managerEmail;
}
const transferringEmployee=mod==='employees'&&Boolean(old)&&old.company!==body.company;
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
for(const field of (modules as any)[mod].fields){if((relationModules as any)[field.type]&&data[field.key]){const target=(relationModules as any)[field.type];const linked=await db.prepare('SELECT * FROM records WHERE id=? AND module=?').bind(data[field.key],target).first<any>();if(!linked||(linked.company!==body.company&&!(target==='projects'&&(JSON.parse(linked.data)._shared_companies||[]).includes(body.company)))||!visible(u,parse(linked),(await db.prepare('SELECT * FROM records').all()).results.map(parse)))throw Error('المرجع لا يتبع الشركة أو النطاق المختار');if(field.type==='employee')data.project_id=JSON.parse(linked.data).project_id||'';if(field.type==='employee'&&mod==='terminations'){const employeeData=JSON.parse(linked.data);if(employeeData.hire_date&&data.date<employeeData.hire_date)throw Error('إنهاء الخدمة لا يسبق تاريخ التعيين');if(data.case_status==='completed'&&data.date>saudiDate())throw Error('لا يكتمل التسجيل بتاريخ مستقبلي');if(data.resignation_id){const resignation=await db.prepare("SELECT data FROM records WHERE module='resignations' AND (id=? OR code=?) AND status='approved'").bind(data.resignation_id,data.resignation_id).first<any>();if(!resignation||JSON.parse(resignation.data).employee_id!==data.employee_id)throw Error('مرجع الاستقالة غير معتمد لهذا الموظف');}}if(field.type==='leave'){const leave=JSON.parse(linked.data);data.employee_id=leave.employee_id;data.project_id=leave.project_id||'';if(mod==='returns'){if(linked.status!=='approved'||leave.start>saudiDate()||data.actual_return<leave.start||data.actual_return>saudiDate())throw Error('المباشرة لإجازة معتمدة بدأت، وبتاريخ بين بدايتها واليوم');if(old&&!data.notes)throw Error('سبب تصحيح المباشرة مطلوب');}if(mod==='leave_dues'){if(data.days>Number(leave.days))throw Error('أيام المستحقات تتجاوز طلب الإجازة');data.net=Math.round((data.salary_basis/30*data.days+data.travel_amount+data.other_amount-data.deductions)*100)/100;if(data.net<0)throw Error('صافي المستحقات سالب');}}if(field.type==='advance'){if(linked.status!=='paid')throw Error('يجب توثيق صرف السلفة قبل تسجيل السداد');data.employee_id=JSON.parse(linked.data).employee_id;data.project_id=JSON.parse(linked.data).project_id||'';const repayments=(await db.prepare("SELECT id,data FROM records WHERE module='repayments'").all()).results.map((r:any)=>({...JSON.parse(r.data),id:r.id})).filter((r:any)=>r.advance_id===linked.id&&r.id!==old?.id);if(data.amount+repayments.reduce((n:number,r:any)=>n+Number(r.amount||0),0)>Number(JSON.parse(linked.data).amount)+.001)throw Error('السداد يتجاوز الرصيد المتبقي');}if(field.type==='employee'&&mod==='payroll'){const e=JSON.parse(linked.data);data.salary=Number(e.salary??e.total_monthly_salary??0);data.basic=Number(e.basic??e.basic_salary??0);data.housing=Number(e.housing??e.housing_allowance??0);data.transport=Number(e.transport??e.transport_allowance??0);
data.overtime=Math.round(Number(data.overtime_hours||0)*(data.salary/30/8+.5*data.basic/30/8)*100)/100;
data.net=Math.round((data.salary+Number(data.bonus||0)+Number(data.extra_allowance||0)+data.overtime-Number(data.deductions||0)-Number(data.absence_deduction||0)-Number(data.advance_deduction||0))*100)/100;
if(data.net<0)throw Error('صافي الراتب سالب');
const cents=x=>Math.round(Number(x||0)*100);
if(cents(data.cash_amount)+cents(data.bank_amount)!==cents(data.net))throw Error('مجموع الكاش والتحويل البنكي يجب أن يساوي صافي الراتب');
data.method=cents(data.cash_amount)>0&&cents(data.bank_amount)>0?'mixed':cents(data.cash_amount)>0?'cash':'bank';}}}
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
