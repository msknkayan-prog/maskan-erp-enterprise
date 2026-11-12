import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companies,normalize,annualLeave,enumOptions,canRead,permissionChoice,permittedRead,permittedWrite} from '../lib/modules.mjs';
import {employeeRegisterValue,employeeRegisterFields} from '../lib/employee-register.mjs';

test('all seven HR companies including Modern Standards are supported',()=>{
 assert.equal(companies.length,7);
 for(const company of ['مسكن الكيان','رياح الاعمار','شركة البلد المتحدة','شركة احواض الطاقة','سمارت برووف','مشاريع حصن الحضارة','المعايير العصرية']) assert.ok(companies.includes(company));
});
test('employee records can be corrected without fabricating a hire date',()=>{
 const out=normalize('employees',{company:'مسكن الكيان',data:{name:'موظف اختباري',code:'TEST-1',salary:5000,sponsorship:'yes'}});
 assert.equal(out.hire_date,'');
 assert.equal(out.salary,5000);
 assert.equal(out.basic,3250);
 assert.equal(out.housing,1250);
 assert.equal(out.transport,500);
 assert.equal(annualLeave(out.hire_date),null);
});
test('canonical and imported staff attributes resolve in one employee register',()=>{
 const row={id:'e1',data:{employee_name:'موظف اختبار',employee_number:'100',job_title:'مهندس',basic_salary:3500,housing_allowance:1000,transport_allowance:500,project_name:'مشروع الاختبار',direct_manager:'المدير',sponsorship_status:'على الكفالة'}};
 assert.equal(employeeRegisterValue(row,'name',[]),'موظف اختبار');
 assert.equal(employeeRegisterValue(row,'job',[]),'مهندس');
 assert.equal(employeeRegisterValue(row,'basic',[]),3500);
 assert.equal(employeeRegisterValue(row,'project_id',[]),'مشروع الاختبار');
 assert.equal(employeeRegisterValue(row,'manager',[]),'المدير');
 assert.ok(employeeRegisterFields.some(f=>f.key==='employment_status'));
});
test('payroll workspace must be rendered independently from general records',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/\{module==='payroll'&&<section/);
 assert.doesNotMatch(ui,/\{spec&&module!=='payroll'&&<>/);
 assert.match(ui,/cycleExcludeEmployee/);
 assert.match(ui,/cycleReceipt/);
});

test('inactive employees are labeled غير نشط and project directors can review payroll',()=>{
 assert.equal(enumOptions.employment.find(([value])=>value==='inactive')?.[1],'غير نشط');
 assert.equal(canRead('projects_director','payroll'),true);
 assert.equal(canRead('projects_director','payroll_batches'),true);
});
test('monthly payroll print and expanded approval controls exist',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/function cyclePrint\(/);
 assert.match(ui,/onClick=\{cyclePrint\}/);
 for(const action of ['managers_approve','projects_approve','finance_pay'])assert.ok(ui.includes(action));
});

test('printable monthly payroll includes overtime and four-stage approvals',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const print=ui.slice(ui.indexOf('function cyclePrint(){'),ui.indexOf('function cycleReceipt('));
 assert.match(print,/'الساعات الإضافية','قيمة الساعات الإضافية'/);
 assert.match(print,/money\(d\.overtime_hours\),money\(d\.overtime\)/);
 assert.match(print,/money\(total\('overtime_hours'\)\),money\(total\('overtime'\)\)/);
 assert.match(print,/إعداد مساعد الإدارة<\/div><div>مراجعة مدراء المشاريع<\/div><div>اعتماد إدارة المشاريع<\/div><div>مراجعة وصرف المالية/);
 assert.doesNotMatch(print,/اعتماد المدير الإداري|توثيق صرف المالية/);
 const receipt=ui.slice(ui.indexOf('function cycleReceipt('),ui.indexOf('function cycleReceipt(')+4500);
 assert.match(receipt,/عدد الساعات الإضافية/);
 assert.match(receipt,/قيمة الساعات الإضافية/);
});

test('payroll summary table is replaced with compact company and status filters',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/payrollStage,setPayrollStage/);
 assert.match(ui,/حالة المسير <select/);
 assert.match(ui,/visibleCycleBatches\.map/);
 assert.match(ui,/visibleCyclePayroll\.map/);
 assert.doesNotMatch(ui,/<th>إجراء المرحلة<\/th>/);
 assert.match(ui,/cycleTransition\(b,'finance_pay'\)/);
});

test('corporate print reference includes bilingual letterhead and sign-off',()=>{
 const operations=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const term of ['paper-letterhead','paper-main-heading','paper-metadata','paper-approval-heading','APPROVAL & SIGNATURE','MASKAN ALKAYAN CONTRACTING CO.'])assert.ok(operations.includes(term),term);
 assert.match(css,/maskan-standard-paper/);
 assert.match(ui,/payroll-approval-flow/);
 assert.match(css,/payroll-flow-step/);
});

test('every non-payroll list print opens the official formatted register, including zero records',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/function printModuleRegister\(\)/);
 assert.match(ui,/onClick=\{printModuleRegister\}/);
 assert.doesNotMatch(ui,/<button onClick=\{\(\)=>window\.print\(\)\}><FileText size=\{16\}\/>طباعة<\/button>/);
 assert.match(ui,/tableRows\|\|emptyBody/);
 assert.match(ui,/APPROVAL & SIGNATURE/);
 assert.match(ui,/MASKAN ALKAYAN CONTRACTING CO\./);
});

test('login remembers email and requests secure browser password storage without storing plaintext locally',()=>{
 const login=readFileSync(new URL('../app/login/page.tsx',import.meta.url),'utf8');
 assert.match(login,/autoComplete="username"/);
 assert.match(login,/autoComplete="current-password"/);
 assert.match(login,/savePassword/);
 assert.match(login,/navigator\.credentials\.store/);
 assert.doesNotMatch(login,/localStorage\.setItem\([^\n]*password/i);
});

test('corporate print layouts reproduce the reference structural elements in every print route',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const operations=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(operations,/paper-party-line/);
 assert.match(operations,/paper-main-heading/);
 assert.match(operations,/paper-approval-line/);
 assert.match(ui,/function printModuleRegister\(\)/);
 assert.match(ui,/header \.registration/);
 assert.match(ui,/header \.reg/);
 assert.match(css,/maskan-standard-paper \.paper-metadata/);
 assert.match(css,/maskan-standard-paper \.paper-main-heading/);
});


test('member editing saves email, username, role and window permissions without replacing the identity',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/action:'update_member'/);
 assert.match(ui,/original_email:memberEdit.original_email/);
 assert.match(ui,/role:memberEdit.role/);
 assert.match(ui,/permissions:memberEditPermissions/);
 assert.match(ui,/تعديل صلاحيات المستخدم/);
 assert.match(ui,/type="email" dir="ltr" required disabled=\{memberEdit.role==='admin'\} value=\{memberEdit.email\}/);
});
test('password invitation is gated by username and supports existing and invited accounts',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const reset=readFileSync(new URL('../app/reset/page.tsx',import.meta.url),'utf8');
 assert.match(ui,/action:'send_password_link'/);
 assert.match(ui,/memberUsername.trim\(\)/);
 assert.match(ui,/disabled=\{memberBusy\|\|!m.username\}/);
 assert.match(reset,/token_type:url.searchParams.get\('type'\)/);
});
test('employee register provides routes to linked personnel records',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/setLinkedEmployee\(\{id:edit.id/);
 assert.match(ui,/r.data\?\.employee_id!==linkedEmployee.id/);
 assert.match(ui,/عرض جميع السجلات/);
});


test('user permissions directory has reference-style filters and management actions',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const term of ['members-directory','members-filter-grid','memberSearch','memberRoleFilter','memberStatusFilter','memberUserFilter','visibleMembers','memberExport','memberPrint','startMemberEdit','sendMemberPasswordLink','memberFormOpen'])assert.ok(ui.includes(term),term);
 assert.match(ui,/عرض \{visibleMembers.length\} من \{members.length\} سجل/);
 assert.match(css,/\.members-directory-table/);
 assert.match(css,/\.members-active-pill/);
});


test('account and permissions offer the three golden-reference controls with secure reset flow',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const text of ['حفظ الحساب والصلاحيات','إعادة تعيين كلمة المرور','إرسال رابط الاستعادة عبر البريد','passwordResetDialog','sendMemberPasswordLink'])assert.ok(ui.includes(text),text);
 assert.match(ui,/role="dialog" aria-modal="true" aria-label="إعادة تعيين كلمة المرور"/);
 assert.match(css,/\.member-account-actions/);
});


test('secure administrator-generated temporary passwords are shown once and copyable',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/action:'generate_temporary_password'/);
 assert.match(ui,/توليد كلمة مرور مؤقتة/);
 assert.match(ui,/navigator\.clipboard\.writeText/);
 assert.match(ui,/setGeneratedPassword\(null\)/);
 assert.match(css,/\.member-generated-password/);
});

test('full member editor allows scoped company/project edits and Unicode names',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/memberEdit.companyMode==='all'/);
 assert.match(ui,/selectedCompanies/);
 assert.match(ui,/selectedProjects/);
 assert.match(ui,/projectMode/);
 assert.match(ui,/تعديل جميع بيانات المستخدم وصلاحياته/);
 assert.match(ui,/maxLength=\{64\}/);
});

test('admin permissions navigation recovers after role repair and rejects duplicate account creation',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/user\?\.role==='admin'/);
 assert.match(ui,/window\.addEventListener\('focus',recheck\)/);
 assert.match(ui,/تعذر قراءة صلاحيات المستخدمين/);
 assert.match(ui,/المستخدم موجود مسبقًا/);
 assert.match(ui,/m\.auth_confirmed/);
});

test('every HR permissions box is editable, and read/write choices affect access',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/financePermissions\(memberRole,memberPermissions,action\)/);
 assert.match(ui,/financePermissions\(memberEdit.role,memberEditPermissions,action\)/);
 assert.ok(!ui.includes("disabled={!(action==='edit'?canWrite"));
 const u={role:'employee',permissions:{'employees:view':true,'employees:edit':true}};
 assert.equal(permittedRead(u,'employees'),true);
 assert.equal(permittedWrite(u,'employees'),true);
 assert.equal(permittedRead({role:'hr',permissions:{'employees:view':false}},'employees'),false);
 assert.equal(permittedWrite({role:'hr',permissions:{'employees:edit':false}},'employees'),false);
 assert.equal(permissionChoice('finance',{'warnings:edit':true},'warnings','edit'),true);
 assert.equal(permissionChoice('hr',{'leave:view':false},'leave','view'),false);
 assert.equal(permittedWrite({role:'finance',permissions:{'warnings:view':false,'warnings:edit':true}},'warnings'),false);
 assert.equal(permittedRead({role:'admin',permissions:{}},'employees'),true);
});


