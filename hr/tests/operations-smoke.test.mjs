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
 assert.match(ui,/checked=\{permissionChoice\(memberRole,memberPermissions,k,action\)\}/);
 assert.match(ui,/checked=\{permissionChoice\(memberEdit.role,memberEditPermissions,k,action\)\}/);
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
 assert.match(ui,/memberPermissionRows=m=>Object.keys\(modules\)\.map/);
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
 assert.match(ui,/لم توجد رواتب أو طلبات أو حساب دخول مرتبط به/);
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
 assert.match(ui,/if\(row\)\{setEdit\(\{\.\.\.row,data:\{\.\.\.row.data\}\}\);return\}/);
 assert.match(ui,/setEdit\(\{company,data:defaultData\}\)/);
 assert.match(ui,/const payload=edit.id\?\{\.\.\.edit\}:\{company:edit.company,data:\{\.\.\.edit.data\}\}/);
 assert.match(ui,/إضافة موظف جديد/);
});
