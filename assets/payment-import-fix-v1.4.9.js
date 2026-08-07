/* Maskan ERP Enterprise v1.4.9 — payments import schema compatibility
   Production payments table does not expose created_by in the current schema cache.
   Keep the import payload limited to columns known to exist in payments.
*/
try {
  if (typeof IMPORT_SPECS !== 'undefined' && IMPORT_SPECS.payments) {
    IMPORT_SPECS.payments.map = (r,i,ctx)=>({
      company_id: companyId(),
      payment_number: r.payment_number,
      project_id: ctx.projects[r.project_code],
      party_id: ctx.parties[r.party_code],
      contract_id: r.contract_number ? (ctx.contracts[r.contract_number] || null) : null,
      amount: Number(String(r.amount ?? '0').replace(/,/g,'')) || 0,
      payment_date: r.payment_date || new Date().toISOString().slice(0,10),
      payment_method: r.payment_method || 'bank_transfer',
      reference_number: r.reference_number || null,
      status: r.status || 'posted'
    });
  }
  document.documentElement.dataset.paymentImportFix='v1.4.9';
} catch (err) {
  console.error('Maskan payment import compatibility patch failed', err);
}