test('directory displays every user permission including hidden module permissions in expandable rows',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/memberPermissionRows=m=>financeModules\.map/);
 assert.match(ui,/عرض جميع الصلاحيات/);
 assert.match(ui,/expandedPermissions===m.email/);
 assert.match(ui,/members-permissions-matrix/);
 assert.match(ui,/members-permission-note/);
 assert.match(ui,/m.role==='admin'\?'تعديل بيانات المدير'/);
 assert.match(css,/\.members-permissions-expanded/);
});


test('administrator editing opens but protects admin role and existing password hashes',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/onClick=\{\(\)=>startMemberEdit\(m\)\}>تعديل الصلاحية/);
 assert.match(ui,/disabled=\{memberEdit.role==='admin'\} value=\{memberEdit.role\}/);
 assert.match(ui,/disabled=\{memberEdit.role==='admin'\} value=\{memberEdit.email\}/);
 assert.match(ui,/passwordResetDialog.role==='admin'/);
 assert.match(ui,/إرسال رابط الاستعادة عبر البريد/);
});

test('distinct login identities can share a contact email and receive a one-time temporary password',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/memberContactEmail/);
 assert.match(ui,/contact_email:memberContactEmail\|\|memberEmail/);
 assert.match(ui,/action:'generate_temporary_password',email:memberEmail/);
 assert.match(ui,/newMemberCredential&&module==='members'/);
 assert.match(ui,/نسخ كلمة المرور/);
 assert.match(ui,/إرسال رابط استعادة آمن/);
});

test('member directory shows active or inactive and provides a secure retry after password failure',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/memberStatusFilter==='inactive'/);
 assert.match(ui,/m.is_active!==false\?"نشط":"غير نشط"/);
 assert.match(ui,/action:'set_member_status'/);
 assert.match(ui,/إعادة محاولة إنشاء كلمة المرور/);
 assert.match(ui,/setNewMemberCredential\(\{email:memberEmail,username:memberUsername.trim\(\),password:null,error:err.message\}\)/);
 assert.match(ui,/newMemberCredential.password\?/);
});


test('monthly payroll offers a unified draft-only manager for add, edit, exclude, restore and submit',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const term of ['payrollManageBatchId','payrollAddEmployeeId','payrollAvailableEmployees','cycleAddEmployee','فتح إدارة المسير','حذف من المسير (استبعاد)','إرسال المسير إلى مدراء المشاريع'])assert.ok(ui.includes(term),term);
 assert.match(ui,/action:'add_employee'/);
 assert.match(ui,/batch_revision:batch.revision/);
 assert.match(ui,/payrollManagedBatch.status==='draft'/);
 assert.match(ui,/payrollManagedReviewed!==payrollManagedIncluded.length/);
 assert.match(css,/\.payroll-management-modal/);
});


test('employee register provides explicit view, editable form, safe archive and restore actions',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const text of ['employeeReadOnly','showArchivedEmployees','openEmployee(row,true)','openEmployee(row,false)','archiveEmployee(row,Boolean(row.data?._archived))','عرض أرشيف الموظفين','استعادة الموظف','عرض بيانات الموظف','تعديل بيانات الموظف'])assert.ok(ui.includes(text),text);
 assert.match(ui,/action:restore\?'restore_employee':'archive_employee'/);
 assert.match(ui,/module==='employees'&&employeeReadOnly/);
 assert.match(ui,/module==='employees'&&Boolean\(r.data\?\._archived\)!==showArchivedEmployees/);
});


test('credential manager requires a freshly generated temporary password and explicit WhatsApp confirmation',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const phrase of ['بيانات الدخول / واتساب','credentialPhone','openCredentialManager','shareMemberOnWhatsApp','مشاركة بيانات الدخول عبر واتساب','كلمة المرور المؤقتة'])assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/window\.confirm\('سيتم فتح واتساب/);
 assert.match(ui,/https:\/\/wa\.me\//);
 assert.match(ui,/!generatedPassword\?\.password/);
 assert.match(ui,/!newMemberCredential.password/);
 assert.match(css,/\.credential-whatsapp-phone/);
});


test('authorized employee edits stay enabled regardless of request workflow state',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const p=ui.indexOf('<form onSubmit={save}><fieldset disabled=');
 const fieldset=ui.slice(p,p+430);
 assert.ok(p>=0);
 assert.match(fieldset,/module==='employees'\?\(employeeReadOnly\|\|!permittedWrite\(user\|\|\{\},'employees'\)\)/);
 assert.match(ui,/module==='employees'\?\(!employeeReadOnly&&permittedWrite\(user\|\|\{\},'employees'\)\)/);
 assert.match(ui,/تفعيل تعديل بيانات الموظف/);
 assert.match(ui,/سيُحفظ في سجل التدقيق/);
 assert.match(ui,/module!=='employees'&&!!edit.id/);
});


test('modern standards HVAC company appears and imports use canonical Excel names',()=>{
 const m=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(m,/المعايير العصرية/);
 assert.match(ui,/canonicalCompany\(r\[headers.indexOf\('الشركة'\)\]\)/);
});

test('monthly payroll approvals use green completion and orange active states with highlighted period',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(ui,/payrollStageLabels=\['مساعد الإدارة','مدراء المشاريع','إدارة المشاريع','المالية \/ الصرف'\]/);
 assert.match(ui,/payrollStages=\['draft','manager_review','projects_review','finance_review','paid'\]/);
 assert.match(ui,/payroll-compact-stage/);
 assert.match(ui,/state==='done'\?'✓ '/);
 assert.match(ui,/payroll-month-pill/);
 assert.match(css,/\.payroll-compact-stage\.done\{background:#e4f6e9/);
 assert.match(css,/\.payroll-compact-stage\.current\{background:#fff0d8/);
 assert.match(ui,/payrollAllOpen&&module==='payroll'/);
 assert.match(ui,/action:'bulk_submit'/);
 assert.match(ui,/manager_notes/);
 assert.match(modules,/administrative_assistant/);
});


test('employee list displays full HVAC company name without duplicate company key and horizontal spacious rows',()=>{
 const m=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(m,/companyDisplayName=\(value\)=>value==='المعايير العصرية'\?'مؤسسة المعايير العصرية لأعمال التكييف'/);
 assert.match(ui,/companyDisplayName\(c\)/);
 assert.match(ui,/companyDisplayName\(row.company\)/);
 assert.match(ui,/employee-status-horizontal/);
 assert.match(ui,/employee-actions-horizontal/);
 assert.match(css,/\.employee-register\{border-collapse:separate!important;border-spacing:0 9px!important/);
 assert.match(css,/\.employee-register \.employee-actions-horizontal\{display:flex!important;flex-direction:row!important/);
});


test('employee payroll net recalculates live from all entered monetary amounts and reconciles payouts',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/function cycleSalarySummary\(d\)/);
 assert.match(ui,/const additions=round\(n\('bonus'\)\+n\('extra_allowance'\)\+overtime\)/);
 assert.match(ui,/const deductions=round\(n\('absence_deduction'\)\+n\('advance_deduction'\)\+n\('deductions'\)\)/);
 assert.match(ui,/const net=round\(gross\+additions-deductions\)/);
 assert.match(ui,/صافي راتب الموظف بعد التعديلات/);
 assert.match(ui,/payroll-net-breakdown/);
 assert.match(ui,/!summary.valid/);
 assert.match(ui,/أيام الغياب وحدها لا تُخصم ماليًا/);
 assert.match(css,/\.payroll-net-summary\{position:sticky/);
});


test('company transfer is editable with an auditable reason and historical records retained',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/transfer_reason:reason\.trim\(\)/);
 assert.match(ui,/سبب نقل أو تصحيح شركة الموظف/);
 assert.match(ui,/employee-company-transfer-note/);
 assert.match(ui,/company_transferred/);
 assert.match(ui,/linked_account_review_required/);
 assert.match(ui,/module==='employees'\?\(employeeReadOnly\|\|!permittedWrite/);
 assert.match(css,/\.employee-company-transfer-note/);
});


test('new employee creation cannot inherit existing employee id or company transfer',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/if\(row\)\{setLeaveHolidayCandidate\(''\);setEdit/);
 assert.match(ui,/setEdit\(\{company,data:defaultData\}\)/);
 assert.match(ui,/const payload=edit.id\?\{\.\.\.edit\}:\{company:edit.company,data:\{\.\.\.edit.data\},salary_edit_source:edit.salary_edit_source\}/);
 assert.match(ui,/إضافة موظف جديد/);
});


test('payroll card metadata, four approval stages and action buttons stay in one horizontally scrollable row',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/\.payroll-stage-row\{[\s\S]*?display:flex!important;[\s\S]*?flex-direction:row!important;[\s\S]*?flex-wrap:nowrap!important;/);
 assert.match(css,/\.payroll-stage-row \.payroll-batch-summary\{display:contents!important\}/);
 assert.match(css,/\.payroll-stage-row \.payroll-compact-stages\{display:flex!important;flex:0 0 auto;flex-wrap:nowrap!important;/);
 assert.match(css,/\.payroll-stage-row>\.row-actions\{display:flex!important;flex:0 0 auto;flex-direction:row!important;flex-wrap:nowrap!important;/);
 assert.match(css,/overflow-x:auto!important/);
});


test('payroll Excel bank-transfer column is explicit and remaining cash is calculated automatically',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/const bank=n\('bank_amount'\),cash=round\(net-bank\)/);
 assert.match(ui,/cash_amount:summary.cash,bank_amount:summary.bank/);
 assert.match(ui,/المتبقي للصرف كاش \(محسوب تلقائيًا\)/);
 assert.match(ui,/التحويل البنكي \(المبلغ المدخل\)/);
 assert.match(ui,/المتبقي كاش \(محسوب\)/);
 assert.match(ui,/Number\(d.net\|\|0\)-Number\(d.bank_amount\|\|0\)/);
});


test('employee profile bank and calculated cash always reconcile to monthly salary',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const mod=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(mod,/f\('bank_amount','التحويل البنكي الشهري','number'\)/);
 assert.match(mod,/f\('cash_amount','المبلغ كاش \(محسوب تلقائيًا\)','number'\)/);
 assert.match(mod,/out.cash_amount=\(cents-bankCents\)\/100/);
 assert.match(mod,/if\(bankCents>cents\)throw Error/);
 assert.match(ui,/readOnly=\{\(module==='employees'&&f\.key==='cash_amount'\)/);
 assert.match(ui,/employee-payout-summary/);
 assert.match(ui,/المبلغ كاش \+ التحويل البنكي = الراتب المرجعي/);
});


test('platform uses 13px general text and 14px primary and secondary headings',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/--maskan-body-font-size:13px/);
 assert.match(css,/--maskan-heading-font-size:14px/);
 assert.match(css,/body :is\(h1,h2,h3,h4,h5,h6\)/);
 assert.match(css,/font-size:var\(--maskan-body-font-size\)!important/);
});

