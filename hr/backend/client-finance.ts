// @ts-nocheck
import {env} from './runtime.ts';
import {identity} from './erp.ts';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'private, no-store'}});
const allowed=(u,action='view')=>{
 const p=typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{});
 if(u.role==='admin')return true;
 if(action==='view')return p['client_finance:view']!==false&&(['finance','hr','projects_director'].includes(u.role)||p['client_finance:view']===true);
 return p['client_finance:edit']!==false&&(u.role==='finance'||p['client_finance:edit']===true);
};
const scope=u=>{if(u.companies==='*'||!u.companies)return null;try{return JSON.parse(u.companies)}catch{return []}};
const checkCompany=(u,company)=>{const allowedCompanies=scope(u);if(allowedCompanies&&!allowedCompanies.includes(company))throw Error('ليس لديك صلاحية على هذه الشركة');};
const str=(s,n=250)=>String(s??'').trim().slice(0,n);
const amt=x=>{const n=Number(x);if(!Number.isFinite(n)||n<0||n>1e12)throw Error('قيمة مالية غير صالحة');return Math.round(n*100)/100};
const date=x=>{const s=str(x,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('التاريخ غير صالح');return s};
const unique=(r)=>r?.results||[];
const row=async(db,id,u)=>{const r=await db.prepare('SELECT * FROM client_contracts WHERE id=?').bind(id).first();if(!r)throw Error('العقد غير موجود');checkCompany(u,r.company);return r};
const input=async req=>{const b=await req.text();if(b.length>850000)throw Error('ملف الاستيراد كبير جدًا؛ قسم العقود إلى مجموعات لا تتجاوز 500 عقد');return JSON.parse(b||'{}')};
const fail=e=>json({error:e.message||'تعذر إتمام العملية'},/صلاحية|403/.test(String(e.message))?403:400);
const addAudit=async(db,u,id,action,details)=>{await db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.email,id,action,new Date().toISOString(),JSON.stringify(details)).run()};
const checkTotal=async(db,c,additional=0)=>{
 const a=await db.prepare("SELECT kind,amount_ex_vat,approved_at FROM client_adjustments WHERE contract_id=?").bind(c.id).all();
 const extra=unique(a).filter(x=>x.approved_at).reduce((n,x)=>n+(x.kind==='extra'?1:-1)*Number(x.amount_ex_vat),0);
 const final=Math.round((Number(c.base_ex_vat)+extra+additional)*100)/100;
 if(final<0)throw Error('قيمة العقد بعد الخصومات لا يمكن أن تكون سالبة');
 return final;
};
const allData=async(db,u)=>{
 const cc=unique(await db.prepare('SELECT * FROM client_contracts ORDER BY created_at DESC LIMIT 5000').all()).filter(c=>{try{checkCompany(u,c.company);return true}catch{return false}});
 const ids=new Set(cc.map(x=>x.id));
 const get=async t=>unique(await db.prepare('SELECT * FROM '+t+' ORDER BY created_at DESC LIMIT 20000').all()).filter(x=>ids.has(x.contract_id));
 return {contracts:cc,installments:await get('client_installments'),installment_items:await get('client_installment_items'),adjustments:await get('client_adjustments'),claims:await get('client_claims'),receipts:await get('client_receipts'),documents:await get('client_documents')};
};
export async function GET(req){
 try{const u=await identity();if(!allowed(u))throw Error('ليس لديك صلاحية عرض المطالبات');const db=env.DB;
 const p=new URL(req.url).searchParams;
 if(p.get('ai_document')){
  if(!allowed(u,'edit'))throw Error('ليس لديك صلاحية استخراج الدفعات');
  const doc=await db.prepare('SELECT id,contract_id,name,mime,size,document_type FROM client_documents WHERE id=?').bind(p.get('ai_document')).first();
  if(!doc||doc.contract_id!==p.get('contract_id')||!['contract','contract_appendix'].includes(doc.document_type))throw Error('يجب تحديد عقد مرفق صحيح');
  const c=await row(db,doc.contract_id,u);
  const imported=await db.prepare('SELECT id FROM client_ai_imports WHERE document_id=?').bind(doc.id).first();
  return json({document:doc,contract:{id:c.id,contract_no:c.contract_no,base_ex_vat:c.base_ex_vat,vat_rate:c.vat_rate,start_date:c.start_date,end_date:c.end_date},already_imported:!!imported});
 }
 if(p.get('download')){const doc=await db.prepare('SELECT * FROM client_documents WHERE id=?').bind(p.get('download')).first();if(!doc)throw Error('المرفق غير موجود');await row(db,doc.contract_id,u);const blob=await env.BUCKET.get(doc.blob_key);if(!blob)throw Error('ملف المرفق غير موجود');return new Response(blob.body,{headers:{'Content-Type':doc.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(doc.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 // Cron provides truly automatic generation; this call also reconciles any missed runs.
 await db.prepare('SELECT auto_generate_client_claims()').first();
 return json(await allData(db,u));
 }catch(e){return fail(e)}
}
export async function POST(req){
 try{const u=await identity();
 const db=env.DB,p=new URL(req.url).searchParams;
 if(p.get('action')==='upload'){if(!allowed(u,'edit'))throw Error('ليس لديك صلاحية رفع مستندات العقود');const c=await row(db,p.get('contract_id'),u);const name=str(p.get('name'),180);const mime=str(req.headers.get('content-type')||'application/pdf',100);
 const documentType=str(p.get('document_type')||'contract');
 if(!['contract','contract_appendix','extra','deduction','claim','receipt','other'].includes(documentType))throw Error('نوع المرفق غير معتمد');
 const adjustmentId=str(p.get('adjustment_id'),40)||null,claimId=str(p.get('claim_id'),40)||null,receiptId=str(p.get('receipt_id'),40)||null;
 if(['extra','deduction'].includes(documentType)){
  if(!adjustmentId)throw Error('حدد بند الإضافة أو الخصم المرتبط بالمرفق');
  const record=await db.prepare('SELECT kind FROM client_adjustments WHERE id=? AND contract_id=?').bind(adjustmentId,c.id).first();
  if(!record||record.kind!==documentType)throw Error('الملحق لا يتبع العقد أو نوعه غير مطابق');
 }
 if(documentType==='claim'){
  if(!claimId)throw Error('حدد المطالبة التي يخصها المرفق');
  const claim=await db.prepare('SELECT id FROM client_claims WHERE id=? AND contract_id=?').bind(claimId,c.id).first();
  if(!claim)throw Error('المطالبة لا تتبع العقد');
 }
 if(documentType==='receipt'){
  if(!receiptId)throw Error('حدد سند الاستلام الذي يخصه المرفق');
  const payment=await db.prepare('SELECT id FROM client_receipts WHERE id=? AND contract_id=?').bind(receiptId,c.id).first();
  if(!payment)throw Error('السند لا يتبع العقد');
 }
 if(!name||!(/\.pdf$|\.png$|\.jpe?g$/i.test(name))||!['application/pdf','image/png','image/jpeg'].includes(mime))throw Error('يسمح بإرفاق PDF أو صورة JPG/PNG فقط');
 const bytes=await req.arrayBuffer();if(bytes.byteLength<1||bytes.byteLength>8388608)throw Error('الحد الأقصى للمرفق 8 ميجابايت');
 const key='client-finance/'+c.id+'/'+crypto.randomUUID();await env.BUCKET.put(key,bytes);
 const id=crypto.randomUUID();
 try{await db.prepare('INSERT INTO client_documents(id,contract_id,name,mime,size,blob_key,uploaded_by,document_type,adjustment_id,claim_id,receipt_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,c.id,name,mime,bytes.byteLength,key,u.email,documentType,adjustmentId,claimId,receiptId).run();}
 catch(e){await env.BUCKET.delete(key);throw e;}
 await addAudit(db,u,c.id,'client_contract_file',{id,name,document_type:documentType,adjustment_id:adjustmentId,claim_id:claimId});return json({ok:true,id});
 }
 const b=await input(req),action=str(b.action,40);
 const perms=typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):u.permissions||{};
 const isApproving=action==='approve_adjustment';
 if(isApproving){
   if(!(u.role==='admin'||u.role==='projects_director'||perms['client_finance:approve']===true))throw Error('ليس لديك صلاحية اعتماد ملاحق العقود');
 }else if(!allowed(u,'edit'))throw Error('ليس لديك صلاحية تحرير العقود المالية');
 if(action==='bulk_import_contracts'){
 const list=b.contracts;
 if(!Array.isArray(list)||!list.length||list.length>500)throw Error('استيراد من 1 إلى 500 عقد في العملية');
 const categories=['سباكة وكهرباء','تشطيبات عامة','أعمال عظم','أعمال تكييف','أعمال دفاع مدني'];
 const keyset=new Set(),statements=[],result=[],errs=[];
 for(let j=0;j<list.length;j++){
  const x=list[j]||{},line=Number(x.line)||j+2;
  const company=str(x.company),customer=str(x.customer),project=str(x.project_name),manager=str(x.project_manager),
    number=str(x.contract_no,90),type=str(x.contract_type);
  const prefix='صف '+line+': ';
  if(!company||!customer||!project||!manager||!number){errs.push(prefix+'بيانات العقد الأساسية ناقصة');continue;}
  try{checkCompany(u,company);}catch{errs.push(prefix+'الشركة خارج نطاق الصلاحيات');continue;}
  if(!categories.includes(type)){errs.push(prefix+'نوع العقد غير صالح');continue;}
  let start,end,signed,base,vat,retention;
  try{
    start=date(x.start_date);end=date(x.end_date);signed=date(x.signed_date);
    base=amt(x.base_ex_vat);vat=Number(x.vat_rate===undefined||x.vat_rate===''?15:x.vat_rate)/100;retention=amt(x.retention_percent||0);
    if(end<start||!Number.isFinite(vat)||vat<0||vat>1||retention>100)throw Error('تواريخ العقد أو النسب غير صحيحة');
  }catch{errs.push(prefix+'التاريخ أو المبلغ أو النسبة غير صالحة');continue;}
  const signature=company+'::'+number;
  if(keyset.has(signature)){errs.push(prefix+'رقم العقد مكرر ضمن الملف');continue;}
  keyset.add(signature);
  const id=crypto.randomUUID();
  result.push({id,company,number});
  statements.push(db.prepare('INSERT INTO client_contracts(id,company,customer,project_name,project_manager,start_date,end_date,contract_no,contract_type,signed_date,base_ex_vat,vat_rate,notes,created_by,customer_phone,customer_email,customer_vat_no,site_location,contract_subject,client_reference,retention_percent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,company,customer,project,manager,start,end,number,type,signed,base,vat,str(x.notes,3000),u.email,str(x.customer_phone,50),str(x.customer_email,200),str(x.customer_vat_no,40),str(x.site_location,400),str(x.contract_subject,1000),str(x.client_reference,120),retention));
  statements.push(db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),u.email,id,'client_contract_bulk_import',new Date().toISOString(),JSON.stringify({company,contract_no:number})));
 }
 if(errs.length)return json({error:'الاستيراد مرفوض بسبب أخطاء في البيانات؛ لم يُحفظ أي عقد',details:errs.slice(0,100)},422);
 // One transaction: even unique contract numbers against existing records cause full rollback.
 try{await db.batch(statements);}catch(e){
   if(/unique|duplicate|constraint/i.test(String(e.message||'')))return json({error:'يوجد رقم عقد مسجل مسبقًا لنفس الشركة؛ لم يُحفظ أي عقد'},409);
   throw e;
 }
 return json({ok:true,imported:result.length});
 }
 if(action==='create_contract'){
 const company=str(b.company),customer=str(b.customer),project=str(b.project_name),manager=str(b.project_manager),
 number=str(b.contract_no,90),type=str(b.contract_type);
 if(!company||!customer||!project||!manager||!number)throw Error('استكمل بيانات العقد والمشروع ومديره');
 checkCompany(u,company);
 const categories=['سباكة وكهرباء','تشطيبات عامة','أعمال عظم','أعمال تكييف','أعمال دفاع مدني'];if(!categories.includes(type))throw Error('نوع العقد غير معتمد');
 const start=date(b.start_date),end=date(b.end_date),signed=date(b.signed_date);
 if(end<start)throw Error('نهاية المشروع تسبق بدايته');
 const base=amt(b.base_ex_vat),vat=Number(b.vat_rate??15)/100;
 if(!Number.isFinite(vat)||vat<0||vat>1)throw Error('نسبة الضريبة غير صالحة');
 const id=crypto.randomUUID();
 const retention=amt(b.retention_percent??0);if(retention>100)throw Error('نسبة حجز الضمان لا تتجاوز 100%');
 await db.prepare('INSERT INTO client_contracts(id,company,customer,project_name,project_manager,start_date,end_date,contract_no,contract_type,signed_date,base_ex_vat,vat_rate,notes,created_by,customer_phone,customer_email,customer_vat_no,site_location,contract_subject,client_reference,retention_percent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .bind(id,company,customer,project,manager,start,end,number,type,signed,base,vat,str(b.notes,3000),u.email,
 str(b.customer_phone,50),str(b.customer_email,200),str(b.customer_vat_no,40),str(b.site_location,400),str(b.contract_subject,1000),str(b.client_reference,120),retention).run();
 await addAudit(db,u,id,'client_contract_created',{contract_no:number,company});return json({ok:true,id});
 }
 const c=await row(db,str(b.contract_id),u);
 if(action==='update_contract'){
 if(!allowed(u,'edit'))throw Error('ليس لديك صلاحية تعديل العقد');
 const start=date(b.start_date||c.start_date),end=date(b.end_date||c.end_date),signed=date(b.signed_date||c.signed_date);
 if(end<start)throw Error('نهاية المشروع تسبق البداية');
 const existing=await db.prepare('SELECT count(*) AS count FROM client_installments WHERE contract_id=?').bind(c.id).first();
 const payment=await db.prepare('SELECT count(*) AS count FROM client_receipts WHERE contract_id=?').bind(c.id).first();
 const newBase=amt(b.base_ex_vat??c.base_ex_vat),newVat=Number(b.vat_rate===undefined?n(c.vat_rate)*100:b.vat_rate)/100;
 if(!Number.isFinite(newVat)||newVat<0||newVat>1)throw Error('نسبة ضريبة غير صالحة');
 if((Number(existing?.count)||Number(payment?.count))&&(newBase!==Number(c.base_ex_vat)||Math.abs(newVat-Number(c.vat_rate))>0.00001))throw Error('لا يمكن تغيير القيمة الأساسية أو الضريبة بعد تسجيل دفعات أو تحصيل؛ استخدم ملحقًا معتمدًا');
 const retention=amt(b.retention_percent??c.retention_percent);if(retention>100)throw Error('نسبة الحجز غير صالحة');
 await db.prepare('UPDATE client_contracts SET customer=?,project_name=?,project_manager=?,start_date=?,end_date=?,signed_date=?,contract_type=?,base_ex_vat=?,vat_rate=?,customer_phone=?,customer_email=?,customer_vat_no=?,site_location=?,contract_subject=?,client_reference=?,retention_percent=?,notes=?,contract_status=?,updated_at=now() WHERE id=?')
 .bind(str(b.customer||c.customer),str(b.project_name||c.project_name),str(b.project_manager||c.project_manager),start,end,signed,str(b.contract_type||c.contract_type),newBase,newVat,
 str(b.customer_phone??c.customer_phone,50),str(b.customer_email??c.customer_email,200),str(b.customer_vat_no??c.customer_vat_no,40),
 str(b.site_location??c.site_location,400),str(b.contract_subject??c.contract_subject,1000),str(b.client_reference??c.client_reference,120),retention,str(b.notes??c.notes,3000),
 ['active','completed','suspended'].includes(b.contract_status)?b.contract_status:c.contract_status,c.id).run();
 await addAudit(db,u,c.id,'client_contract_updated',{customer:b.customer,manager:b.project_manager});return json({ok:true});
 }
 if(action==='approve_ai_schedule'){
  const documentId=str(b.document_id,40),doc=await db.prepare('SELECT id,contract_id,mime,document_type FROM client_documents WHERE id=? AND contract_id=?').bind(documentId,c.id).first();
  if(!doc||!['contract','contract_appendix'].includes(doc.document_type))throw Error('يجب اختيار عقد أو ملحق معتمد مرفق لنفس العقد');
  const already=await db.prepare('SELECT id FROM client_ai_imports WHERE document_id=?').bind(documentId).first();
  if(already)throw Error('تم اعتماد بنود هذا المستند سابقًا. لن تُكرر الدفعات');
  const plans=b.installments;
  if(!Array.isArray(plans)||plans.length<1||plans.length>30)throw Error('يُسمح من دفعة واحدة إلى 30 دفعة لكل عقد');
  const existing=unique(await db.prepare("SELECT amount_ex_vat FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((t,x)=>t+Number(x.amount_ex_vat),0);
  const capacity=await checkTotal(db,c);
  const statements=[],dueKeys=new Set();let requested=0,requestedPercent=0;
  const existingPercent=unique(await db.prepare("SELECT payment_percent FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((z,x)=>z+Number(x.payment_percent||0),0);
  for(let ix=0;ix<plans.length;ix++){
   const p=plans[ix]||{},due=date(p.due_date),percent=p.payment_percent===''||p.payment_percent===undefined||p.payment_percent===null?null:amt(p.payment_percent),
    value=percent===null?amt(p.amount_ex_vat):Math.round(capacity*percent)/100,title=str(p.title,160),desc=str(p.description,1500),rawItems=p.items||[];
   if(percent!==null&&(percent<=0||percent>100))throw Error('نسبة الدفعة غير صالحة');if(percent!==null)requestedPercent+=percent;
   if(value<=0||!title)throw Error('دفعة رقم '+(ix+1)+': العنوان والمبلغ مطلوبان');
   if(!Array.isArray(rawItems)||rawItems.length>50)throw Error('دفعة رقم '+(ix+1)+': عدد البنود يتجاوز 50');
   const signature=title+'|'+due;
   if(dueKeys.has(signature))throw Error('تكرار نفس الدفعة بتاريخ الاستحقاق');dueKeys.add(signature);
   requested+=value;const id=crypto.randomUUID();
   const progress=amt(p.progress_percent||0);if(progress>100)throw Error('نسبة إنجاز غير صالحة');
   statements.push(db.prepare('INSERT INTO client_installments(id,contract_id,title,description,due_date,amount_ex_vat,progress_percent,milestone_type,payment_percent) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(id,c.id,title,desc,due,value,progress,'ai_contract_reviewed',percent));
   let itemAmount=0;const itemCodes=new Set();
   for(let j=0;j<rawItems.length;j++){
    const item=rawItems[j]||{},itemCode=str(item.item_code||'AI-'+(j+1),50),description=str(item.description,900);
    const qty=Number(item.quantity),unitPrice=amt(item.unit_price_ex_vat);
    if(!description||!Number.isFinite(qty)||qty<=0||qty>100000000||itemCodes.has(itemCode))throw Error('تفاصيل بند غير صالحة في الدفعة '+(ix+1));
    itemCodes.add(itemCode);itemAmount+=Math.round(qty*unitPrice*100)/100;
    statements.push(db.prepare('INSERT INTO client_installment_items(id,installment_id,contract_id,item_code,description,quantity,unit,unit_price_ex_vat,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),id,c.id,itemCode,description,qty,str(item.unit||'بند',50),unitPrice,u.email));
   }
   if(itemAmount>value+0.005)throw Error('قيمة بنود الدفعة رقم '+(ix+1)+' تتجاوز إجمالي الدفعة');
  }
  if(existingPercent+requestedPercent>100.0001)throw Error('النسب التعاقدية المستخرجة تتجاوز 100%');
  if(existing+requested>capacity+0.005)throw Error('مجموع الدفعات المستخرجة يتجاوز المتبقي من قيمة العقد قبل الضريبة');
  statements.push(db.prepare('INSERT INTO client_ai_imports(id,contract_id,document_id,installment_count,total_ex_vat,approved_by) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),c.id,documentId,plans.length,Math.round(requested*100)/100,u.email));
  statements.push(db.prepare('INSERT INTO audit(id,actor,record_id,action,at,details) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),u.email,c.id,'ai_installment_schedule_approved',new Date().toISOString(),JSON.stringify({document_id:documentId,installments:plans.length,total_ex_vat:requested})));
  try{await db.batch(statements)}catch(err){if(/unique|duplicate/i.test(String(err.message||'')))throw Error('هذه الدفعات مستوردة مسبقًا');throw err;}
  await db.prepare('SELECT auto_generate_client_claims()').first();
  return json({ok:true,imported:plans.length,total_ex_vat:Math.round(requested*100)/100});
 }
 if(['archive_contract','delete_contract','restore_contract'].includes(action)){
 if(u.role!=='admin'&&u.role!=='finance'&&!(typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):u.permissions||{})['client_finance:delete'])throw Error('ليس لديك صلاحية حذف أو استعادة العقود');
 if(action==='restore_contract'){
  if(c.contract_status!=='archived')throw Error('العقد غير مؤرشف');
  await db.prepare("UPDATE client_contracts SET contract_status='active',updated_at=now() WHERE id=?").bind(c.id).run();
  await addAudit(db,u,c.id,'client_contract_restored',{contract_no:c.contract_no});
  return json({ok:true,restored:true});
 }
 const entities=['client_installments','client_adjustments','client_receipts','client_claims','client_documents','client_ai_imports'];
 const counts=await Promise.all(entities.map(t=>db.prepare('SELECT count(*) AS n FROM '+t+' WHERE contract_id=?').bind(c.id).first()));
 const linked=counts.reduce((n,x)=>n+Number(x?.n||0),0);
 if(action==='delete_contract'&&linked===0){
   await db.prepare('DELETE FROM client_contracts WHERE id=?').bind(c.id).run();
   await addAudit(db,u,c.id,'client_contract_deleted',{contract_no:c.contract_no,company:c.company});
   return json({ok:true,deleted:true});
 }
 if(c.contract_status==='archived')throw Error('العقد مؤرشف بالفعل');
 await db.prepare("UPDATE client_contracts SET contract_status='archived',updated_at=now() WHERE id=?").bind(c.id).run();
 await addAudit(db,u,c.id,'client_contract_archived',{contract_no:c.contract_no,linked_records:linked});
 return json({ok:true,archived:true,linked_records:linked});
 }
 if(c.contract_status==='archived')throw Error('العقد مؤرشف ولا يمكن تسجيل دفعات أو إصدار مطالبة');
 if(action==='add_installment'){
 const due=date(b.due_date),percentage=b.payment_percent===''||b.payment_percent===undefined||b.payment_percent===null?null:amt(b.payment_percent);
 const basis=await checkTotal(db,c);
 if(percentage!==null&&(percentage<=0||percentage>100))throw Error('النسبة التعاقدية يجب أن تكون بين 0 و100');
 const amount=percentage===null?amt(b.amount_ex_vat):Math.round(basis*percentage)/100;
 if(!amount)throw Error('قيمة الدفعة مطلوبة');
 const scheduled=unique(await db.prepare("SELECT amount_ex_vat FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((a,x)=>a+Number(x.amount_ex_vat),0);
 const total=basis;
 const previousPercent=unique(await db.prepare("SELECT payment_percent FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((z,x)=>z+Number(x.payment_percent||0),0);
 if(percentage!==null&&previousPercent+percentage>100.0001)throw Error('مجموع نسب الدفعات يتجاوز 100%');
 if(scheduled+amount>total+0.005)throw Error('مجموع الدفعات يتجاوز قيمة العقد بعد الإضافات والخصومات المعتمدة');
 const id=crypto.randomUUID();
 const progress=amt(b.progress_percent??0);if(progress>100)throw Error('نسبة الإنجاز لا تتجاوز 100%');
 await db.prepare('INSERT INTO client_installments(id,contract_id,title,description,due_date,amount_ex_vat,progress_percent,milestone_type,payment_percent) VALUES(?,?,?,?,?,?,?,?,?)')
 .bind(id,c.id,str(b.title,160)||'دفعة تعاقدية',str(b.description,1500),due,amount,progress,str(b.milestone_type,50)||'contractual',percentage).run();
 await db.prepare('SELECT auto_generate_client_claims()').first();
 await addAudit(db,u,c.id,'client_installment_added',{id,amount,due});return json({ok:true,id});
 }
 if(action==='add_installment_item'){
 const installment=await db.prepare('SELECT * FROM client_installments WHERE id=? AND contract_id=?').bind(str(b.installment_id),c.id).first();
 if(!installment||installment.status!=='scheduled')throw Error('دفعة غير موجودة أو أُلغيت');
 const claim=await db.prepare('SELECT status FROM client_claims WHERE installment_id=?').bind(installment.id).first();
 if(claim?.status==='issued')throw Error('البنود مقفلة بعد إصدار المطالبة');
 const quantity=Number(b.quantity),price=amt(b.unit_price_ex_vat);
 if(!Number.isFinite(quantity)||quantity<=0||quantity>100000000)throw Error('كمية غير صالحة');
 const value=Math.round(quantity*price*100)/100;
 const other=unique(await db.prepare('SELECT amount_ex_vat FROM client_installment_items WHERE installment_id=?').bind(installment.id).all()).reduce((a,x)=>a+Number(x.amount_ex_vat),0);
 if(other+value>Number(installment.amount_ex_vat)+.005)throw Error('مجموع البنود أكبر من قيمة الدفعة');
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO client_installment_items(id,installment_id,contract_id,item_code,description,quantity,unit,unit_price_ex_vat,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
 .bind(id,installment.id,c.id,str(b.item_code,50)||'ITEM-'+id.slice(0,6),str(b.description,900),quantity,str(b.unit,50)||'بند',price,u.email).run();
 await addAudit(db,u,c.id,'client_installment_item_added',{id,installment_id:installment.id,value});return json({ok:true,id});
 }
 if(action==='add_adjustment'){
 const kind=str(b.kind);if(!['extra','deduction'].includes(kind))throw Error('نوع الملحق غير صحيح');
 const amount=amt(b.amount_ex_vat);if(amount<=0)throw Error('المبلغ يجب أن يكون أكبر من صفر');
 const approved=b.approved_at?date(b.approved_at):null;
 const delta=kind==='extra'?amount:-amount;
 if(approved){
 const newTotal=await checkTotal(db,c,delta);
 const scheduled=unique(await db.prepare("SELECT amount_ex_vat FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((n,x)=>n+Number(x.amount_ex_vat),0);
 const paid=unique(await db.prepare('SELECT amount_inc_vat FROM client_receipts WHERE contract_id=?').bind(c.id).all()).reduce((n,x)=>n+Number(x.amount_inc_vat),0);
 if(scheduled>newTotal+0.005)throw Error('الخصم يجعل جدول الدفعات يتجاوز صافي قيمة العقد؛ عدّل الدفعات أولًا');
 if(paid>newTotal*(1+Number(c.vat_rate))+0.02)throw Error('الخصم يجعل المدفوع يتجاوز قيمة العقد بعد التعديل');
 }
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO client_adjustments(id,contract_id,kind,description,amount_ex_vat,approved_at,created_by,approved_by) VALUES(?,?,?,?,?,?,?,?)')
 .bind(id,c.id,kind,str(b.description,1500)||'ملحق العقد',amount,approved,u.email,approved?u.email:null).run();
 await addAudit(db,u,c.id,'client_adjustment_added',{kind,amount,id,approved});return json({ok:true,id});
 }
 if(action==='approve_adjustment'){
 // Approval permission was checked before loading the contract.
 const a=await db.prepare('SELECT * FROM client_adjustments WHERE id=? AND contract_id=?').bind(str(b.adjustment_id),c.id).first();
 if(!a||a.approved_at)throw Error('الملحق معتمد مسبقًا أو غير موجود');
 const amount=Number(a.amount_ex_vat),delta=a.kind==='extra'?amount:-amount;
 const adjustedTotal=await checkTotal(db,c,delta);
 const scheduled=unique(await db.prepare("SELECT amount_ex_vat FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((v,x)=>v+Number(x.amount_ex_vat),0);
 const paid=unique(await db.prepare('SELECT amount_inc_vat FROM client_receipts WHERE contract_id=?').bind(c.id).all()).reduce((v,x)=>v+Number(x.amount_inc_vat),0);
 if(scheduled>adjustedTotal+.005||paid>adjustedTotal*(1+Number(c.vat_rate))+.02)throw Error('لا يمكن الاعتماد قبل تسوية جدول الدفعات والتحصيلات');
 await db.prepare('UPDATE client_adjustments SET approved_at=?,approved_by=? WHERE id=? AND approved_at IS NULL').bind(new Date().toISOString().slice(0,10),u.email,a.id).run();
 await addAudit(db,u,c.id,'client_adjustment_approved',{id:a.id});return json({ok:true});
 }
 if(action==='issue_claim'){
 const cl=await db.prepare('SELECT * FROM client_claims WHERE id=? AND contract_id=?').bind(str(b.claim_id),c.id).first();
 if(!cl||cl.status!=='ready')throw Error('المطالبة غير موجودة أو سبق إصدارها');
 const submitted=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
 await db.prepare("UPDATE client_claims SET status='issued',issued_at=now(),submitted_at=?,raised_at=?,created_by=? WHERE id=? AND status='ready'").bind(submitted,submitted,u.email,cl.id).run();
 await addAudit(db,u,c.id,'client_claim_issued',{claim_no:cl.claim_no,claim_id:cl.id});return json({ok:true});
 }
 if(action==='record_claim_client_approval'){
 const cl=await db.prepare('SELECT * FROM client_claims WHERE id=? AND contract_id=?').bind(str(b.claim_id),c.id).first();
 if(!cl||cl.status!=='issued')throw Error('المطالبة لم تُصدر بعد');
 const accepted=date(b.client_approved_at);
 await db.prepare('UPDATE client_claims SET client_approved_at=?,client_comment=? WHERE id=? AND contract_id=?').bind(accepted,str(b.client_comment,1000),cl.id,c.id).run();
 await addAudit(db,u,c.id,'client_claim_accepted',{claim_id:cl.id,accepted});return json({ok:true});
 }
 if(action==='add_receipt'){
 const amount=amt(b.amount_inc_vat);if(amount<=0)throw Error('مبلغ الدفعة غير صالح');
 const claimId=b.claim_id?str(b.claim_id):null;
 if(claimId){const cl=await db.prepare('SELECT * FROM client_claims WHERE id=? AND contract_id=?').bind(claimId,c.id).first();if(!cl||cl.status!=='issued')throw Error('يجب إصدار المطالبة أولًا');}
 const total=(await checkTotal(db,c))*(1+Number(c.vat_rate));
 const paid=unique(await db.prepare('SELECT amount_inc_vat FROM client_receipts WHERE contract_id=?').bind(c.id).all()).reduce((n,x)=>n+Number(x.amount_inc_vat),0);
 if(paid+amount>total+0.02)throw Error('إجمالي المدفوع يتجاوز المستحق شامل الضريبة');
 const id=crypto.randomUUID();await db.prepare('INSERT INTO client_receipts(id,contract_id,claim_id,paid_at,amount_inc_vat,method,reference,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,c.id,claimId,date(b.paid_at),amount,str(b.method,60)||'تحويل بنكي',str(b.reference,200)||'بدون مرجع',u.email).run();
 await addAudit(db,u,c.id,'client_payment_received',{amount,id});return json({ok:true,id});
 }
 throw Error('إجراء غير معروف');
 }catch(e){return fail(e)}
}
