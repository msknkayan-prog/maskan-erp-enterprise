export const companies=['رياح الاعمار','مسكن الكيان','شركة البلد المتحدة','شركة احواض الطاقة','سمارت برووف','مشاريع حصن الحضارة','المعايير العصرية'];
export const companyDisplayName=(value)=>value==='المعايير العصرية'?'مؤسسة المعايير العصرية لأعمال التكييف':value;
export const canonicalCompany=(value)=>{const name=String(value||'').trim().replace(/\s+/g,' ');return /^(مؤسسة |شركة )?المعايير العصرية( لأعمال التكييف)?$/.test(name)?'المعايير العصرية':name;};
const f=(key,label,type='text',required=false)=>({key,label,type,required});
export const modules={
 employees:{label:'الموظفون',singular:'موظف',icon:'users',group:'شؤون الموظفين',fields:[f('name','اسم الموظف','text',true),f('code','الرقم الوظيفي','text',true),f('job','المسمى الوظيفي'),f('department','القسم'),f('project_id','المشروع','project'),f('email','البريد الإلكتروني','email'),f('employment_status','حالة الموظف','employment'),f('nationality','الجنسية'),f('identity','الهوية / الإقامة'),f('phone','الجوال'),f('home_phone','هاتف البلد الأم'),f('hire_date','تاريخ التعيين','date'),f('salary','الأجر الشهري الإجمالي','number',true),f('basic','الراتب الأساسي','number'),f('bank_amount','التحويل البنكي الشهري','number'),f('cash_amount','المبلغ كاش (محسوب تلقائيًا)','number'),f('sponsorship','حالة الكفالة','sponsorship',true),f('leave_balance_mode','طريقة احتساب رصيد الإجازة','calculation_mode'),f('manual_leave_entitlement','إجمالي رصيد الإجازة المستحق يدويًا','number'),f('opening_leave','رصيد الإجازات المرحّل يدويًا','number'),f('opening_leave_confirmed','اعتماد الرصيد المرحّل','ticket_eligibility'),f('bank','اسم البنك'),f('iban','الآيبان'),f('iqama_expiry','انتهاء الإقامة','date'),f('contract_expiry_mode','طريقة تحديد انتهاء العقد','calculation_mode'),f('contract_expiry','انتهاء العقد','date'),f('manager','المدير المباشر'),f('direct_manager_id','مرجع المدير المباشر','internal'),f('payment_method','طريقة الصرف','method'),f('supervisor_account','رقم حساب المدير المباشر'),f('last_leave_request','آخر طلب إجازة معتمد'),f('last_return_date','آخر مباشرة بعد إجازة','internal'),f('last_return_leave_id','مرجع آخر مباشرة','internal'),f('last_return_absence_days','أيام الغياب بآخر مباشرة','internal'),f('last_return_payable_days','أيام الاستحقاق بآخر مباشرة','internal'),f('last_return_absence_amount','خصم الغياب بآخر مباشرة','internal'),f('last_return_payroll_month','شهر آخر مباشرة','internal'),f('notes','ملاحظات','textarea')]},
 leave:{label:'الإجازات',singular:'طلب إجازة',icon:'calendar',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('leave_type','نوع الإجازة','leave_type'),f('leave_payment','تصنيف الإجازة من الرصيد السنوي','leave_payment'),f('unpaid_days','أيام الإجازة غير المدفوعة','number'),f('contact_phone','هاتف التواصل أثناء الإجازة'),f('replacement','الموظف البديل'),f('request_date','تاريخ طلب الإجازة','date'),f('last_work_day','آخر يوم عمل قبل الإجازة','date'),f('last_return','تاريخ آخر مباشرة سابقة','date'),f('conduct','تقييم السلوك'),f('ticket','استحقاق تذكرة السفر','ticket_eligibility'),f('ticket_due_date','تاريخ استحقاق التذكرة','date'),f('other_reason','توضيح الأسباب الأخرى'),f('start','من تاريخ','date',true),f('end','إلى تاريخ','date',true),f('expected_return','تاريخ المباشرة المتوقع بعد الإجازة','date'),f('return_record_id','مرجع محضر المباشرة','internal'),f('actual_return','المباشرة الفعلية','internal'),f('holiday_policy','احتساب أيام العطلة','holiday_policy'),f('holiday_dates','تواريخ العطلات الواقعة داخل الإجازة'),f('days','عدد الأيام','number',true),f('notes','الملاحظات','textarea')]},
 advances:{label:'السلف',singular:'طلب سلفة',icon:'wallet',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('amount','قيمة السلفة','number',true),f('date','التاريخ','date',true),f('installments','عدد الأقساط','number'),f('monthly_deduction','مبلغ الاستقطاع الشهري','number'),f('first_month','شهر أول قسط','month'),f('schedule_mode','طريقة استقطاع السلفة','advance_schedule'),f('notes','سبب السلفة','textarea',true)]},
 warnings:{label:'الإنذارات',singular:'إنذار',icon:'alert',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('warning_type','نوع الإنذار','warning_type'),f('sequence','رقم الإنذار','number'),f('required_action','الإجراء المطلوب'),f('name','موضوع الإنذار','text',true),f('date','التاريخ','date',true),f('notes','تفاصيل الإنذار','textarea',true)]},
 payroll_batches:{label:'المسيرات الشهرية',singular:'مسير شهري',icon:'chart',group:'المالية',fields:[f('month','الشهر'),f('employee_count','عدد الموظفين','number')]},
 payroll:{label:'الرواتب',singular:'مسير موظف',icon:'chart',group:'المالية',fields:[f('employee_id','الموظف','employee',true),f('month','شهر الراتب','month',true),f('bonus','المكافآت','number'),f('extra_allowance','بدلات إضافية','number'),f('overtime_hours','الساعات الإضافية','number'),f('absence_days','أيام الغياب','number'),f('absence_deduction','خصم الغياب','number'),f('advance_deduction','خصم السلف','number'),f('deductions','الخصميات المعتمدة','number'),f('method','طريقة الصرف','method',true),f('cash_amount','صرف كاش','number'),f('bank_amount','تحويل بنكي','number'),f('notes','بيان الخصميات','textarea')]},
 settlements:{label:'المخالصات',singular:'مخالصة',icon:'file',group:'المالية',fields:[f('employee_id','الموظف','employee',true),f('date','التاريخ','date',true),f('amount','المستحقات قبل الخصم','number',true),f('deductions','الخصميات','number'),f('monthly_salary','الأجر الشهري المرجعي','number'),f('rejoining_date','تاريخ المباشرة','date'),f('wages_from','بداية فترة الأجور','date'),f('wages_to','نهاية فترة الأجور','date'),f('wages_amount','أجور مستحقة','number'),f('leave_days','أيام الإجازة المتبقية','number'),f('leave_amount','تعويض الإجازة','number'),f('ticket_amount','قيمة التذكرة','number'),f('service_amount','نهاية الخدمة المدخلة','number'),f('other_amount','مستحقات أخرى','number'),f('last_work_date','آخر يوم عمل','date'),f('termination_reason','سبب انتهاء العلاقة'),f('ticket_note','بيان التذكرة'),f('service_days','مدة نهاية الخدمة بالأيام','number'),f('other_note','بيان المستحقات الأخرى'),f('deduction_note','سبب الخصميات'),f('amount_words','المبلغ كتابة'),f('beneficiary_name','اسم المستفيد'),f('beneficiary_identity','هوية المستفيد'),f('bank_name','اسم البنك'),f('bank_code','رمز البنك'),f('account_no','رقم الحساب'),f('iban','الآيبان'),f('notes','تفاصيل التسوية','textarea',true)]},
 project_managers:{label:'دليل مدراء المشاريع',singular:'بيانات مدير مشروع',icon:'users',group:'الإدارة والإعدادات',fields:[f('name','اسم مدير المشروع','text',true),f('email','بريد حساب مدير المشروع','email',true),f('phone','رقم الجوال'),f('job','المسمى الوظيفي'),f('department','الإدارة / القسم'),f('notes','ملاحظات','textarea')]},
 projects:{label:'المشاريع والتكليفات',singular:'مشروع موظفين',icon:'building',group:'الإدارة والإعدادات',fields:[f('name','اسم المشروع','text',true),f('code','رمز المشروع','text',true),f('manager_email','بريد مدير المشروع','email'),f('director_email','بريد مدير المشاريع','email'),f('latitude','خط العرض','coordinate'),f('longitude','خط الطول','coordinate'),f('radius','نطاق الحضور بالمتر','number'),f('address','عنوان الموقع')]},
 appointments:{label:'التعيين والمباشرة',singular:'نموذج تعيين ومباشرة',icon:'file',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('date','تاريخ النموذج','date',true),f('actual_start','تاريخ المباشرة','date',true),f('document_no','رقم نموذج التعيين'),f('direct_manager','المسؤول المباشر'),f('work_location','مقر العمل'),f('contract_end','نهاية التعاقد','date'),f('work_hours','ساعات العمل حسب الاتفاق'),f('form_status','حالة تجهيز النموذج'),f('contract_type','نوع العقد'),f('probation','فترة التجربة'),f('notes','شروط وملاحظات','textarea')]},
 resignations:{label:'الاستقالات',singular:'طلب استقالة',icon:'file',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('date','تاريخ الطلب','date',true),f('last_day','آخر يوم عمل مقترح','date',true),f('notes','سبب الاستقالة','textarea',true),f('handover','تسليم العهد والأعمال','textarea')]},
 returns:{label:'المباشرة بعد الإجازة',singular:'مباشرة بعد إجازة',icon:'calendar',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','internal'),f('leave_id','طلب الإجازة المعتمد','leave',true),f('leave_start','بداية الإجازة','internal'),f('leave_end','نهاية الإجازة','internal'),f('expected_return','تاريخ المباشرة المتوقع','internal'),f('actual_return','تاريخ المباشرة الفعلي','date',true),f('notes','ملاحظة / سبب التصحيح','textarea')]},
 terminations:{label:'إنهاء الخدمة',singular:'ملف إنهاء خدمة',icon:'file',group:'شؤون الموظفين',fields:[f('employee_id','الموظف','employee',true),f('date','تاريخ إنهاء الخدمة','date',true),f('notes','سبب إنهاء الخدمة','textarea',true),f('resignation_id','مرجع الاستقالة'),f('handover','تسليم العهد والأعمال','textarea'),f('case_status','حالة الملف','case_status')]},
 leave_dues:{label:'مستحقات الإجازة',singular:'بيان مستحقات إجازة',icon:'wallet',group:'المالية',fields:[f('leave_id','طلب الإجازة','leave',true),f('salary_basis','أساس الراتب المراجع','number',true),f('days','أيام الاستحقاق','number',true),f('travel_amount','قيمة التذكرة','number'),f('ticket_description','تفاصيل التذكرة'),f('other_amount','إضافات أخرى','number'),f('other_description','تفاصيل الإضافات'),f('deductions','الخصميات','number'),f('deduction_reason','بيان الخصومات'),f('payment_note','ملاحظات الصرف'),f('notes','ملاحظات','textarea')]},
 repayments:{label:'سداد السلف',singular:'سداد سلفة',icon:'wallet',group:'المالية',fields:[f('advance_id','السلفة المعتمدة','advance',true),f('amount','المبلغ المسدد','number',true),f('date','تاريخ السداد','date',true),f('code','مرجع السداد','text',true),f('payroll_month','شهر الاستقطاع','month'),f('payroll_reference','مرجع مسير الرواتب'),f('method','طريقة السداد','method'),f('notes','ملاحظات','textarea')]},
 company_profiles:{label:'هوية الشركات',singular:'هوية شركة',icon:'building',group:'الإدارة والإعدادات',fields:[f('name','الاسم الرسمي للشركة','text',true),f('english_name','اسم الشركة باللغة الإنجليزية'),f('commercial_registration','رقم السجل التجاري'),f('vat_registration','الرقم الضريبي للشركة'),f('bank_name','اسم البنك'),f('iban','رقم الآيبان'),f('bank_account','رقم الحساب البنكي'),f('phone','الهاتف'),f('email','البريد الإلكتروني','email'),f('mobile','الجوال'),f('website','الموقع الإلكتروني','url'),f('city','المدينة'),f('address','العنوان','textarea')]}

};
// Worksite company is distinct from the legal employer used for access and payroll.
modules.employees.fields.splice(2,0,f('working_company','الشركة التي يعمل بها','work_company'));
export const workflow=['draft','project_manager','projects_director','hr','approved'];
// The finance approver also manages the Accounting project. Permissions for
// approval stages are tied to existing verified accounts, not exclusive roles.
export const requestApprovalOwners={
 projects_director:{email:'mskn.kayan@gmail.com',name:'مجدي محجوب — المدير العام'},
 hr:{email:'magdiosman0@gmail.com',name:'م. محمد يوسف — شؤون الموظفين'},
 finance:{email:'altoom1900@gmail.com',name:'مصعب عبد القيوم — المالية والصرف'}
};
export const isRequestFinanceActor=user=>Boolean(user?.is_active!==false&&(user?.role==='admin'||String(user?.email||'').trim().toLowerCase()===requestApprovalOwners.finance.email&&['project_manager','finance'].includes(user?.role)));
export function isRequestStageActor(user,stage){
 if(!user||user.is_active===false)return false;
 const email=String(user.email||'').trim().toLowerCase();
 if(stage==='project_manager')return user.role==='project_manager'||user.role==='admin'&&email===requestApprovalOwners.projects_director.email||user.role==='hr'&&email===requestApprovalOwners.hr.email; // Backend additionally verifies the assigned project and manager email.
 if(stage==='projects_director')return user.role==='admin'&&email===requestApprovalOwners.projects_director.email;
 if(stage==='hr')return user.role==='hr'&&email===requestApprovalOwners.hr.email||user.role==='admin'&&email===requestApprovalOwners.projects_director.email;
 if(stage==='finance')return isRequestFinanceActor(user);
 return false;
}
export const states={draft:'مسودة',project_manager:'المدير المباشر',projects_director:'إدارة المشاريع',hr:'شؤون الموظفين',finance:'الإدارة المالية',finance_approved:'معتمد للصرف من المالية',approved:'معتمد',paid:'تم الصرف',returned:'معاد للمراجعة',rejected:'مرفوض',active:'نشط',inactive:'غير نشط',cancelled:'ملغي'};
export const saudiDate=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,10);
export function leaveAccrualAsOf(data,at=saudiDate()){
 const manual=data?.contract_expiry_mode==='manual'&&/^\d{4}-\d{2}-\d{2}$/.test(String(data?.contract_expiry||''));
 return manual?data.contract_expiry:at;
}
export function annualLeave(hire,at=saudiDate()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(hire||''))return null;
 if(isNaN(Date.parse(hire))||new Date(hire).toISOString().slice(0,10)!==hire)return null;
 const [y,m,d]=hire.split('-').map(Number);
 const anniversary=n=>{const yy=y+n;const dd=Math.min(d,new Date(Date.UTC(yy,m,0)).getUTCDate());return new Date(Date.UTC(yy,m-1,dd))};
 const now=new Date(at+'T00:00:00Z');
 if(now<anniversary(0))return {years:0,annual:21,accrued:0};
 let years=now.getUTCFullYear()-y;
 if(anniversary(years)>now)years--;
 const annual=years>=4?30:21;
 if(years===0)return {years,annual,accrued:0};
 const yearStart=anniversary(years);
 const monthDate=n=>{const yy=yearStart.getUTCFullYear(),mm=yearStart.getUTCMonth()+n;const last=new Date(Date.UTC(yy,mm+1,0)).getUTCDate();return new Date(Date.UTC(yy,mm,Math.min(yearStart.getUTCDate(),last)))};
 let months=(now.getUTCFullYear()-yearStart.getUTCFullYear())*12+now.getUTCMonth()-yearStart.getUTCMonth();
 if(monthDate(months)>now)months--;
 const from=monthDate(months),to=monthDate(months+1);
 const monthFraction=(+now-+from)/(+to-+from);
 const accrued=Math.min(years,4)*21+Math.max(years-4,0)*30+annual*(months+monthFraction)/12;
 return {years,annual,accrued:Math.round(accrued*100)/100};
}
export function serviceDuration(hire,at=saudiDate()){
 const service=annualLeave(hire,at);
 if(!service)return null;
 const start=new Date(hire+'T00:00:00Z'),today=new Date(at+'T00:00:00Z');
 if(isNaN(+today)||today<start)return {years:0,months:0,days:0,totalDays:0};
 const [y,m,d]=hire.split('-').map(Number);
 const year=service.years;
 const yy=y+year,dd=Math.min(d,new Date(Date.UTC(yy,m,0)).getUTCDate());
 const yearStart=new Date(Date.UTC(yy,m-1,dd));
 const monthly=n=>{const month=yearStart.getUTCMonth()+n;const last=new Date(Date.UTC(yy,month+1,0)).getUTCDate();return new Date(Date.UTC(yy,month,Math.min(dd,last)))};
 let months=(today.getUTCFullYear()-yy)*12+today.getUTCMonth()-yearStart.getUTCMonth();
 if(monthly(months)>today)months--;
 const days=Math.round((+today-+monthly(months))/86400000);
 return {years:year,months,days,totalDays:Math.round((+today-+start)/86400000)};
}
export function nextContractExpiry(hire,at=saudiDate()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(hire||'')||!/^\d{4}-\d{2}-\d{2}$/.test(at||''))return '';
 const start=new Date(hire+'T00:00:00Z'),today=new Date(at+'T00:00:00Z');
 if(isNaN(+start)||start.toISOString().slice(0,10)!==hire||isNaN(+today))return '';
 const [year,month,day]=hire.split('-').map(Number);
 const anniversary=n=>{const yy=year+n,dd=Math.min(day,new Date(Date.UTC(yy,month,0)).getUTCDate());return new Date(Date.UTC(yy,month-1,dd))};
 let n=Math.max(1,today.getUTCFullYear()-year);
 while(anniversary(n)<today)n++;
 return anniversary(n).toISOString().slice(0,10);
}
const numValue=v=>Number(v||0);
export function normalize(module,input){const spec=modules[module];if(!spec)throw Error('نافذة غير معروفة');if(!companies.includes(input.company))throw Error('حدد الشركة');const out={};for(const field of spec.fields){let v=String(input.data?.[field.key]??'').trim();if(module==='leave'&&field.key==='ticket'){if(v==='نعم')v='yes';if(v==='لا')v='no';}if(v.length>4000)throw Error('بيانات طويلة');if(enumOptions[field.type]&&v&&!enumOptions[field.type].some(o=>o[0]===v))throw Error('اختيار غير صالح: '+field.label);if(field.required&&!v)throw Error('أكمل '+field.label);if(field.type==='number'){let n=Number(v||0);if(!Number.isFinite(n)||Math.abs(n)>1e9||(n<0&&field.key!=='opening_leave'))throw Error('قيمة غير صالحة: '+field.label);out[field.key]=n;}else{if(field.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('بريد إلكتروني غير صحيح');if(field.type==='coordinate'&&v){let n=Number(v),limit=field.key==='latitude'?90:180;if(!Number.isFinite(n)||Math.abs(n)>limit)throw Error('إحداثيات غير صحيحة');}if(['date','month'].includes(field.type)&&v){const re=field.type==='month'?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;if(!re.test(v)||(field.type==='date'&&(isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)))throw Error('تاريخ غير صالح');}out[field.key]=v;}}
if(module==='employees'&&/^(?:مراقب|مشرف)(?:\s*[-–/]\s*(?:مراقب|مشرف))?$/.test(String(out.job||'').trim()))out.job='مشرف';
if(module==='employees'){
 out.leave_balance_mode=out.leave_balance_mode||'auto';
 out.contract_expiry_mode=out.contract_expiry_mode||'auto';
  // Contract-end based accrual must never be overridden by a stale manual entitlement.
  if(out.contract_expiry_mode==='manual')out.leave_balance_mode='auto';
 if(!['auto','manual'].includes(out.leave_balance_mode)||!['auto','manual'].includes(out.contract_expiry_mode))throw Error('طريقة الاحتساب غير صالحة');
 if(out.leave_balance_mode==='manual'&&(String(input.data?.manual_leave_entitlement??'').trim()===''||!Number.isFinite(out.manual_leave_entitlement)||out.manual_leave_entitlement<0))throw Error('أدخل إجمالي رصيد الإجازات المستحق يدويًا');
 if(out.contract_expiry_mode==='manual'){
  if(!out.contract_expiry)throw Error('حدد تاريخ انتهاء العقد اليدوي');
  if(out.hire_date&&out.contract_expiry<=out.hire_date)throw Error('تاريخ انتهاء العقد يجب أن يكون بعد تاريخ التعيين');
 }else out.contract_expiry=nextContractExpiry(out.hire_date);
 out.working_company=canonicalCompany(String(out.working_company||input.company));
 if(!companies.includes(out.working_company))throw Error('اختر الشركة التي يعمل بها الموظف من القائمة');
}
if(module==='leave'){
 const nextReturn=leaveNextDate(out.end);
 if(!nextReturn)throw Error('تاريخ نهاية الإجازة غير صالح');
 out.expected_return=nextReturn;
 const ticket=String(out.ticket||'no').trim().toLowerCase();
 if(ticket==='نعم'||ticket==='yes')out.ticket='yes';
 else if(ticket==='لا'||ticket==='no')out.ticket='no';
 if(!['yes','no'].includes(out.ticket))throw Error('حدد استحقاق تذكرة السفر بنعم أو لا');
 if(out.ticket==='no')out.ticket_due_date='';
 const fixed=fixedLeaveDays(out.leave_type);
 const calendar=leaveCalendarDays(out.start,out.end);
 const holidays=parseLeaveHolidayDates(out.holiday_dates,out.start,out.end);
 if(!out.holiday_policy)out.holiday_policy='include';
 if(!['include','exclude'].includes(out.holiday_policy))throw Error('حدد طريقة احتساب أيام العطلة');
 if(fixed!==null&&out.holiday_policy==='exclude'&&holidays.length)throw Error('لا يمكن استبعاد العطلات من الإجازة ذات المدة الثابتة');
 const expected=calendar-(out.holiday_policy==='exclude'?holidays.length:0);
 if(calendar===null||expected<1)throw Error('راجع تواريخ الإجازة والعطلات');
 if(fixed===null&&out.days!==expected)throw Error('عدد أيام الإجازة يجب أن يطابق التاريخين بعد احتساب العطلات');
 out.holiday_dates=holidays.join(',');
 if(fixed!==null&&(out.days!==fixed||out.end!==leaveEndDate(out.start,fixed)))throw Error('مدة الإجازة الخاصة يجب أن تطابق النوع المحدد وتاريخ البداية');
 if(out.end<out.start||out.days<=0||out.days>Math.floor((Date.parse(out.end)-Date.parse(out.start))/86400000)+1)throw Error('راجع فترة الإجازة وأيامها');
 // Annual paid days are deducted only once; unpaid days never reduce the annual balance.
 // Old annual requests without leave_payment remain paid for backward compatibility.
 if(out.leave_type==='unpaid')out.leave_payment='unpaid';
 else if(!out.leave_payment)out.leave_payment='paid';
 if(out.leave_type!=='annual'&&out.leave_type!=='unpaid'&&out.leave_payment!=='paid')throw Error('تقسيم مدفوع/غير مدفوع متاح للإجازة السنوية أو بدون راتب فقط');
 if(out.leave_payment==='paid')out.unpaid_days=0;
 if(out.leave_payment==='unpaid')out.unpaid_days=out.days;
 if(out.leave_payment==='mixed'){
  if(out.leave_type!=='annual'||!Number.isInteger(out.unpaid_days)||out.unpaid_days<1||out.unpaid_days>=out.days)throw Error('حدد عدد الأيام غير المدفوعة ضمن المدة، أقل من إجمالي أيام الإجازة');
 }
 if(!Number.isInteger(out.unpaid_days)||out.unpaid_days<0||out.unpaid_days>out.days)throw Error('عدد أيام الإجازة غير المدفوعة غير صالح');
 out.paid_days=out.leave_type==='annual'?out.days-out.unpaid_days:0;
 out.balance_deducted=out.leave_type==='annual'&&out.paid_days>0;
 }if(module==='advances'){
  out.schedule_mode=out.schedule_mode||'auto';
  if(!['auto','manual'].includes(out.schedule_mode))throw Error('طريقة جدولة السلفة غير صحيحة');
  if(out.schedule_mode==='auto'&&!out.installments)throw Error('حدد عدد الأقساط للجدولة التلقائية');
  if(out.schedule_mode==='auto'&&!out.first_month)throw Error('حدد شهر بداية أقساط السلفة');
  if(out.installments){
   if(!Number.isInteger(out.installments)||out.installments<1||out.installments>60)throw Error('عدد أقساط السلفة يجب أن يكون بين 1 و60');
   if(!out.first_month)throw Error('حدد شهر بداية استقطاع أقساط السلفة');
   if(out.first_month<out.date.slice(0,7))throw Error('شهر أول قسط لا يمكن أن يسبق شهر طلب السلفة');
  }else if(out.first_month)throw Error('حدد عدد الأقساط قبل شهر أول قسط');
  const cents=Math.round(out.amount*100);
  const calculatedCents=out.installments?Math.floor(cents/out.installments):0;
   const overrideCents=Math.round(Number(out.monthly_deduction||0)*100);
   if(overrideCents<0||overrideCents>cents||!Number.isSafeInteger(overrideCents))throw Error('مبلغ الاستقطاع الشهري يجب ألا يتجاوز قيمة السلفة');
   const regularCents=overrideCents||calculatedCents;
   out.monthly_deduction=regularCents/100;
  out.installment_amount=regularCents/100;
  out.final_installment=out.installments?Math.max(0,cents-regularCents*(out.installments-1))/100:0;
 }if(module==='employees'){const extra=input.data?.extra_fields;if(extra&&typeof extra==='object'&&!Array.isArray(extra)){if(Object.keys(extra).length>100)throw Error('حقول إضافية كثيرة');out.extra_fields=Object.fromEntries(Object.entries(extra).map(([k,v])=>{if(k.length>120||String(v).length>1000||['__proto__','constructor','prototype'].includes(k))throw Error('حقل إضافي غير صالح');return [k,String(v)]}));}if(!['yes','no','unknown'].includes(out.sponsorship))throw Error('حالة الكفالة غير صحيحة');if(out.hire_date>saudiDate())throw Error('تاريخ التعيين في المستقبل');let cents=Math.round(out.salary*100);
const changedFromBasic=input.salary_edit_source==='basic';
if(changedFromBasic){
 const basicCents=Math.round(Number(input.data?.basic??0)*100);
 if(!Number.isFinite(basicCents)||basicCents<0)throw Error('الراتب الأساسي غير صالح');
 cents=Math.round(basicCents/0.65);
 out.salary=cents/100;
 out.basic=basicCents/100;
 out.housing=Math.round(cents*.25)/100;
 out.transport=(cents-basicCents-Math.round(cents*.25))/100;
}else{
 out.basic=Math.round(cents*.65)/100;
 out.housing=Math.round(cents*.25)/100;
 out.transport=(cents-Math.round(cents*.65)-Math.round(cents*.25))/100;
}
const bankCents=Math.round(Number(out.bank_amount||0)*100);
if(bankCents>cents)throw Error('التحويل البنكي لا يجوز أن يتجاوز الراتب الشهري');
out.bank_amount=bankCents/100;out.cash_amount=(cents-bankCents)/100;}
if(module==='settlements'){const sum=['wages_amount','leave_amount','ticket_amount','service_amount','other_amount'].reduce((n,k)=>n+numValue(out[k]),0);if(sum>0)out.amount=Math.round(sum*100)/100;}if(module==='payroll'&&!['bank','cash','mixed'].includes(out.method))throw Error('حدد طريقة الصرف');if(['payments','contracts','purchases','advances'].includes(module)&&out.amount<=0)throw Error('المبلغ يجب أن يكون أكبر من صفر');return out;}
export const operationalModules=['employees','projects','project_managers','appointments','warnings','returns','terminations','company_profiles'];
export const enumOptions={advance_schedule:[['auto','جدولة تلقائية مع مسير الرواتب'],['manual','سداد يدوي بدون خصم تلقائي']],calculation_mode:[['auto','تلقائي'],['manual','يدوي']],leave_payment:[['paid','مدفوعة من الرصيد السنوي'],['unpaid','غير مدفوعة'],['mixed','مدفوعة جزئيًا / أيام غير مدفوعة']],sponsorship:[['yes','على الكفالة'],['no','خارج الكفالة'],['unknown','غير محدد']],method:[['bank','تحويل بنكي'],['cash','كاش'],['mixed','كاش وتحويل بنكي']],employment:[['active','نشط'],['inactive','غير نشط'],['on_leave','في إجازة'],['needs_review','بحاجة مراجعة']],ticket_eligibility:[['yes','نعم'],['no','لا']],holiday_policy:[['include','احتساب العطلة ضمن أيام الإجازة'],['exclude','استبعاد العطلة من الرصيد المخصوم']],leave_type:[['annual','سنوية'],['sick','مرضية'],['unpaid','بدون راتب'],['emergency','طارئة'],['bereavement','إجازة وفاة – 5 أيام'],['wife_childbirth','إجازة وضع الزوجة – شهران (60 يومًا)'],['marriage','إجازة زواج – 5 أيام'],['newborn','إجازة مولود – 3 أيام'],['other','أخرى']],warning_type:[['first','إنذار أول'],['second','إنذار ثان'],['final','إنذار نهائي'],['notice','تنبيه']],case_status:[['draft','قيد التجهيز'],['completed','مكتمل التسجيل'],['cancelled','ملغي']]};
export const specialLeaveDays=Object.freeze({bereavement:5,wife_childbirth:60,marriage:5,newborn:3});
enumOptions.work_company=companies.map(c=>[c,companyDisplayName(c)]);
export const fixedLeaveDays=type=>specialLeaveDays[type]||null;
export function leaveEndDate(start,days){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(start||''))||!Number.isInteger(Number(days))||Number(days)<1)return '';
 const date=new Date(start+'T00:00:00Z');if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==start)return '';
 date.setUTCDate(date.getUTCDate()+Number(days)-1);return date.toISOString().slice(0,10);
}
export function leaveNextDate(end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(end||'')))return '';
 const date=new Date(end+'T00:00:00Z');
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==end)return '';
 date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}