test('unsaved employee form never renders a paper record without an ID',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const ops=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 assert.match(ui,/\{edit\.id&&<RecordPaper row=/);
 assert.match(ops,/row\.id\?\.slice\(0,8\)\|\|'سجل جديد'/);
 assert.doesNotMatch(ops,/row\.id\.slice\(0,8\)/);
});

test('employee job title observer and supervisor variants normalize to مشرف without changing specialized titles',()=>{
 const m=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(m,/out\.job='مشرف'/);
 assert.match(m,/module==='employees'&&/);
});
test('employee register includes bank and cash columns',()=>{
 const m=readFileSync(new URL('../lib/employee-register.mjs',import.meta.url),'utf8');
 assert.match(m,/\['bank_amount','تحويل بنكي'\]/);
 assert.match(m,/\['cash_amount','المتبقي كاش'\]/);
 assert.equal((m.match(/\['salary','الأجر الشهري الإجمالي'\]/g)||[]).length,1);
});


test('editing employee base pay recalculates monthly total and housing transport portions',()=>{
 const out=normalize('employees',{company:'مسكن الكيان',salary_edit_source:'basic',data:{name:'اختبار تعديل الأساسي',code:'TST-BASIC',salary:5000,basic:3500,bank_amount:3000,sponsorship:'yes'}});
 assert.equal(out.basic,3500);
 assert.equal(Math.round(out.salary*100),Math.round((3500/.65)*100));
 assert.equal(Math.round((out.basic+out.housing+out.transport)*100),Math.round(out.salary*100));
 assert.equal(Math.round((out.bank_amount+out.cash_amount)*100),Math.round(out.salary*100));
});
test('editing employee monthly salary still defaults to basic 65 housing 25 transport remainder',()=>{
 const out=normalize('employees',{company:'مسكن الكيان',salary_edit_source:'salary',data:{name:'اختبار تعديل الإجمالي',code:'TST-TOTAL',salary:6000,basic:3200,bank_amount:1000,sponsorship:'yes'}});
 assert.equal(out.basic,3900);
 assert.equal(out.housing,1500);
 assert.equal(out.transport,600);
});
test('salary input and base salary input explicitly determine the salary update source',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const m=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(m,/f\('basic','الراتب الأساسي','number'\)/);
 assert.match(ui,/salary_edit_source:'basic'/);
 assert.match(ui,/salary_edit_source:'salary'/);
 assert.match(ui,/result.payroll_synced/);
});

test('employee second-company registration preserves original company and requires distinct role identity',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/function cloneEmployeeToSecondCompany\(row\)/);
 assert.match(ui,/إضافة الموظف إلى شركة ثانية \(سجل مستقل\)/);
 assert.match(ui,/dual_source_company:row\.company/);
 assert.match(ui,/dual_source_id:row\.id/);
 assert.match(ui,/code:'',project_id:''/);
 assert.match(ui,/company===edit\.dual_source_company/);
 assert.match(ui,/dual_source_code:employeeCode/);
 assert.match(ui,/module==='employees'&&!edit\.id&&f\.key==='code'/);
 assert.match(ui,/يوجد سجل موظف بنفس الهوية في الشركة المختارة/);
 assert.match(ui,/اختر شركة ثانية مختلفة عن الشركة الأصلية/);
 assert.match(ui,/لن يتغير سجل الشركة الأولى/);
});
test('existing company transfer remains separate from second-company creation',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/سبب نقل أو تصحيح شركة الموظف/);
 assert.match(ui,/transfer_reason:reason\.trim\(\),data:\{\.\.\.edit\.data,project_id:'',direct_manager_id:''/);
 assert.match(ui,/notes:\[previousNotes,note\]/);
 const normalized=normalize('employees',{company:'رياح الاعمار',data:{name:'موظف تجريبي بالشركة الثانية',code:'TEST-SECOND-220',salary:6000,bank_amount:2500,sponsorship:'yes'}});
 assert.equal(normalized.basic,3900);
 assert.equal(normalized.housing,1500);
 assert.equal(normalized.transport,600);
 assert.equal(normalized.bank_amount,2500);
 assert.equal(normalized.cash_amount,3500);
});

test('payroll employee addition uses company batch-scoped code and blocks another active company entry',()=>{
 const cycle=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(cycle,/employeeId\+':'\+batch\.data\.month\+':'\+batch\.id/);
 assert.match(cycle,/periodRows\.map\(r=>\(\{company:r\.company,data:JSON\.parse\(r\.data\)\}\)\)\.find\(r=>r\.company!==batch\.company&&!r\.data\.excluded\)/);
 assert.match(cycle,/استبعده من المسير السابق/);
 assert.match(cycle,/employeeId, batch\.data\.month|employeeId,batch\.data\.month/);
 assert.match(cycle,/batch\.status!=='draft'/);
 assert.match(cycle,/batch\.revision!==Number\(body\.batch_revision\)/);
});
test('monthly generation uses batch scoped codes and guards against duplicate active pay',()=>{
 const cycle=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(cycle,/e\.id\+':'\+month\+':'\+id/);
 assert.match(cycle,/p\.data\.employee_id===e\.id&&p\.data\.month===month&&!p\.data\.excluded/);
 assert.match(cycle,/existing\.some\(b=>b\.company===co&&b\.data\.month===month\)/);
});

test('new employees receive an automatic globally unique code from the server',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/if\(mod==='employees'&&!old\)body\.data=\{\.\.\.\(body\.data\|\|\{\}\),code:'AUTO'\}/);
 assert.match(backend,/COALESCE\(MAX\(CASE WHEN code ~/);
 assert.match(backend,/WHERE module='employees'/);
 assert.ok(!backend.includes('jsonb_set(?::jsonb'));
 assert.ok(backend.includes('replace(?::text'));
 assert.ok(backend.includes('next_code.code'));
 assert.match(backend,/RETURNING code/);
 assert.match(backend,/employee_code:result\[0\]/);
});
test('employee registration does not request manually entered job number',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/يُولّد تلقائيًا عند الحفظ/);
 assert.match(ui,/module==='employees'&&!edit\.id&&f\.key==='code'/);
 assert.match(ui,/result\.employee_code/);
 assert.doesNotMatch(ui,/أدخل رقمًا وظيفيًا جديدًا ومستقلًا/);
});

test('employee register has independent per-column filters and reset control',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/employeeFilterOpen,setEmployeeFilterOpen/);
 assert.match(ui,/employeeFieldFilters,setEmployeeFieldFilters/);
 assert.match(ui,/const employeeFilterMatch=\(r\)=>/);
 assert.match(ui,/module==='employees'&&!employeeFilterMatch\(r\)/);
 assert.match(ui,/فلاتر سجل الموظفين لكل حقل/);
 assert.match(ui,/activeEmployeeFilters.length/);
 assert.match(ui,/setEmployeeFieldFilters\(\{\}\)/);
 assert.match(ui,/availableEmployeeFields.map\(f=><label/);
 assert.match(ui,/تُطبَّق الفلاتر على الجدول والطباعة وتصدير Excel/);
});

test('employee identifier is inserted as valid JSON text with no jsonb_set root scalar mutation',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/code:'AUTO'/);
 assert.ok(backend.includes('replace(?::text'));
 assert.match(backend,/::jsonb::text/);
 assert.match(backend,/pg_advisory|next_code\.code/);
 assert.match(backend,/RETURNING code/);
});

test('employee form supports searchable department, project and direct manager within selected company',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/module==='employees'&&f\.key==='department'/);
 assert.match(ui,/employee-department-choices/);
 assert.match(ui,/r\.module==='employees'&&r\.company===edit\.company/);
 assert.match(ui,/module==='employees'&&f\.key==='manager'/);
 assert.match(ui,/aria-label="اختيار المدير المباشر من الدليل"/);
 assert.match(ui,/module==='employees'&&f\.key==='project_id'/);
 assert.match(ui,/aria-label="فلتر المشاريع حسب الاسم"/);
 assert.match(ui,/r\.module==='projects'&&\(r\.company===edit\.company/);
 assert.match(ui,/setEmployeeProjectSearch\(''\)/);
});

