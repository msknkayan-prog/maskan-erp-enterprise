// @ts-nocheck
// Monthly payroll is a company/month batch, immutable after approval except by explicit return.
// No bank transfer or actual cash payment is performed by this service.
import {env} from './runtime.ts';
import {identity} from './erp.ts';
import {companies,permission} from './modules.mjs';
import {isAuthorizedProjectManagerAccount,magdiProjectManagerName} from './project-manager-roster.mjs';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const err=(message,status=400)=>response({error:message},status);
const cents=x=>Math.round(Number(x||0)*100);
const rounded=x=>Math.round(Number(x||0)*100)/100;
const amount=(v,label)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>10000000||Math.round(n*100)!==n*100&&Math.abs(Math.round(n*100)-n*100)>0.000001)throw Error('قيمة مالية غير صالحة: '+label);return rounded(n);};
const monthKsa=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,7);
const allowed=(u,co)=>u.role==='admin'||u.companies==='*'||!u.companies||(()=>{try{return JSON.parse(u.companies).includes(co)}catch{return false}})();
const parse=r=>({...r,data:JSON.parse(r.data)});
const db=env.DB;
async function batchOf(id){const b=await db.prepare("SELECT * FROM records WHERE id=? AND module='payroll_batches'").bind(id).first();if(!b)throw Error('المسير غير موجود');return parse(b);}
const isPrep=u=>['admin','administrative_assistant'].includes(u.role);
const isManager=u=>['admin','project_manager'].includes(u.role);
const canManageProject=async(u,project,company,employeeId='')=>{
 if(u.role==='admin')return true;
 if(employeeId){
  const worker=await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(employeeId,company).first();
  if(!worker)return false;
  const employee=JSON.parse(worker.data||'{}');
  if(String(employee.project_id||'')!==String(project))return false;
  const delegated=String(employee.delegated_manager_email||'').trim().toLowerCase();
  if(delegated)return delegated===String(u.email||'').trim().toLowerCase();
 }
 if(u.role!=='project_manager'||!project||!allowed(u,company))return false;
 if(u.projects!=='*'){
  try{if(!JSON.parse(u.projects||'[]').includes(project))return false}catch{return false}
 }
 const row=await db.prepare("SELECT company,data FROM records WHERE id=? AND module='projects'").bind(project).first();
 if(!row)return false;
 const data=JSON.parse(row.data);
 return (row.company===company||Array.isArray(data._shared_companies)&&data._shared_companies.includes(company))&&String(data.manager_email||'').trim().toLowerCase()===String(u.email||'').trim().toLowerCase();
};
const isFinance=u=>['admin','finance'].includes(u.role);
const isProjectsDirector=u=>['admin','projects_director'].includes(u.role);
const nowIso=()=>new Date().toISOString();
const ensureAssignedPayrollManager=async(projectId,company,employeeId='')=>{
 if(!projectId)throw Error('يجب تعيين مشروع لكل موظف قبل إرسال المسير لمدراء المشاريع');
 const project=await db.prepare("SELECT company,data FROM records WHERE id=? AND module='projects'").bind(projectId).first();
 if(!project)throw Error('مشروع الموظف غير مسجل في المنصة');
 const p=JSON.parse(project.data);
 if(project.company!==company&&!(Array.isArray(p._shared_companies)&&p._shared_companies.includes(company)))throw Error('مشروع الموظف لا يتبع شركة المسير');
 const worker=employeeId?await db.prepare("SELECT data FROM records WHERE id=? AND module='employees' AND company=?").bind(employeeId,company).first():null;
 if(employeeId&&!worker)throw Error('لم يتم العثور على سجل الموظف المطلوب في شركة المسير');
 if(worker&&String(JSON.parse(worker.data||'{}').project_id||'')!==String(projectId))throw Error('مشروع الموظف في المسير لا يطابق سجل الموظفين');
 const delegated=String(worker?JSON.parse(worker.data||'{}').delegated_manager_email||'':'').trim().toLowerCase();
 const email=delegated||String(p.manager_email||'').trim().toLowerCase();
 if(!email)throw Error('المشروع غير مرتبط بمدير مشروع مخول');
 const manager=await db.prepare('SELECT email,role,is_active,companies,projects FROM members WHERE lower(email)=?').bind(email).first();
 const managerName=delegated?String(worker?JSON.parse(worker.data||'{}').manager||'':''):String(p.manager_name||'');
 if(!isAuthorizedProjectManagerAccount(manager,managerName||magdiProjectManagerName))throw Error('مدير المشروع ليس لديه حساب مشروع نشط: '+email);
 if(manager.companies&&manager.companies!=='*'){
  let eligible=false;try{eligible=JSON.parse(manager.companies).includes(company)}catch{}
  if(!eligible)throw Error('مدير المشروع لا يملك صلاحية شركة المسير: '+email);
 }
 if(!delegated&&manager.projects&&manager.projects!=='*'){
  let eligible=false;try{eligible=JSON.parse(manager.projects).includes(projectId)}catch{}
  if(!eligible)throw Error('مدير المشروع لا يملك صلاحية المشروع في المسير: '+email);
 }
 return email;
};

