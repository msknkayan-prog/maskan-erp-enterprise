// Return-to-work eligibility is derived from the actual employee and leave lifecycle.
// Legacy "finance" requests have already passed HR approval; finance is no longer a
// fourth approval step. Never treat draft, HR-pending or rejected leaves as approved.
export const isReturnEligibleLeave=leave=>{
 const status=String(leave?.status||'');
 return !leave?.data?._deleted&&['approved','paid','finance'].includes(status)&&Boolean(leave?.data?.employee_id);
};
export const employeeOnLeave=employee=>['on_leave','في إجازة','فى إجازة','قيد الإجازة','قيد الاجازة'].includes(String(employee?.data?.employment_status||employee?.data?.employee_status||'').trim());
export const availableReturnLeaves=(records,company='')=>{
 const all=records.filter(r=>r.module==='leave'&&(!company||r.company===company)&&isReturnEligibleLeave(r));
 return all.filter(leave=>!leave.data?.return_record_id&&!records.some(r=>r.module==='returns'&&r.company===leave.company&&r.data?.leave_id===leave.id&&!r.data?._deleted));
};

export const returnToWorkRegister=(records,company='')=>{
 const leaves=records.filter(r=>r.module==='leave'&&(!company||r.company===company)&&isReturnEligibleLeave(r));
 const returns=records.filter(r=>r.module==='returns'&&(!company||r.company===company)&&!r.data?._deleted);
 return leaves.map(leave=>{
  const returnRecord=returns.find(record=>record.data?.leave_id===leave.id||record.id===leave.data?.return_record_id)||null;
  const actualReturn=String(returnRecord?.data?.actual_return||leave.data?.actual_return||'');
  const completed=Boolean(actualReturn&&(returnRecord||leave.data?.return_record_id||leave.data?.return_status==='completed'));
  return {leave,returnRecord,actualReturn,completed,status:completed?'تمت المباشرة':'بانتظار تسجيل المباشرة'};
 });
};