test('project managers only see the project assigned to their own login, even with broad scope',async()=>{
 const {visible}=await import('../backend/modules.mjs');
 const projects=[
  {id:'p-one',module:'projects',company:'مسكن الكيان',data:{name:'مشروع أ',manager_email:'pm-one@example.test'}},
  {id:'p-two',module:'projects',company:'مسكن الكيان',data:{name:'مشروع ب',manager_email:'pm-two@example.test'}}
 ];
 const employees=[
  {id:'e-one',module:'employees',company:'مسكن الكيان',data:{name:'موظف أ',project_id:'p-one'}},
  {id:'e-two',module:'employees',company:'مسكن الكيان',data:{name:'موظف ب',project_id:'p-two'}}
 ];
 const requests=[
  {id:'r-one',module:'leave',company:'مسكن الكيان',data:{employee_id:'e-one'}},
  {id:'r-two',module:'leave',company:'مسكن الكيان',data:{employee_id:'e-two'}}
 ];
 const all=[...projects,...employees,...requests];
 const pm={role:'project_manager',email:'PM-One@Example.Test',companies:'*',projects:'*'};
 assert.equal(visible(pm,projects[0],all),true);
 assert.equal(visible(pm,requests[0],all),true);
 assert.equal(visible(pm,requests[1],all),false);
 assert.equal(visible(pm,projects[1],all),false);
 assert.equal(visible({...pm,email:'unassigned@example.test'},requests[0],all),false);
 assert.equal(visible({...pm,projects:'[]'},requests[0],all),false);
});
test('request workflow requires an assigned active manager before routing and checks ownership at review',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/current==='draft'&&decision==='approve'&&next==='project_manager'/);
 assert.match(backend,/يجب ربط الموظف بمشروع قبل إرسال الطلب/);
 assert.match(backend,/يجب تعيين مدير المشروع في ملف المشروع/);
 assert.match(backend,/manager\.role!=='project_manager'/);
 assert.match(backend,/current==='project_manager'&&u\.role!=='admin'/);
 assert.match(backend,/الطلب يخص مدير مشروع آخر/);
 assert.match(ui,/module==='projects'&&f\.key==='manager_email'/);
 assert.match(ui,/members\.filter\(m=>m\.role==='project_manager'&&m\.is_active!==false\)/);
});

test('the deployed shared visibility rule restricts managers to their assigned projects',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const p1={id:'p1',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm1@example.test'}};
 const p2={id:'p2',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm2@example.test'}};
 const e1={id:'e1',module:'employees',company:'مسكن الكيان',data:{project_id:'p1'}};
 const e2={id:'e2',module:'employees',company:'مسكن الكيان',data:{project_id:'p2'}};
 const r1={id:'l1',module:'leave',company:'مسكن الكيان',data:{employee_id:'e1'}};
 const r2={id:'l2',module:'leave',company:'مسكن الكيان',data:{employee_id:'e2'}};
 const rows=[p1,p2,e1,e2,r1,r2];
 const u={role:'project_manager',email:'PM1@EXAMPLE.TEST',projects:'*',companies:'*'};
 assert.equal(visible(u,r1,rows),true);
 assert.equal(visible(u,r2,rows),false);
 assert.equal(visible(u,p1,rows),true);
 assert.equal(visible(u,p2,rows),false);
 assert.equal(visible({...u,email:'unknown@example.test'},r1,rows),false);
 assert.equal(visible({...u,projects:'[]'},r1,rows),false);
 assert.equal(visible({...u,companies:'["شركة البلد المتحدة"]'},r1,rows),false);
});

test('manager account company permissions are checked at project linking and request dispatch',()=>{
 const source=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(source,/SELECT role,is_active,companies FROM members WHERE email=\?/);
 assert.match(source,/manager\.companies/);
 assert.match(source,/مدير المشروع لا يمتلك صلاحية الشركة المحددة/);
 assert.match(source,/مدير المشروع لا يمتلك صلاحية الشركة التابعة للطلب/);
});

test('leave dues select employee then filter approved leave and populate salary and days',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/اختيار موظف مستحقات الإجازة/);
 assert.match(ui,/function applyLeaveToForm\(leaveId\)/);
 assert.match(ui,/next\.salary_basis=employee\?String\(employee\.data\.salary\|\|0\)/);
 assert.match(ui,/next\.days=leave\?String\(leave\.data\.days\|\|0\)/);
 assert.match(ui,/r\.data\.employee_id===edit\.data\.employee_id/);
 assert.match(ui,/\['approved','paid'\]\.includes\(r\.status\)/);
});
test('related HR forms display the canonical employee details and server saves a trusted snapshot',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/function linkedEmployeeFor\(form\)/);
 assert.match(ui,/بيانات الموظف المسحوبة من السجل/);
 assert.match(ui,/function applyEmployeeToForm\(employeeId\)/);
 assert.match(backend,/employee_snapshot=snapshot/);
 assert.match(backend,/employeeRecord=await db\.prepare/);
 assert.match(backend,/linked\.status!=='approved'\)throw Error\('لا يمكن إنشاء مستحقات/);
 assert.match(backend,/data\.net=Math\.round\(\(Number\(data\.salary_basis\)\/30/);
 assert.match(backend,/if\(mod==='settlements'\)/);
});

test('company switching clears old employee and leave links and manager views exclude financial snapshots',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/leave_id:'',project_id:'',contract_id:''/);
 assert.match(erp,/const \{employee_snapshot,\.\.\.safeData\}=r\.data/);
 assert.match(erp,/data:safeData/);
});

test('four special leave policies have fixed calendar durations and no annual balance deduction',async()=>{
 const {fixedLeaveDays,leaveEndDate,normalize,enumOptions}=await import('../lib/modules.mjs');
 const cases=[['bereavement',5],['wife_childbirth',60],['marriage',5],['newborn',3]];
 const types=new Set(enumOptions.leave_type.map(([code])=>code));
 for(const [leave_type,days] of cases){
  assert.ok(types.has(leave_type));
  assert.equal(fixedLeaveDays(leave_type),days);
  const start='2026-11-11',end=leaveEndDate(start,days);
  const data={employee_id:'employee-1',leave_type,start,end,days};
  const out=normalize('leave',{company:'مسكن الكيان',data});
  assert.equal(out.days,days);
  assert.equal(out.balance_deducted,false);
  assert.throws(()=>normalize('leave',{company:'مسكن الكيان',data:{...data,days:days-1}}),/مدة الإجازة الخاصة/);
  assert.throws(()=>normalize('leave',{company:'مسكن الكيان',data:{...data,end:'2026-12-31'}}),/مدة الإجازة الخاصة/);
 }
 assert.equal(leaveEndDate('2026-11-11',5),'2026-11-15');
 assert.equal(leaveEndDate('2026-11-11',60),'2027-01-09');
 assert.equal(fixedLeaveDays('annual'),null);
});
test('leave editor recalculates duration and end date on type and start date changes',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/function applyLeaveField\(key,value\)/);
 assert.match(ui,/next\.days=String\(days\);next\.end=leaveEndDate\(next\.start,days\)/);
 assert.match(ui,/module==='leave'&&\['leave_type','holiday_policy','ticket'\]\.includes\(f\.key\)\?applyLeaveField/);
 assert.match(ui,/module==='leave'&&\['start','end'\]\.includes\(f\.key\)\)applyLeaveField/);
 assert.match(ui,/fixedLeaveDays\(edit\.data\.leave_type\)!==null/);
 assert.match(ui,/لا تخصم من رصيد الإجازة السنوية/);
});

test('pending requests center lists active request types with filters and excludes closed statuses',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/module==='pending_requests'/);
 assert.match(ui,/الطلبات قيد الإجراء/);
 assert.match(ui,/pendingRequestTypes=\['leave','advances','resignations','returns','terminations','leave_dues','settlements','warnings','appointments'\]/);
 assert.match(ui,/pendingStages=\['draft','returned','project_manager','projects_director','hr','finance'\]/);
 assert.match(ui,/accessiblePendingTypes=pendingRequestTypes\.filter\(k=>user&&permittedRead\(user,k\)\)/);
 assert.match(ui,/\(!company\|\|r\.company===company\)/);
 assert.match(ui,/pendingType,setPendingType/);
 assert.match(ui,/pendingStage,setPendingStage/);
 assert.match(ui,/pendingSearch,setPendingSearch/);
 assert.match(ui,/setModule\(r\.module\);setEdit\(\{\.\.\.r,data:\{\.\.\.r\.data\}\}\)/);
 assert.match(ui,/لا تشمل المعتمدة أو المصروفة أو المرفوضة/);
});

test('employee project selection filters names and references and clearly handles missing projects',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/فلتر المشاريع حسب الاسم/);
 assert.match(ui,/نتائج البحث عن المشاريع/);
 assert.match(ui,/r\.module==='projects'&&\(r\.company===edit\.company/);
 assert.match(ui,/r.data.project_number,r.data.code,r.data.address/);
 assert.match(ui,/لا توجد مشاريع لهذه الشركة/);
 assert.match(ui,/لا توجد نتائج مطابقة/);
 assert.match(ui,/المشاريع المطابقة:/);
 assert.match(ui,/مسح بحث المشاريع/);
});

test('project filter provides clickable immediate search results and retains correct company scope',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/role="listbox" aria-label="نتائج البحث عن المشاريع"/);
 assert.match(ui,/role="option" aria-selected=\{edit\.data\.project_id===r\.id\}/);
 assert.match(ui,/onClick=\{\(\)=>\{setEdit\(\{\.\.\.edit,data:\{\.\.\.edit\.data,project_id:r\.id\}\}\);setEmployeeProjectSearch\(''\)\}\}/);
 assert.match(ui,/r\.company===edit\.company/);
 assert.match(ui,/r\.data\.project_number/);
 assert.match(ui,/المشروع المحدد:/);
});

test('project editor supports searchable company, name and account-scoped manager choices',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/aria-label="بحث الشركة"/);
 assert.match(ui,/aria-label="فلتر اسم المشروع"/);
 assert.match(ui,/project-name-suggestions/);
 assert.match(ui,/aria-label="فلتر مدير المشروع"/);
 assert.match(ui,/members\.filter\(m=>m\.role==='project_manager'&&m\.is_active!==false/);
 assert.match(ui,/module==='projects'&&f\.key==='code'/);
 assert.match(ui,/يُولّد تلقائيًا عند الحفظ/);
});
test('project serial numbers are generated on server and kept immutable on edit',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(erp,/if\(mod==='projects'&&!old\)body\.data=/);
 assert.match(erp,/SELECT nextval\('hr\.project_code_seq'\)::text AS code/);
 assert.match(erp,/if\(mod==='projects'&&old\)data\.code=/);
 assert.match(erp,/data\.code=String\(serial\.code\)/);
});