export async function POST(req){
 try{
  // The Next.js proxy validates the browser Origin against the site Origin.
  // Supabase edge routing can rewrite req.url, so comparing that internal URL
  // with the public Origin incorrectly blocks authorized payroll generation.
  // All mutations still require verified JWT, active session, role and scope.
  const u=await identity();
  const body=await req.json();
  const action=String(body.action||'');
  const modern=Number(body.workflow_version)===2;
  const prepAllowed=modern?isPrep(u):['admin','hr'].includes(u.role);
  const now=nowIso(),mutation=crypto.randomUUID();
  if(action==='generate'){
   if(!prepAllowed||!permission(u,'payroll','edit'))return err('غير مخول بالتوليد',403);
   const month=String(body.month||'');
   if(month!==monthKsa())throw Error('يسمح بإنشاء مسير للشهر الحالي فقط؛ لا يمكن إنشاء مسير لشهر سابق أو لاحق');
   const requested=body.company==='__all__'?companies:[String(body.company||'')];
   if(requested.some(co=>!companies.includes(co)||!allowed(u,co)))return err('الشركة خارج نطاق الصلاحيات',403);
   const all=(await db.prepare("SELECT * FROM records WHERE module='employees'").all()).results.map(parse);
   const existing=(await db.prepare("SELECT company,data FROM records WHERE module='payroll_batches'").all()).results.map(r=>({...r,data:JSON.parse(r.data)}));
   if(requested.some(co=>existing.some(b=>b.company===co&&b.data.month===month)))throw Error('تم توليد مسير لهذا الشهر مسبقًا لإحدى الشركات المختارة. افتح المسير الموجود للمراجعة.');
   // For employee transfers, old company payroll may be retained as excluded.
   // Creating another active payroll for the same employment/month remains forbidden.
   const periodRows=(await db.prepare("SELECT company,data FROM records WHERE module='payroll'").all()).results.map(r=>({company:r.company,data:JSON.parse(r.data)}));
   const statements=[],results=[],batchIds=[];
   for(const co of requested){
    const employees=all.filter(e=>e.company===co&&['active','نشط','على رأس العمل','علي راس العمل'].includes(String(e.data.employment_status||e.data.employee_status||'').trim()));
    if(!employees.length)continue;
    const activeConflict=employees.map(e=>({employee:e,existing:periodRows.find(p=>p.data.employee_id===e.id&&p.data.month===month&&!p.data.excluded)})).find(x=>x.existing);
    if(activeConflict)throw Error('يوجد قيد رواتب سابق غير مستبعد للموظف رقم '+(activeConflict.employee.data.code||activeConflict.employee.code||'')+' لدى شركة '+activeConflict.existing.company+' للشهر نفسه؛ راجع المسير السابق قبل التوليد.');
    const id=crypto.randomUUID();
    batchIds.push(id);
    const data={month,employee_count:employees.length,generated_at:now,generated_by:u.email,source:'employees',version:1};
    statements.push(db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES(?,?,?,?,?,'draft',1,?,?,?,?)").bind(id,'payroll_batches',co,co+':'+month,JSON.stringify(data),u.email,now,now,mutation));
    const employeeInserts=[];
    for(const e of employees){
     const d=e.data;
     const basic=rounded(d.basic??d.basic_salary??0);
     const housing=rounded(d.housing??d.housing_allowance??0);
     const transport=rounded(d.transport??d.transport_allowance??0);
     const salary=rounded(d.salary??d.total_monthly_salary??basic+housing+transport);
     const status=d.employment_status||d.employee_status||'';
     const isSuspended=!['active','نشط','على رأس العمل','علي راس العمل'].includes(String(status).trim());
     const salaryMismatch=Math.abs(cents(salary)-cents(basic+housing+transport))>1;
     const row={batch_id:id,employee_id:e.id,month,employee_name:d.name||d.employee_name||'',employee_number:d.code||d.employee_number||e.code||'',employment_status:status,project_id:d.project_id||'',manager_reviewed:false,manager_notes:'',
       basic,housing,transport,salary,bonus:0,extra_allowance:0,overtime_hours:0,overtime:0,
       absence_days:0,absence_deduction:0,advance_deduction:0,deductions:0,
       net:salary,cash_amount:0,bank_amount:0,split_confirmed:false,
       exception_note:'',needs_review:isSuspended||salaryMismatch,review_reason:[isSuspended?'حالة الموظف غير نشطة':'',salaryMismatch?'اختلاف إجمالي الراتب عن مكوناته':''].filter(Boolean).join('؛ '),notes:'',method:'bank'};
     employeeInserts.push([crypto.randomUUID(),'payroll',co,e.id+':'+month+':'+id,JSON.stringify(row),u.email,now,now,mutation]);
    }
    // Send one multi-row insert per company instead of hundreds of network round-trips.
    const bulkSql="INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) VALUES "+
      employeeInserts.map(()=>" (?,?,?,?,?,'draft',1,?,?,?,?)").join(',');
    statements.push(db.prepare(bulkSql).bind(...employeeInserts.flat()));
    results.push({company:co,count:employees.length,id});
   }
   if(!statements.length)throw Error('لا يوجد موظفون في الشركات المحددة');
   statements.push(db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,batchIds[0],'payroll_batch_generate',now,JSON.stringify({month,companies:results.map(x=>x.company),count:results.reduce((n,x)=>n+x.count,0)})));
   await db.batch(statements);
   return response({ok:true,generated:results});
  }
  if(action==='bulk_submit'){
   if(!modern||!prepAllowed||!permission(u,'payroll','edit'))return err('الإرسال الجماعي من صلاحيات مساعد الإدارة فقط',403);
   const ids=body.batch_ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('قائمة المسيرات غير صحيحة');
   const revisions=body.revisions||{},stmts=[];
   for(const id of ids){
     const b=await batchOf(id);
     if(!allowed(u,b.company)||b.status!=='draft'||b.data.month!==String(body.month||''))throw Error('مسير غير صالح للإرسال: '+b.company);
     if(b.revision!==Number(revisions[id]))throw Error('تغير المسير؛ حدّث الصفحة: '+b.company);
     const details=(await db.prepare("SELECT * FROM records WHERE module='payroll' AND company=?").bind(b.company).all()).results.map(parse).filter(row=>row.data.batch_id===id);
     if(details.length!==Number(b.data.employee_count)||!details.some(row=>!row.data.excluded))throw Error('قائمة المسير غير مكتملة: '+b.company);
     for(const row of details.filter(row=>!row.data.excluded)){
      if(!row.data.split_confirmed||!Number.isFinite(Number(row.data.net))||cents(row.data.cash_amount)+cents(row.data.bank_amount)!==cents(row.data.net)||row.data.needs_review&&!row.data.exception_note)throw Error('مراجعة الأجور غير مكتملة: '+b.company);
       await ensureAssignedPayrollManager(row.data.project_id,b.company,row.data.employee_id);
     }
     stmts.push(db.prepare("UPDATE records SET status='manager_review',revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll_batches' AND revision=? AND status='draft'").bind(now,mutation,id,b.revision));
     stmts.push(db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,id,'payroll_batch_bulk_submit',now,JSON.stringify({company:b.company,month:b.data.month})));
   }
   const results=await db.batch(stmts);
   if(results.filter((_,i)=>i%2===0).some(r=>!r.meta.changes))throw Error('تعارض في تحديث المسيرات؛ حدّث القائمة');
   return response({ok:true,submitted:ids.length,status:'manager_review'});
  }
  const batch=await batchOf(String(body.batch_id||''));
  if(!allowed(u,batch.company)||!permission(u,'payroll','view'))return err('ليس ضمن نطاق صلاحياتك',403);
  const monthly=(await db.prepare("SELECT * FROM records WHERE module='payroll' AND company=?").bind(batch.company).all()).results.map(parse).filter(r=>r.data.batch_id===batch.id);
  if(action==='add_employee'){
   if(!prepAllowed||!permission(u,'payroll','edit')||batch.status!=='draft')return err('الإضافة متاحة لمسير قيد التجهيز وبصلاحية إعداد المسير فقط',403);
   if(batch.data.month!==monthKsa())throw Error('لا يمكن إضافة موظف إلى شهر سابق أو لاحق');
   if(batch.revision!==Number(body.batch_revision))throw Error('تغيّر المسير؛ أعد تحميل الصفحة');
   const employeeId=String(body.employee_id||'');
   const employee=await db.prepare("SELECT * FROM records WHERE module='employees' AND id=? AND company=?").bind(employeeId,batch.company).first();
   if(!employee)throw Error('الموظف غير موجود في الشركة المحددة');
   const original=parse(employee),d=original.data;
   const status=String(d.employment_status||d.employee_status||'').trim();
   if(!['active','نشط','على رأس العمل','علي راس العمل'].includes(status))throw Error('لا يمكن إدراج موظف غير نشط في المسير دون مراجعة حالته بسجل الموظفين');
   if(monthly.some(r=>r.data.employee_id===employeeId))throw Error('الموظف مدرج بالفعل في هذا المسير، يمكنك إعادته إذا كان مستبعدًا');
   // The same employment record may have an excluded old-company payroll
   // after a company transfer. Do not reuse its globally unique legacy code.
   // Still reject simultaneous active payroll in any company for this month.
   const periodRows=(await db.prepare("SELECT company,data FROM records WHERE module='payroll' AND data::jsonb->>'employee_id'=? AND data::jsonb->>'month'=?").bind(employeeId,batch.data.month).all()).results;
   const activeElsewhere=periodRows.map(r=>({company:r.company,data:JSON.parse(r.data)})).find(r=>r.company!==batch.company&&!r.data.excluded);
   if(activeElsewhere)throw Error('للموظف قيد رواتب غير مستبعد في شركة '+activeElsewhere.company+' للشهر نفسه؛ استبعده من المسير السابق أو راجع شؤون الموظفين قبل إضافته هنا.');
   const basic=amount(d.basic??d.basic_salary??0,'الراتب الأساسي');
   const housing=amount(d.housing??d.housing_allowance??0,'بدل السكن');
   const transport=amount(d.transport??d.transport_allowance??0,'بدل النقل');
   const salary=rounded(basic+housing+transport);
   const declared=rounded(d.salary??d.total_monthly_salary??salary);
   const mismatch=Math.abs(cents(declared)-cents(salary))>1;
   const rowId=crypto.randomUUID();
   const data={batch_id:batch.id,employee_id:employeeId,month:batch.data.month,employee_name:d.name||d.employee_name||'',employee_number:d.code||d.employee_number||original.code||'',employment_status:status,project_id:d.project_id||'',manager_reviewed:false,manager_notes:'',
    basic,housing,transport,salary,bonus:0,extra_allowance:0,overtime_hours:0,overtime:0,absence_days:0,absence_deduction:0,advance_deduction:0,deductions:0,
    net:salary,cash_amount:0,bank_amount:0,split_confirmed:false,excluded:false,
    exception_note:'',needs_review:mismatch,review_reason:mismatch?'اختلاف إجمالي الراتب عن مكوناته':'',
    notes:'',method:'bank',added_to_batch_at:now,added_to_batch_by:u.email};
   const newBatch={...batch.data,employee_count:Number(batch.data.employee_count)+1};
   const result=await db.batch([
    db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND module='payroll_batches' AND status='draft' AND revision=?").bind(JSON.stringify(newBatch),now,mutation,batch.id,batch.revision),
    db.prepare("INSERT INTO records(id,module,company,code,data,status,revision,created_by,created_at,updated_at,mutation) SELECT ?, 'payroll', ?, ?, ?, 'draft',1,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND module='payroll_batches' AND status='draft' AND revision=?)").bind(rowId,batch.company,employeeId+':'+batch.data.month+':'+batch.id,JSON.stringify(data),u.email,now,now,mutation,batch.id,batch.revision+1),
    db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,rowId,'payroll_employee_add',now,JSON.stringify({batch_id:batch.id,month:batch.data.month,employee_id:employeeId}))
   ]);
   if(!result[0].meta.changes||!result[1].meta.changes)throw Error('تعارض في تحديث المسير؛ أعد التحميل');
   return response({ok:true,row_id:rowId,needs_review:mismatch});
  }
  if(action==='exclude'||action==='restore'){
   if(!prepAllowed||!permission(u,'payroll','edit')||batch.status!=='draft')return err('استبعاد الموظف أو إعادته متاحان في مرحلة تجهيز المسير فقط',403);
   const employee=monthly.find(r=>r.id===String(body.row_id||''));
   if(!employee)throw Error('هذا الموظف غير مرتبط بالمسير');
   if(employee.revision!==body.revision)throw Error('تغير سجل الموظف، حدّث الصفحة');
   const excluding=action==='exclude';
   const reason=String(body.reason||'').trim().slice(0,1000);
   if(excluding&&!reason)throw Error('يجب كتابة سبب استبعاد الموظف من مسير الشهر');
   if(excluding&&employee.data.excluded)return err('الموظف مستبعد بالفعل');
   if(!excluding&&!employee.data.excluded)return err('الموظف مدرج بالفعل');
   const updated={...employee.data,excluded:excluding,
     excluded_at:excluding?now:null,excluded_by:excluding?u.email:null,
     exclusion_reason:excluding?reason:null,split_confirmed:excluding?false:employee.data.split_confirmed,
     ...(excluding?{cash_amount:0,bank_amount:0}:{})};
   const results=await db.batch([
    db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=? AND module='payroll' AND EXISTS(SELECT 1 FROM records b WHERE b.id=? AND b.status='draft')")
      .bind(JSON.stringify(updated),now,mutation,employee.id,employee.revision,batch.id),
    db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),u.email,employee.id,excluding?'payroll_employee_exclude':'payroll_employee_restore',now,JSON.stringify({batch_id:batch.id,month:batch.data.month,reason}))
   ]);
   if(!results[0].meta.changes)throw Error('تعذر تعديل المسير، حدّث الصفحة');
   return response({ok:true,excluded:excluding});
  }
  if(action==='update'){
   const managerEditing=modern&&isManager(u)&&batch.status==='manager_review';
   const prepEditing=prepAllowed&&batch.status==='draft';
   if(!permission(u,'payroll','edit')||!(prepEditing||managerEditing))return err('صلاحية التعديل تقتصر على مساعد الإدارة أثناء التجهيز ومدير المشروع أثناء المراجعة',403);
   const employee=monthly.find(r=>r.id===body.row_id);if(!employee)throw Error('الموظف غير مرتبط بالمسير');
   if(employee.revision!==body.revision)throw Error('تم تعديل بيانات الموظف من مستخدم آخر؛ أعد التحميل');
   if(employee.data.excluded)throw Error('أعد الموظف إلى المسير أولًا قبل تعديل بياناته');
   if(managerEditing){
     const linked=await db.prepare("SELECT data FROM records WHERE id=? AND module='employees'").bind(employee.data.employee_id||'').first();
     const projectId=employee.data.project_id||(linked?JSON.parse(linked.data).project_id:'');
     if(!await canManageProject(u,projectId,batch.company,employee.data.employee_id))return err('الموظف خارج تكليف مدير المشروع المخوّل',403);
   }
   const input=body.data||{},old=employee.data;
   const basic=amount(input.basic,'الراتب الأساسي');
   const housing=amount(input.housing,'بدل السكن');
   const transport=amount(input.transport,'بدل النقل');
   const salary=rounded(basic+housing+transport);
   const bonus=amount(input.bonus??0,'المكافآت');
   const extra_allowance=amount(input.extra_allowance??0,'بدلات إضافية');
   const overtime_hours=Number(input.overtime_hours||0);
   const absence_days=Number(input.absence_days||0);
   if(!Number.isFinite(overtime_hours)||overtime_hours<0||overtime_hours>300||!Number.isFinite(absence_days)||absence_days<0||absence_days>31)throw Error('ساعات إضافية أو أيام غياب غير صالحة');
   const overtime=rounded(overtime_hours*(salary/30/8+0.5*basic/30/8));
   const absence_deduction=amount(input.absence_deduction??0,'خصم الغياب');
   const advance_deduction=amount(input.advance_deduction??0,'خصم السلف');
   const deductions=amount(input.deductions??0,'خصومات أخرى');
   const net=rounded(salary+bonus+extra_allowance+overtime-absence_deduction-advance_deduction-deductions);
   if(net<0)throw Error('الصافي سالب');
   const cash_amount=amount(input.cash_amount??0,'الكاش');
   const bank_amount=amount(input.bank_amount??0,'التحويل البنكي');
   if(cents(cash_amount)+cents(bank_amount)!==cents(net))throw Error('إجمالي الكاش والتحويل يجب أن يساوي صافي الراتب');
   const exception_note=String(input.exception_note||'').trim().slice(0,1000);
   if(old.needs_review&&!exception_note)throw Error('الموظف غير النشط يحتاج توضيح قرار إدراجه في مسير الرواتب');
   const data={...old,basic,housing,transport,salary,bonus,extra_allowance,overtime_hours,absence_days,overtime,absence_deduction,advance_deduction,deductions,net,cash_amount,bank_amount,split_confirmed:true,exception_note,notes:String(input.notes||'').slice(0,2000),method:cash_amount&&bank_amount?'mixed':cash_amount?'cash':'bank',reviewed_by:u.email,reviewed_at:now,manager_reviewed:managerEditing?true:false,manager_notes:managerEditing?String(input.manager_notes||'').trim().slice(0,2000):old.manager_notes||'',manager_reviewed_by:managerEditing?u.email:null,manager_reviewed_at:managerEditing?now:null};
   const res=await db.batch([db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=? AND module='payroll' AND EXISTS(SELECT 1 FROM records b WHERE b.id=? AND b.status=?)")
    .bind(JSON.stringify(data),now,mutation,employee.id,employee.revision,batch.id,batch.status),
    db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,employee.id,'payroll_employee_edit',now,JSON.stringify({batch_id:batch.id,month:batch.data.month}))]);
   if(!res[0].meta.changes)throw Error('المسير تغير؛ أعد التحميل');
   return response({ok:true});
  }
  // Enforce employment status at every approval/payment boundary, including
  // batches created before the employee became inactive.
  if(['submit','managers_approve','projects_approve','finance_pay','admin_approve','finance_approve'].includes(action)){
   const included=monthly.filter(r=>!r.data.excluded);
   if(included.length){
    const employeeIds=included.map(r=>String(r.data.employee_id||''));
    const employeeRows=(await db.prepare("SELECT id,company,data FROM records WHERE module='employees' AND company=?").bind(batch.company).all()).results.map(parse);
    const activeIds=new Set(employeeRows.filter(r=>['active','نشط','على رأس العمل','علي راس العمل'].includes(String(r.data.employment_status||r.data.employee_status||'').trim())).map(r=>r.id));
    const invalid=employeeIds.find(id=>!activeIds.has(id));
    if(invalid)throw Error('يوجد موظف غير نشط في المسير؛ يجب استبعاده أو تعديل حالته إلى نشط في سجل الموظفين قبل الاعتماد أو الصرف');
   }
  }
  if(action==='submit'){
   if(!prepAllowed||batch.status!=='draft')return err('الإرسال من صلاحيات إعداد المسير فقط',403);
   if(monthly.length!==Number(batch.data.employee_count))throw Error('قائمة الموظفين غير مكتملة');
   if(monthly.every(r=>r.data.excluded))throw Error('لا يمكن إرسال مسير استُبعد منه جميع الموظفين');
   for(const e of monthly.filter(r=>!r.data.excluded)){
    if(!e.data.split_confirmed||!Number.isFinite(Number(e.data.net))||cents(e.data.cash_amount)+cents(e.data.bank_amount)!==cents(e.data.net))throw Error('يجب مراجعة وتوزيع صافي راتب جميع الموظفين قبل الإرسال');
    if(e.data.needs_review&&!e.data.exception_note)throw Error('راجع استثناءات الموظفين غير النشطين أو اختلاف بيانات الرواتب');
     if(modern)await ensureAssignedPayrollManager(e.data.project_id,batch.company,e.data.employee_id);
   }
  }else if(!modern&&action==='admin_approve'){
   if(!['admin','administrative_manager'].includes(u.role)||batch.status!=='admin_review')return err('الاعتماد الإداري ليس ضمن صلاحيتك أو المرحلة',403);
  }else if(!modern&&action==='finance_approve'){
   if(!isFinance(u)||batch.status!=='finance_review')return err('المراجعة المالية ليست ضمن صلاحيتك أو المرحلة',403);
  }else if(action==='managers_approve'){
   if(!modern||!['admin','projects_director'].includes(u.role)||batch.status!=='manager_review')return err('يكتمل تسليم المسير لإدارة المشاريع من المدير العام أو إدارة المشاريع بعد مراجعة مدراء المشاريع',403);
   const included=monthly.filter(r=>!r.data.excluded);
   if(!included.length||included.some(r=>!r.data.manager_reviewed))throw Error('لم تكتمل مراجعة مدراء المشاريع لجميع الموظفين');
   const employees=(await db.prepare("SELECT id,data FROM records WHERE module='employees' AND company=?").bind(batch.company).all()).results;
   const projects=(await db.prepare("SELECT id,company,data FROM records WHERE module='projects'").all()).results;
   for(const row of included){
    const employee=employees.find(e=>e.id===row.data.employee_id);
    const projectId=String(row.data.project_id||employee&&JSON.parse(employee.data).project_id||'');
    const assigned=projects.find(p=>p.id===projectId);
    if(!assigned)throw Error('المسير يتضمن موظفًا دون مشروع مسجل: '+row.data.employee_name);
    const delegated=String(employee?JSON.parse(employee.data||'{}').delegated_manager_email||'':'').trim().toLowerCase();
    const managerEmail=delegated||String(JSON.parse(assigned.data).manager_email||'').toLowerCase();
    if(!managerEmail||String(row.data.manager_reviewed_by||'').toLowerCase()!==managerEmail&&row.data.manager_reviewed_by!==u.email&&u.role!=='admin')throw Error('تحتاج مراجعة موظف من مدير مشروعه المخوّل: '+row.data.employee_name);
   }
   // Each manager may review only their assigned projects; final handoff requires every included row marked reviewed.
  }else if(action==='projects_approve'){
   if(!isProjectsDirector(u)||batch.status!=='projects_review')return err('اعتماد إدارة المشاريع ليس ضمن صلاحياتك أو المرحلة الحالية',403);
  }else if(action==='finance_pay'){
   if(!isFinance(u)||batch.status!==(modern?'finance_review':'finance'))return err('مرحلة المراجعة والصرف للإدارة المالية فقط',403);
   if(!String(body.reference||'').trim()||String(body.reference).length>200)throw Error('مرجع الصرف مطلوب');
   if(!body.confirm_payment)throw Error('يجب تأكيد الصرف الفعلي قبل إصدار السندات');
   if(monthly.length!==Number(batch.data.employee_count)||monthly.every(r=>r.data.excluded))throw Error('قائمة المسير غير مكتملة');
   for(const row of monthly.filter(r=>!r.data.excluded)){
    if((modern&&!row.data.manager_reviewed)||!row.data.split_confirmed||cents(row.data.cash_amount)+cents(row.data.bank_amount)!==cents(row.data.net))throw Error('لا يمكن صرف مسير غير معتمد أو غير متطابق');
    if(row.data.needs_review&&!row.data.exception_note)throw Error('استثناء دون مبرر');
   }
  }else if(action==='return'){
   if(!String(body.note||'').trim())throw Error('سبب الإعادة مطلوب');
   if(!((modern&&isManager(u)&&batch.status==='manager_review')||(isProjectsDirector(u)&&batch.status==='projects_review')||(isFinance(u)&&batch.status===(modern?'finance_review':'finance'))||(!modern&&(['admin','administrative_manager'].includes(u.role)&&batch.status==='admin_review'))))return err('لا تملك صلاحية إعادة هذا المسير',403);
  }else throw Error('عملية غير معروفة');
  const next=(modern?{submit:'manager_review',managers_approve:'projects_review',projects_approve:'finance_review',finance_pay:'paid',return:'draft'}:{submit:'admin_review',admin_approve:'finance_review',finance_approve:'projects_review',projects_approve:'finance',finance_pay:'paid',return:'draft'})[action];
  const newData={...batch.data,
   ...(action==='finance_pay'?{paid_at:now,paid_by:u.email,payment_reference:String(body.reference).trim()}:{}),
   ...(action==='return'?{returned_at:now,return_note:String(body.note).trim().slice(0,1000)}:{})};
  const res=await db.batch([db.prepare("UPDATE records SET status=?,data=?,revision=revision+1,updated_at=?,mutation=? WHERE id=? AND revision=? AND status=?")
   .bind(next,JSON.stringify(newData),now,mutation,batch.id,batch.revision,batch.status),
   db.prepare("INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.email,batch.id,'payroll_batch_'+action,now,JSON.stringify({from:batch.status,to:next,note:body.note||'',reference:action==='finance_pay'?String(body.reference):undefined}))]);
  if(!res[0].meta.changes)throw Error('المسير تغير، أعد تحميل الصفحة');
  return response({ok:true,status:next});
 }catch(error){return err(error.message||'تعذر تنفيذ العملية',String(error.message||'').includes('UNIQUE')?409:400);}
}
