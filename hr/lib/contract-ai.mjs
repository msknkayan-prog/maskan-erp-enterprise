// Server/client shared financial document extraction validation.
// AI output is an untrusted proposal. Only edited and validated amounts can be committed.
const amount=x=>{const value=Number(x);return Number.isFinite(value)&&value>=0&&value<1e12?Math.round(value*100)/100:null};
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const text=(x,n=300)=>String(x??'').trim().slice(0,n);
export function normalizeContractAIResult(raw){
 const result=typeof raw==='string'?JSON.parse(raw):raw;
 if(!result||typeof result!=='object'||!Array.isArray(result.installments))throw Error('لم يُرجع التحليل جدول دفعات صالحًا');
 const warnings=Array.isArray(result.warnings)?result.warnings.slice(0,25).map(x=>text(x,250)):[];
 const cleaned=result.installments.slice(0,10).map((p,i)=>{
  const title=text(p.title||'دفعة رقم '+(i+1),160);
  const percent=p.payment_percent===undefined||p.payment_percent===null||p.payment_percent===''?null:amount(p.payment_percent);
  if(percent!==null&&(percent<=0||percent>100))warnings.push('نسبة الدفعة '+(i+1)+' غير صالحة');
  const value=amount(p.amount_ex_vat);
  const originalDate=text(p.due_date,10);
  const due_date=validDate(originalDate)?originalDate:'';
  if(!due_date)warnings.push('الدفعة '+(i+1)+' تحتاج تاريخ استحقاق محددًا من العقد قبل حفظها');
  if(value===null||value===0)warnings.push('الدفعة '+(i+1)+' تحتاج مبلغًا قبل الضريبة');
  const items=Array.isArray(p.items)?p.items.slice(0,50).map((item,j)=>({
   item_code:text(item.item_code||'AI-'+(j+1),50),
   description:text(item.description,900),
   quantity:Number(item.quantity)>0&&Number.isFinite(Number(item.quantity))?Number(item.quantity):1,
   unit:text(item.unit||'بند',50),
   unit_price_ex_vat:amount(item.unit_price_ex_vat)??0
  })):[];
  if(items.reduce((sum,item)=>sum+Math.round(item.quantity*item.unit_price_ex_vat*100)/100,0)>(value||0)+.005){
   warnings.push('قيمة بنود الدفعة '+(i+1)+' تتجاوز إجماليها؛ راجع البنود');
  }
  return {title,description:text(p.description||'',1500),due_date,amount_ex_vat:value===null?'':value,payment_percent:percent??'',progress_percent:0,items,source:text(p.source||'',300)};
 });
 return {installments:cleaned,warnings,contract_no:text(result.contract_no,90),document_summary:text(result.document_summary,450)};
}
export function validateAISchedule(schedule,{remaining=Infinity}={}){
 const problems=[],seen=new Set();let total=0,totalPercent=0;
 if(!Array.isArray(schedule)||!schedule.length||schedule.length>10)return ['عدد الدفعات يجب أن يكون بين 1 و10'];
 schedule.forEach((p,i)=>{
  const label='الدفعة '+(i+1);
  if(!text(p.title))problems.push(label+': الاسم مطلوب');
  if(!validDate(p.due_date))problems.push(label+': تاريخ استحقاق صحيح مطلوب');
  const percent=p.payment_percent===''||p.payment_percent===null||p.payment_percent===undefined?null:amount(p.payment_percent);
  if(percent!==null){if(percent<=0||percent>100)problems.push(label+': نسبة تعاقدية غير صالحة');totalPercent+=percent;}
  const m=amount(p.amount_ex_vat);
  if(m===null||m<=0)problems.push(label+': قيمة موجبة قبل الضريبة مطلوبة');else total+=m;
  const key=text(p.title)+'|'+p.due_date;if(seen.has(key))problems.push(label+': مكررة');seen.add(key);
  const items=p.items||[];
  if(items.length>50)problems.push(label+': عدد البنود أكثر من 50');
  let itemTotal=0;const keys=new Set();
  items.forEach((item,j)=>{
   const q=Number(item.quantity),price=amount(item.unit_price_ex_vat);
   if(!text(item.description)||!Number.isFinite(q)||q<=0||price===null)problems.push(label+': بيانات بند '+(j+1)+' غير صالحة');
   itemTotal+=Math.round(q*(price||0)*100)/100;
   const code=text(item.item_code);if(keys.has(code))problems.push(label+': رمز بند مكرر');keys.add(code);
  });
  if(m!==null&&itemTotal>m+.005)problems.push(label+': بنودها أكبر من قيمتها');
 });
 if(totalPercent>100.0001)problems.push('مجموع النسب التعاقدية أكبر من 100%');
 if(Number.isFinite(remaining)&&total>remaining+.005)problems.push('إجمالي الدفعات المستخرجة يتجاوز الرصيد غير المجدول من العقد');
 return problems;
}