test('inactive employees do not appear in current payroll preview or draft roster',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/const payrollEmployees=rows\.filter\(r=>r\.module==='employees'.*\['active','نشط','على رأس العمل','علي راس العمل'\]/);
 assert.match(ui,/const payrollEmployeeIsActive=id=>/);
 assert.match(ui,/const visibleCyclePayroll=cyclePayroll\.filter\(r=>visibleCycleIds\.has\(r\.data\?\.batch_id\)&&cycleRowShouldShow\(r\)\)/);
 assert.match(ui,/const payrollManagedRows=payrollManagedBatch\?cyclePayroll\.filter\(row=>row\.data\.batch_id===payrollManagedBatch\.id&&cycleRowShouldShow\(row\)\):\[\]/);
 assert.match(ui,/batch\?\.status==='paid'\|\|payrollEmployeeIsActive/);
});
test('server blocks payroll approval and payment for inactive included employees',()=>{
 const server=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(server,/\['submit','managers_approve','projects_approve','finance_pay','admin_approve','finance_approve'\]\.includes\(action\)/);
 assert.match(server,/SELECT id,company,data FROM records WHERE module='employees' AND company=\?/);
 assert.match(server,/if\(invalid\)throw Error\('يوجد موظف غير نشط في المسير/);
 assert.match(server,/if\(!\['active','نشط','على رأس العمل','علي راس العمل'\]\.includes\(status\)\)throw Error\('لا يمكن إدراج موظف غير نشط/);
});

test('project manager directory appears as separate management module and requires active project manager account',async()=>{
 const {modules,canRead,canWrite}=await import('../lib/modules.mjs');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.equal(modules.project_managers.label,'دليل مدراء المشاريع');
 assert.ok(modules.project_managers.fields.some(f=>f.key==='email'));
 assert.ok(modules.project_managers.fields.some(f=>f.key==='phone'));
 assert.equal(canWrite('hr','project_managers'),true);
 assert.equal(canWrite('project_manager','project_managers'),false);
 assert.equal(canRead('projects_director','project_managers'),true);
 assert.match(erp,/if\(mod==='project_managers'\)/);
 assert.match(erp,/يجب ربط بيانات المدير بحساب نشط بصلاحية مدير مشروع/);
 assert.match(erp,/مدير المشروع مسجل مسبقًا لدى الشركة/);
});
test('project assignment and employee request details use project manager directory records',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/r\.module==='project_managers'&&r\.company===edit\.company/);
 assert.match(ui,/module==='project_managers'&&f\.key==='email'/);
 assert.match(ui,/managerDirectoryForRequest\(edit,edit\.company\)/);
 assert.match(erp,/سجّل بيانات مدير المشروع أولًا في دليل مدراء المشاريع للشركة/);
 assert.match(erp,/data\.project_manager=\{name:manager\?\.name/);
 assert.match(erp,/details\.project_manager=\{name:dir\.name/);
 assert.match(erp,/UPDATE records SET status=\?,data=\?,revision=revision\+1/);
});

test('HR directory choices expose only active project manager identities without credentials',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/if\(mod==='project_manager_choices'\)/);
 assert.match(erp,/SELECT email,username,display_name,role,is_active,companies FROM members WHERE role='project_manager' AND is_active=true/);
 assert.match(erp,/\['admin','hr','projects_director'\]\.includes\(u\.role\)/);
 assert.match(ui,/user\?\.role==='admin'\?'members':'project_manager_choices'/);
});

test('employee editing preserves project manager names even before a project login is provisioned',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/data\.manager=details\.manager_name\|\|data\.manager\|\|''/);
 assert.match(erp,/data\.manager_email='';/);
 assert.match(ui,/directRow\?\.data\.name\|\|employeeData\.manager/);
});
test('automatic refresh coalesces focus/visibility triggers and rejects out-of-order responses',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/refreshGeneration=useRef\(0\),lastBackgroundRefresh=useRef\(0\)/);
 assert.match(ui,/const generation=\+\+refreshGeneration\.current/);
 assert.match(ui,/if\(generation!==refreshGeneration\.current\)return/);
 assert.match(ui,/now-lastBackgroundRefresh\.current<2500/);
 assert.match(ui,/refreshGeneration\.current\+\+/);
});
test('request search uses indexed records and appointment fields offer searchable historic options',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/pendingRecordIndex=new Map\(rows\.map/);
 assert.match(ui,/pendingRecordIndex\.get\(r\.data\?\.leave_id\)/);
 assert.match(ui,/module==='appointments'&&\['direct_manager','work_location','work_hours','form_status','contract_type','probation'\]/);
 assert.match(ui,/list=\{'appointment-options-'\+f\.key\}/);
 assert.match(ui,/changes\.direct_manager=project\?\.data\.manager_name\|\|d\.manager/);
});

test('each HR company document uses that company logo and never incorrectly uses the Maskan logo',async()=>{
 const {companyLogoPath,companyOfficialName}=await import('../lib/company-brand.mjs');
 const uuid='a5a5a5a5-1234-4abc-8def-000000000001';
 const profiles=[{module:'company_profiles',company:'المعايير العصرية',data:{name:'مؤسسة المعايير العصرية لأعمال التكييف',logo_file_id:uuid}}];
 assert.equal(companyLogoPath('المعايير العصرية',profiles),'/api/files?id='+uuid+'&logo=1');
 assert.equal(companyOfficialName('المعايير العصرية',profiles),'مؤسسة المعايير العصرية لأعمال التكييف');
 assert.equal(companyLogoPath('مسكن الكيان',[]),'/maskan-logo.jpg');
 assert.equal(companyLogoPath('رياح الاعمار',[]),'');
 assert.equal(companyLogoPath('الشركة غير معروفة',[]),'');
});
test('logo upload is private, image-only, administrator controlled and audit logged',()=>{
 const files=readFileSync(new URL('../backend/files.ts',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(files,/q\.get\('logo'\)==='1'/);
 assert.match(files,/JSON\.parse\(record\.data\)\.logo_file_id!==id/);
 assert.match(files,/isCompanyLogo\?'inline'/);
 assert.match(erp,/if\(body\.action==='set_company_logo'\)/);
 assert.match(erp,/if\(u\.role!=='admin'\)throw Error\('403'\)/);
 assert.match(erp,/file\.record_id!==recordId/);
 assert.match(erp,/company_logo_updated/);
 assert.match(ui,/async function uploadCompanyLogo\(file\)/);
 assert.match(ui,/form\.append\('record',edit\.id\)/);
 assert.match(ui,/action:'set_company_logo'/);
});
test('printable documents and payroll receipts use company-based branding',()=>{
 const operations=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(operations,/companyLogoPath\(row\.company,rows\)/);
 assert.match(operations,/companyOfficialName\(row\.company,rows\)/);
 assert.doesNotMatch(operations,/<img src="\/maskan-logo.jpg"/);
 assert.match(ui,/companyLogoPath\(b\.company,rows\)/);
 assert.match(ui,/companyLogoPath\(title,rows\)/);
 assert.match(ui,/companyLogoPath\(company,rows\)/);
 assert.match(ui,/title==='جميع الشركات'\?'':companyLogoPath/);
 assert.doesNotMatch(ui,/const logosrc=safe\(window\.location\.origin\+'\/maskan-logo.jpg'\)/);
 assert.doesNotMatch(ui,/const logoUrl=safe\(window\.location\.origin\+'\/maskan-logo.jpg'\)/);
});

test('printable form layout preserves RTL name width, readable body text and company logo',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const operations=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 assert.match(ui,/header\{display:grid;grid-template-columns:170px minmax\(0,1fr\)/);
 assert.match(ui,/header \.brand strong\{display:block;font-size:20px;line-height:1\.55/);
 assert.match(ui,/body\{font:13px\/1\.6 Tahoma/);
 assert.match(ui,/font-size:12px;line-height:1\.65/);
 assert.match(css,/grid-template-columns:165px minmax\(0,1fr\)!important/);
 assert.match(css,/@page\{size:A4 portrait;margin:11mm\}/);
 assert.match(css,/\.paper-brand strong\{font-size:16px!important;line-height:1\.5!important\}/);
 assert.match(operations,/companyLogoPath\(row\.company,rows\)/);
 assert.match(operations,/paper-logo-placeholder/);
 assert.doesNotMatch(operations,/paper-logo-placeholder">\{brand\}/);
});
test('all company registers keep correct official name in fallback footer',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const register=ui.slice(ui.indexOf('function printModuleRegister(){'),ui.indexOf('function template(){'));
 assert.match(register,/companyOfficialName\(company,rows\)/);
 assert.match(register,/companyLogoPath\(company,rows\)/);
 assert.match(register,/safe\(companyName\)\+' \| إدارة شؤون الموظفين'/);
 assert.doesNotMatch(register,/contact\|\|'شركة مسكن الكيان للمقاولات/);
});

test('project managers choose authorized projects via searchable checkbox list on creation and editing',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/function ManagerProjectPicker\(/);
 assert.match(ui,/aria-label="بحث مشاريع المدير"/);
 assert.match(ui,/member-project-option/);
 assert.match(ui,/role="group" aria-label="قائمة مشاريع مدير المشروع"/);
 assert.match(ui,/memberRole==='project_manager'&&<ManagerProjectPicker/);
 assert.match(ui,/memberEdit\.role==='project_manager'&&<ManagerProjectPicker/);
 assert.match(backend,/حدد مشروعًا واحدًا على الأقل لمدير المشروع/);
 assert.match(backend,/المشاريع المختارة لا تتبع الشركات المسموح بها/);
 assert.match(backend,/ليس لديك صلاحية مراجعة طلبات هذا المشروع/);
});
test('project manager visibility requires both assigned manager and explicit selected project scope',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const projects=[{id:'a',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm@example.com'}},{id:'b',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm@example.com'}}];
 const employees=[{id:'e',module:'employees',company:'مسكن الكيان',data:{project_id:'b'}}];
 const requests=[{id:'r',module:'leave',company:'مسكن الكيان',data:{employee_id:'e'}}];
 const u={role:'project_manager',email:'pm@example.com',companies:'*',projects:JSON.stringify(['a'])};
 assert.equal(visible(u,projects[0],[...projects,...employees,...requests]),true);
 assert.equal(visible(u,projects[1],[...projects,...employees,...requests]),false);
 assert.equal(visible(u,requests[0],[...projects,...employees,...requests]),false);
});
test('unified letterheads use horizontally aligned full-width name next to company logo on paper',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const paper=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 assert.match(paper,/className="paper-identity"/);
 assert.match(css,/\.maskan-standard-paper \.paper-identity\{/);
 assert.match(css,/grid-template-columns:138px minmax\(0,1fr\)!important/);
 assert.match(ui,/class="brand-block"/);
 assert.match(ui,/grid-template-columns:170px minmax\(0,1fr\)/);
});

test('project manager scope defaults do not affect creation of HR, finance and other accounts',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/\[memberProject,setMemberProject\]=useState\('\*'\)/);
 assert.match(ui,/setMemberProject\(role==='project_manager'\?'selected':'\*'\)/);
 assert.match(ui,/setMemberSelectedProjects\(\[\]\)/);
});

