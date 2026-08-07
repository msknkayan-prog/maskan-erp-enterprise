/* Maskan ERP Enterprise — import upsert + enum normalization fix — 2026-08-07
   Uses tenant-safe composite conflict targets matching production unique indexes.
   Normalizes party, project and contract enum values during CSV/Excel import.
*/

try {
  if (typeof IMPORT_SPECS !== 'undefined') {
    const compositeKeys = {
      parties: 'company_id,party_code',
      projects: 'company_id,project_code',
      contracts: 'company_id,contract_number',
      requests: 'company_id,request_number',
      certificates: 'company_id,certificate_number',
      payments: 'company_id,payment_number',
      purchase_orders: 'company_id,po_number'
    };
    Object.entries(compositeKeys).forEach(([module,key])=>{
      if (IMPORT_SPECS[module]) IMPORT_SPECS[module].key = key;
    });

    const norm = value => String(value ?? '').trim();
    const lower = value => norm(value).toLowerCase();

    if (IMPORT_SPECS.parties) {
      const partyTypeAliases = new Map([
        ['client','client'],['customer','client'],['عميل','client'],['العميل','client'],
        ['contractor','contractor'],['subcontractor','contractor'],['مقاول','contractor'],['المقاول','contractor'],['مقاول باطن','contractor'],
        ['supplier','supplier'],['vendor','supplier'],['مورد','supplier'],['المورد','supplier'],
        ['consultant','consultant'],['استشاري','consultant'],['الاستشاري','consultant']
      ]);
      const normalizePartyType = value => {
        const raw=norm(value);
        if(!raw) return 'contractor';
        return partyTypeAliases.get(raw.toLowerCase()) || partyTypeAliases.get(raw) || null;
      };
      IMPORT_SPECS.parties.validate = (r)=>{
        const errors=[];
        const rawType=norm(r.party_type);
        if(!norm(r.name_ar) && !rawType) errors.push('اسم الجهة مطلوب');
        return errors;
      };
      IMPORT_SPECS.parties.map = (r,i)=>{
        const rawType=norm(r.party_type);
        const normalizedType=normalizePartyType(rawType);
        const typeIsKnown=!!normalizedType;
        const organisationName=typeIsKnown ? norm(r.name_ar) : (rawType || norm(r.name_ar));
        return {
          company_id:companyId(),
          party_code:norm(r.party_code) || `PTY-${String(i+1).padStart(4,'0')}`,
          name_ar:organisationName,
          party_type:typeIsKnown ? normalizedType : 'contractor',
          phone:norm(r.phone)||null,
          commercial_registration:norm(r.commercial_registration)||null,
          vat_number:norm(r.vat_number)||null,
          iban:norm(r.iban)||null,
          created_by:profile.id
        };
      };
    }

    if (IMPORT_SPECS.projects) {
      const projectStatusAliases = new Map([
        ['planned','planned'],['plan','planned'],['مخطط','planned'],['تخطيط','planned'],['جديد','planned'],
        ['active','active'],['نشط','active'],['قيد التنفيذ','active'],['جاري','active'],['جارى','active'],
        ['on_hold','on_hold'],['on hold','on_hold'],['متوقف','on_hold'],['معلق','on_hold'],['معلّق','on_hold'],
        ['completed','completed'],['complete','completed'],['مكتمل','completed'],['منتهي','completed'],['منتهى','completed']
      ]);
      const originalMap=IMPORT_SPECS.projects.map;
      IMPORT_SPECS.projects.map=(r,i,ctx)=>{
        const out=originalMap(r,i,ctx);
        const raw=norm(r.status);
        out.status=projectStatusAliases.get(lower(raw)) || projectStatusAliases.get(raw) || 'planned';
        out.completion_percentage=Math.max(0,Math.min(100,Number(r.completion_percentage||0)));
        return out;
      };
    }

    if (IMPORT_SPECS.contracts) {
      const contractTypeAliases = new Map([
        ['subcontract','subcontract'],['subcontractor','subcontract'],['مقاول باطن','subcontract'],['عقد مقاول باطن','subcontract'],['مقاولة باطن','subcontract'],
        ['supply_contract','supply_contract'],['supply','supply_contract'],['توريد','supply_contract'],['عقد توريد','supply_contract'],
        ['client_contract','client_contract'],['client','client_contract'],['عقد عميل','client_contract'],['عقد رئيسي','client_contract'],
        ['service_contract','service_contract'],['service','service_contract'],['خدمات','service_contract'],['عقد خدمات','service_contract']
      ]);
      const recordStatusAliases = new Map([
        ['draft','draft'],['مسودة','draft'],
        ['submitted','submitted'],['مرفوع','submitted'],['مقدم','submitted'],
        ['under_review','under_review'],['under review','under_review'],['قيد المراجعة','under_review'],
        ['approved','approved'],['معتمد','approved'],
        ['rejected','rejected'],['مرفوض','rejected'],
        ['active','active'],['نشط','active'],['ساري','active'],['سارى','active'],
        ['planned','planned'],['مخطط','planned'],
        ['on_hold','on_hold'],['on hold','on_hold'],['متوقف','on_hold'],['معلق','on_hold'],
        ['completed','completed'],['مكتمل','completed'],['منتهي','completed'],['منتهى','completed'],
        ['cancelled','cancelled'],['canceled','cancelled'],['ملغي','cancelled'],['ملغى','cancelled']
      ]);
      const originalMap=IMPORT_SPECS.contracts.map;
      IMPORT_SPECS.contracts.map=(r,i,ctx)=>{
        const out=originalMap(r,i,ctx);
        const rawType=norm(r.contract_type);
        const rawStatus=norm(r.status);
        out.contract_type=contractTypeAliases.get(lower(rawType)) || contractTypeAliases.get(rawType) || 'subcontract';
        out.status=recordStatusAliases.get(lower(rawStatus)) || recordStatusAliases.get(rawStatus) || 'draft';
        return out;
      };
    }
  }
  document.documentElement.dataset.importUpsertFix='2026-08-07-enum-v146';
} catch (err) {
  console.error('Maskan import upsert patch failed', err);
}
