// @ts-nocheck
import {env} from './runtime.ts';
import {identity} from './erp.ts';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'private, no-store'}});
const allowed=(u,action='view')=>{
 const p=typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{});
 if(u.role==='admin')return true;
 if(action==='view')return ['finance','hr','projects_director'].includes(u.role)||p['client_finance:view']===true;
 return (u.role==='finance'||p['client_finance:edit']===true)&&p['client_finance:edit']!==false;
};
const scope=u=>{if(u.companies==='*'||!u.companies)return null;try{return JSON.parse(u.companies)}catch{return []}};
const checkCompany=(u,company)=>{const allowedCompanies=scope(u);if(allowedCompanies&&!allowedCompanies.includes(company))throw Error('ليس لديك صلاحية على هذه الشركة');};
const str=(s,n=250)=>String(s??'').trim().slice(0,n);
const amt=x=>{const n=Number(x);if(!Number.isFinite(n)||n<0||n>1e12)throw Error('قيمة مالية غير صالحة');return Math.round(n*100)/100};
const date=x=>{const s=str(x,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('التاريخ غير صالح');return s};
const unique=(r)=>r?.results||[];
const row=async(db,id,u)=>{const r=await db.prepare('SELECT * FROM client_contracts WHERE id=?').bind(id).first();if(!r)throw Error('العقد غير موجود');checkCompany(u,r.company);return r};
const input=async req=>{const b=await req.text();if(b.length>100000)throw Error('الطلب كبير');return JSON.parse(b||'{}')};
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
 return {contracts:cc,installments:await get('client_installments'),adjustments:await get('client_adjustments'),claims:await get('client_claims'),receipts:await get('client_receipts'),documents:await get('client_documents')};
};
export async function GET(req){
 try{const u=await identity();if(!allowed(u))throw Error('ليس لديك صلاحية عرض المطالبات');const db=env.DB;
 const p=new URL(req.url).searchParams;
 if(p.get('download')){const doc=await db.prepare('SELECT * FROM client_documents WHERE id=?').bind(p.get('download')).first();if(!doc)throw Error('المرفق غير موجود');await row(db,doc.contract_id,u);const blob=await env.BUCKET.get(doc.blob_key);if(!blob)throw Error('ملف المرفق غير موجود');return new Response(blob.body,{headers:{'Content-Type':doc.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(doc.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 // Cron provides truly automatic generation; this call also reconciles any missed runs.
 await db.prepare('SELECT auto_generate_client_claims()').first();
 return json(await allData(db,u));
 }catch(e){return fail(e)}
}
export async function POST(req){
 try{const u=await identity();if(!allowed(u,'edit'))throw Error('ليس لديك صلاحية تحرير العقود المالية');
 const db=env.DB,p=new URL(req.url).searchParams;
 if(p.get('action')==='upload'){const c=await row(db,p.get('contract_id'),u);const name=str(p.get('name'),180);const mime=str(req.headers.get('content-type')||'application/pdf',100);
 if(!name||!(/\.pdf$|\.png$|\.jpe?g$/i.test(name))||!['application/pdf','image/png','image/jpeg'].includes(mime))throw Error('يسمح بإرفاق PDF أو صورة JPG/PNG فقط');
 const bytes=await req.arrayBuffer();if(bytes.byteLength<1||bytes.byteLength>8388608)throw Error('الحد الأقصى للمرفق 8 ميجابايت');
 const key='client-finance/'+c.id+'/'+crypto.randomUUID();await env.BUCKET.put(key,bytes);
 const id=crypto.randomUUID();
 try{await db.prepare('INSERT INTO client_documents(id,contract_id,name,mime,size,blob_key,uploaded_by) VALUES(?,?,?,?,?,?,?)').bind(id,c.id,name,mime,bytes.byteLength,key,u.email).run();}
 catch(e){await env.BUCKET.delete(key);throw e;}
 await addAudit(db,u,c.id,'client_contract_file',{id,name});return json({ok:true,id});
 }
 const b=await input(req),action=str(b.action,40);
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
 await db.prepare('INSERT INTO client_contracts(id,company,customer,project_name,project_manager,start_date,end_date,contract_no,contract_type,signed_date,base_ex_vat,vat_rate,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,company,customer,project,manager,start,end,number,type,signed,base,vat,str(b.notes,3000),u.email).run();
 await addAudit(db,u,id,'client_contract_created',{contract_no:number,company});return json({ok:true,id});
 }
 const c=await row(db,str(b.contract_id),u);
 if(action==='add_installment'){
 const due=date(b.due_date),amount=amt(b.amount_ex_vat);
 if(!amount)throw Error('قيمة الدفعة مطلوبة');
 const scheduled=unique(await db.prepare("SELECT amount_ex_vat FROM client_installments WHERE contract_id=? AND status='scheduled'").bind(c.id).all()).reduce((a,x)=>a+Number(x.amount_ex_vat),0);
 const total=await checkTotal(db,c);
 if(scheduled+amount>total+0.005)throw Error('مجموع الدفعات يتجاوز قيمة العقد بعد الإضافات والخصومات المعتمدة');
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO client_installments(id,contract_id,title,description,due_date,amount_ex_vat) VALUES(?,?,?,?,?,?)').bind(id,c.id,str(b.title,160)||'دفعة تعاقدية',str(b.description,1500),due,amount).run();
 await db.prepare('SELECT auto_generate_client_claims()').first();
 await addAudit(db,u,c.id,'client_installment_added',{id,amount,due});return json({ok:true,id});
 }
 if(action==='add_adjustment'){
 const kind=str(b.kind);if(!['extra','deduction'].includes(kind))throw Error('نوع الملحق غير صحيح');
 const amount=amt(b.amount_ex_vat);if(amount<=0)throw Error('المبلغ يجب أن يكون أكبر من صفر');
 const approved=b.approved_at?date(b.approved_at):null;
 const delta=kind==='extra'?amount:-amount;
 if(approved)await checkTotal(db,c,delta);
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO client_adjustments(id,contract_id,kind,description,amount_ex_vat,approved_at,created_by) VALUES(?,?,?,?,?,?,?)').bind(id,c.id,kind,str(b.description,1500)||'ملحق العقد',amount,approved,u.email).run();
 await addAudit(db,u,c.id,'client_adjustment_added',{kind,amount,id,approved});return json({ok:true,id});
 }
 if(action==='issue_claim'){
 const cl=await db.prepare('SELECT * FROM client_claims WHERE id=? AND contract_id=?').bind(str(b.claim_id),c.id).first();
 if(!cl||cl.status!=='ready')throw Error('المطالبة غير موجودة أو سبق إصدارها');
 await db.prepare("UPDATE client_claims SET status='issued',issued_at=now(),created_by=? WHERE id=? AND status='ready'").bind(u.email,cl.id).run();
 await addAudit(db,u,c.id,'client_claim_issued',{claim_no:cl.claim_no,claim_id:cl.id});return json({ok:true});
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