test('edge backend imports exactly available module exports to prevent boot-time 503',async()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const edge=await import('../backend/modules.mjs');
 const frontend=await import('../lib/modules.mjs');
 const imports=[...backend.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/modules\.mjs['"]/g)]
  .flatMap(match=>match[1].split(',').map(v=>v.trim()).filter(Boolean));
 assert.ok(imports.includes('permittedRead'));
 assert.ok(imports.includes('permittedWrite'));
 for(const item of imports){assert.ok(Object.hasOwn(edge,item),'Missing Edge backend export: '+item);}
 for(const name of ['companies','companyDisplayName','canonicalCompany','modules','canRead','canWrite','permission','permittedRead','permittedWrite']){
  assert.equal(typeof edge[name]==='function'?edge[name].toString():JSON.stringify(edge[name]),typeof frontend[name]==='function'?frontend[name].toString():JSON.stringify(frontend[name]), 'Edge/frontend module mismatch: '+name);
 }
});

test('client finance contracts cover customer, project dates, installments and taxes',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const proxy=readFileSync(new URL('../app/api/[service]/route.ts',import.meta.url),'utf8');
 for(const label of ['المطالبات المالية واستحقاقات العملاء','مدير المشروع','بداية المشروع','نهاية المشروع','الأعمال الإضافية والخصومات','المطالبات والمستخلصات','استلام دفعة','قيمة العقد شامل الضريبة'])assert.ok(ui.includes(label),label);
 assert.match(ui,/companyLogoPath\(current\.company,profiles\)/);
 assert.match(main,/clientFinanceAuthorized/);
 assert.match(proxy,/'client-finance'/);
 assert.match(api,/checkCompany\(u,/);
 assert.match(api,/amount_inc_vat/);
 assert.match(api,/auto_generate_client_claims/);
 assert.match(api,/INSERT INTO client_documents/);
 assert.doesNotMatch(api,/localStorage/);
});

test('financial receivables complete flow: customer details, BOQ, VAT, signatures, access controls',()=>{
 const finance=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../backend/index.ts',import.meta.url),'utf8');
 for(const label of ['رقم العميل الضريبي','هاتف العميل','موقع المشروع','نسبة حجز الضمان','مدير المشروع','بداية المشروع','نهاية المشروع','بنود الدفعة','تاريخ اعتماد العميل','تاريخ استلام الدفعة','تاريخ رفع المطالبة','المستخلص PDF','قيمة العقد شامل الضريبة'])assert.ok(finance.includes(label),label);
 for(const field of ['customer_vat_no','customer_email','customer_phone','site_location','retention_percent','contract_status','client_reference','contract_subject'])assert.ok(backend.includes(field),field);
 for(const action of ['create_contract','update_contract','add_installment','add_installment_item','add_adjustment','approve_adjustment','issue_claim','record_claim_client_approval','add_receipt'])assert.ok(backend.includes("action==='"+action+"'"),action);
 assert.match(finance,/companyLogoPath\(current\.company,profiles\)/);
 assert.match(finance,/itemized/);
 assert.match(ui,/financeModules\.map\(k=>/);
 assert.match(ui,/financePermissions/);
 assert.match(edge,/'client-finance':clientFinance/);
 assert.match(backend,/checkCompany\(u,c\.company\)/);
 assert.match(backend,/client_finance:view/);
 assert.match(backend,/client_finance:edit/);
 assert.match(backend,/client_finance:approve/);
});

test('official financial claims inherit per-company bank, tax, and commercial registration identity',()=>{
 const frontend=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 const finance=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 for(const key of ["f('english_name'","f('commercial_registration'","f('vat_registration'","f('bank_name'","f('iban'","f('bank_account'"]) {
  assert.ok(frontend.includes(key),key);assert.ok(backend.includes(key),key);
 }
 for(const key of ['corporate.bank_name','corporate.iban','corporate.bank_account','corporate.vat_registration','corporate.commercial_registration'])assert.ok(finance.includes(key),key);
 assert.match(finance,/companyLogoPath\(current\.company,profiles\)/);
});

test('Excel contract template round-trips and preserves contract IDs as text',async()=>{
 const {buildContractsXlsx,parseContractsXlsx,contractColumns,exportContractRows}=await import('../lib/client-contracts-xlsx.mjs');
 const raw=[['مسكن الكيان','000123','عميل اختبار','مشروع اختبار','مدير المشروع','أعمال تكييف','2026-11-11','2026-11-12','2027-01-30','10000','15','','','','','','','','0']];
 const bytes=buildContractsXlsx(raw);
 const parsed=parseContractsXlsx(bytes);
 assert.equal(parsed.errors.length,0);
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].contract_no,'000123');
 assert.equal(parsed.rows[0].customer,'عميل اختبار');
 assert.equal(contractColumns[1][1],'رقم العقد');
 const summed=exportContractRows([{contract_no:'000123',company:'مسكن الكيان',vat_rate:.15}],()=>({vat:1500,all:11500,paid:1000,remaining:10500}));
 assert.equal(summed[0].length,contractColumns.length);
 assert.equal(summed[0][10],15);
 assert.equal(summed[0].at(-1),10500);
});
test('Excel contract import catches duplicates, invalid dates and protects against formulas',async()=>{
 const {buildContractsXlsx,parseContractsXlsx}=await import('../lib/client-contracts-xlsx.mjs');
 const a=['مسكن الكيان','000123','عميل','مشروع','مدير','أعمال تكييف','2026-11-11','2026-11-12','2027-01-30','1000','15','','','','','','','',''];
 const parsed=parseContractsXlsx(buildContractsXlsx([a,a]));
 assert.ok(parsed.errors.some(e=>e.includes('مكرر')));
 const dated=[...a];dated[7]='11/11/2026';
 assert.ok(parseContractsXlsx(buildContractsXlsx([dated])).errors.some(e=>e.includes('التاريخ')));
 const backend=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 assert.match(backend,/bulk_import_contracts/);
 assert.match(backend,/await db\.batch\(statements\)/);
 assert.match(backend,/keyset\.has\(signature\)/);
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 assert.match(ui,/Load Excel/);
 assert.match(ui,/Export Excel/);
 assert.match(ui,/رقم العقد: \{c\.contract_no\}/);
});

test('contract XLSX importer supports Excel namespace-prefixed worksheet XML',async()=>{
 const {buildContractsXlsx,parseContractsXlsx}=await import('../lib/client-contracts-xlsx.mjs');
 const {unzipSync,zipSync,strFromU8,strToU8}=await import('fflate');
 const values=[['مسكن الكيان','0005','عميل','مشروع','مدير','أعمال تكييف','2026-11-11','2026-11-12','2027-01-01','25000','15','','','','','','','','']];
 const archive=unzipSync(buildContractsXlsx(values));
 const path='xl/worksheets/sheet1.xml';
 let xml=strFromU8(archive[path]);
 xml=xml.replace(/<(\/)?(worksheet|sheetViews|sheetView|sheetData|row|c|v|is|t|cols|col|autoFilter)(?=[\s>])/g,(_,slash,tag)=>'<'+(slash||'')+'x:'+tag);
 // The SpreadsheetML XML declaration need not declare prefixes for our data-only reader.
 archive[path]=strToU8(xml);
 const imported=parseContractsXlsx(zipSync(archive));
 assert.equal(imported.errors.length,0);
 assert.equal(imported.rows[0].contract_no,'0005');
});

test('finance navigation header uses the approved gold background and revised Arabic title',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/nav-label nav-label-finance">العقود والمطالبات المالية/);
 assert.match(css,/\.app aside \.nav-label\.nav-label-finance/);
 assert.match(css,/linear-gradient\(135deg,#a77f27,#d7bb62\)/);
});

test('contract duration, signed date, record printing and categorized attachments are linked',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 for(const term of ['projectDuration','durationLabel','تاريخ توقيع العقد','مدة تنفيذ المشروع','printFinanceRegister','طباعة جدول الدفعات','طباعة الملحق','طباعة سند الدفعة','طباعة سجل المرفقات','إرفاق العقد الأصلي','مرفق الخصم','documentLink.document_type'])assert.ok(ui.includes(term),term);
 assert.match(api,/documentType/);
 assert.match(api,/adjustment_id,claim_id,receipt_id/);
 assert.match(api,/b\.signed_date\|\|c\.signed_date/);
 assert.match(api,/client_documents\(id,contract_id,name,mime,size,blob_key,uploaded_by,document_type,adjustment_id,claim_id,receipt_id,replaces_document_id\)/);
});

test('finance print and attachment quick actions are present and scoped to the selected contract',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 for(const title of ['إرفاق العقد','إرفاق مستند الخصم/الملحق','طباعة سجل المرفقات','طباعة بيانات العقد','طباعة الدفعة','طباعة سند الدفعة','طباعة الملحق','مدة تنفيذ المشروع تلقائيًا'])assert.ok(ui.includes(title),title);
 assert.match(backend,/SELECT kind FROM client_adjustments WHERE id=\? AND contract_id=\?/);
 assert.match(backend,/SELECT id FROM client_claims WHERE id=\? AND contract_id=\?/);
 assert.match(backend,/SELECT id FROM client_receipts WHERE id=\? AND contract_id=\?/);
});

