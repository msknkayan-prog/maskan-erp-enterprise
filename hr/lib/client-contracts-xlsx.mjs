import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';

// Deliberately constrained SpreadsheetML reader/writer: data only, no macros or formula execution.
// Import template expects "عقود العملاء" as its first worksheet.
export const contractColumns=[
 ['company','الشركة'],['contract_no','رقم العقد'],['customer','اسم العميل'],['project_name','اسم المشروع'],
 ['project_manager','مدير المشروع'],['contract_type','نوع العقد'],['signed_date','تاريخ توقيع العقد'],
 ['start_date','بداية المشروع'],['end_date','نهاية المشروع'],['base_ex_vat','قيمة العقد قبل الضريبة'],
 ['vat_rate','نسبة ضريبة القيمة المضافة %'],['customer_phone','هاتف العميل'],['customer_email','بريد العميل'],
 ['customer_vat_no','الرقم الضريبي للعميل'],['site_location','موقع المشروع'],
 ['contract_subject','وصف أعمال العقد'],['client_reference','رقم مرجع العميل'],
 ['retention_percent','نسبة حجز الضمان %'],['notes','ملاحظات'],
 ['vat_amount','قيمة ضريبة العقد'],['total_inc_vat','قيمة العقد شامل الضريبة'],
 ['amount_paid','المبالغ المستلمة شامل الضريبة'],['amount_remaining','المتبقي شامل الضريبة']
];
export const contractImportKeys=contractColumns.slice(0,19).map(x=>x[0]);
const required=['company','contract_no','customer','project_name','project_manager','contract_type','signed_date','start_date','end_date','base_ex_vat'];
const types=new Set(['سباكة وكهرباء','تشطيبات عامة','أعمال عظم','أعمال تكييف','أعمال دفاع مدني']);
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const pos=n=>{let x=n+1,s='';while(x){x--;s=String.fromCharCode(65+x%26)+s;x=Math.floor(x/26)}return s};
const sheetXml=(headers,entries)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${headers.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${i===3||i===14?28:21}" customWidth="1"/>`).join('')}</cols><sheetData>${[headers,...entries].map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>{
 const r=pos(j)+(i+1);
 const value=v===null||v===undefined?'':v;
 // Always emit as strings so contract identifiers preserve leading zeros.
 return `<c r="${r}" t="inlineStr" s="${i===0?1:0}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${pos(headers.length-1)}${entries.length+1}"/></worksheet>`;
const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF21231F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>`;
export function buildContractsXlsx(rows=[],sample=false){
 const headers=contractColumns.map(x=>x[1]);
 const entries=sample?[['مسكن الكيان','CTR-0001','عميل تجريبي','مشروع تجريبي','مدير المشروع','أعمال تكييف','2026-11-11','2026-11-15','2027-05-30','100000','15','','','','','','','','']]:rows;
 const docs={
 '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
 '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
 'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="عقود العملاء" sheetId="1" r:id="rId1"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
 'xl/styles.xml':styles,
 'xl/worksheets/sheet1.xml':sheetXml(headers,entries)
 };
 return zipSync(Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,strToU8(v)])),{level:6});
}
const decodeXml=s=>String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const attr=(tag,k)=>(tag.match(new RegExp('(?:^|\\s)'+k+'="([^"]*)"'))||[])[1]||'';
const content=xml=>([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>decodeXml(m[1])).join(''));
const colIdx=ref=>{const a=ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'';let x=0;for(const c of a)x=x*26+(c.charCodeAt(0)-64);return x-1};
export function parseContractsXlsx(bytes,{maxRows=500,maxBytes=5*1024*1024}={}){
 if(bytes.byteLength>maxBytes)throw Error('ملف Excel يتجاوز الحد المسموح 5 ميجابايت');
 let archive;try{archive=unzipSync(bytes,{filter:file=>file.name==='xl/worksheets/sheet1.xml'||file.name==='xl/sharedStrings.xml'});}catch{throw Error('ملف غير صالح؛ اختر ملف XLSX حديث');}
 const sheet=archive['xl/worksheets/sheet1.xml'];if(!sheet)throw Error('الورقة الأولى غير موجودة؛ استخدم قالب عقود العملاء');
 const xml=strFromU8(sheet);if(xml.length>6000000)throw Error('ملف Excel كبير جدًا');
 const sharedXml=archive['xl/sharedStrings.xml']?strFromU8(archive['xl/sharedStrings.xml']):'';
 const shared=[...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>content(m[1]));
 const rows=[];
 for(const m of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const cells=Array(contractColumns.length).fill('');
  for(const c of m[1].matchAll(/<c\b([^>]*)(?:\/\>|>([\s\S]*?)<\/c>)/g)){
   const index=colIdx(attr(c[1],'r'));if(index<0||index>=cells.length)continue;
   const body=c[2]||'';
   if(/<f(?:\s|>)/.test(body))throw Error('لا تُقبل الصيغ في ملف الاستيراد. انسخ القيم أولًا.');
   const type=attr(c[1],'t'),v=body.match(/<v>([\s\S]*?)<\/v>/)?.[1]||'';
   cells[index]=type==='inlineStr'?content(body):type==='s'?(shared[Number(v)]||''):decodeXml(v);
  }
  rows.push(cells.map(x=>String(x??'').trim()));
  if(rows.length>maxRows+1)throw Error('الحد الأقصى لكل عملية استيراد '+maxRows+' عقد');
 }
 if(!rows.length)throw Error('الملف فارغ');
 const expected=contractColumns.map(x=>x[1]);
 if(expected.some((h,i)=>rows[0][i]!==h))throw Error('عناوين الأعمدة لا تتطابق مع القالب الرسمي. حمّل القالب أولًا.');
 const imported=rows.slice(1).filter(row=>row.some(v=>v!=='')).map((values,i)=>({line:i+2,...Object.fromEntries(contractImportKeys.map((key,j)=>[key,values[j]]))}));
 const errors=[],seen=new Set();
 for(const row of imported){
  for(const key of required)if(!row[key])errors.push('السطر '+row.line+': '+contractColumns.find(c=>c[0]===key)[1]+' مطلوب');
  if(row.contract_type&&!types.has(row.contract_type))errors.push('السطر '+row.line+': نوع العقد غير معتمد');
  for(const key of ['signed_date','start_date','end_date'])if(row[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(row[key]))errors.push('السطر '+row.line+': التاريخ يجب أن يكون YYYY-MM-DD');
  if(row.start_date&&row.end_date&&row.end_date<row.start_date)errors.push('السطر '+row.line+': تاريخ النهاية يسبق البداية');
  for(const key of ['base_ex_vat','vat_rate','retention_percent'])if(row[key]!==''&&(!Number.isFinite(Number(row[key]))||Number(row[key])<0))errors.push('السطر '+row.line+': قيمة '+key+' غير صالحة');
  if(row.vat_rate!==''&&Number(row.vat_rate)>100)errors.push('السطر '+row.line+': نسبة الضريبة أكبر من 100%');
  const sig=row.company+'::'+row.contract_no;if(seen.has(sig))errors.push('السطر '+row.line+': رقم العقد مكرر داخل الملف');seen.add(sig);
 }
 return {rows:imported,errors};
}
export function exportContractRows(contracts,summary){
 return contracts.map(c=>{
  const b=summary(c);
  return [...contractImportKeys.map(key=>key==='vat_rate'?Number(c.vat_rate||0)*100:c[key]??''),b.vat,b.all,b.paid,b.remaining];
 });
}
