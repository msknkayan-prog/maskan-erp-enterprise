export const preferredProjectManagers=[
 {id:'mohamed_ahmed',name:'م محمداحمد',aliases:['محمد احمد','محمداحمد']},
 {id:'alhadi',name:'م الهادي الرحيمة',aliases:['الهادي الرحيمة','الهادي الرحمة']},
 {id:'mohamed_yousef',name:'م محمد يوسف',aliases:['محمد يوسف']},
 {id:'musab',name:'أ مصعب عبد القيوم',aliases:['مصعب عبد القيوم','مصعب عبدالقيوم']},
 {id:'magdi',name:'م مجدي محجوب',aliases:['مجدي محجوب']},
 {id:'othman',name:'أ عثمان محمداحمد',aliases:['عثمان محمداحمد','عثمان محمد احمد']}
];

export function normalizeManagerName(value){
 return String(value||'').normalize('NFKC').trim()
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/^(?:مهندس|استاذ|أستاذ|م|أ)\s*[.،:\-\s]+/u,'')
  .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
}

export function preferredManagerForName(name){
 const normalized=normalizeManagerName(name);
 return preferredProjectManagers.find(p=>p.aliases.some(alias=>normalizeManagerName(alias)===normalized))||null;
}

export function suggestedProjectsForManager(rows,profileId,company,email=''){
 const managerEmail=String(email||'').trim().toLowerCase();
 const directories=rows.filter(r=>r.module==='project_managers'&&r.company===company&&preferredManagerForName(r.data?.name)?.id===profileId);
 const directoryIds=new Set(directories.map(r=>r.id));
 const eligibleProjectIds=new Set(rows.filter(r=>r.module==='projects'&&r.company===company).map(r=>r.id));
 return [...new Set(rows.filter(r=>{
  if(r.module!=='employees'||r.company!==company||r.data?._archived)return false;
  const data=r.data||{};
  const matchingEmail=managerEmail&&String(data.manager_email||'').trim().toLowerCase()===managerEmail;
  return matchingEmail||directoryIds.has(data.direct_manager_id)||preferredManagerForName(data.manager)?.id===profileId;
 }).map(r=>String(r.data.project_id||'')).filter(id=>eligibleProjectIds.has(id)))];
}