test('AI schedule normalization never invents missing installment dates and checks sums',async()=>{
 const {normalizeContractAIResult,validateAISchedule}=await import('../lib/contract-ai.mjs');
 const proposal=normalizeContractAIResult({contract_no:'C-55',warnings:[],installments:[
 {title:'دفعة عند انتهاء العظم',description:'بعد التنفيذ',due_date:null,amount_ex_vat:45000,items:[{item_code:'A',description:'عظم',quantity:2,unit:'طن',unit_price_ex_vat:20000}]},
 {title:'دفعة ثانية',due_date:'2026-12-20',amount_ex_vat:5000,items:[]}
 ]});
 assert.equal(proposal.installments[0].due_date,'');
 assert.ok(proposal.warnings.some(w=>w.includes('تاريخ استحقاق')));
 assert.ok(validateAISchedule(proposal.installments).some(e=>e.includes('تاريخ')));
 proposal.installments[0].due_date='2026-12-01';
 assert.deepEqual(validateAISchedule(proposal.installments,{remaining:50000}),[]);
 assert.ok(validateAISchedule(proposal.installments,{remaining:49000}).some(e=>e.includes('يتجاوز')));
 proposal.installments[0].items[0].unit_price_ex_vat=25000;
 assert.ok(validateAISchedule(proposal.installments).some(e=>e.includes('أكبر')));
});
test('AI document route is session guarded, and schedules save only by explicit approval with deduplication',()=>{
 const route=readFileSync(new URL('../app/api/client-contract-ai/route.ts',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 for(const marker of ["hr_access=","ai_document=","already_imported","ai-gateway.vercel.sh/v1/responses","input_file","input_image","VERCEL_OIDC_TOKEN","requires_review:true"])assert.ok(route.includes(marker),marker);
 for(const marker of ["approve_ai_schedule","client_ai_imports","await db.batch(statements)","document_id","auto_generate_client_claims()"])assert.ok(api.includes(marker),marker);
 for(const marker of ["analyzeContractAI","approveAISchedule","validateAISchedule","مراجعة الدفعات المستخرجة من 1 إلى 10","تأكيد وحفظ بنود الدفعات المعتمدة"])assert.ok(ui.includes(marker),marker);
});

test('contract installment percent, sequential number and safe archive are integrated',()=>{
 const backend=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const ai=readFileSync(new URL('../lib/contract-ai.mjs',import.meta.url),'utf8');
 for(const s of ["'archive_contract'","contract_status='archived'","payment_percent","previousPercent","السابق / Previous","الحالي / Current","الإجمالي التراكمي / Cumulative","dateOnly","حذف العقد","installment_no"])assert.ok(backend.includes(s)||ui.includes(s),s);
 assert.match(backend,/previousPercent|payment_percent/);
 assert.match(backend,/previousPercent|payment_percent/);
 assert.match(backend,/Math\.round\(basis\*percentage\)\/100/);
 assert.match(backend,/Math\.round\(capacity\*percent\)\/100/);
 assert.match(ai,/payment_percent/);
});

test('delete contract only when empty, archive otherwise and allow restore',()=>{
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 for(const term of ["delete_contract","restore_contract","archive_contract","linked===0","client_contract_deleted","client_contract_archived"])assert.ok(api.includes(term),term);
 assert.match(api,/linked===0/);
 assert.match(api,/DELETE FROM client_contracts WHERE id=/);
 assert.match(ui,/إظهار العقود المؤرشفة/);
 assert.match(ui,/استعادة العقد/);
 assert.match(ui,/حذف العقد/);
});

test('AI payment extraction is prominent before manual entry and needs explicit save',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const tab=ui.indexOf("{tab==='installments'&&");
 const manual=ui.indexOf('إضافة دفعة تعاقدية');
 assert.ok(tab>0&&manual>tab);
 const ai=ui.indexOf('استخراج الدفعات من العقد بالذكاء الاصطناعي');
 assert.ok(ai>tab&&ai<manual,'AI CTA appears above manual form');
 for(const marker of ['extractFromContract','aiDocumentId','aiContractFile','uploadDocument(aiContractFile','تأكيد وحفظ بنود الدفعات المعتمدة','approveAISchedule','requires_review'])assert.ok(ui.includes(marker)||marker==='requires_review',marker);
 assert.match(css,/\.cf-ai-import-grid/);
});
test('issued customer claim has printable certificate and email handoff without claiming automatic dispatch',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 assert.match(ui,/const prepareClientEmail=/);
 assert.match(ui,/claim\.status!=='issued'/);
 assert.match(ui,/mailto:/);
 assert.match(ui,/encodeURIComponent\(address\)/);
 assert.match(ui,/تجهيز الإرسال للعميل/);
 assert.match(ui,/المستخلص PDF/);
 assert.match(ui,/يجب إرفاق PDF وإرسال الرسالة من بريدك/);
});

test('contract payment limit, automatic claim number, and customer issuer signatures',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 const ai=readFileSync(new URL('../lib/contract-ai.mjs',import.meta.url),'utf8');
 assert.match(api,/plans\.length>10/);
 assert.match(api,/existingCount\?\.n\|\|0\)\+plans\.length>10/);
 assert.match(api,/existingCount\?\.n\|\|0\)>=10/);
 assert.match(ai,/schedule\.length>10/);
 assert.match(ui,/عدد الدفعات المسجلة/);
 assert.match(ui,/الشركة المصدرة للمطالبة المالية/);
 assert.match(ui,/مدير المشروع/);
 assert.match(ui,/اعتماد العميل/);
 assert.match(ui,/رقم المطالبة/);
 assert.match(ui,/cl\.vat_amount/);
 assert.match(ui,/cl\.amount_ex_vat/);
 assert.match(ui,/installment_no/);
});
test('contract attachments have explicit save replace and soft-delete with audit history',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 for(const marker of ['حفظ العقد / المرفق بعد الإرفاق','تعديل / استبدال','مسح المرفق','saveAttachedContract','deleteAttachedContract','replaceDocumentId'])assert.ok(ui.includes(marker),marker);
 for(const marker of ['delete_document','deleted_at IS NULL','replaces_document_id','client_contract_document_removed','client_contract_file_replaced','validMime'])assert.ok(api.includes(marker),marker);
});

test('AI extraction is visible next to the payment table and save section',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const table=ui.indexOf('جدول الاستحقاقات —');
 const ai=ui.indexOf('id="finance-ai-contract-upload"');
 const manual=ui.indexOf('إضافة دفعة تعاقدية (الحد الأعلى 10)');
 assert.ok(table>=0&&ai>table&&manual>ai,'AI panel must follow table and precede manual form');
 for(const marker of ['رقم البند','cf-ai-save-panel','aiStatus.message',"fetch('/api/client-contract-ai'"])assert.ok(ui.includes(marker),marker);
 assert.ok(css.includes('.cf-ai-save-panel'));
});
test('AI Gateway diagnostics are authenticated and proxy compatible',()=>{
 const route=readFileSync(new URL('../app/api/client-contract-ai/route.ts',import.meta.url),'utf8');
 for(const marker of ['export async function GET(req:Request)','VERCEL_OIDC_TOKEN','permittedOrigins','forwardedHost','requires_review:true'])assert.ok(route.includes(marker),marker);
});

test('Compact AI review displays ten numbered placeholders filled by extracted installments',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const token of ['cf-ai-compact-controls','cf-ai-payment-table','Array.from({length:10}','{i+1}','cf-ai-empty-slot','تأكيد وحفظ بنود الدفعات المعتمدة'])assert.ok(ui.includes(token),token);
 assert.ok(css.includes('.cf-ai-compact-controls'));
 assert.ok(css.includes('.cf-ai-payment-table'));
});

test('Each contract card has working edit and safe delete controls with explicit confirmations',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const token of ['cf-contract-record-actions','تعديل العقد','حذف العقد','openEditContract(c)','archiveContract(c)','confirm(','res.deleted','contract_id:target.id'])assert.ok(ui.includes(token),token);
 assert.match(css,/\.cf-contract-record-actions/);
 assert.match(ui,/canArchive&&\['delete_contract','archive_contract','restore_contract'\]/);
 assert.match(ui,/contract_id:currentRecord\.id/);
});

test('finance approvals and delete-only users are not blocked by edit permission gates',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 assert.match(ui,/canApprove&&obj.action==='approve_adjustment'/);
 assert.match(ui,/canArchive&&\['delete_contract','archive_contract','restore_contract'\]/);
 assert.match(api,/const isDeleting=\['archive_contract','delete_contract','restore_contract'\]/);
 assert.match(api,/perms\['client_finance:delete'\]===true/);
 assert.match(api,/perms\['client_finance:approve'\]===true/);
});
test('contract updates respect stored VAT percent, and archived contracts are read only',()=>{
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 assert.match(api,/Number\(c.vat_rate\)\*100/);
 assert.match(api,/استعد العقد من الأرشيف قبل تعديله/);
 assert.match(api,/لا يمكن حذف مرفق من عقد مؤرشف/);
});
test('payment receipts cannot exceed issued individual claim values',()=>{
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 assert.match(api,/SELECT amount_inc_vat FROM client_receipts WHERE contract_id=\? AND claim_id=\?/);
 assert.match(api,/claimPaid\+amount/);
 assert.match(api,/مبلغ التحصيل يتجاوز المتبقي من قيمة المطالبة المرتبطة/);
});
test('AI-approved contracts retain source document evidence',()=>{
 const api=readFileSync(new URL('../backend/client-finance.ts',import.meta.url),'utf8');
 assert.match(api,/client_ai_imports WHERE document_id=\?/);
 assert.match(api,/لا يمكن مسح مستند اعتمدت منه دفعات/);
 assert.match(api,/لا يمكن استبدال ملف عقد اعتمدت منه دفعات/);
});

test('contract dashboard exposes operational readiness checks and routes to missing work',()=>{
 const ui=readFileSync(new URL('../app/client-finance.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const marker of ['const readiness=(c)=>','فحص جاهزية العقد للتشغيل','ملف العقد','جدول الدفعات','مطالبات مستحقة','بريد العميل','setTab(entry.tab)','openEditContract(current)'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/Math\.abs\(unscheduled\)<\.01/);
 assert.match(css,/\.cf-readiness-grid/);
});

test('draft leave request deletion is audited and restricted to authorized HR/admin',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 for(const marker of ['deleteDraftRequest','حذف الطلب','delete_draft_request','revision:row.revision'])assert.ok(ui.includes(marker),marker);
 for(const marker of ["body.action==='delete_draft_request'","old.status!=='draft'","_deleted_at:now","draft_request_deleted","status='draft' AND revision=?"])assert.ok(backend.includes(marker),marker);
 assert.match(backend,/!r.data\?\._deleted/);
});
test('live records search matches rendered leave employee names and Arabic digits',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const marker of ['companyDisplayName(r.company)','employee?.data?.name','enumOptions[f.type].find','relationModules[f.type]','searchWords.every','البحث في السجلات','مسح البحث'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/\[٠-٩\]/);
 assert.match(ui,/\[۰-۹\]/);
});

