// Shared deterministic installment calculation for payroll generation and refresh.
// Only disbursed advances belong in context.loans; recording a payroll draft never settles a loan.
export const advanceCents=value=>Math.round(Number(value||0)*100);
const validMonth=month=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||''));
const monthNumber=month=>{const [year,n]=month.split('-').map(Number);return year*12+n;};
export const loanFirstMonth=loan=>{const value=String(loan?.data?.first_month||'');if(validMonth(value))return value;const paid=String(loan?.data?.paid_at||loan?.data?.date||'').slice(0,7);return validMonth(paid)?paid:'';};
export const advanceOutstanding=(loan,context)=>Math.max(0,advanceCents(loan.data.amount)-(context.sums.get(loan.id)||0));
export function calculateScheduledAdvances(context,employeeId,month,capCents=Infinity){
 if(!validMonth(month))return [];
 let available=capCents;
 const allocations=[];
 const loans=context.loans.filter(loan=>loan.data.employee_id===employeeId&&loan.data.schedule_mode!=='manual'&&validMonth(loanFirstMonth(loan))&&loanFirstMonth(loan)<=month)
  .sort((a,b)=>loanFirstMonth(a).localeCompare(loanFirstMonth(b))||String(a.data.date||'').localeCompare(String(b.data.date||'')));
 for(const loan of loans){
  if(available<=0)break;
  const skipped=Array.isArray(loan.data.deferred_months)?loan.data.deferred_months:[];
  if(skipped.includes(month))continue;
  const balance=advanceOutstanding(loan,context);
  if(balance<=0)continue;
  const count=Math.max(1,Number(loan.data.installments||1));
  const base=Math.max(1,Math.floor(advanceCents(loan.data.amount)/count));
  const elapsed=monthNumber(month)-monthNumber(loanFirstMonth(loan))-skipped.filter(m=>validMonth(m)&&m>=loanFirstMonth(loan)&&m<month).length;
  if(elapsed<0)continue;
  const scheduled=elapsed>=count-1?Math.max(base,advanceCents(loan.data.final_installment||0)):base;
  const amount=Math.min(balance,scheduled,available);
  if(amount>0){allocations.push({advance_id:loan.id,amount:amount/100});available-=amount;}
 }
 return allocations;
}
