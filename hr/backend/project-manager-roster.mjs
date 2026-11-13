export const preferredProjectManagers=[
 {id:'mohamed_ahmed',name:'م محمداحمد',aliases:['محمد احمد','محمداحمد']},
 {id:'alhadi',name:'م الهادي الرحيمة',aliases:['الهادي الرحيمة','الهادي الرحمة']},
 {id:'mohamed_yousef',name:'م محمد يوسف',aliases:['محمد يوسف']},
 {id:'musab',name:'أ مصعب عبد القيوم',aliases:['مصعب عبد القيوم','مصعب عبدالقيوم']},
 {id:'magdi',name:'م مجدي محجوب',aliases:['مجدي محجوب']},
 {id:'othman',name:'أ. عثمان محمد أحمد',aliases:['عثمان محمداحمد','عثمان محمد احمد','أ عثمان محمداحمد']},
 {id:'amjad_fouad',name:'م. أمجد فؤاد',aliases:['أمجد فؤاد','امجد فؤاد','امجد فواد','أمجد فواد']}
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
 return preferredProjectManagers.find(p=>[p.name,...p.aliases].some(alias=>normalizeManagerName(alias)===normalized))||null;
}

// Direct-supervisor names are operational personnel data, not login identities.
// Keep the seven approved names selectable even before an Auth account exists.
export function employeeDirectManagerOptions(records=[],members=[],company=''){
 const choices=new Map();
 const add=name=>{
  const normalized=normalizeManagerName(name);
  if(!normalized)return;
  const profile=preferredManagerForName(name);
  const key=profile?'roster:'+profile.id:'name:'+normalized;
  if(!choices.has(key))choices.set(key,{key,name:profile?.name||String(name).trim(),email:'',phone:'',directory_id:'',hasLogin:false});
 };
 for(const profile of preferredProjectManagers)add(profile.name);
 const relevant=records.filter(r=>{
  if(r.module==='projects')return r.company===company||Array.isArray(r.data?._shared_companies)&&r.data._shared_companies.includes(company);
  return r.company===company&&!r.data?._deleted;
 });
 for(const row of relevant){
  if(row.module==='projects')add(row.data?.manager_name);
  if(row.module==='project_managers')add(row.data?.name);
  if(row.module==='employees'&&!row.data?._archived)add(row.data?.manager);
 }
 const active=members.filter(m=>{
  if(m.role!=='project_manager'||m.is_active===false)return false;
  if(!m.companies||m.companies==='*')return true;
  try{return JSON.parse(m.companies||'[]').includes(company)}catch{return false}
 });
 for(const member of active)add(member.username||member.display_name);
 for(const choice of choices.values()){
  const relatedDirectory=relevant.filter(r=>r.module==='project_managers'&&normalizeManagerName(r.data?.name)===normalizeManagerName(choice.name));
  const relatedProjects=relevant.filter(r=>r.module==='projects'&&normalizeManagerName(r.data?.manager_name)===normalizeManagerName(choice.name));
  const emails=new Set([
   ...relatedDirectory.map(r=>r.data?.email),
   ...relatedProjects.map(r=>r.data?.manager_email),
   ...active.filter(m=>normalizeManagerName(m.username||m.display_name)===normalizeManagerName(choice.name)).map(m=>m.email)
  ].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
  const valid=active.filter(m=>emails.has(String(m.email||'').trim().toLowerCase()));
  if(valid.length!==1)continue;
  choice.email=String(valid[0].email).trim().toLowerCase();
  choice.hasLogin=true;
  const directory=relatedDirectory.find(r=>String(r.data?.email||'').trim().toLowerCase()===choice.email);
  choice.phone=String(directory?.data?.phone||'');
  choice.directory_id=directory?.id||'';
 }
 return [...choices.values()].sort((a,b)=>{
  const ai=preferredProjectManagers.findIndex(p=>a.key==='roster:'+p.id);
  const bi=preferredProjectManagers.findIndex(p=>b.key==='roster:'+p.id);
  if(ai!==-1||bi!==-1)return ai===-1?1:bi===-1?-1:ai-bi;
  return a.name.localeCompare(b.name,'ar');
 });
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
