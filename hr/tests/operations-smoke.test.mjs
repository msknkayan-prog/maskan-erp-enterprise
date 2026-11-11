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
 assert.match(ui,/if\(row\)\{setEdit\(\{\.\.\.row,data:\{\.\.\.row.data\}\}\);return\}/);
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
 assert.match(ui,/setEdit\(\{\.\.\.edit,company:nextCompany,transfer_reason:reason\.trim\(\),data:\{\.\.\.edit\.data,project_id:''\}\}\)/);
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
 assert.match(ui,/employee-manager-choices/);
 assert.match(ui,/module==='employees'&&f\.key==='project_id'/);
 assert.match(ui,/aria-label="فلتر المشاريع"/);
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
 assert.equal(visible({...pm,projects:'[]'},requests[0],all),true);
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
 assert.equal(visible({...u,projects:'[]'},r1,rows),true);
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
 assert.match(ui,/module==='leave'&&f\.key==='leave_type'\?applyLeaveField/);
 assert.match(ui,/module==='leave'&&f\.key==='start'\)applyLeaveField/);
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