export function leaveCalendarDays(start,end){
 const re=/^\d{4}-\d{2}-\d{2}$/;
 if(!re.test(String(start||''))||!re.test(String(end||'')))return null;
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==start||new Date(b).toISOString().slice(0,10)!==end||b<a)return null;
 return Math.round((b-a)/86400000)+1;
}
export function parseLeaveHolidayDates(value,start,end){
 const raw=String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(raw.length>60)throw Error('الحد الأقصى 60 يوم عطلة في الطلب');
 const unique=[...new Set(raw)];
 if(unique.length!==raw.length)throw Error('تاريخ العطلة مكرر');
 for(const d of unique){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d||d<start||d>end)
    throw Error('تاريخ العطلة يجب أن يقع داخل فترة الإجازة');
 }
 return unique.sort();
}
export function leaveChargedDays(start,end,holidayDates='',policy='include'){
 const days=leaveCalendarDays(start,end);if(days===null)return null;
 const dates=parseLeaveHolidayDates(holidayDates,start,end);
 return days-(policy==='exclude'?dates.length:0);
}
export const relationModules={employee:'employees',project:'projects',leave:'leave',advance:'advances'};
export const canWrite=(role,module)=>role==='admin'||(['administrative_assistant','project_manager'].includes(role)&&['payroll','payroll_batches'].includes(module))||role==='hr'&&['project_managers','employees','appointments','leave','advances','warnings','resignations','returns','terminations','leave_dues','settlements'].includes(module)||role==='finance'&&['payroll','leave_dues','settlements','repayments'].includes(module)||role==='project_manager'&&['leave','advances','resignations','returns'].includes(module);
export const canRead=(role,module)=>role==='admin'||(role==='procurement'&&['projects','company_profiles'].includes(module))||(role==='administrative_assistant'&&['employees','projects','payroll','payroll_batches'].includes(module))||(['project_manager'].includes(role)&&['payroll','payroll_batches'].includes(module))||(['hr','finance','project_manager','projects_director'].includes(role)&&module==='company_profiles')||role==='hr'||role==='administrative_manager'&&['employees','projects','project_managers','payroll','payroll_batches'].includes(module)||role==='finance'&&['employees','projects','leave','advances','resignations','payroll','payroll_batches','settlements','repayments','leave_dues','returns','terminations'].includes(module)||['project_manager','projects_director'].includes(role)&&['employees','projects','project_managers','leave','advances','resignations','returns','terminations',...(role==='projects_director'?['payroll','payroll_batches']:[])].includes(module);
export function distanceMeters(a,b,c,d){const rad=v=>v*Math.PI/180;const q=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));}
const safeScope=(raw)=>{
 if(raw==='*'||raw===null||raw===undefined||raw==='')return null;
 try{const parsed=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(parsed)&&parsed.every(id=>typeof id==='string')?parsed:[];}catch{return []}
};
export function visible(user,row,all=[]){
 if(user.role==='admin')return true;
 if(user.role==='employee')return (row.module==='employees'&&row.id===user.employee_id)||row.data?.employee_id===user.employee_id;
 const companyScope=safeScope(user.companies);
 if(companyScope&&!companyScope.includes(row.company))return false;
 if(isRequestFinanceActor(user)&&['leave','advances'].includes(row.module)&&['finance','approved','finance_approved','paid'].includes(row.status))return true;
 if(isRequestFinanceActor(user)&&row.module==='employees'&&all.some(r=>['leave','advances'].includes(r.module)&&['finance','approved','finance_approved','paid'].includes(r.status)&&r.company===row.company&&r.data?.employee_id===row.id))return true;
 if(user.role==='project_manager'&&user.employee_id&&(row.module==='employees'&&row.id===user.employee_id||['leave','advances','resignations','returns'].includes(row.module)&&row.data?.employee_id===user.employee_id))return true;
 if(row.module==='project_managers'&&user.role==='project_manager')return String(row.data?.email||'').trim().toLowerCase()===String(user.email||'').trim().toLowerCase();
 const projectScope=safeScope(user.projects);
 const isPayroll=['payroll','payroll_batches'].includes(row.module);
 const project=isPayroll?null:row.module==='projects'?row.id:row.data?.project_id||all.find(r=>r.id===row.data?.employee_id)?.data?.project_id;
  const accountEmail=String(user.email||'').trim().toLowerCase();
  const employee=row.module==='employees'?row:all.find(e=>e.module==='employees'&&e.id===row.data?.employee_id);
  const delegated=String(employee?.data?.delegated_manager_email||'').trim().toLowerCase();
  if(user.role==='project_manager'&&['leave','advances','resignations'].includes(row.module)&&row.data?.employee_id){
    const direct=String(employee?.data?.manager_email||employee?.data?.supervisor_account||row.data?.direct_manager?.email||'').trim().toLowerCase();
    return Boolean(direct&&direct===accountEmail);
   }
   if(row.module==='employees'&&user.role==='project_manager'){
    const direct=String(row.data?.manager_email||row.data?.supervisor_account||'').trim().toLowerCase();
    if(direct&&direct===accountEmail)return true;
   }
   if(['returns','terminations','warnings','appointments'].includes(row.module)&&row.data?.employee_id){
    const direct=String(employee?.data?.manager_email||employee?.data?.supervisor_account||'').trim().toLowerCase();
    if(direct&&user.role==='project_manager')return direct===accountEmail;
   }
   if(delegated&&(row.module==='employees'||!!row.data?.employee_id))return delegated===accountEmail;
  if(row.module==='projects'&&all.some(e=>e.module==='employees'&&e.company===row.company&&e.data?.project_id===row.id&&String(e.data?.delegated_manager_email||'').trim().toLowerCase()===accountEmail))return true;
 if(user.role==='project_manager'){
  if(row.module==='payroll_batches'){
   return all.some(pay=>{
    if(pay.module!=='payroll'||pay.data?.batch_id!==row.id||pay.data?.excluded)return false;
    const projectId=String(pay.data?.project_id||all.find(e=>e.module==='employees'&&e.id===pay.data?.employee_id)?.data?.project_id||'');
    const worker=all.find(e=>e.module==='employees'&&e.id===pay.data?.employee_id);
    const reviewer=String(worker?.data?.delegated_manager_email||'').trim().toLowerCase();
    if(reviewer)return reviewer===accountEmail&&pay.company===row.company;
    if(!projectId)return false;
    if(projectScope&&!projectScope.includes(projectId))return false;
    const assigned=all.find(p=>p.module==='projects'&&p.id===projectId);
    return !!assigned&&String(assigned.data?.manager_email||'').trim().toLowerCase()===String(user.email||'').trim().toLowerCase()&&(assigned.company===row.company||Array.isArray(assigned.data?._shared_companies)&&assigned.data._shared_companies.includes(row.company));
   });
  }
  if(row.module==='payroll'){
   const projectId=String(row.data?.project_id||all.find(r=>r.id===row.data?.employee_id&&r.module==='employees')?.data?.project_id||'');
   if(!projectId)return false;
   if(projectScope&&!projectScope.includes(projectId))return false;
   const assigned=all.find(r=>r.module==='projects'&&r.id===projectId);
   if(!assigned||String(assigned.data?.manager_email||'').toLowerCase()!==String(user.email||'').toLowerCase())return false;
   return assigned.company===row.company||Array.isArray(assigned.data?._shared_companies)&&assigned.data._shared_companies.includes(row.company);
  }
  if(!project)return false;
  // A manager must be both assigned to the project and inside the explicit access scope.
  if(projectScope&&!projectScope.includes(project))return false;
  const assigned=all.find(r=>r.module==='projects'&&r.id===project);
  return Boolean(assigned&&String(assigned.data?.manager_email||'').trim().toLowerCase()===String(user.email||'').trim().toLowerCase()&&(assigned.company===row.company||Array.isArray(assigned.data?._shared_companies)&&assigned.data._shared_companies.includes(row.company)));
 }
 if(projectScope&&!isPayroll&&(!project||!projectScope.includes(project)))return false;
 return true;
}
export function permissionChoices(raw){try{const p=typeof raw==='string'?JSON.parse(raw||'{}'):raw||{};return p&&typeof p==='object'&&!Array.isArray(p)?p:{}}catch{return {}}}
export function permissionDefault(role,module,action){if(action==='edit')return canWrite(role,module);if(action==='view')return canRead(role,module);return canRead(role,module)}
export function permissionChoice(role,raw,module,action){const p=permissionChoices(raw);const v=p[module+':'+action];return typeof v==='boolean'?v:permissionDefault(role,module,action)}
export function permission(user,module,action){
 if(user.role==='admin')return true;
 const p=permissionChoices(user.permissions);
 if(p[module+':view']===false)return false;
 return p[module+':'+action]!==false;
}
export function permittedRead(user,module){return user.role==='admin'||(permission(user,module,'view')&&(permissionChoices(user.permissions)[module+':view']===true||canRead(user.role,module)))}
export function permittedWrite(user,module){return user.role==='admin'||(permittedRead(user,module)&&permission(user,module,'edit')&&(permissionChoices(user.permissions)[module+':edit']===true||canWrite(user.role,module)))}
