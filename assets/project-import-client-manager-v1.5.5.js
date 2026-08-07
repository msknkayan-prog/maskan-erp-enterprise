/* Maskan ERP Enterprise v1.5.5 — project import: client + project manager
   Adds client_name/client_code/project_manager_name/project_manager_email to the
   projects import template. Missing clients are created automatically and linked.
   Project managers are linked to existing active users by email first, then name.
*/
(function(){
  'use strict';

  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const first=(r,keys)=>{for(const k of keys){if(String(r?.[k]??'').trim())return String(r[k]).trim()}return ''};
  const uniq=a=>[...new Set(a.filter(Boolean))];

  async function nextClientCode(existing){
    const used=new Set((existing||[]).map(x=>String(x.party_code||'').toUpperCase()));
    let n=1,code='';
    do{code=`CL-${String(n++).padStart(4,'0')}`}while(used.has(code));
    return code;
  }

  function install(){
    if(typeof IMPORT_SPECS!=='object'||!IMPORT_SPECS.projects)return false;
    const spec=IMPORT_SPECS.projects;
    if(spec.__clientManagerImportV155)return true;

    const oldPrepare=spec.prepare;
    const oldValidate=spec.validate;
    const oldMap=spec.map;

    const extraCols=['client_code','client_name','project_manager_email','project_manager_name'];
    spec.columns=[...new Set([...(spec.columns||[]),...extraCols])];
    const exampleBase=Array.isArray(spec.example)?[...spec.example]:[];
    while(exampleBase.length<spec.columns.length)exampleBase.push('');
    const ix=k=>spec.columns.indexOf(k);
    if(ix('client_code')>=0)exampleBase[ix('client_code')]='CL-0001';
    if(ix('client_name')>=0)exampleBase[ix('client_name')]='شركة العميل';
    if(ix('project_manager_email')>=0)exampleBase[ix('project_manager_email')]='pm@example.com';
    if(ix('project_manager_name')>=0)exampleBase[ix('project_manager_name')]='مدير المشروع';
    spec.example=exampleBase;

    spec.prepare=async function(rows){
      const base=oldPrepare?await oldPrepare(rows):{};

      const clientCodes=uniq(rows.map(r=>first(r,['client_code','customer_code'])));
      const clientNames=uniq(rows.map(r=>first(r,['client_name','customer_name','client','customer'])));

      const existingClientsResp=await sb.from('parties')
        .select('id,party_code,name_ar,party_type,is_active')
        .eq('party_type','client');
      if(existingClientsResp.error)throw existingClientsResp.error;
      const existingClients=existingClientsResp.data||[];
      const byCode={},byName={};
      existingClients.forEach(x=>{
        if(x.party_code)byCode[norm(x.party_code)]=x.id;
        if(x.name_ar)byName[norm(x.name_ar)]=x.id;
      });

      let nextCode=await nextClientCode(existingClients);
      let nextNum=Number(nextCode.split('-')[1]||1);
      const newClients=[];
      for(const row of rows){
        const code=first(row,['client_code','customer_code']);
        const name=first(row,['client_name','customer_name','client','customer']);
        if(!name&&!code)continue;
        if((code&&byCode[norm(code)])||(name&&byName[norm(name)]))continue;
        const generated=code||`CL-${String(nextNum++).padStart(4,'0')}`;
        const displayName=name||generated;
        newClients.push({company_id:companyId(),party_code:generated,name_ar:displayName,party_type:'client',is_active:true,created_by:profile?.id});
        byCode[norm(generated)]='__pending__';
        byName[norm(displayName)]='__pending__';
      }

      if(newClients.length){
        const {data,error}=await sb.from('parties').insert(newClients).select('id,party_code,name_ar');
        if(error)throw error;
        (data||[]).forEach(x=>{
          byCode[norm(x.party_code)]=x.id;
          byName[norm(x.name_ar)]=x.id;
        });
      }

      const managersResp=await sb.from('profiles')
        .select('id,full_name,email,role,is_active')
        .eq('is_active',true);
      if(managersResp.error)throw managersResp.error;
      const managersByEmail={},managersByName={};
      (managersResp.data||[]).forEach(x=>{
        if(x.email)managersByEmail[norm(x.email)]=x.id;
        if(x.full_name)managersByName[norm(x.full_name)]=x.id;
      });

      return {...base,__clientsByCode:byCode,__clientsByName:byName,__managersByEmail:managersByEmail,__managersByName:managersByName,__createdClients:newClients.length};
    };

    spec.validate=function(r,ctx){
      const errors=[];
      if(oldValidate){
        const e=oldValidate(r,ctx);
        if(Array.isArray(e))errors.push(...e);
      }
      const clientCode=first(r,['client_code','customer_code']);
      const clientName=first(r,['client_name','customer_name','client','customer']);
      const pmEmail=first(r,['project_manager_email','manager_email','pm_email']);
      const pmName=first(r,['project_manager_name','project_manager','manager_name','pm_name']);
      if(clientCode&&!ctx.__clientsByCode?.[norm(clientCode)] && !clientName)errors.push(`العميل ${clientCode} غير موجود`);
      if(clientName&&!ctx.__clientsByName?.[norm(clientName)] && !clientCode)errors.push(`تعذر إنشاء/ربط العميل ${clientName}`);
      if(pmEmail&&!ctx.__managersByEmail?.[norm(pmEmail)])errors.push(`مدير المشروع بالبريد ${pmEmail} غير موجود ضمن المستخدمين النشطين`);
      if(!pmEmail&&pmName&&!ctx.__managersByName?.[norm(pmName)])errors.push(`مدير المشروع ${pmName} غير موجود ضمن المستخدمين النشطين`);
      return errors;
    };

    spec.map=function(r,i,ctx){
      const out=oldMap?oldMap(r,i,ctx):{company_id:companyId(),created_by:profile?.id};
      const clientCode=first(r,['client_code','customer_code']);
      const clientName=first(r,['client_name','customer_name','client','customer']);
      const pmEmail=first(r,['project_manager_email','manager_email','pm_email']);
      const pmName=first(r,['project_manager_name','project_manager','manager_name','pm_name']);
      const clientId=(clientCode&&ctx.__clientsByCode?.[norm(clientCode)])||(clientName&&ctx.__clientsByName?.[norm(clientName)]);
      const managerId=(pmEmail&&ctx.__managersByEmail?.[norm(pmEmail)])||(!pmEmail&&pmName&&ctx.__managersByName?.[norm(pmName)]);
      if(clientId&&clientId!=='__pending__')out.client_id=clientId;
      if(managerId)out.project_manager_id=managerId;
      return out;
    };

    spec.__clientManagerImportV155=true;
    document.documentElement.dataset.projectImportClientManager='v1.5.5';
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer)},100);
  }
})();