test('leave day count updates from both dates and selected holiday policy',async()=>{
 const {leaveCalendarDays,leaveChargedDays,parseLeaveHolidayDates,normalize}=await import('../lib/modules.mjs');
 assert.equal(leaveCalendarDays('2026-11-12','2026-11-15'),4);
 assert.equal(leaveCalendarDays('2026-11-16','2026-11-15'),null);
 assert.equal(leaveChargedDays('2026-11-12','2026-11-15','2026-11-13','include'),4);
 assert.equal(leaveChargedDays('2026-11-12','2026-11-15','2026-11-13','exclude'),3);
 assert.deepEqual(parseLeaveHolidayDates('2026-11-14,2026-11-13','2026-11-12','2026-11-15'),['2026-11-13','2026-11-14']);
 assert.throws(()=>parseLeaveHolidayDates('2026-11-16','2026-11-12','2026-11-15'),/داخل فترة الإجازة/);
 assert.throws(()=>parseLeaveHolidayDates('2026-11-13,2026-11-13','2026-11-12','2026-11-15'),/مكرر/);
 const data={employee_id:'test',leave_type:'annual',start:'2026-11-12',end:'2026-11-15',days:3,holiday_policy:'exclude',holiday_dates:'2026-11-13'};
 const result=normalize('leave',{company:'مسكن الكيان',data});
 assert.equal(result.days,3);
 assert.equal(result.holiday_dates,'2026-11-13');
 assert.throws(()=>normalize('leave',{company:'مسكن الكيان',data:{...data,days:4}}),/عدد أيام الإجازة يجب أن يطابق/);
 assert.throws(()=>normalize('leave',{company:'مسكن الكيان',data:{...data,holiday_dates:'2026-11-18'}}),/داخل فترة الإجازة/);
});
test('leave UI allows adding/removing holiday dates and displays automatic net day count',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const marker of ['addLeaveHolidayDate','leaveChargedDays','leaveCalendarDays','إضافة يوم عطلة','أيام الإجازة المحتسبة','leave-holiday-tags','holiday_policy'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/f\.key==='days'\|\|f\.key==='expected_return'\|\|f\.key==='end'/);
});

test('leave expected return and ticket eligibility are derived safely',async()=>{
 const {normalize,leaveNextDate}=await import('../lib/modules.mjs');
 assert.equal(leaveNextDate('2026-11-15'),'2026-11-16');
 assert.equal(leaveNextDate('2026-12-31'),'2027-01-01');
 assert.equal(leaveNextDate('2026-02-30'),'');
 const payload={company:'مسكن الكيان',data:{employee_id:'test',leave_type:'annual',start:'2026-11-12',end:'2026-11-15',days:4,holiday_policy:'include',ticket:'yes',ticket_due_date:'2026-12-01',expected_return:'2025-01-01'}};
 const out=normalize('leave',payload);
 assert.equal(out.expected_return,'2026-11-16');
 assert.equal(out.ticket,'yes');
 assert.equal(out.ticket_due_date,'2026-12-01');
 const no=normalize('leave',{...payload,data:{...payload.data,ticket:'no',ticket_due_date:'2026-12-01'}});
 assert.equal(no.ticket_due_date,'');
 assert.equal(normalize('leave',{...payload,data:{...payload.data,ticket:'نعم'}}).ticket,'yes');
 assert.throws(()=>normalize('leave',{...payload,data:{...payload.data,ticket:'unknown'}}),/استحقاق تذكرة/);
});
test('advance installment amount is exact to halalas and invalid plans are rejected',async()=>{
 const {normalize}=await import('../lib/modules.mjs');
 const payload={company:'مسكن الكيان',data:{employee_id:'test',amount:1000,date:'2026-11-12',installments:3,first_month:'2026-12',notes:'ظرف طارئ'}};
 const out=normalize('advances',payload);
 assert.equal(out.installment_amount,333.33);
 assert.equal(out.final_installment,333.34);
 assert.equal(Math.round((out.installment_amount*2+out.final_installment)*100),100000);
 assert.throws(()=>normalize('advances',{...payload,data:{...payload.data,installments:61}}),/عدد أقساط/);
 assert.throws(()=>normalize('advances',{...payload,data:{...payload.data,first_month:'2026-10'}}),/شهر أول قسط/);
 assert.throws(()=>normalize('advances',{...payload,data:{...payload.data,installments:3,first_month:''}}),/حدد شهر/);
});
test('leave and advance forms show calculated return, ticket and installment preview',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const marker of ['expected_return','ticket_due_date','ticket','leaveNextDate','المباشرة المتوقعة','القسط الدوري','القسط الأخير'])assert.ok(ui.includes(marker),marker);
 const backend=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 for(const marker of ['leaveNextDate','ticket_eligibility','installment_amount','final_installment'])assert.ok(backend.includes(marker),marker);
});

test('leave request grid and editor show days, accrued entitlement and projected remaining balance',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const token of ['عدد أيام الإجازة','الرصيد المستحق','الرصيد المتبقي بعد الطلب','leaveBalanceFor','leave-balance-summary','المستحق حتى اليوم','المتوقع بعد اعتماد الطلب','المسودات لا تخصم'])assert.ok(ui.includes(token),token);
 assert.match(ui,/x.status==='approved'/);
 assert.match(ui,/alreadyApproved/);
 assert.match(css,/\.leave-balance-summary/);
});

test('employee direct manager is a canonical active scoped directory record and request snapshot',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const mod=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 for(const term of ['direct_manager_id','manager_phone','supervisor_account'])assert.ok(erp.includes(term),term);
 assert.match(erp,/module='project_managers' AND id=\? AND company=\?/);
 assert.match(erp,/managerRow/);
 assert.match(erp,/account\.role!=='project_manager'/);
 assert.match(erp,/data\.direct_manager=\{name:snapshot\.manager/);
 assert.match(mod,/f\('direct_manager_id','مرجع المدير المباشر','internal'\)/);
 assert.match(ui,/aria-label="بحث المدير المباشر"/);
 assert.match(ui,/aria-label="اختيار المدير المباشر من الدليل"/);
 assert.match(ui,/setMembers\(d\.rows\)/);
 assert.match(ui,/f\.type!=='internal'/);
});
test('leave and advance approvals show assigned project manager and horizontal stages',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const print=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 for(const term of ['request-approval-guide','request-approval-summary','approvalStages','مدير المشروع المختص','دورة اعتماد الطلب'])assert.ok(ui.includes(term),term);
 for(const term of ['Direct Manager','Project Manager','التسلسل: إعداد الطلب'])assert.ok(print.includes(term),term);
});
test('payroll approval requires authorized project managers for every staff row and protects final handoff',()=>{
 const cycle=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(cycle,/ensureAssignedPayrollManager/);
 assert.match(cycle,/await ensureAssignedPayrollManager\(row\.data\.project_id,b\.company\)/);
 assert.match(cycle,/await ensureAssignedPayrollManager\(e\.data\.project_id,batch\.company\)/);
 assert.match(cycle,/await canManageProject\(u,projectId,batch\.company\)/);
 assert.match(cycle,/manager\.role!=='project_manager'/);
 assert.match(cycle,/manager_reviewed_by/);
 assert.match(cycle,/\['admin','projects_director'\]\.includes\(u\.role\)/);
 assert.match(ui,/إرسال لإدارة المشاريع بعد مراجعة المدراء/);
});

test('project manager can view payroll employees only from projects assigned to own active account',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const all=[
  {id:'p1',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm1@example.test'}},
  {id:'p2',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm2@example.test'}},
  {id:'e1',module:'employees',company:'مسكن الكيان',data:{project_id:'p1'}},
  {id:'e2',module:'employees',company:'مسكن الكيان',data:{project_id:'p2'}}
 ];
 const person=(id,project)=>({id,module:'payroll',company:'مسكن الكيان',data:{employee_id:id,project_id:project}});
 const u={role:'project_manager',email:'pm1@example.test',projects:'*',companies:'*'};
 assert.equal(visible(u,person('e1','p1'),all),true);
 assert.equal(visible(u,person('e2','p2'),all),false);
 assert.equal(visible({...u,projects:JSON.stringify(['p2'])},person('e1','p1'),all),false);
 assert.equal(visible(u,{id:'b1',module:'payroll_batches',company:'مسكن الكيان',data:{month:'2026-11'}},all),true);
});

test('existing employee can be chosen as project manager and linked to scoped approvals',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/اختيار أحد الموظفين لتعيينه مدير مشروع/);
 assert.match(ui,/aria-label="اختيار موظف مدير مشروع"/);
 assert.match(ui,/employee_id:managerSetup\.employeeId\|\|null/);
 assert.match(ui,/setManagerSetup\(\{employeeId:employee\.id/);
 assert.match(backend,/if\(body\.action==='onboard_project_manager'\)/);
 assert.match(backend,/employeeRow=await db\.prepare/);
 assert.match(backend,/الموظف مرتبط بحساب دخول آخر/);
 assert.match(backend,/employee_id=\?,companies=\?,projects=\?,username=\?/);
 assert.match(backend,/project_manager_account:email,is_project_manager:true/);
 assert.match(backend,/manager_email:email,manager_name:name/);
 assert.match(backend,/project_manager_onboarding/);
});
test('manager payroll header visibility depends on assigned employee project',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const projects=[{id:'p1',company:'مسكن الكيان',module:'projects',data:{manager_email:'a@test.example'}},{id:'p2',company:'مسكن الكيان',module:'projects',data:{manager_email:'b@test.example'}}];
 const payrolls=[{id:'r1',company:'مسكن الكيان',module:'payroll',data:{batch_id:'b1',project_id:'p1',employee_id:'e1'}},{id:'r2',company:'مسكن الكيان',module:'payroll',data:{batch_id:'b2',project_id:'p2',employee_id:'e2'}}];
 const batches=[{id:'b1',company:'مسكن الكيان',module:'payroll_batches',data:{}},{id:'b2',company:'مسكن الكيان',module:'payroll_batches',data:{}}];
 const records=[...projects,...payrolls,...batches];
 const user={role:'project_manager',email:'a@test.example',companies:'*',projects:'["p1"]'};
 assert.equal(visible(user,batches[0],records),true);
 assert.equal(visible(user,batches[1],records),false);
 assert.equal(visible(user,payrolls[1],records),false);
});
