/* Maskan ERP Enterprise — import upsert + enum normalization fix — 2026-08-07
   Uses tenant-safe composite conflict targets matching production unique indexes.
   Also normalizes party_type values so Excel/CSV imports cannot send arbitrary
   organisation names into the PostgreSQL party_type enum.
   Loaded after assets/app.js and relationship patch.
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

    if (IMPORT_SPECS.parties) {
      const partyTypeAliases = new Map([
        ['client','client'],['customer','client'],['عميل','client'],['العميل','client'],
        ['contractor','contractor'],['subcontractor','contractor'],['مقاول','contractor'],['المقاول','contractor'],['مقاول باطن','contractor'],
        ['supplier','supplier'],['vendor','supplier'],['مورد','supplier'],['المورد','supplier'],
        ['consultant','consultant'],['استشاري','consultant'],['الاستشاري','consultant']
      ]);

      const normalizePartyType = value => {
        const raw=String(value??'').trim();
        if(!raw) return 'contractor';
        return partyTypeAliases.get(raw.toLowerCase()) || partyTypeAliases.get(raw) || null;
      };

      // A common legacy sheet layout places the organisation name in party_type
      // and a contact/person name in name_ar. If party_type is not a valid enum,
      // preserve that organisation name as the ERP party name and default the
      // classification to contractor instead of failing the entire import.
      IMPORT_SPECS.parties.validate = (r)=>{
        const errors=[];
        const rawType=String(r.party_type??'').trim();
        if(!String(r.name_ar||'').trim() && !rawType) errors.push('اسم الجهة مطلوب');
        return errors;
      };

      IMPORT_SPECS.parties.map = (r,i)=>{
        const rawType=String(r.party_type??'').trim();
        const normalizedType=normalizePartyType(rawType);
        const typeIsKnown=!!normalizedType;
        const organisationName=typeIsKnown ? String(r.name_ar||'').trim() : (rawType || String(r.name_ar||'').trim());
        return {
          company_id:companyId(),
          party_code:String(r.party_code||'').trim() || `PTY-${String(i+1).padStart(4,'0')}`,
          name_ar:organisationName,
          party_type:typeIsKnown ? normalizedType : 'contractor',
          phone:String(r.phone||'').trim()||null,
          commercial_registration:String(r.commercial_registration||'').trim()||null,
          vat_number:String(r.vat_number||'').trim()||null,
          iban:String(r.iban||'').trim()||null,
          created_by:profile.id
        };
      };
    }
  }
  document.documentElement.dataset.importUpsertFix='2026-08-07-party-enum';
} catch (err) {
  console.error('Maskan import upsert patch failed', err);
}
