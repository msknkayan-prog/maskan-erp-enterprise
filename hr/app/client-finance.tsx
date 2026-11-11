// @ts-nocheck
'use client';
import {useEffect,useMemo,useState} from 'react';
import {companyLogoPath,companyOfficialName} from '../lib/company-brand.mjs';
import {buildContractsXlsx,parseContractsXlsx,exportContractRows} from '../lib/client-contracts-xlsx.mjs';
import {validateAISchedule} from '../lib/contract-ai.mjs';
const kinds=['سباكة وكهرباء','تشطيبات عامة','أعمال عظم','أعمال تكييف','أعمال دفاع مدني'];
const n=x=>Number(x||0);
const money=x=>n(x).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,10);
const projectDuration=(start,end)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(start||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(end||'')))return null;
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;
 return Math.round((b-a)/86400000)+1;
};
const durationLabel=(start,end)=>{const days=projectDuration(start,end);return days===null?'حدد تاريخي البداية والنهاية':days+' يوم تقويمي (شامل يوم البداية والنهاية)';};
const documentLabels={contract:'العقد الأساسي',contract_appendix:'ملحق العقد',extra:'مستند الأعمال الإضافية',deduction:'مرفق الخصم',claim:'مرفق المطالبة المالية',receipt:'سند استلام الدفعة',other:'مستند آخر'};
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const blank={company:'',customer:'',project_name:'',project_manager:'',contract_no:'',contract_type:kinds[0],start_date:today(),end_date:today(),signed_date:today(),base_ex_vat:'',vat_rate:'15',customer_phone:'',customer_email:'',customer_vat_no:'',site_location:'',contract_subject:'',client_reference:'',retention_percent:'0',contract_status:'active',notes:''};
const p0={title:'',description:'',amount_ex_vat:'',due_date:today(),progress_percent:'0',milestone_type:'contractual'};
const item0={installment_id:'',item_code:'',description:'',quantity:'1',unit:'بند',unit_price_ex_vat:''};
const a0={kind:'extra',description:'',amount_ex_vat:'',approved_at:today()};
const r0={paid_at:today(),amount_inc_vat:'',method:'تحويل بنكي',reference:'',claim_id:''};
export default function ClientFinance({user,company,profiles,companyList,projectManagers=[]}){
 const [data,setData]=useState({contracts:[],installments:[],installment_items:[],adjustments:[],claims:[],receipts:[],documents:[]});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selected,setSelected]=useState(''),[newOpen,setNewOpen]=useState(false),[contract,setContract]=useState(blank);
 const [tab,setTab]=useState('installments'),[installment,setInstallment]=useState(p0),[item,setItem]=useState(item0),[adjustment,setAdjustment]=useState(a0),[receipt,setReceipt]=useState(r0);
 const [contractEditOpen,setContractEditOpen]=useState(false),[editContract,setEditContract]=useState(blank),[approvalEdit,setApprovalEdit]=useState(null);
 const [search,setSearch]=useState('');
 const [documentLink,setDocumentLink]=useState({document_type:'contract',adjustment_id:'',claim_id:'',receipt_id:''}),[initialContractFile,setInitialContractFile]=useState(null);
 const [importPreview,setImportPreview]=useState(null),[importOpen,setImportOpen]=useState(false);
 const [aiPreview,setAiPreview]=useState(null),[aiBusy,setAiBusy]=useState(false);
 const privileges=(()=>{try{return typeof user?.permissions==='string'?JSON.parse(user.permissions||'{}'):user?.permissions||{}}catch{return {}}})();
 const canEdit=user?.role==='admin'||(user?.role==='finance'&&privileges['client_finance:edit']!==false)||privileges['client_finance:edit']===true;
 const canApprove=user?.role==='admin'||user?.role==='projects_director'||privileges['client_finance:approve']===true;
 const reload=async()=>{setLoading(true);try{const response=await fetch('/api/client-finance',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'تعذر تحميل المطالبات');setData(result);setError('');}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{reload()},[]);
 const userCompanies=(()=>{try{return user?.companies==='*'||!user?.companies?companyList:JSON.parse(user.companies)}catch{return []}})();
 const contracts=data.contracts.filter(c=>(!company||c.company===company)&&[c.customer,c.project_name,c.contract_no,c.project_manager].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=data.contracts.find(c=>c.id===selected&&(!company||c.company===company));
 const overdue=data.installments.filter(i=>i.status==='scheduled'&&i.due_date<today()&&data.contracts.some(c=>c.id===i.contract_id&&(!company||c.company===company))&&!data.claims.some(cl=>cl.installment_id===i.id&&cl.status==='issued'));
 const pendingClaims=data.claims.filter(cl=>cl.status==='ready'&&data.contracts.some(c=>c.id===cl.contract_id&&(!company||c.company===company)));
 const items=(key)=>data[key].filter(x=>x.contract_id===selected);
 const sum=arr=>arr.reduce((a,b)=>a+n(b),0);
 const summary=(c)=>{
  const adjust=data.adjustments.filter(x=>x.contract_id===c.id&&x.approved_at);
  const ex=n(c.base_ex_vat)+sum(adjust.map(x=>(x.kind==='extra'?1:-1)*n(x.amount_ex_vat)));
  const vat=+(ex*n(c.vat_rate)).toFixed(2),all=ex+vat;
  const paid=sum(data.receipts.filter(x=>x.contract_id===c.id).map(x=>x.amount_inc_vat));
  const scheduled=sum(data.installments.filter(x=>x.contract_id===c.id&&x.status!=='cancelled').map(x=>x.amount_ex_vat));
  return {ex,vat,all,paid,remaining:all-paid,scheduled,unscheduled:ex-scheduled};
 };
 const totalReceivable=contracts.reduce((x,c)=>x+summary(c).remaining,0);
 const execute=async(obj,success)=>{
  if(!canEdit)return;setBusy(true);setNotice('');setError('');
  try{const r=await fetch('/api/client-finance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});const x=await r.json();if(!r.ok)throw Error(x.error||'تعذر حفظ البيانات');setNotice(success);await reload();return x;}
  catch(e){setError(e.message);return null}finally{setBusy(false)}
 };
 const uploadDocument=async(file,contractId,link={document_type:'contract'})=>{
 if(!file||!contractId||!canEdit)return false;
 if(file.size>8388608)throw Error('الملف يتجاوز 8 ميجابايت');
 const params=new URLSearchParams({action:'upload',contract_id:contractId,name:file.name,document_type:link.document_type||'contract'});
 for(const key of ['adjustment_id','claim_id','receipt_id'])if(link[key])params.set(key,link[key]);
 const r=await fetch('/api/client-finance?'+params,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
 const j=await r.json();if(!r.ok)throw Error(j.error||'تعذر إرفاق المستند');
 return j;
};
const analyzeContractAI=async(documentId,contractId)=>{
 setAiBusy(true);setError('');setAiPreview(null);
 try{const r=await fetch('/api/client-contract-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contract_id:contractId,document_id:documentId})});const j=await r.json();if(!r.ok)throw Error(j.error||'فشل تحليل العقد');setAiPreview(j);setTab('installments');setNotice('تم استخراج البنود مبدئيًا بواسطة AI؛ راجع التواريخ والمبالغ ثم اعتمدها للحفظ.');}catch(err){setError(err.message);}finally{setAiBusy(false)}
};
const approveAISchedule=async()=>{
 if(!aiPreview||!current)return;
 const problems=validateAISchedule(aiPreview.installments,{remaining:summary(current).unscheduled});
 if(problems.length){setError(problems.join(' | '));return;}
 const result=await execute({action:'approve_ai_schedule',contract_id:current.id,document_id:aiPreview.document_id,installments:aiPreview.installments},'تم حفظ الدفعات المستخرجة وربطها بالعقد، وستُنشأ المطالبات عند تاريخ استحقاقها');
 if(result)setAiPreview(null);
};
const updateAISchedule=(i,key,value)=>setAiPreview(prev=>({...prev,installments:prev.installments.map((p,index)=>index===i?{...p,[key]:value}:p)}));
const updateAIItem=(i,j,key,value)=>setAiPreview(prev=>({...prev,installments:prev.installments.map((p,index)=>index!==i?p:{...p,items:p.items.map((item,x)=>x===j?{...item,[key]:value}:item)})}));
const register=async e=>{e.preventDefault();const result=await execute({action:'create_contract',...contract},'تم تسجيل العقد وربطه بالشركة');if(result){
 setSelected(result.id);setContract(blank);setNewOpen(false);
 if(initialContractFile){try{const document=await uploadDocument(initialContractFile,result.id,{document_type:'contract'});setNotice('تم تسجيل العقد وإرفاق ملف العقد الأصلي');await reload();if(document?.id)await analyzeContractAI(document.id,result.id);}catch(err){setError('العقد محفوظ لكن فشل رفع ملفه: '+err.message);}finally{setInitialContractFile(null)}}
}};
 const saveContract=async e=>{e.preventDefault();if(await execute({action:'update_contract',contract_id:selected,...editContract,vat_rate:Number(editContract.vat_rate)},'تم تحديث معلومات العقد'))setContractEditOpen(false)};
 const addItem=async e=>{e.preventDefault();if(await execute({action:'add_installment_item',contract_id:selected,...item},'تم ربط بند الدفعة بالعقد'))setItem(item0)};
 const addPay=async e=>{e.preventDefault();if(await execute({action:'add_installment',contract_id:selected,...installment},'تم تسجيل دفعة العقد وتوليد المطالبة تلقائيًا إن حل موعدها')){setInstallment(p0)}};
 const addAdjust=async e=>{e.preventDefault();if(await execute({action:'add_adjustment',contract_id:selected,...adjustment},'تم تسجيل ملحق العقد')){setAdjustment(a0)}};
 const recordClientApproval=async e=>{e.preventDefault();if(await execute({action:'record_claim_client_approval',contract_id:selected,...approvalEdit},'تم حفظ تاريخ اعتماد العميل'))setApprovalEdit(null)};
 const addReceipt=async e=>{e.preventDefault();if(await execute({action:'add_receipt',contract_id:selected,...receipt},'تم تسجيل استلام المبلغ وتحديث المستحق المتبقي')){setReceipt(r0)}};
 const upload=async e=>{
 const file=e.target.files?.[0];if(!file||!current||!canEdit)return;
 setBusy(true);setError('');try{const document=await uploadDocument(file,current.id,documentLink);setNotice('تم حفظ المرفق وربطه بالعقد والسجل المحدد');await reload();if(document?.id&&['contract','contract_appendix'].includes(documentLink.document_type))await analyzeContractAI(document.id,current.id);}
 catch(err){setError(err.message)}finally{setBusy(false);e.target.value=''}
 };
 const downloadExcel=(filename,values)=>{
  const xlsx=buildContractsXlsx(values);
  const url=URL.createObjectURL(new Blob([xlsx],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const exportAllContracts=()=>downloadExcel('عقود_العملاء_'+today()+'.xlsx',exportContractRows(contracts,summary));
 const downloadTemplate=()=>downloadExcel('قالب_استيراد_عقود_العملاء.xlsx',[]);
 const handleImportFile=async(e)=>{
  const file=e.target.files?.[0];if(!file)return;
  setError('');setNotice('');
  try{
   if(!/\\.xlsx$/i.test(file.name))throw Error('يُقبل ملف XLSX فقط');
   const parsed=parseContractsXlsx(new Uint8Array(await file.arrayBuffer()));
   const scopeSet=new Set(userCompanies);
   for(const row of parsed.rows)if(!scopeSet.has(row.company))parsed.errors.push('السطر '+row.line+': الشركة خارج صلاحيات المستخدم');
   const already=new Set(data.contracts.map(c=>c.company+'::'+c.contract_no));
   for(const row of parsed.rows)if(already.has(row.company+'::'+row.contract_no))parsed.errors.push('السطر '+row.line+': رقم العقد مسجل مسبقًا');
   setImportPreview({...parsed,filename:file.name});
  }catch(err){setImportPreview(null);setError(err.message);}
  e.target.value='';
 };
 const saveBulk=async()=>{
  if(!importPreview?.rows.length||importPreview.errors.length)return;
  const r=await execute({action:'bulk_import_contracts',contracts:importPreview.rows},'اكتمل استيراد '+importPreview.rows.length+' عقد بنجاح');
  if(r){setImportPreview(null);setImportOpen(false);}
 };
 const printFinanceRegister=(kind,entry=null)=>{
  if(!current)return;
  const corporate=profiles.find(x=>x.module==='company_profiles'&&x.company===current.company)?.data||{};
  const logo=companyLogoPath(current.company,profiles);
  const labels={contract:'سجل العقد وبيانات المشروع',installments:'جدول الدفعات وبنودها',adjustments:'سجل الأعمال الإضافية والخصومات',receipts:'سجل الدفعات المستلمة',documents:'سجل مرفقات العقود',claims:'كشف المطالبات المالية'};
  const rowsByType={
   contract:[['رقم العقد',current.contract_no],['اسم العميل',current.customer],['اسم المشروع',current.project_name],['نوع العقد',current.contract_type],['مدير المشروع',current.project_manager],['تاريخ توقيع العقد',current.signed_date],['بداية المشروع',current.start_date],['نهاية المشروع',current.end_date],['مدة تنفيذ المشروع',durationLabel(current.start_date,current.end_date)],['قيمة العقد قبل الضريبة',money(summary(current).ex)+' ر.س'],['قيمة العقد شامل الضريبة',money(summary(current).all)+' ر.س'],['المدفوع شامل الضريبة',money(summary(current).paid)+' ر.س'],['المتبقي شامل الضريبة',money(summary(current).remaining)+' ر.س']],
   installments:items('installments').map(x=>[x.title,x.due_date+' | إنجاز '+n(x.progress_percent)+'% | '+money(x.amount_ex_vat)+' ر.س قبل الضريبة']),
   adjustments:items('adjustments').map(x=>[x.kind==='deduction'?'خصم: '+x.description:'أعمال إضافية: '+x.description,money(x.amount_ex_vat)+' ر.س | '+(x.approved_at?'اعتمد بتاريخ '+x.approved_at:'قيد الاعتماد')]),
   receipts:items('receipts').map(x=>[x.paid_at+' | '+x.reference,money(x.amount_inc_vat)+' ر.س | '+x.method]),
   documents:items('documents').map(x=>[documentLabels[x.document_type]||'مرفق عام',x.name+' | '+String(x.created_at||'').slice(0,10)]),
   claims:items('claims').map(x=>[x.claim_no,(x.submitted_at||x.raised_at||'—')+' | '+money(x.amount_inc_vat)+' ر.س'])
  };
  let rows=entry?
   kind==='installments'?[['الدفعة',entry.title],['تاريخ الاستحقاق',entry.due_date],['نسبة الإنجاز',n(entry.progress_percent)+'%'],['القيمة قبل الضريبة',money(entry.amount_ex_vat)+' ر.س'],...data.installment_items.filter(x=>x.installment_id===entry.id).map(x=>['بند '+x.item_code,x.description+' | '+x.quantity+' '+x.unit+' × '+money(x.unit_price_ex_vat)])]:
   kind==='adjustments'?[['نوع الملحق',entry.kind==='deduction'?'خصم من العقد':'أعمال إضافية'],['الوصف',entry.description],['القيمة قبل الضريبة',money(entry.amount_ex_vat)+' ر.س'],['تاريخ الاعتماد',entry.approved_at||'غير معتمد']]:
   kind==='receipts'?[['تاريخ استلام الدفعة',entry.paid_at],['المبلغ شامل الضريبة',money(entry.amount_inc_vat)+' ر.س'],['طريقة الاستلام',entry.method],['مرجع العملية',entry.reference]]:
   kind==='documents'?[['نوع المستند',documentLabels[entry.document_type]||'مرفق'],['اسم الملف',entry.name],['تاريخ الرفع',String(entry.created_at||'').slice(0,10)],['رفع بواسطة',entry.uploaded_by]]:(rowsByType[kind]||[]):(rowsByType[kind]||[]);
  const name=labels[kind]||'سجل مالي';
  const brand=companyOfficialName(current.company,profiles);
  const image=logo?'<img alt="شعار الشركة" src="'+esc(new URL(logo,location.origin).href)+'"/>':'';
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(name)} - ${esc(current.contract_no)}</title><style>
   @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:12px Tahoma,Arial,sans-serif;color:#20231e}
   header{display:grid;grid-template-columns:1.4fr 105px 1fr;gap:10px;align-items:center;padding:12px 0;border-top:1px solid #d7c99f}
   header img{width:100px;height:80px;object-fit:contain}header .brand{text-align:center;border-bottom:2px solid #c4a558;padding:12px 0;font-weight:bold;font-size:16px}header .license{text-align:center;border-bottom:2px solid #c4a558;padding:12px 0}
   h1{text-align:center;margin:15px 0;font-size:20px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #343434;padding:11px 9px;text-align:right;overflow-wrap:anywhere}thead th,.heading{background:#151515;color:#e0bb62;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}tbody tr:nth-child(even){background:#f8f4e9}th:first-child{width:37%}
   .meta{border:1px solid #c7ae72;padding:10px;margin:12px 0;display:flex;justify-content:space-between;gap:15px}
   .sign{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #444}.sign>div{padding:12px;border-left:1px solid #444;min-height:110px}.sign>div:last-child{border-left:0}.sign p{margin-top:25px;border-bottom:1px dotted #aaa}
   footer{margin-top:15px;border-top:3px solid #b99b53;padding:10px;text-align:center;font-size:10px}
   button{background:#b89449;padding:9px 15px;border:0;margin-top:15px;cursor:pointer}@media print{button{display:none}tr,.sign{break-inside:avoid}}
   </style></head><body><header><div class="brand">${esc(brand)}</div>${image}<div class="license">السجل التجاري: ${esc(corporate.commercial_registration||'—')}</div></header>
   <h1>${esc(name)}</h1><div class="meta"><span>العميل: ${esc(current.customer)}</span><span>المشروع: ${esc(current.project_name)}</span><span>رقم العقد: ${esc(current.contract_no)}</span></div>
   <table><thead><tr><th>البيان / Description</th><th>القيمة / Details</th></tr></thead><tbody>${rows.length?rows.map(([label,value])=>'<tr><th>'+esc(label)+'</th><td>'+esc(value)+'</td></tr>').join(''):'<tr><td colspan="2">لا توجد سجلات مدخلة</td></tr>'}</tbody></table>
   <h3 class="heading" style="text-align:center;padding:9px;margin:22px 0 0">الاعتماد والتوقيع / APPROVAL & SIGNATURE</h3>
   <div class="sign"><div><b>الإعداد</b><p>الاسم:</p><p>التوقيع:</p></div><div><b>مدير المشروع</b><p>${esc(current.project_manager)}</p><p>التوقيع:</p></div><div><b>المراجعة المالية / العميل</b><p>الاسم:</p><p>التوقيع:</p></div></div>
   <footer>${esc(brand)} | ${esc(corporate.phone||corporate.mobile||'')} | ${esc(corporate.email||'')} | طباعة ${esc(today())}</footer><button onclick="window.print()">طباعة / حفظ PDF</button></body></html>`;
  const win=window.open('','_blank');if(!win){setError('يرجى السماح بفتح نافذة الطباعة');return;}win.document.write(html);win.document.close();
 };
 const printDoc=(kind,cl)=>{
  if(!current)return;
  const amount=cl?n(cl.amount_ex_vat):summary(current).ex,vat=cl?n(cl.vat_amount):summary(current).vat,gross=amount+vat;
  const related=cl?data.installments.find(i=>i.id===cl.installment_id):null;
  const itemized=related?data.installment_items.filter(i=>i.installment_id===related.id):[];
  const received=cl?data.receipts.filter(x=>x.claim_id===cl.id):data.receipts.filter(x=>x.contract_id===current.id);
  const receivedTotal=sum(received.map(x=>x.amount_inc_vat));
  const logosrc=companyLogoPath(current.company,profiles)||'';
  const corporate=profiles.find(x=>x.module==='company_profiles'&&x.company===current.company)?.data||{};
  const officialEnglish=corporate.english_name||(current.company==='مسكن الكيان'?'MASKAN ALKAYAN CONTRACTING CO.':current.company);
  const paidContract=summary(current).paid;
  const issuer=cl?.created_by||user?.email||'—';
  const docDate=cl?.submitted_at||cl?.issued_at?.slice(0,10)||cl?.raised_at||today();
  const documentTitle=kind==='certificate'?'مستخلص أعمال':'مطالبة مالية';
  const documentEn=kind==='certificate'?'Payment Certificate':'Payment Claim';
  const baseLines=itemized.map(x=>({code:x.item_code,desc:x.description+' — '+x.quantity+' '+x.unit+' × '+money(x.unit_price_ex_vat),percent:amount>0?100*n(x.amount_ex_vat)/amount:0,amount:n(x.amount_ex_vat)}));
  const assigned=baseLines.reduce((total,x)=>total+x.amount,0);
  const remainder=Math.max(0,Math.round((amount-assigned)*100)/100);
  const rows=related?(baseLines.length?[...baseLines,...(remainder>0?[{code:'—',desc:'باقي الدفعة — '+related.title,percent:amount>0?100*remainder/amount:0,amount:remainder}]:[])]:[{code:'1',desc:related.title+' — '+(related.description||'حسب جدول الدفعات'),percent:summary(current).ex>0?100*amount/summary(current).ex:0,amount}])
    :[{code:'1',desc:current.contract_type+' — '+current.project_name,percent:100,amount}];
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(documentTitle)} - ${esc(current.contract_no)}</title><style>
 @page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#181818;background:white;font-size:11px;line-height:1.65}header{display:grid;grid-template-columns:1.5fr 105px 1fr;gap:12px;align-items:center;border-top:1px solid #ddd;padding:10px 0 12px;direction:rtl}header .brand{text-align:center;border-bottom:2px solid #b79b4c}header .brand strong{display:block;font-size:16px}header .brand small{font:700 10px Arial,sans-serif}header img{width:105px;height:90px;object-fit:contain}header .reg{text-align:center;border-bottom:2px solid #b79b4c;padding:10px 0}.party{display:flex;justify-content:space-between;margin:10px 0;font-weight:700}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0}th,td{border:1px solid #222;padding:8px;text-align:center;word-break:break-word}th{font-size:10px}thead th,.dark{background:#101010;color:#d8b24d;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}.document-name{background:#fff!important;color:#171717!important;font-size:18px}.document-name span{display:block;font-size:12px;color:#a88533;font-weight:700}.white{background:white!important;color:#222!important}.meta{font-size:10px}.meta th{width:21%}.summary{width:68%;margin-right:auto}.summary td:nth-child(1){font-weight:bold}.summary tr:last-child{background:#eee5d2;font-weight:bold}.approval-title{text-align:center;border:1px solid #222;background:#101010;color:#dbb959;padding:7px;font-weight:bold;margin-top:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.approvals{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #222;border-top:0}.approvals>div{border-left:1px solid #222;padding:8px;min-height:120px}.approvals>div:last-child{border-left:0}.approvals b{display:block;border-bottom:1px solid #666;padding-bottom:7px;text-align:center}.approvals p{border-bottom:1px dotted #bbb;margin:14px 0}.footer{margin-top:18px;padding:10px;border:1px solid #aa8c40;border-top:3px solid #a88b3e;text-align:center}.notes{color:#555;font-size:10px}button{background:#b89449;border:0;padding:10px 18px;cursor:pointer}@media print{button{display:none}table tr,.approvals{break-inside:avoid}}
 </style></head><body>
 <header><div class="brand"><strong>${esc(companyOfficialName(current.company,profiles))}</strong><small>${esc(officialEnglish)}</small></div>${logosrc?'<img src="'+esc(new URL(logosrc,location.origin).href)+'" alt="الشعار">':'<div style="font-weight:bold;text-align:center;color:#a88b3e">'+esc(companyOfficialName(current.company,profiles))+'</div>'}<div class="reg">السجل التجاري: ${esc(corporate.commercial_registration||'—')}</div></header>
 <div class="party"><span>السادة: ${esc(current.customer)} المحترمون</span><span>رقم العقد: ${esc(current.contract_no)}</span></div>
 <table><thead><tr><th>رقم المستند #</th><th>التاريخ Date</th><th>النوع Type</th><th colspan="2" class="document-name">${documentTitle}<span>${documentEn}</span></th><th>القيمة شامل الضريبة</th></tr></thead><tbody><tr><td>${esc(cl?.claim_no||current.contract_no)}</td><td>${esc(docDate)}</td><td>${esc(current.contract_type)}</td><td colspan="2">${esc(current.project_name)}</td><td>${money(gross)} ر.س</td></tr></tbody></table>
 <table><thead><tr><th>اسم العميل Customer</th><th colspan="2">اسم المشروع Project Name</th><th colspan="2">رقم العقد Project / Contract No.</th></tr></thead><tbody><tr><td>${esc(current.customer)}</td><td colspan="2">${esc(current.project_name)}</td><td colspan="2">${esc(current.contract_no)}</td></tr></tbody></table>
 <table class="meta"><tbody><tr><th>مدير المشروع</th><td>${esc(current.project_manager)}</td><th>بداية المشروع</th><td>${esc(current.start_date)}</td><th>نهاية المشروع</th><td>${esc(current.end_date)}</td></tr><tr><th>توقيع العقد</th><td>${esc(current.signed_date)}</td><th>مدة التنفيذ</th><td colspan="3">${esc(durationLabel(current.start_date,current.end_date))}</td></tr><tr><th>تاريخ رفع المطالبة</th><td>${esc(cl?.submitted_at||'لم تُرفع بعد')}</td><th>تاريخ استلام الدفعة</th><td>${esc(received.map(x=>x.paid_at).join('، ')||'لم يتم')}</td><th>مُصدر المستند</th><td>${esc(issuer)}</td></tr><tr><th>السجل التجاري</th><td>${esc(corporate.commercial_registration||'—')}</td><th>الرقم الضريبي</th><td>${esc(corporate.vat_registration||'—')}</td><th>رقم العميل الضريبي</th><td>${esc(current.customer_vat_no||'—')}</td></tr></tbody></table>
 <table><thead><tr><th>#</th><th>رقم البند Item Code</th><th>وصف البند / Claim Description</th><th>نسبة المطالبة Claim %</th><th>قبل الضريبة</th></tr></thead><tbody>${rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.code)+'</td><td>'+esc(r.desc)+'</td><td>'+r.percent.toFixed(2)+'%</td><td>'+money(r.amount)+'</td></tr>').join('')}</tbody></table>
 <table class="summary"><tbody><tr><td>قيمة المطالبة قبل الضريبة / Sub Total</td><td>${money(amount)} ر.س</td></tr><tr><td>ضريبة القيمة المضافة ${money(n(current.vat_rate)*100)}%</td><td>${money(vat)} ر.س</td></tr><tr><td>الإجمالي شامل الضريبة / Total</td><td>${money(gross)} ر.س</td></tr><tr><td>المدفوع لهذه المطالبة</td><td>${money(receivedTotal)} ر.س</td></tr><tr><td>المتبقي للمطالبة</td><td>${money(gross-receivedTotal)} ر.س</td></tr></tbody></table>
 <div class="approval-title">الاعتماد والتوقيع / APPROVAL & SIGNATURE</div><div class="approvals"><div><b>إعداد ومراجعة المطالبة</b><p>الاسم: ${esc(issuer)}</p><p>التوقيع:</p><p>التاريخ:</p></div><div><b>مدير المشروع</b><p>الاسم: ${esc(current.project_manager)}</p><p>التوقيع:</p><p>الختم:</p></div><div><b>اعتماد العميل</b><p>الاسم:</p><p>التوقيع:</p><p>الختم:</p></div></div>
 <div class="footer">
 <strong>يرجى سداد قيمة المطالبة وفق العقد وتحويل المستحق إلى بيانات الحساب الرسمي للشركة:</strong>
 <div style="margin:8px auto;border:1px solid #d5bf8e;padding:9px">
 اسم البنك: ${esc(corporate.bank_name||'غير مسجل في هوية الشركة')} ·
 الآيبان: <b dir="ltr">${esc(corporate.iban||'غير مسجل')}</b> ·
 رقم الحساب: ${esc(corporate.bank_account||'غير مسجل')}
 </div>
 <div>هاتف: ${esc(corporate.phone||corporate.mobile||'—')} · بريد: ${esc(corporate.email||'—')} · العنوان: ${esc(corporate.address||corporate.city||'—')}</div>
 <div class="notes">مستند صادر من نظام مسكن الكيان — ${esc(current.company)} — تاريخ الطباعة ${esc(today())}. هذه المطالبة ليست فاتورة ضريبية إلا إذا أُصدرت وفق المتطلبات النظامية.</div></div><button onclick="window.print()">طباعة / حفظ PDF</button></body></html>`;
  const w=window.open('','_blank');if(!w){setError('اسمح بالنوافذ المنبثقة للطباعة');return;}w.document.write(html);w.document.close();
 };
 return <section className="client-finance" dir="rtl">
  <div className="cf-title"><div><span className="cf-kicker">إدارة العقود والذمم المدينة</span><h2>المطالبات المالية واستحقاقات العملاء</h2><p>سجل مستقل لكل شركة، مع احتساب ضريبة القيمة المضافة والمستحقات تلقائيًا</p></div><div className="cf-actions" style={{display:'flex',flexWrap:'wrap',gap:8}}>
  <button type="button" onClick={downloadTemplate}>تنزيل قالب Excel</button>
  <button type="button" onClick={exportAllContracts}>Export Excel — تصدير العقود</button>
  {canEdit&&<button type="button" onClick={()=>setImportOpen(true)}>Load Excel — استيراد العقود</button>}
  {canEdit&&<button className="cf-primary" onClick={()=>{setContract({...blank,company:company||userCompanies?.[0]||''});setNewOpen(true)}}>+ عقد عميل جديد</button>}
 </div></div>
  {error&&<div className="cf-alert">{error}<button onClick={()=>setError('')}>إغلاق</button></div>}{notice&&<div className="cf-ok">{notice}</div>}
  <div className="cf-brief"><div><small>إجمالي المستحق من العملاء</small><strong>{money(totalReceivable)} ر.س</strong></div><div><small>مطالبات جاهزة للإصدار</small><strong>{pendingClaims.length}</strong></div><div><small>دفعات متأخرة دون إصدار</small><strong>{overdue.length}</strong></div><div><small>مستخدم إصدار المطالبات</small><strong>{user?.email||'—'}</strong></div></div>
  <div className="cf-controls"><label>البحث في العقود<input type="search" placeholder="اسم العميل أو المشروع أو رقم العقد" value={search} onChange={e=>setSearch(e.target.value)}/></label><button onClick={reload} disabled={loading}>تحديث المستحقات</button><span>{contracts.length} عقد</span></div>
  {loading&&<p>جارٍ تحميل بيانات العملاء والعقود…</p>}
  <div className="cf-layout"><div className="cf-contracts">{contracts.map(c=>{const b=summary(c);return <button key={c.id} className={'cf-contract '+(selected===c.id?'selected':'')} onClick={()=>{setSelected(c.id);setTab('installments');setAiPreview(null)}}><strong>{c.project_name}</strong><small>{c.company} · {c.customer}</small><small><b>رقم العقد: {c.contract_no}</b> · {c.project_manager}</small><span>المتبقي: <b>{money(b.remaining)} ر.س</b></span></button>})}{!loading&&!contracts.length&&<div className="cf-empty">لا توجد عقود ضمن نطاق الشركة المحددة. يمكنك إضافة عقد جديد.</div>}</div>
  <div className="cf-detail">{current?<><div className="cf-head"><div><h3>{current.project_name}</h3><p>{current.customer} | <strong>رقم العقد: {current.contract_no}</strong> | {current.contract_type}</p><p>مدير المشروع: <b>{current.project_manager}</b> · تاريخ التوقيع {current.signed_date} · من {current.start_date} إلى {current.end_date} · <b>مدة التنفيذ: {durationLabel(current.start_date,current.end_date)}</b></p><p>الموقع: {current.site_location||'غير محدد'} · هاتف العميل: {current.customer_phone||'—'}</p><p>بريد العميل: {current.customer_email||'—'} · الرقم الضريبي: {current.customer_vat_no||'—'}</p></div><div className="cf-actions">{canEdit&&<button onClick={()=>{setEditContract({...current,vat_rate:String(n(current.vat_rate)*100)});setContractEditOpen(true)}}>تعديل بيانات العقد</button>}<button onClick={()=>printFinanceRegister('contract')}>طباعة بيانات العقد</button>{canEdit&&<button onClick={()=>{setDocumentLink({document_type:'contract',adjustment_id:'',claim_id:'',receipt_id:''});setTab('documents')}}>إرفاق العقد</button>}</div></div>
  <div className="cf-stat-grid">{[['قيمة العقد قبل الضريبة',summary(current).ex],['ضريبة القيمة المضافة',summary(current).vat],['العقد شامل الضريبة',summary(current).all],['المدفوع من العملاء',summary(current).paid],['المتبقي شامل الضريبة',summary(current).remaining],['نسبة حجز الضمان',n(current.retention_percent)]].map(([label,value])=><div key={label}><small>{label}</small><strong>{money(value)}</strong><small>ريال سعودي</small></div>)}</div>
  <div className="cf-tabs">{[['installments','بنود الدفعات'],['claims','المطالبات والمستخلصات'],['receipts','الدفعات المستلمة'],['adjustments','الأعمال الإضافية والخصومات'],['documents','العقد والمرفقات']].map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{t}</button>)}</div>
  {tab==='installments'&&<>{aiBusy&&<div className="cf-preview"><strong>يجري تحليل بنود العقد بواسطة الذكاء الاصطناعي…</strong><p>لا تُنشأ دفعات أو مطالبات حتى تنتهي المراجعة والاعتماد.</p></div>}
  {aiPreview&&aiPreview.contract_id===selected&&<div className="cf-ai-review">
   <h3>مراجعة بنود الدفعات المستخرجة من العقد – AI</h3>
   <p>تم استخلاص {aiPreview.installments.length} دفعة من المرفق. هذه مقترحات غير معتمدة؛ راجع المبلغ والموعد لكل دفعة قبل حفظها.</p>
   {aiPreview.document_summary&&<p>{aiPreview.document_summary}</p>}
   {aiPreview.warnings?.length>0&&<div className="cf-alert"><b>ملاحظات التحليل:</b><ul>{aiPreview.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
   {aiPreview.installments.map((p,i)=><div key={i} className="cf-ai-installment">
    <div className="cf-form">
     <label>وصف الدفعة<input value={p.title} onChange={e=>updateAISchedule(i,'title',e.target.value)}/></label>
     <label>تاريخ الاستحقاق الفعلي<input type="date" value={p.due_date||''} onChange={e=>updateAISchedule(i,'due_date',e.target.value)}/></label>
     <label>المبلغ قبل الضريبة<input type="number" min=".01" step=".01" value={p.amount_ex_vat} onChange={e=>updateAISchedule(i,'amount_ex_vat',e.target.value)}/></label>
     <label className="cf-full">وصف الاستحقاق<input value={p.description||''} onChange={e=>updateAISchedule(i,'description',e.target.value)}/></label>
    </div>
    {p.source&&<p>مرجع الاستخراج: {p.source}</p>}
    {p.items.map((it,j)=><div key={j} className="cf-form">
      <label>رمز البند<input value={it.item_code} onChange={e=>updateAIItem(i,j,'item_code',e.target.value)}/></label>
      <label>وصف البند<input value={it.description} onChange={e=>updateAIItem(i,j,'description',e.target.value)}/></label>
      <label>الكمية<input type="number" min=".001" step=".001" value={it.quantity} onChange={e=>updateAIItem(i,j,'quantity',e.target.value)}/></label>
      <label>الوحدة<input value={it.unit} onChange={e=>updateAIItem(i,j,'unit',e.target.value)}/></label>
      <label>سعر الوحدة<input type="number" min="0" step=".01" value={it.unit_price_ex_vat} onChange={e=>updateAIItem(i,j,'unit_price_ex_vat',e.target.value)}/></label>
    </div>)}
   </div>)}
   <p>إجمالي الدفعات المقترحة: <b>{money(aiPreview.installments.reduce((sum,p)=>sum+n(p.amount_ex_vat),0))} ر.س</b> قبل الضريبة · المتبقي غير المجدول: <b>{money(summary(current).unscheduled)} ر.س</b></p>
   {validateAISchedule(aiPreview.installments,{remaining:summary(current).unscheduled}).length>0&&<div className="cf-alert">{validateAISchedule(aiPreview.installments,{remaining:summary(current).unscheduled}).join(' | ')}</div>}
   <button type="button" className="cf-primary" disabled={busy||aiBusy||validateAISchedule(aiPreview.installments,{remaining:summary(current).unscheduled}).length>0} onClick={approveAISchedule}>اعتماد وحفظ الدفعات المستخرجة في العقد</button>
   <button type="button" onClick={()=>setAiPreview(null)}>إلغاء التحليل</button>
  </div>}
  <p>جدول الاستحقاقات — المتبقي لتوزيع الدفعات قبل الضريبة: <b>{money(summary(current).unscheduled)} ر.س</b> <button type="button" onClick={()=>printFinanceRegister('installments')}>طباعة جدول الدفعات</button></p><div className="cf-table"><table><thead><tr><th>الدفعة والبنود</th><th>تاريخ الاستحقاق</th><th>نسبة الإنجاز</th><th>قبل الضريبة</th><th>شامل الضريبة</th><th>توزيع البنود</th><th>الطباعة</th></tr></thead><tbody>{items('installments').map(x=><tr key={x.id}><td><strong>{x.title}</strong><small>{x.description}</small>{data.installment_items.filter(i=>i.installment_id===x.id).map(i=><small key={i.id}>• {i.item_code}: {i.description} · {i.quantity} {i.unit} × {money(i.unit_price_ex_vat)} = {money(i.amount_ex_vat)} ر.س</small>)}</td><td>{x.due_date}</td><td>{n(x.progress_percent).toFixed(2)}%</td><td>{money(x.amount_ex_vat)}</td><td>{money(n(x.amount_ex_vat)*(1+n(current.vat_rate)))}</td><td>{money(n(x.amount_ex_vat)-sum(data.installment_items.filter(i=>i.installment_id===x.id).map(i=>i.amount_ex_vat)))} ر.س غير موزعة</td><td><button type="button" onClick={()=>printFinanceRegister('installments',x)}>طباعة الدفعة</button></td></tr>)}</tbody></table></div>{canEdit&&<form className="cf-form" onSubmit={addPay}><h4>إضافة دفعة تعاقدية</h4><label>اسم الدفعة<input required value={installment.title} onChange={e=>setInstallment({...installment,title:e.target.value})}/></label><label>تاريخ الاستحقاق<input required type="date" value={installment.due_date} onChange={e=>setInstallment({...installment,due_date:e.target.value})}/></label><label>المبلغ قبل الضريبة<input required min="0.01" step=".01" type="number" value={installment.amount_ex_vat} onChange={e=>setInstallment({...installment,amount_ex_vat:e.target.value})}/></label><label>نسبة إنجاز الدفعة %<input type="number" min="0" max="100" step=".01" value={installment.progress_percent} onChange={e=>setInstallment({...installment,progress_percent:e.target.value})}/></label><label className="cf-full">وصف الاستحقاق<input value={installment.description} onChange={e=>setInstallment({...installment,description:e.target.value})}/></label><button className="cf-primary" disabled={busy}>حفظ الدفعة</button></form>}
  {canEdit&&items('installments').length>0&&<form className="cf-form" onSubmit={addItem}><h4>تفاصيل بنود الدفعة / BOQ</h4>
    <label>الدفعة<select required value={item.installment_id} onChange={e=>setItem({...item,installment_id:e.target.value})}><option value="">اختر الدفعة</option>{items('installments').filter(x=>x.status==='scheduled'&&!items('claims').some(cl=>cl.installment_id===x.id&&cl.status==='issued')).map(x=><option key={x.id} value={x.id}>{x.title} — {money(x.amount_ex_vat)} ر.س</option>)}</select></label>
    <label>رمز البند<input required value={item.item_code} onChange={e=>setItem({...item,item_code:e.target.value})}/></label>
    <label>الكمية<input required type="number" min=".001" step=".001" value={item.quantity} onChange={e=>setItem({...item,quantity:e.target.value})}/></label>
    <label>الوحدة<input required value={item.unit} onChange={e=>setItem({...item,unit:e.target.value})}/></label>
    <label>سعر الوحدة قبل الضريبة<input required type="number" min="0" step=".01" value={item.unit_price_ex_vat} onChange={e=>setItem({...item,unit_price_ex_vat:e.target.value})}/></label>
    <label className="cf-full">وصف الأعمال<input required value={item.description} onChange={e=>setItem({...item,description:e.target.value})}/></label>
    <div className="cf-full cf-preview">إجمالي البند: <b>{money(n(item.quantity)*n(item.unit_price_ex_vat))} ر.س</b> قبل الضريبة</div>
    <button className="cf-primary" disabled={busy}>إضافة بند إلى الدفعة</button>
  </form>}</>}
  {tab==='claims'&&<><p>تُنشأ المطالبات تلقائيًا عند حلول الاستحقاق وتصدر بحساب المستخدم المخوّل. <button type="button" onClick={()=>printFinanceRegister('claims')}>طباعة سجل المطالبات</button></p><div className="cf-table"><table><thead><tr><th>رقم المطالبة</th><th>تاريخ الاستحقاق</th><th>تاريخ رفع المطالبة</th><th>اعتماد العميل</th><th>إجمالي شامل الضريبة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{items('claims').map(cl=><tr key={cl.id}><td>{cl.claim_no}</td><td>{data.installments.find(x=>x.id===cl.installment_id)?.due_date||'—'}</td><td>{cl.submitted_at||'لم تُرفع بعد'}</td><td>{cl.client_approved_at||'لم يعتمد'}</td><td>{money(cl.amount_inc_vat)}</td><td>{cl.status==='ready'?'جاهزة للإصدار':cl.status==='issued'?'صادرة':'ملغاة'}</td><td className="cf-actions">{canEdit&&cl.status==='ready'&&<button disabled={busy} onClick={()=>execute({action:'issue_claim',contract_id:selected,claim_id:cl.id},'تم إصدار المطالبة رسميًا')}>إصدار</button>}<button onClick={()=>printDoc('claim',cl)}>المطالبة PDF</button><button onClick={()=>printDoc('certificate',cl)}>المستخلص PDF</button>{canEdit&&cl.status==='issued'&&<button onClick={()=>setApprovalEdit({claim_id:cl.id,client_approved_at:today(),client_comment:cl.client_comment||''})}>اعتماد العميل</button>}</td></tr>)}</tbody></table></div>{approvalEdit&&canEdit&&<form className="cf-form" onSubmit={recordClientApproval}><h4>توثيق اعتماد العميل للمطالبة</h4><label>تاريخ اعتماد العميل<input required type="date" value={approvalEdit.client_approved_at} onChange={e=>setApprovalEdit({...approvalEdit,client_approved_at:e.target.value})}/></label><label className="cf-full">ملاحظات العميل<input value={approvalEdit.client_comment} onChange={e=>setApprovalEdit({...approvalEdit,client_comment:e.target.value})}/></label><button className="cf-primary" disabled={busy}>حفظ تاريخ اعتماد العميل</button><button type="button" onClick={()=>setApprovalEdit(null)}>إلغاء</button></form>}</>}
  {tab==='receipts'&&<><button type="button" onClick={()=>printFinanceRegister('receipts')}>طباعة سجل الدفعات المستلمة</button><div className="cf-table"><table><thead><tr><th>تاريخ الاستلام</th><th>المبلغ شامل الضريبة</th><th>طريقة الدفع</th><th>المرجع</th><th>طباعة</th></tr></thead><tbody>{items('receipts').map(x=><tr key={x.id}><td>{x.paid_at}</td><td>{money(x.amount_inc_vat)}</td><td>{x.method}</td><td>{x.reference}</td><td><button type="button" onClick={()=>printFinanceRegister('receipts',x)}>طباعة سند الدفعة</button></td></tr>)}</tbody></table></div>{canEdit&&<form className="cf-form" onSubmit={addReceipt}><h4>تسجيل استلام دفعة</h4><label>تاريخ استلام الدفعة<input type="date" required value={receipt.paid_at} onChange={e=>setReceipt({...receipt,paid_at:e.target.value})}/></label><label>المبلغ شامل الضريبة<input type="number" min=".01" step=".01" required value={receipt.amount_inc_vat} onChange={e=>setReceipt({...receipt,amount_inc_vat:e.target.value})}/></label><label>طريقة الصرف<select value={receipt.method} onChange={e=>setReceipt({...receipt,method:e.target.value})}><option>تحويل بنكي</option><option>نقدًا</option><option>شيك</option></select></label><label>مرجع الدفع<input value={receipt.reference} onChange={e=>setReceipt({...receipt,reference:e.target.value})}/></label><label className="cf-full">المطالبة المرتبطة<select value={receipt.claim_id} onChange={e=>setReceipt({...receipt,claim_id:e.target.value})}><option value="">دفعة عامة للعقد</option>{items('claims').filter(x=>x.status==='issued').map(x=><option key={x.id} value={x.id}>{x.claim_no}</option>)}</select></label><button className="cf-primary" disabled={busy}>تسجيل استلام المبلغ</button></form>}</>}
  {tab==='adjustments'&&<><button type="button" onClick={()=>printFinanceRegister('adjustments')}>طباعة سجل الخصومات والأعمال الإضافية</button><div className="cf-table"><table><thead><tr><th>البند</th><th>البيان</th><th>المبلغ قبل الضريبة</th><th>الاعتماد</th><th>طباعة</th></tr></thead><tbody>{items('adjustments').map(x=><tr key={x.id}><td>{x.kind==='extra'?'أعمال إضافية':'خصم من العقد'}</td><td>{x.description}</td><td>{money(x.amount_ex_vat)}</td><td>{x.approved_at||'غير معتمد'}{!x.approved_at&&canApprove&&<button disabled={busy} onClick={()=>execute({action:'approve_adjustment',contract_id:selected,adjustment_id:x.id},'تم اعتماد ملحق العقد')}>اعتماد الملحق</button>}</td><td><button type="button" onClick={()=>printFinanceRegister('adjustments',x)}>طباعة الملحق</button>{canEdit&&<button type="button" onClick={()=>{setDocumentLink({document_type:x.kind,adjustment_id:x.id,claim_id:'',receipt_id:''});setTab('documents')}}>إرفاق مستند الخصم/الملحق</button>}</td></tr>)}</tbody></table></div>{canEdit&&<form className="cf-form" onSubmit={addAdjust}><h4>إضافة ملحق العقد / خصم</h4><label>نوع الحركة<select value={adjustment.kind} onChange={e=>setAdjustment({...adjustment,kind:e.target.value})}><option value="extra">أعمال إضافية</option><option value="deduction">خصم من العقد</option></select></label><label>المبلغ قبل الضريبة<input required type="number" min=".01" step=".01" value={adjustment.amount_ex_vat} onChange={e=>setAdjustment({...adjustment,amount_ex_vat:e.target.value})}/></label><label>تاريخ اعتماد الملحق<input type="date" value={adjustment.approved_at} onChange={e=>setAdjustment({...adjustment,approved_at:e.target.value})}/></label><label className="cf-full">وصف الأعمال<input required value={adjustment.description} onChange={e=>setAdjustment({...adjustment,description:e.target.value})}/></label><button className="cf-primary" disabled={busy}>حفظ الملحق</button></form>}</>}
  {tab==='documents'&&<>
   <div className="cf-head"><div><h4>مرفقات العقود والخصومات والمطالبات</h4><p>يمكن تحميل العقد الأساسي أو ملحقه وربط مرفقات الخصومات والمطالبات بمستنداتها مباشرة (PDF أو JPG/PNG حتى 8 ميجابايت).</p></div><button type="button" onClick={()=>printFinanceRegister('documents')}>طباعة سجل المرفقات</button></div>
   {canEdit&&<div className="cf-form">
    <label>نوع المرفق<select value={documentLink.document_type} onChange={e=>setDocumentLink({document_type:e.target.value,adjustment_id:'',claim_id:'',receipt_id:''})}>{Object.entries(documentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {['extra','deduction'].includes(documentLink.document_type)&&<label>الملحق أو الخصم المرتبط<select required value={documentLink.adjustment_id} onChange={e=>setDocumentLink({...documentLink,adjustment_id:e.target.value})}><option value="">اختر الملحق</option>{items('adjustments').filter(a=>a.kind===documentLink.document_type).map(a=><option key={a.id} value={a.id}>{a.description} · {money(a.amount_ex_vat)} ر.س</option>)}</select></label>}
    {documentLink.document_type==='claim'&&<label>المطالبة المرتبطة<select required value={documentLink.claim_id} onChange={e=>setDocumentLink({...documentLink,claim_id:e.target.value})}><option value="">اختر المطالبة</option>{items('claims').map(cl=><option key={cl.id} value={cl.id}>{cl.claim_no}</option>)}</select></label>}
    {documentLink.document_type==='receipt'&&<label>الدفعة المستلمة<select required value={documentLink.receipt_id} onChange={e=>setDocumentLink({...documentLink,receipt_id:e.target.value})}><option value="">اختر الدفعة</option>{items('receipts').map(r=><option key={r.id} value={r.id}>{r.paid_at} · {money(r.amount_inc_vat)} ر.س</option>)}</select></label>}
    <label className="cf-full">إرفاق الملف<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy||(['extra','deduction'].includes(documentLink.document_type)&&!documentLink.adjustment_id)||(documentLink.document_type==='claim'&&!documentLink.claim_id)||(documentLink.document_type==='receipt'&&!documentLink.receipt_id)} onChange={upload}/></label>
   </div>}
   <div className="cf-table"><table><thead><tr><th>نوع المرفق</th><th>اسم الملف</th><th>السجل المرتبط</th><th>تاريخ الرفع</th><th>بواسطة</th><th>المرفق</th><th>طباعة</th></tr></thead><tbody>{items('documents').map(x=><tr key={x.id}><td>{documentLabels[x.document_type]||'العقد الأساسي'}</td><td>{x.name}{canEdit&&['contract','contract_appendix'].includes(x.document_type)&&<button type="button" disabled={aiBusy} onClick={()=>analyzeContractAI(x.id,current.id)}>تحليل بنود العقد AI</button>}</td><td>{x.adjustment_id?items('adjustments').find(a=>a.id===x.adjustment_id)?.description||'ملحق':x.claim_id?items('claims').find(a=>a.id===x.claim_id)?.claim_no||'مطالبة':x.receipt_id?items('receipts').find(a=>a.id===x.receipt_id)?.reference||'دفعة':'العقد'}</td><td>{String(x.created_at).slice(0,10)}</td><td>{x.uploaded_by}</td><td><a href={'/api/client-finance?download='+encodeURIComponent(x.id)} target="_blank" rel="noopener noreferrer">فتح / تنزيل</a></td><td><button type="button" onClick={()=>printFinanceRegister('documents',x)}>طباعة البيان</button></td></tr>)}</tbody></table></div>
  </>}
 </>:<div className="cf-empty">اختر عقدًا لعرض الاستحقاقات والدفعات والمطالبات والمرفقات.</div>}</div></div>
 {importOpen&&<div className="cf-overlay" role="presentation"><div className="cf-modal" role="dialog" aria-modal="true" aria-label="استيراد عقود العملاء من Excel">
 <div className="cf-head"><h3>استيراد عقود العملاء دفعة واحدة — Load Excel</h3><button onClick={()=>{setImportOpen(false);setImportPreview(null)}}>إغلاق</button></div>
 <p>حمّل القالب الرسمي، واملأ بيانات العقود ثم اختر الملف XLSX. الحد الأقصى <b>500 عقد</b> لكل عملية. سيتم فحص رقم العقد والشركة وجميع البيانات قبل الحفظ. لن تُستبدل العقود الموجودة أو تُحذف.</p>
 <div className="cf-actions" style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:14}}>
  <button type="button" onClick={downloadTemplate}>تحميل القالب الفارغ</button>
  <label className="cf-upload">اختيار ملف Excel<input type="file" accept=".xlsx" onChange={handleImportFile}/></label>
 </div>
 {importPreview&&<><div className="cf-brief"><div><small>اسم الملف</small><strong>{importPreview.filename}</strong></div><div><small>عدد العقود</small><strong>{importPreview.rows.length}</strong></div><div><small>أخطاء الفحص</small><strong>{importPreview.errors.length}</strong></div></div>
 {importPreview.errors.length>0&&<div className="cf-alert"><b>تعذر الاستيراد؛ يجب تصحيح الأخطاء أولًا:</b><ul>{importPreview.errors.slice(0,30).map((e,i)=><li key={i}>{e}</li>)}</ul>{importPreview.errors.length>30&&<p>يوجد أخطاء إضافية في الملف.</p>}</div>}
 <div className="cf-table"><table><thead><tr><th>السطر</th><th>الشركة</th><th>رقم العقد</th><th>العميل</th><th>المشروع</th><th>قبل الضريبة</th></tr></thead><tbody>{importPreview.rows.slice(0,15).map((r,i)=><tr key={i}><td>{r.line}</td><td>{r.company}</td><td>{r.contract_no}</td><td>{r.customer}</td><td>{r.project_name}</td><td>{money(r.base_ex_vat)}</td></tr>)}</tbody></table></div>
 <p>المعاينة تعرض أول 15 عقدًا فقط. الاستيراد يُنفذ كعملية واحدة؛ إذا فشل أي عقد فلن يتم إدخال أي من عقود الملف.</p>
 <button className="cf-primary" type="button" disabled={busy||!importPreview.rows.length||importPreview.errors.length>0} onClick={saveBulk}>اعتماد استيراد {importPreview.rows.length} عقد دفعة واحدة</button>
 </>}
 </div></div>}
 {contractEditOpen&&current&&<div className="cf-overlay" role="presentation"><div className="cf-modal" role="dialog" aria-modal="true" aria-label="تعديل بيانات العقد">
  <div className="cf-head"><h3>تعديل بيانات العقد — {current.contract_no}</h3><button onClick={()=>setContractEditOpen(false)}>إغلاق</button></div>
  <p>يمكن تغيير بيانات العميل والمشروع. تُقفل القيمة الأساسية ونسبة الضريبة بعد إدخال الدفعات حفاظًا على سلامة المطالبات، وتُستخدم الملاحق لتعديل القيمة.</p>
  <form className="cf-form" onSubmit={saveContract}>
   {[
     ['customer','اسم العميل','text'],['project_name','اسم المشروع','text'],['project_manager','مدير المشروع','text'],
     ['signed_date','تاريخ توقيع العقد','date'],['start_date','بداية المشروع','date'],['end_date','نهاية المشروع','date'],
     ['base_ex_vat','قيمة العقد قبل الضريبة','number'],['vat_rate','نسبة الضريبة %','number'],
     ['customer_phone','هاتف العميل','tel'],['customer_email','بريد العميل','email'],
     ['customer_vat_no','الرقم الضريبي للعميل','text'],['site_location','موقع المشروع','text'],
     ['contract_subject','وصف نطاق الأعمال','text'],['client_reference','المرجع لدى العميل','text'],
     ['retention_percent','نسبة حجز الضمان %','number'],['notes','ملاحظات العقد','text']
   ].map(([key,label,type])=><label key={key}>{label}<input type={type} required={['customer','project_name','project_manager','start_date','end_date'].includes(key)} min={type==='number'?0:undefined} max={['retention_percent','vat_rate'].includes(key)?100:undefined} step={type==='number'?'.01':undefined} value={editContract[key]??''} onChange={e=>setEditContract({...editContract,[key]:e.target.value})}/></label>)}
   <label>نوع العقد<select value={editContract.contract_type} onChange={e=>setEditContract({...editContract,contract_type:e.target.value})}>{kinds.map(k=><option key={k}>{k}</option>)}</select></label>
   <label>حالة العقد<select value={editContract.contract_status} onChange={e=>setEditContract({...editContract,contract_status:e.target.value})}><option value="active">ساري</option><option value="completed">مكتمل</option><option value="suspended">متوقف</option></select></label>
   <div className="cf-full cf-preview">مدة تنفيذ المشروع: <b>{durationLabel(editContract.start_date,editContract.end_date)}</b> · تاريخ توقيع العقد: <b>{editContract.signed_date||'—'}</b></div><div className="cf-full cf-preview">الإجمالي المتوقع شامل الضريبة: <b>{money(n(editContract.base_ex_vat)*(1+n(editContract.vat_rate)/100))} ر.س</b></div>
   <button className="cf-primary" disabled={busy}>حفظ التغييرات</button>
  </form>
 </div></div>}
 {newOpen&&<div className="cf-overlay"><div className="cf-modal"><div className="cf-head"><h3>تسجيل عقد جديد مع العميل</h3><button onClick={()=>setNewOpen(false)}>إغلاق</button></div><form className="cf-form" onSubmit={register}><label>الشركة<select required value={contract.company} onChange={e=>setContract({...contract,company:e.target.value})}>{(company?[company]:userCompanies).map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>اسم العميل<input required value={contract.customer} onChange={e=>setContract({...contract,customer:e.target.value})}/></label><label>اسم المشروع<input required value={contract.project_name} onChange={e=>setContract({...contract,project_name:e.target.value})}/></label><label>رقم العقد<input required value={contract.contract_no} onChange={e=>setContract({...contract,contract_no:e.target.value})}/></label><label>مدير المشروع<input required list="cf-managers" value={contract.project_manager} onChange={e=>setContract({...contract,project_manager:e.target.value})}/><datalist id="cf-managers">{projectManagers.map((m,i)=><option key={i} value={m}/>)}</datalist></label><label>نوع العقد<select value={contract.contract_type} onChange={e=>setContract({...contract,contract_type:e.target.value})}>{kinds.map(x=><option key={x}>{x}</option>)}</select></label><label>تاريخ توقيع العقد<input required type="date" value={contract.signed_date} onChange={e=>setContract({...contract,signed_date:e.target.value})}/></label><label>بداية المشروع<input required type="date" value={contract.start_date} onChange={e=>setContract({...contract,start_date:e.target.value})}/></label><label>نهاية المشروع<input required type="date" value={contract.end_date} onChange={e=>setContract({...contract,end_date:e.target.value})}/></label><div className="cf-full cf-preview">مدة تنفيذ المشروع تلقائيًا: <b>{durationLabel(contract.start_date,contract.end_date)}</b> · تاريخ توقيع العقد: <b>{contract.signed_date||'—'}</b></div><label>قيمة العقد قبل الضريبة (ر.س)<input required min="0" step=".01" type="number" value={contract.base_ex_vat} onChange={e=>setContract({...contract,base_ex_vat:e.target.value})}/></label><label>ضريبة القيمة المضافة %<input required min="0" max="100" step=".01" type="number" value={contract.vat_rate} onChange={e=>setContract({...contract,vat_rate:e.target.value})}/></label><div className="cf-full cf-preview">قيمة الضريبة: <b>{money(n(contract.base_ex_vat)*n(contract.vat_rate)/100)}</b> ر.س | قيمة العقد شامل الضريبة: <b>{money(n(contract.base_ex_vat)*(1+n(contract.vat_rate)/100))}</b> ر.س</div><label>رقم مرجع العميل<input value={contract.client_reference} onChange={e=>setContract({...contract,client_reference:e.target.value})}/></label>
<label>رقم العميل الضريبي<input value={contract.customer_vat_no} onChange={e=>setContract({...contract,customer_vat_no:e.target.value})}/></label>
<label>هاتف العميل<input value={contract.customer_phone} onChange={e=>setContract({...contract,customer_phone:e.target.value})}/></label>
<label>البريد الإلكتروني للعميل<input type="email" value={contract.customer_email} onChange={e=>setContract({...contract,customer_email:e.target.value})}/></label>
<label>موقع المشروع<input value={contract.site_location} onChange={e=>setContract({...contract,site_location:e.target.value})}/></label>
<label>نسبة حجز الضمان %<input type="number" min="0" max="100" step=".01" value={contract.retention_percent} onChange={e=>setContract({...contract,retention_percent:e.target.value})}/></label>
<label className="cf-full">وصف نطاق العقد<input value={contract.contract_subject} onChange={e=>setContract({...contract,contract_subject:e.target.value})}/></label>
<label className="cf-full">إرفاق العقد الأصلي (PDF أو صورة)<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setInitialContractFile(e.target.files?.[0]||null)}/></label><label className="cf-full">ملاحظات العقد<textarea value={contract.notes} onChange={e=>setContract({...contract,notes:e.target.value})}/></label><button className="cf-primary" disabled={busy}>حفظ العقد</button></form></div></div>}
 </section>;
}
