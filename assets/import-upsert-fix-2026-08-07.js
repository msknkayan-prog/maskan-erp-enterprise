/* Maskan ERP Enterprise — import upsert fix — 2026-08-07
   Uses tenant-safe composite conflict targets matching production unique indexes.
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
  }
  document.documentElement.dataset.importUpsertFix='2026-08-07';
} catch (err) {
  console.error('Maskan import upsert patch failed', err);
}
