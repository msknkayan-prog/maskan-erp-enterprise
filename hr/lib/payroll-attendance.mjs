// Shared Saudi monthly-payroll absence arithmetic.
// Days of approved paid leave are never converted to unpaid absence.
const dateMs=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?Date.parse(value+'T00:00:00Z'):NaN;
const DAY=86400000;
export const salaryAbsenceDeduction=(salary,days)=>Math.round(Math.max(0,Number(salary||0))*Math.max(0,Number(days||0))/30*100)/100;
export function returnPeriodAttendance(leave,actualReturn,month){
 const start=dateMs(leave?.start),end=dateMs(leave?.end),back=dateMs(actualReturn),from=dateMs(month+'-01');
 const y=Number(String(month).slice(0,4)),m=Number(String(month).slice(5,7));
 if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(back)||!Number.isFinite(from)||m<1||m>12||end<start||back<start)return {absence_days:0,payable_days:30,unpaid_leave_days:0,late_days:0,valid:false};
 const until=Date.UTC(y,m,1);
 const overlap=(a,b)=>Math.max(0,Math.ceil((Math.min(b,until)-Math.max(a,from))/DAY));
 const unpaid=leave?.leave_type==='unpaid'||leave?.leave_payment==='unpaid'
  ?Math.ceil((end-start)/DAY)+1
  :Math.min(Math.max(0,Number(leave?.unpaid_days||0)),Math.ceil((end-start)/DAY)+1);
 // Mixed annual leave: the explicitly unpaid tail of the approved request is deductible.
 const unpaidStart=end-(unpaid-1)*DAY;
 const unpaidDays=unpaid?overlap(unpaidStart,Math.min(end+DAY,back)):0;
 // Late return outside the approved period is unpaid until the day before actual attendance.
 const late=overlap(end+DAY,back);
 const absenceDays=Math.min(30,unpaidDays+late);
 return {absence_days:absenceDays,payable_days:30-absenceDays,unpaid_leave_days:unpaidDays,late_days:late,valid:true};
}
