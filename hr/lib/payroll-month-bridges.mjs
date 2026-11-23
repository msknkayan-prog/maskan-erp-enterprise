import {returnPeriodAttendance,salaryAbsenceDeduction} from './payroll-attendance.mjs';
const activeLeaveStatus=status=>['approved','paid','finance'].includes(status);
export function payrollAttendanceFromRecords(records,employeeId,month){
 const leaves=records.filter(r=>r.module==='leave'&&r.data?.employee_id===employeeId&&!r.data?._deleted&&activeLeaveStatus(r.status));
 const returns=records.filter(r=>r.module==='returns'&&!r.data?._deleted&&r.data?.employee_id===employeeId);
 const parts=[];
 for(const leave of leaves){
  const linked=returns.find(r=>r.data?.leave_id===leave.id);
  const actual=linked?.data?.actual_return||leave.data?.actual_return;
  // Only a recorded actual return can establish the number of unpaid/late days.
  if(!actual)continue;
  const attendance=returnPeriodAttendance(leave.data,actual,month);
  if(attendance.valid&&(attendance.absence_days||attendance.unpaid_leave_days||attendance.late_days)){
   parts.push({leave_id:leave.id,actual_return:actual,...attendance});
  }
 }
 const absenceDays=Math.min(30,parts.reduce((sum,p)=>sum+p.absence_days,0));
 return {absence_days:absenceDays,absence_deduction:0,payable_days:30-absenceDays,return_parts:parts,
  return_to_work_at:parts.length?parts.map(p=>p.actual_return).sort().at(-1):null};
}
export function payrollAttendanceForSalary(records,employeeId,month,salary){
 const x=payrollAttendanceFromRecords(records,employeeId,month);
 return {...x,absence_deduction:salaryAbsenceDeduction(salary,x.absence_days)};
}
