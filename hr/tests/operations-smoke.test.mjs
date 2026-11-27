import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {companies,modules,normalize,annualLeave,leaveAccrualAsOf,enumOptions,canRead,canWrite,permissionChoice,permittedRead,permittedWrite,isRequestStageActor,isRequestFinanceActor,requestApprovalOwners,visible} from '../lib/modules.mjs';

test('leave and advance approval follows the four named accounts without changing member roles',()=>{
 const magdi={email:requestApprovalOwners.projects_director.email,role:'admin',is_active:true};
 const mohamed={email:requestApprovalOwners.hr.email,role:'hr',is_active:true};
 const musab={email:requestApprovalOwners.finance.email,role:'project_manager',is_active:true};
 assert.equal(isRequestStageActor(magdi,'projects_director'),true);
 assert.equal(isRequestStageActor(mohamed,'hr'),true);
 assert.equal(isRequestStageActor(musab,'finance'),true);
 assert.equal(isRequestStageActor(musab,'project_manager'),true);
 assert.equal(isRequestFinanceActor(musab),true);
 assert.equal(isRequestStageActor(magdi,'finance'),true); // System administrator may approve advance finance disbursement.
 assert.equal(isRequestStageActor(mohamed,'projects_director'),false);
 assert.equal(isRequestStageActor({...musab,email:'other@example.com'},'finance'),false);
 assert.equal(isRequestStageActor({...musab,role:'finance'},'finance'),true);
 assert.equal(isRequestStageActor({...mohamed,is_active:false},'hr'),false);
});

test('Musab receives finance requests across projects, while other project data stays restricted',async()=>{
 const musab={role:'project_manager',email:requestApprovalOwners.finance.email,is_active:true,companies:'*',projects:'*'};
 const other={...musab,email:'manager@example.com'};
 const worker={id:'employee1',module:'employees',company:'مسكن الكيان',data:{project_id:'project1'}};
 const project={id:'project1',module:'projects',company:'مسكن الكيان',data:{manager_email:'manager@example.com'}};
 const atFinance={id:'request1',module:'advances',company:'مسكن الكيان',status:'finance',data:{employee_id:'employee1'}};
 const atDirector={...atFinance,id:'request2',status:'projects_director'};
 const records=[worker,project,atFinance,atDirector];
 assert.equal(visible(musab,atFinance,records),true);
 assert.equal(visible(musab,atDirector,records),false);
 assert.equal(visible(musab,worker,records),true);
 assert.equal(visible(musab,project,records),false);
 assert.equal(visible(other,atFinance,records),false); // Financial requests no longer route to the project owner.
 assert.equal(visible(musab,{...worker,id:'not-in-finance',data:{project_id:'project2'}},records),false);
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/routedRequest\?\(u\.role!=='admin'&&\!isRequestStageActor\(u,current\)\)/);
 assert.match(backend,/next='projects_director';\s*details.manager_submitted_by=u.email/);
 assert.match(backend,/!isRequestFinanceActor\(u\)/);
 const backendModules=await import('../backend/modules.mjs');
 assert.equal(backendModules.isRequestStageActor(musab,'finance'),true);
 assert.equal(backendModules.visible(musab,atFinance,records),true);
});
import {employeeRegisterValue,employeeRegisterFields} from '../lib/employee-register.mjs';
import {requestApprovalStages,requestStageView,requestStageTimestamp} from '../lib/request-approval.mjs';

test('request approval register shows four role-specific status columns with no invented dates',()=>{
 assert.deepEqual(requestApprovalStages.map(stage=>stage.id),['project_manager','projects_director','hr']);
 const statuses=[
  ['draft',['waiting','future','future']],
  ['project_manager',['waiting','future','future']],
  ['projects_director',['done','waiting','future']],
  ['hr',['done','done','waiting']],
  ['finance',['done','done','done']],
  ['approved',['done','done','done']],
  ['paid',['done','done','done']]
 ];
 for(const [status,expected] of statuses)assert.deepEqual(requestApprovalStages.map(stage=>requestStageView({status},stage.id).kind),expected,status);
 assert.equal(requestStageView({status:'returned'},'project_manager').kind,'returned');
 assert.equal(requestStageView({status:'rejected'},'hr').kind,'stopped');
 assert.equal(requestStageTimestamp({status:'hr',data:{}},'projects_director'),'');
 const stamp='2026-11-13T12:30:00.000Z';
 assert.equal(requestStageTimestamp({data:{approval_tracking:{hr:{at:stamp}}}},'hr'),stamp);
 const frontend=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(frontend,/function ApprovalCompactStrip/);
 assert.match(frontend,/requestApprovalStages\.map\(stage=>/);
 assert.match(frontend,/مسار الاعتماد والقرار/);
 assert.match(frontend,/onApprove=\{\(\)=>transition\(row\)\}/);
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/details\.approval_tracking=\{\.\.\.tracking,\[completed\]/);
 assert.match(backend,/details\.approval_tracking=\{\};/);
});
import {projectRegisterFields,projectRegisterValue} from '../lib/project-register.mjs';
import {employeeDirectManagerOptions,normalizeManagerName,magdiGeneralManagerEmail,magdiProjectManagerName,isMagdiGeneralManagerAccount,isAuthorizedProjectManagerAccount} from '../lib/project-manager-roster.mjs';

test('Magdi Mahjoub uses the existing general manager login without changing its admin role',()=>{
 const admin={email:magdiGeneralManagerEmail,username:'magdi osman',role:'admin',is_active:true,companies:'*',projects:'*'};
 assert.equal(magdiProjectManagerName,'م مجدي محجوب');
 assert.equal(isMagdiGeneralManagerAccount(admin,'م. مجدي محجوب'),true);
 assert.equal(isAuthorizedProjectManagerAccount(admin,'م مجدي محجوب'),true);
 assert.equal(isAuthorizedProjectManagerAccount(admin,'أ عثمان محمداحمد'),false);
 assert.equal(isAuthorizedProjectManagerAccount({...admin,email:'another-admin@example.com'},'م مجدي محجوب'),false);
 assert.equal(isAuthorizedProjectManagerAccount({...admin,is_active:false},'م مجدي محجوب'),false);
 assert.equal(admin.role,'admin');
 assert.equal(admin.username,'magdi osman');
});

test('direct-manager selector links only approved Magdi profile to the original admin account',()=>{
 const admin={email:magdiGeneralManagerEmail,username:'magdi osman',role:'admin',is_active:true,companies:'*'};
 const options=employeeDirectManagerOptions([], [admin,{...admin,email:'someone@example.com'}],'مسكن الكيان');
 const magdi=options.find(m=>m.key==='roster:magdi');
 assert.equal(magdi.email,magdiGeneralManagerEmail);
 assert.equal(magdi.hasLogin,true);
 assert.equal(magdi.name,magdiProjectManagerName);
 assert.ok(!options.some(m=>m.name==='magdi osman'));
 assert.ok(options.filter(m=>m.key.startsWith('roster:')&&m.hasLogin).every(m=>m.key==='roster:magdi'));
});

test('inactive or wrong admin account cannot be substituted into Magdi manager profile',()=>{
 for(const member of [{email:magdiGeneralManagerEmail,role:'admin',is_active:false},{email:'other@example.com',role:'admin',is_active:true}]){
  const magdi=employeeDirectManagerOptions([], [member],'مسكن الكيان').find(m=>m.key==='roster:magdi');
  assert.equal(magdi.email,'');
  assert.equal(magdi.hasLogin,false);
 }
});

test('Magdi onboarding and project approval preserve the general manager role in backend',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/const adminMagdi=isMagdiGeneralManagerAccount\(existing,name\)/);
 assert.match(backend,/\}else if\(!adminMagdi\)\{/);
 assert.match(backend,/isAuthorizedProjectManagerAccount\(manager,data\.manager_name/);
 assert.match(backend,/const managerEmail=String\(employeeData\.manager_email/);
 assert.match(backend,/if\(!adminMagdi&&manager\.projects!=='\*'/);
});

test('all approved direct managers are selectable before login identities are created',()=>{
 const options=employeeDirectManagerOptions([],[],'مسكن الكيان');
 assert.equal(options.filter(option=>option.key.startsWith('roster:')).length,8);
 for(const name of ['م مجدي محجوب','أ. عثمان محمد أحمد','م محمد يوسف','م. أمجد فؤاد']){
  assert.ok(options.some(option=>normalizeManagerName(option.name)===normalizeManagerName(name)),name);
 }
 assert.ok(options.every(option=>!option.hasLogin));
});

test('manager names from company projects and employees merge without duplicates or unauthorized login assignments',()=>{
 const records=[
  {module:'projects',company:'مسكن الكيان',data:{manager_name:'م. مجدي محجوب'}},
  {module:'employees',company:'مسكن الكيان',data:{manager:'م مجدي محجوب'}},
  {module:'projects',company:'مسكن الكيان',data:{manager_name:'م محمد إسماعيل',manager_email:'ismail@example.com'}},
  {module:'project_managers',company:'مسكن الكيان',id:'directory1',data:{name:'م محمد إسماعيل',email:'ismail@example.com',phone:'123'}},
  {module:'projects',company:'رياح الاعمار',data:{manager_name:'مدير شركة أخرى'}}
 ];
 const members=[{email:'ismail@example.com',username:'محمد اسماعيل',role:'project_manager',is_active:true,companies:'*'}];
 const options=employeeDirectManagerOptions(records,members,'مسكن الكيان');
 assert.equal(options.filter(x=>x.key==='roster:magdi').length,1);
 assert.equal(options.find(x=>x.key==='roster:magdi').email,'');
 assert.equal(options.find(x=>x.key==='name:محمداسماعيل').email,'ismail@example.com');
 assert.equal(options.find(x=>x.key==='name:محمداسماعيل').directory_id,'directory1');
 assert.ok(!options.some(x=>x.name==='مدير شركة أخرى'));
});

test('Edge and frontend use identical direct-manager selection rules',async()=>{
 const edge=await import('../backend/project-manager-roster.mjs');
 assert.deepEqual(edge.employeeDirectManagerOptions([],[],'مسكن الكيان'),employeeDirectManagerOptions([],[],'مسكن الكيان'));
 assert.equal(edge.normalizeManagerName('أ. عثمان محمد أحمد'),normalizeManagerName('عثمان محمداحمد'));
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/from '\.\/project-manager-roster\.mjs'/);
 assert.match(erp,/const match=options\.find\(m=>m\.key===key/);
 assert.match(erp,/resolved=await resolveEmployeeDirectManager\(db,old\.company,String\(projectData\.manager_email\|\|''\),String\(projectData\.manager_name\|\|''\),false\)/);
 assert.match(ui,/manager_key:choice==='__project__'\?'':choice/);
});

test('employee register separates numeric project code, project manager, and working company',()=>{
 const project={id:'project1',module:'projects',company:'مسكن الكيان',data:{code:'1047',manager_name:'م مجدي محجوب'}};
 const employee={id:'employee1',company:'مسكن الكيان',data:{project_id:'project1',working_company:'رياح الاعمار'}};
 assert.equal(employeeRegisterValue(employee,'project_code',[project]),'1047');
 assert.equal(employeeRegisterValue(employee,'project_manager_name',[project]),'م مجدي محجوب');
 assert.equal(employeeRegisterValue(employee,'working_company',[project]),'رياح الاعمار');
 assert.equal(employeeRegisterValue({company:'مسكن الكيان',data:{}},'working_company',[]),'مسكن الكيان');
 assert.equal(employeeRegisterValue({company:'مسكن الكيان',data:{project_number:'اسم غير رقمي'}},'project_code',[]),'');
 assert.deepEqual(employeeRegisterFields.slice(0,6).map(f=>f.key),['working_company','code','name','manager','project_code','project_manager_name']);
 const saved=normalize('employees',{company:'مسكن الكيان',data:{name:'موظف',code:'10001',salary:1000,sponsorship:'yes',working_company:'رياح الاعمار'}});
 assert.equal(saved.working_company,'رياح الاعمار');
 assert.equal(normalize('employees',{company:'مسكن الكيان',data:{name:'موظف',code:'10001',salary:1000,sponsorship:'yes'}}).working_company,'مسكن الكيان');
 assert.throws(()=>normalize('employees',{company:'مسكن الكيان',data:{name:'موظف',code:'10001',salary:1000,sponsorship:'yes',working_company:'جهة خارج القائمة'}}),/اختيار غير صالح/);
});

test('employee columns have unique keys so header and cells cannot drift after switching windows',()=>{
 const keys=employeeRegisterFields.map(f=>f.key);
 assert.equal(keys.filter(key=>key==='salary').length,1);
 assert.equal(new Set(keys).size,keys.length);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/<table key=\{module\} className=/);
 assert.match(ui,/tableFields\.map\(f=><th key=\{module\+':'\+f\.key\}/);
});

test('all module field definitions are unique; leave phone and type stay in their own columns',()=>{
 for(const [module,spec] of Object.entries(modules)){
  const keys=spec.fields.map(field=>field.key);
  assert.equal(keys.length,new Set(keys).size,`duplicate table key in ${module}`);
 }
 const leave=modules.leave.fields;
 assert.equal(leave.find(f=>f.key==='leave_type')?.label,'نوع الإجازة');
 assert.equal(leave.find(f=>f.key==='contact_phone')?.label,'هاتف التواصل أثناء الإجازة');
});

test('projects show correct numeric code, manager name and active employee salary sum from register',()=>{
 const project={id:'p1063',module:'projects',code:'1063',company:'مسكن الكيان',data:{name:'العمل - سديم 79',code:'1063',manager_name:'م محمداحمد'}};
 const employees=[
  {id:'e1',module:'employees',company:'مسكن الكيان',data:{project_id:'p1063',employment_status:'active',salary:5000,manager:'م محمداحمد'}},
  {id:'e2',module:'employees',company:'مسكن الكيان',data:{project_id:'p1063',employment_status:'inactive',salary:9000}},
  {id:'e3',module:'employees',company:'مسكن الكيان',data:{project_id:'another',employment_status:'active',salary:2000}}
 ];
 const records=[project,...employees];
 assert.equal(projectRegisterValue(project,'name',records),'العمل - سديم 79');
 assert.equal(projectRegisterValue(project,'code',records),'1063');
 assert.equal(projectRegisterValue(project,'manager_name',records),'م محمداحمد');
 assert.equal(projectRegisterValue(project,'active_employee_count',records),1);
 assert.equal(projectRegisterValue(project,'monthly_salary_total',records),5000);
 assert.equal(employees[0].data.salary,5000);
 assert.equal(new Set(projectRegisterFields.map(f=>f.key)).size,projectRegisterFields.length);
 assert.equal(projectRegisterFields.some(f=>f.key==='salary'),false);
});

test('a project with disagreeing employee supervisors is flagged rather than assigned arbitrarily',()=>{
 const project={id:'p1039',module:'projects',data:{code:'1039',name:'إدارة المشاريع'}};
 const records=[project,...['م مجدي محجوب','م محمد المحلي'].map(manager=>({module:'employees',data:{project_id:'p1039',manager}}))];
 assert.equal(projectRegisterValue(project,'manager_name',records),'يحتاج تحديد مدير المشروع');
 assert.equal(projectRegisterValue({...project,data:{...project.data,manager_name:'م مجدي محجوب'}},'manager_name',records),'م مجدي محجوب');
});

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
 for(const action of ['projects_approve','finance_pay'])assert.ok(ui.includes(action));
});

test('printable monthly payroll includes overtime and two-stage approvals',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const print=ui.slice(ui.indexOf('function cyclePrint(){'),ui.indexOf('function cycleReceipt('));
 assert.match(print,/'الساعات الإضافية','قيمة الساعات الإضافية'/);
 assert.match(print,/money\(d\.overtime_hours\),money\(d\.overtime\)/);
 assert.match(print,/money\(total\('overtime_hours'\)\),money\(total\('overtime'\)\)/);
 assert.match(print,/اعتماد إدارة المشاريع<\/div><div>صرف المالية أو المدير العام/);
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
 assert.match(ui,/contact_email:memberRole==='project_manager'\?projectManagerContactEmail:\(memberContactEmail\|\|memberEmail\)/);
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



test('payroll management searches available and enrolled employees by normalized Arabic name and staff number',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const marker of ['payrollSearchNormalize','payrollEmployeeMatches','payrollEmployeeSearch','payrollListedSearch','payrollFilteredAvailableEmployees','payrollManagedFilteredRows','بحث موظفي المسير بالاسم أو الرقم الوظيفي','بحث الموظف المراد إضافته للمسير'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/payrollManagedFilteredRows\.map\(row=>/);
 assert.match(ui,/payrollFilteredAvailableEmployees\.map\(emp=>/);
 assert.match(ui,/setPayrollEmployeeSearch\(e\.target\.value\);setPayrollAddEmployeeId\(''\)/);
});

test('monthly payroll offers a unified draft-only manager for add, edit, exclude, restore and submit',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 for(const term of ['payrollManageBatchId','payrollAddEmployeeId','payrollAvailableEmployees','cycleAddEmployee','فتح إدارة المسير','حذف من المسير (استبعاد)','إرسال المسير إلى إدارة المشاريع'])assert.ok(ui.includes(term),term);
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
 assert.match(ui,/payrollStageLabels=\['اعتماد إدارة المشاريع','المالية أو المدير العام · صرف'\]/);
 assert.match(ui,/payrollStages=\['projects_review','finance_review','paid'\]/);
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
 assert.match(ui,/const deductions=round\(salaryAbsenceDeduction\(gross,n\('absence_days'\)\)/);
 assert.match(ui,/const net=round\(gross\+additions-deductions\)/);
 assert.match(ui,/صافي راتب الموظف بعد التعديلات/);
 assert.match(ui,/payroll-net-breakdown/);
 assert.match(ui,/!summary.valid/);
 assert.match(ui,/خصم الغياب يُحتسب تلقائياً/);
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

test('monthly payroll stores salary-charged company and project cost center independently of legal employer',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-label="شركة تحميل الراتب في المسير"/);
 assert.match(ui,/aria-label="مركز تكلفة المشروع في المسير"/);
 assert.match(ui,/cycleEdit\.data\.working_company/);
 assert.match(ui,/const cycleCostProjectName=\(id,fallback=''/);
 assert.match(ui,/aria-label="مركز تكلفة المشروع في المسير" type="text" readOnly/);
 assert.match(ui,/<th>أيام الاستحقاق<\/th>/);
 assert.match(ui,/<th>خصم الغياب<\/th>/);
 assert.match(ui,/استحقاق الحضور في المسير/);
 assert.match(ui,/const cost_company=canonicalCompany\(row\.data\.working_company\|\|row\.company\)/);
 assert.match(ui,/const cyclePaymentSources=Object\.values/);
 assert.match(ui,/شركة تحميل الراتب/);
 assert.match(ui,/مركز تكلفة المشروع/);
 assert.match(ui,/const cycleCostBreakdown=Object\.values/);
 assert.match(ui,/const head=\['الشركة التابعة لها الموظف','الشركة المحمّل عليها الراتب','رقم مركز تكلفة المشروع'/);
 assert.match(backend,/cost_company:co,cost_project_id:d\.project_id\|\|''/);
 assert.match(backend,/cost_project_id:d\.project_id\|\|''/);
 assert.match(backend,/const cost_company=canonicalCompany/);
 assert.match(backend,/!companies\.includes\(cost_company\)\|\|!allowed\(u,cost_company\)/);
 assert.match(backend,/if\(!costProject\)throw Error/);
 assert.match(backend,/canonicalCompany\(costProject\.company\)!==cost_company/);
 assert.match(backend,/managerEditing&&cost_project_id!==String\(old\.cost_project_id\|\|old\.project_id\|\|''\)/);
 assert.match(backend,/const data=\{\.\.\.old,cost_company,cost_project_id,basic/);
 assert.doesNotMatch(backend,/UPDATE records SET company=\?/);
});

test('payroll allocation cannot be changed by project managers and is validated before submission',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-label="شركة تحميل الراتب في المسير" readOnly/);
 assert.match(backend,/managerEditing&&cost_company!==canonicalCompany\(old\.cost_company\|\|batch\.company\)/);
 assert.match(backend,/const chargedCompany=canonicalCompany\(e\.data\.working_company\|\|batch\.company\)/);
 assert.match(backend,/canonicalCompany\(e\.data\.cost_company\|\|batch\.company\)!==chargedCompany/);
 assert.match(backend,/if\(!chargedProject\)throw Error/);
 assert.match(backend,/canonicalCompany\(chargedProject\.company\)!==chargedCompany/);
});

test('air conditioning department is selectable for employees and project managers',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/employee-department-choices[\s\S]*?'قسم التكييف'/);
 assert.match(ui,/const departments=\[\.\.\.new Set\([\s\S]*?'قسم التكييف'/);
 assert.match(backend,/registeredDepartments=new Set\([\s\S]*?'قسم التكييف'/);
});

test('payroll generation and manual enrollment use actual work company while preserving legal company',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(backend,/all\.filter\(e=>canonicalCompany\(e\.data\.working_company\|\|e\.company\)===co/);
 assert.match(backend,/source_company:e\.company,working_company:co/);
 assert.match(backend,/canonicalCompany\(d\.working_company\|\|original\.company\)!==batch\.company/);
 assert.match(backend,/source_company:original\.company,working_company:batch\.company/);
 assert.match(ui,/canonicalCompany\(row\.data\?\.working_company\|\|row\.company\)===payrollManagedBatch\.company/);
 assert.match(ui,/شركة السجل\/الكفالة/);
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
 assert.equal((m.match(/\['salary','الراتب الشهري الإجمالي'\]/g)||[]).length,1);
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
 assert.match(ui,/transfer_reason:reason\.trim\(\),data:\{\.\.\.edit\.data,project_id:'',_direct_manager_manual:false,direct_manager_id:''/);
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
 assert.match(ui,/aria-label="اختيار المدير المباشر من قائمة المدراء المعتمدين"/);
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
  {id:'e-one',module:'employees',company:'مسكن الكيان',data:{name:'موظف أ',project_id:'p-one',manager_email:'pm-one@example.test'}},
  {id:'e-two',module:'employees',company:'مسكن الكيان',data:{name:'موظف ب',project_id:'p-two',manager_email:'pm-two@example.test'}}
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
 assert.equal(visible({...pm,projects:'[]'},requests[0],all),true,'assigned direct manager is independently authorized for employee requests');
});
test('request workflow requires an assigned active manager before routing and checks ownership at review',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/current==='draft'\|\|current==='project_manager'/);
 assert.match(backend,/المدير المباشر للموظف لا يمتلك بريد اعتماد/);
 assert.match(backend,/const managerEmail=String\(employeeData\.manager_email/);
 assert.match(backend,/current==='project_manager'/);
 assert.match(backend,/هذا الطلب بانتظار اعتماد المدير المباشر المحدد/);
 assert.match(backend,/const managerEmail=String\(employeeData\.manager_email/);
 assert.match(ui,/module==='projects'&&f\.key==='manager_email'/);
 assert.match(ui,/directManagerChoices\(rows,members,edit\.company\)/);
});

test('the deployed shared visibility rule restricts managers to their assigned projects',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const p1={id:'p1',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm1@example.test'}};
 const p2={id:'p2',module:'projects',company:'مسكن الكيان',data:{manager_email:'pm2@example.test'}};
 const e1={id:'e1',module:'employees',company:'مسكن الكيان',data:{project_id:'p1',manager_email:'pm1@example.test'}};
 const e2={id:'e2',module:'employees',company:'مسكن الكيان',data:{project_id:'p2',manager_email:'pm2@example.test'}};
 const r1={id:'l1',module:'leave',company:'مسكن الكيان',data:{employee_id:'e1'}};
 const r2={id:'l2',module:'leave',company:'مسكن الكيان',data:{employee_id:'e2'}};
 const rows=[p1,p2,e1,e2,r1,r2];
 const u={role:'project_manager',email:'PM1@EXAMPLE.TEST',projects:'*',companies:'*'};
 assert.equal(visible(u,r1,rows),true);
 assert.equal(visible(u,r2,rows),false);
 assert.equal(visible(u,p1,rows),true);
 assert.equal(visible(u,p2,rows),false);
 assert.equal(visible({...u,email:'unknown@example.test'},r1,rows),false);
 assert.equal(visible({...u,projects:'[]'},r1,rows),true,'direct manager request approval does not depend on project ownership');
 assert.equal(visible({...u,companies:'["شركة البلد المتحدة"]'},r1,rows),false);
});
test('named employee delegation overrides project owner for both visibility rules, including technical office and payroll',async()=>{
 const project={id:'technical',module:'projects',company:'مسكن الكيان',data:{name:'المكتب الفني',manager_email:'owner@example.test'}};
 const delegated={id:'worker1',module:'employees',company:'مسكن الكيان',data:{name:'موظف المكتب الفني',project_id:'technical',delegated_manager_email:'new@example.test',manager_email:'new@example.test'}};
 const legacy={id:'worker2',module:'employees',company:'مسكن الكيان',data:{name:'موظف آخر',project_id:'technical',manager_email:'owner@example.test'}};
 const request={id:'leave1',module:'leave',company:'مسكن الكيان',data:{employee_id:delegated.id,project_id:project.id}};
 const salary={id:'pay1',module:'payroll',company:'مسكن الكيان',data:{employee_id:delegated.id,project_id:project.id,batch_id:'batch1'}};
 const batch={id:'batch1',module:'payroll_batches',company:'مسكن الكيان',data:{}};
 const rows=[project,delegated,legacy,request,salary,batch];
 const newManager={role:'project_manager',email:'new@example.test',companies:'*',projects:'[]'};
 const owner={...newManager,email:'owner@example.test',projects:'["technical"]'};
 for(const modulePath of ['../lib/modules.mjs','../backend/modules.mjs']){
  const {visible}=await import(modulePath);
  for(const record of [project,delegated,salary,batch])assert.equal(visible(newManager,record,rows),true,modulePath+' '+record.module);
  assert.equal(visible(newManager,request,rows),true,modulePath+' request follows employee direct manager');
  for(const record of [delegated,salary,batch])assert.equal(visible(owner,record,rows),false,modulePath+' '+record.module);
  assert.equal(visible(owner,request,rows),false,modulePath+' project owner cannot approve a different employee direct manager request');
  assert.equal(visible(owner,legacy,rows),true,modulePath+' legacy worker');
  assert.equal(visible({...newManager,companies:'["رياح الاعمار"]'},request,rows),false,'company isolation');
 }
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const payroll=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.match(ui,/function ManagerEmployeePicker\(/);
 assert.match(ui,/حفظ تكليف الموظفين/);
 assert.match(erp,/assign_manager_employees/);
 assert.match(erp,/delegated_manager_email/);
 assert.doesNotMatch(payroll,/await ensureAssignedPayrollManager\(/);
 assert.match(ui,/إضافة قسم الدفاع المدني/);
});


test('manager account company permissions are checked at project linking and request dispatch',()=>{
 const source=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(source,/SELECT role,is_active,companies FROM members WHERE email=\?/);
 assert.match(source,/manager\.companies/);
 assert.match(source,/المدير المباشر لا يملك صلاحية شركة الموظف/);
 assert.match(source,/المدير المباشر لا يملك صلاحية شركة الموظف/);
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
 assert.match(ui,/module==='leave'&&\['leave_type','leave_payment','holiday_policy','ticket'\]\.includes\(f\.key\)\?applyLeaveField/);
 assert.match(ui,/module==='leave'&&\['start','end','unpaid_days'\]\.includes\(f\.key\)\)applyLeaveField/);
 assert.match(ui,/fixedLeaveDays\(edit\.data\.leave_type\)!==null/);
 assert.match(ui,/لا تخصم من رصيد الإجازة السنوية/);
});

test('pending requests center lists active request types with filters and excludes closed statuses',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/module==='pending_requests'/);
 assert.match(ui,/الطلبات قيد الإجراء/);
 assert.match(ui,/pendingRequestTypes=\['leave','advances','payroll_batches','resignations','returns','terminations','leave_dues','settlements','warnings','appointments'\]/);
 assert.match(ui,/pendingStages=\['draft','returned','project_manager','projects_director','hr','finance','manager_review','projects_review','finance_review','finance_approved'\]/);
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
 assert.match(ui,/project_id:r\.id,_direct_manager_manual:false,direct_manager_id:manager\?\.id\|\|''/);
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
 assert.match(ui,/members\.filter\(m=>\(m\.role==='project_manager'\|\|isMagdiGeneralManagerAccount\(m\)\)/);
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
 assert.match(server,/SELECT id,company,data FROM records WHERE module='employees'/);
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
 assert.match(erp,/details\.direct_manager=\{name:managerName/);
 assert.match(erp,/UPDATE records SET status=\?,data=\?,revision=revision\+1/);
});

test('HR directory choices expose only active project manager identities without credentials',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/if\(mod==='project_manager_choices'\)/);
 assert.match(erp,/SELECT email,username,contact_email,role,is_active,companies FROM members WHERE is_active=true AND/);
 assert.match(erp,/\['admin','hr','projects_director'\]\.includes\(u\.role\)/);
 assert.match(ui,/user\?\.role==='admin'\?'members':'project_manager_choices'/);
});

test('direct manager saves known project names without requiring a login identity',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/details\.name\|\|fallbackName\|\|account\.username\|\|email/);
 assert.match(erp,/isAuthorizedProjectManagerAccount\(account,fallbackName\)/);
 assert.match(erp,/availableEmployeeDirectManagers\(db,old\.company\)/);
 assert.match(ui,/employeeDirectManagerOptions\(rows,members,c\)/);
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
 assert.match(backend,/يمكن منح المدير صلاحية المشاريع المعيّن مديرًا لها فقط/);
 assert.match(backend,/المدير المباشر لا يملك حساب اعتماد نشطاً/);
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

test('employee direct manager is a verified roster choice reflected in request snapshots',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const mod=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 for(const term of ['direct_manager_id','manager_phone','supervisor_account'])assert.ok(erp.includes(term),term);
 assert.match(erp,/module='project_managers' AND company=\?/);
 assert.match(erp,/setEmployeeDirectManager\(updated,resolved,mode==='selected'\)/);
 assert.match(erp,/isAuthorizedProjectManagerAccount\(account,fallbackName\)/);
 assert.match(erp,/data\.direct_manager=\{name:snapshot\.manager/);
 assert.match(mod,/f\('direct_manager_id','مرجع المدير المباشر','internal'\)/);
 assert.match(ui,/aria-label="بحث المدير المباشر"/);
 assert.match(ui,/aria-label="اختيار المدير المباشر من قائمة المدراء المعتمدين"/);
 assert.match(ui,/setMembers\(d\.rows\)/);
 assert.match(ui,/f\.type!=='internal'/);
});
test('general manager can approve and correct return completion with linked employee and payroll sync',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/async function gmConfirmReturn/);
 assert.match(ui,/user\?\.role!=='admin'\|\|!permittedWrite\(user\|\|\{\},'returns'\)/);
 assert.match(ui,/المدير العام: اعتماد المباشرة وتحديث الحالة/);
 assert.match(ui,/تصحيح تاريخ المباشرة \(المدير العام\)/);
 assert.match(ui,/await post\(\{action:'save',module:'returns',company:leave.company/);
 assert.match(ui,/\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/);
 assert.match(backend,/mod==='returns'&&u.role==='admin'&&old.status==='completed'/);
 assert.ok(backend.includes(String.raw`status=\'completed\'`));
 assert.match(backend,/mod==='returns'\?'completed':'draft'/);
 assert.match(backend,/return_last_updated_by:u.email,return_last_updated_at:now/);
 assert.match(backend,/سبب تصحيح تاريخ المباشرة مطلوب/);
 assert.match(backend,/returnSyncUpdates\.push/);
 assert.match(backend,/return_payroll_sync:mod==='returns'\?returnPayrollSync/);
});
test('return-to-work register preserves completed records, actual dates and pending entries',async()=>{
 const {returnToWorkRegister,availableReturnLeaves}=await import('../lib/return-to-work.mjs');
 const approved=(id,employee_id)=>({id,module:'leave',status:'approved',company:'مسكن الكيان',data:{employee_id,start:'2026-10-01',end:'2026-10-31'}});
 const a=approved('leave-a','employee-a'),b=approved('leave-b','employee-b'),c=approved('leave-c','employee-c');
 c.data.return_status='completed';c.data.return_record_id='legacy-return';c.data.actual_return='2026-11-10';
 const returned={id:'return-a',module:'returns',company:'مسكن الكيان',data:{leave_id:'leave-a',actual_return:'2026-11-05'}};
 const records=[a,b,c,returned];
 const list=returnToWorkRegister(records,'مسكن الكيان');
 assert.equal(list.length,3);
 assert.deepEqual(list.find(x=>x.leave.id==='leave-a')&&[list.find(x=>x.leave.id==='leave-a').completed,list.find(x=>x.leave.id==='leave-a').actualReturn,list.find(x=>x.leave.id==='leave-a').status],[true,'2026-11-05','تمت المباشرة']);
 assert.equal(list.find(x=>x.leave.id==='leave-b').completed,false);
 assert.equal(list.find(x=>x.leave.id==='leave-c').completed,true);
 assert.deepEqual(availableReturnLeaves(records).map(x=>x.id),['leave-b']);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/returnToWorkRegister\(rows,company\)/);
 assert.match(ui,/<th>تاريخ المباشرة الفعلي<\/th>/);
 assert.match(ui,/تمت المباشرة<\/span>/);
 assert.match(ui,/عرض محضر المباشرة/);
 assert.match(ui,/تم حفظ المباشرة بتاريخ/);
 assert.match(api,/return_status:'completed',actual_return:data.actual_return/);
});

test('approved and HR-approved legacy leaves appear in return-to-work queue',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 for(const marker of ['الموظفون المطلوب تسجيل مباشرتهم من الإجازات المعتمدة','بانتظار تسجيل المباشرة','تسجيل المباشرة','leave.data.employee_id','return_record_id','leave.data.expected_return','setEdit({company:leave.company','آخر مباشرة من إجازة مسجلة','availableReturnLeaves(rows,company)'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/employeeOnLeave\(r\)/);
 assert.match(ui,/actual_return:expected&&expected<=today\?expected:''/);
});
test('return-to-work records link leave and employee with duplicate and stale-write protection',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const client=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const server=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 for(const source of [client,server]){
  assert.match(source,/f\('last_return_date','آخر مباشرة بعد إجازة','internal'\)/);
  assert.match(source,/f\('return_record_id','مرجع محضر المباشرة','internal'\)/);
  assert.match(source,/f\('leave_id','طلب الإجازة المعتمد','leave',true\)/);
 }
 for(const marker of ['returnLeaveRecord=linked','leave_start=String(leave.start','leave_end=String(leave.end','existingReturn&&String(existingReturn.id)!==String(id)','updatedLeave={...leaveData,return_record_id:id','last_return_date:data.actual_return','returnSyncUpdates','leave_id:mod===\'returns\'?data.leave_id','module=\'employees\' AND revision=?'])assert.ok(backend.includes(marker),marker);
 assert.match(backend,/UPDATE records SET data=\?,revision=revision\+1,updated_at=\?,mutation=\? WHERE id=\? AND module='leave' AND revision=\?/);
 assert.match(backend,/returnSyncUpdates\.some/);
});

test('scheduled loan installments are deterministic and recorded only after disbursement',async()=>{
 const {calculateScheduledAdvances}=await import('../lib/payroll-advance-schedule.mjs');
 const auto={id:'a1',status:'paid',data:{employee_id:'e1',amount:5000,installments:10,first_month:'2026-11',schedule_mode:'auto',date:'2026-11-23',paid_at:'2026-11-23T11:00:00Z'}};
 const manual={id:'a2',data:{...auto.data,schedule_mode:'manual'}};
 const ctx={loans:[auto,manual],sums:new Map()};
 assert.deepEqual(calculateScheduledAdvances(ctx,'e1','2026-11',350000),[{advance_id:'a1',amount:500}]);
 assert.deepEqual(calculateScheduledAdvances(ctx,'e1','2026-10',350000),[]);
 assert.deepEqual(calculateScheduledAdvances({...ctx,loans:[]},'e1','2026-11',350000),[]);
 assert.deepEqual(calculateScheduledAdvances(ctx,'e1','2026-11',30000),[{advance_id:'a1',amount:300}]);
 const deferred={...auto,data:{...auto.data,deferred_months:['2026-11']}};
 assert.deepEqual(calculateScheduledAdvances({...ctx,loans:[deferred]},'e1','2026-11',350000),[]);
 const contextPaid={...ctx,sums:new Map([['a1',475000]])};
 assert.deepEqual(calculateScheduledAdvances(contextPaid,'e1','2026-11',350000),[{advance_id:'a1',amount:250}]);
});
test('project manager may also be verified HR approver without changing the account role',async()=>{
 const {isAuthorizedProjectManagerAccount}=await import('../backend/project-manager-roster.mjs');
 const {isRequestStageActor,requestApprovalOwners}=await import('../backend/modules.mjs');
 const manager={email:requestApprovalOwners.hr.email,role:'hr',is_active:true};
 assert.equal(isAuthorizedProjectManagerAccount(manager,'م محمد يوسف'),true);
 assert.equal(isRequestStageActor(manager,'project_manager'),true);
 assert.equal(isRequestStageActor(manager,'hr'),true);
 assert.equal(isAuthorizedProjectManagerAccount({...manager,email:'someone@example.com'}),false);
 assert.equal(isAuthorizedProjectManagerAccount({...manager,is_active:false}),false);
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(erp,/const isManager=actorEmail===managerEmail/);
 assert.match(erp,/!adminOverride&&manager\?\.role==='project_manager'&&manager.projects/);
});
test('loan disbursement automatically recalculates draft payroll, preserves approval/review locks',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/action==='disburse'/);
 assert.match(erp,/calculateScheduledAdvances\(context,data.employee_id,month,beforeLoan\)/);
 assert.match(erp,/drafts\.has\(current.batch_id\)/);
 assert.match(erp,/\['draft','manager_review'\]\.includes\(b.status\)/);
 assert.match(erp,/split_confirmed:false/);
 assert.match(erp,/advance_schedule_synced_at:now/);
 assert.match(erp,/payroll_synced:synced.length/);
 assert.match(ui,/لم يُوثّق صرفها بعد/);
});

test('return-to-work list includes approved, paid and legacy finance-stage leaves plus on-leave staff',async()=>{
 const {isReturnEligibleLeave,availableReturnLeaves,employeeOnLeave}=await import('../lib/return-to-work.mjs');
 const make=(id,status,employee='e')=>({id,module:'leave',status,company:'مسكن الكيان',data:{employee_id:employee,start:'2026-11-01',end:'2026-11-20'}});
 const all=[make('a','approved'),make('b','paid'),make('c','finance'),make('d','hr'),make('e','rejected')];
 assert.deepEqual(availableReturnLeaves(all).map(x=>x.id),['a','b','c']);
 assert.equal(isReturnEligibleLeave(make('d','hr')),false);
 assert.equal(employeeOnLeave({data:{employment_status:'on_leave'}}),true);
 assert.equal(employeeOnLeave({data:{employment_status:'في إجازة'}}),true);
 assert.equal(employeeOnLeave({data:{employment_status:'active'}}),false);
 assert.deepEqual(availableReturnLeaves([...all,{id:'x',module:'returns',company:'مسكن الكيان',data:{leave_id:'c'}}]).map(x=>x.id),['a','b']);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/availableReturnLeaves\(rows,company\)/);
 assert.match(ui,/const pendingLeaves=rows\.filter/);
 assert.match(ui,/employeeOnLeave\(r\)/);
 assert.match(ui,/حالة الموظف وحدها لا تثبت اعتماد الإجازة/);
 assert.match(ui,/تحديث بيانات الإجازات والموظفين/);
});
test('return-to-work approval updates employee and open payroll atomically without touching paid batches',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(erp,/isReturnEligibleLeave\(\{\.\.\.linked,data:leave\}\)/);
 assert.match(erp,/employment_status:employeeData\.employment_status==='terminated'/);
 assert.match(erp,/module='payroll_batches' AND company=\?/);
 assert.match(erp,/monthlyBatch&&\['draft','manager_review'\]\.includes\(monthlyBatch.status\)&&current/);
 assert.match(erp,/return_to_work_at:data\.actual_return/);
 assert.match(erp,/split_confirmed:false,manager_reviewed:false/);
 assert.match(erp,/monthlyBatch\.status==='draft'&&!matched\.some/);
 assert.match(erp,/added_reason:'approved_return_to_work'/);
 assert.match(erp,/advance_allocations:allocations/);
 assert.match(erp,/return_payroll_sync:mod==='returns'\?returnPayrollSync/);
 assert.match(erp,/returnSyncUpdates\.some/);
});

test('return-to-work attendance deducts unpaid days but protects approved paid leave',async()=>{
 const {returnPeriodAttendance,salaryAbsenceDeduction}=await import('../lib/payroll-attendance.mjs');
 const unpaid={start:'2026-11-01',end:'2026-11-30',leave_type:'unpaid'};
 const whole=returnPeriodAttendance(unpaid,'2026-11-23','2026-11');
 assert.equal(whole.absence_days,22);assert.equal(whole.payable_days,8);
 assert.equal(salaryAbsenceDeduction(9000,whole.absence_days),6600);
 assert.equal(9000-salaryAbsenceDeduction(9000,whole.absence_days),2400);
 const paid={...unpaid,leave_type:'annual',leave_payment:'paid',unpaid_days:0};
 assert.equal(returnPeriodAttendance(paid,'2026-11-23','2026-11').absence_days,0);
 const late={...paid,end:'2026-11-20'};
 assert.equal(returnPeriodAttendance(late,'2026-11-23','2026-11').absence_days,2);
 const mixed={...paid,unpaid_days:10};
 assert.equal(returnPeriodAttendance(mixed,'2026-11-25','2026-11').absence_days,4);
 assert.equal(returnPeriodAttendance(unpaid,'bad-date','2026-11').valid,false);
});
test('project cost center displays staff project and payroll absence amount updates automatically',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-label="مركز تكلفة المشروع في المسير" type="text" readOnly/);
 assert.match(ui,/cost_project_id:linked\?\.data\?\.project_id/);
 assert.match(ui,/salaryAbsenceDeduction\(cycleSalarySummary\(cycleEdit.data\)\.gross/);
 assert.match(backend,/const cost_project_id=assignedProjectId/);
 assert.match(backend,/const absence_deduction=salaryAbsenceDeduction\(salary,absence_days\)/);
 assert.match(erp,/returnSyncUpdates/);
 assert.match(erp,/last_return_absence_days:returnAttendance.absence_days/);
 assert.match(erp,/absence_days:attendance.absence_days,absence_deduction:salaryAbsenceDeduction/);
 assert.match(erp,/net:newNet,bank_amount:bank/);
});
test('payroll newly generated and newly added employee rows derive absence from approved returns',async()=>{
 const {payrollAttendanceForSalary}=await import('../lib/payroll-month-bridges.mjs');
 const leave={id:'leave-1',module:'leave',status:'approved',company:'مسكن الكيان',data:{employee_id:'employee-1',leave_type:'unpaid',start:'2026-11-01',end:'2026-11-20'}};
 const actual={id:'return-1',module:'returns',company:'مسكن الكيان',data:{employee_id:'employee-1',leave_id:'leave-1',actual_return:'2026-11-23'}};
 const attendance=payrollAttendanceForSalary([leave,actual],'employee-1','2026-11',9000);
 assert.equal(attendance.absence_days,22);
 assert.equal(attendance.payable_days,8);
 assert.equal(attendance.absence_deduction,6600);
 assert.equal(attendance.return_to_work_at,'2026-11-23');
 assert.equal(payrollAttendanceForSalary([leave],'employee-1','2026-11',9000).absence_days,0);
 assert.equal(payrollAttendanceForSalary([{...leave,status:'hr'},actual],'employee-1','2026-11',9000).absence_days,0);
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.equal((backend.match(/payrollAttendanceForSalary\(attendanceRecords,/g)||[]).length>=3,true);
 assert.match(backend,/action==='sync_deductions'/);
 assert.match(backend,/return_payable_days:attendance.payable_days/);
});
test('outstanding scheduled paid advances continue every month and never overdraw balance',async()=>{
 const {calculateScheduledAdvances,loanFirstMonth}=await import('../lib/payroll-advance-schedule.mjs');
 const loan={id:'advance-1',status:'paid',data:{employee_id:'employee-1',amount:5000,installments:10,first_month:'2026-11',schedule_mode:'auto',paid_at:'2026-11-23T11:00:00Z'}};
 const ctx={loans:[loan],sums:new Map()};
 assert.equal(calculateScheduledAdvances(ctx,'employee-1','2026-11',900000)[0].amount,500);
 assert.equal(calculateScheduledAdvances(ctx,'employee-1','2026-12',900000)[0].amount,500);
 assert.equal(calculateScheduledAdvances(ctx,'employee-1','2027-09',900000)[0].amount,500);
 assert.equal(calculateScheduledAdvances({...ctx,sums:new Map([['advance-1',480000]])},'employee-1','2027-09',900000)[0].amount,200);
 assert.deepEqual(calculateScheduledAdvances({...ctx,sums:new Map([['advance-1',500000]])},'employee-1','2027-09',900000),[]);
 assert.equal(loanFirstMonth({data:{paid_at:'2026-11-23T10:20:00Z'}}),'2026-11');
 assert.equal(calculateScheduledAdvances({...ctx,loans:[{...loan,data:{...loan.data,first_month:'',paid_at:'2026-11-23T10:20:00Z'}}]},'employee-1','2026-11',900000)[0].amount,500);
 assert.deepEqual(calculateScheduledAdvances({...ctx,loans:[{...loan,data:{...loan.data,schedule_mode:'manual'}}]},'employee-1','2026-11',900000),[]);
});
test('open payroll can re-sync loan installments and return attendance without replaying repayments',()=>{
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/action==='sync_deductions'/);
 assert.match(backend,/\['draft','manager_review'\]\.includes\(batch.status\)/);
 assert.match(backend,/payrollAttendanceForSalary\(attendanceRecords,d.employee_id,batch.data.month,wage\)/);
 assert.match(backend,/autoAdvanceAllocations\(loans,d.employee_id,batch.data.month/);
 assert.match(backend,/split_confirmed:false,manager_reviewed:false/);
 assert.match(backend,/updates.length/);
 assert.match(ui,/function cycleSyncDeductions/);
 assert.match(ui,/تحديث أقساط السلف والغياب لجميع الموظفين/);
 assert.match(ui,/<th>خصم السلف المجدولة<\/th>/);
 assert.match(backend,/تغيرت أقساط سلف الموظف/);
 assert.match(backend,/const manualAbsence=Math.max\(0,Number\(d.absence_days\|\|0\)-oldReturnDays\)/);
 assert.match(backend,/const absence_days=Math.min\(30,manualAbsence\+attendance.absence_days\)/);
 assert.match(backend,/return_absence_days:attendance.absence_days/);
 assert.match(backend,/أقساط السلف تغيرت لدى الموظف/);
 assert.match(ui,/readOnly=\{key==='absence_deduction'\|\|key==='advance_deduction'\}/);
});

test('GM approves advance directly, records employee ledger and issues printable receipt',()=>{
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(api,/body.action==='gm_approve_advance'/);
 assert.match(api,/!isRequestFinanceActor\(u\)/);
 assert.match(api,/advance_disbursement_ledger/);
 assert.match(api,/existingLedger.some/);
 assert.match(api,/status='paid'/);
 assert.match(api,/receipt_no:reference/);
 assert.match(ui,/async function gmFinalizeAdvance/);
 assert.match(ui,/طباعة سند الصرف/);
 assert.match(ui,/function advanceReceipt/);
 assert.match(ui,/سند تسليم عهدة \/ سلفة موظف/);
});
test('payroll cost center follows employee project on synchronizing existing payroll',()=>{
 const api=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(api,/employeeProjectById=new Map/);
 assert.match(api,/cost_project_id:costProjectId,project_id:costProjectId/);
 assert.match(ui,/const cycleCostProjectName=\(id,fallback=''/);
 assert.match(ui,/e\?\.data\?\.project_id\|\|row.data.cost_project_id/);
});
test('employee opening leave starts zero and previously confirmed manual balances are retained',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/if\(mod==='employees'&&!old\)\{data.opening_leave='0';data.opening_leave_confirmed='no';\}/);
 assert.match(backend,/previous\?\.opening_leave_confirmed==='yes'/);
 assert.match(ui,/defaultData.opening_leave='0';defaultData.opening_leave_confirmed='no'/);
 assert.match(ui,/تُحفظ جميع الأرصدة السابقة المعتمدة والمدخلة يدوياً/);
});

test('overview hides all request approval tables while specialized pending requests retains workflow',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/موافقات مسؤول النظام حسب المدير المخوّل/);
 assert.doesNotMatch(ui,/adminStageGroups\.filter\(stage=>stage.records.length>0\)/);
 assert.match(ui,/module==='pending_requests'&&<section className="panel"/);
 assert.match(ui,/فتح الطلب ومراجعته/);
 assert.match(ui,/permittedRead\(user\|\|\{\},'employees'\)&&<details/);
});
test('advances display administrative approvals only, without finance or payout approval column',async()=>{
 const {requestApprovalStages}=await import('../lib/request-approval.mjs');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.equal(requestApprovalStages.length,3);
 assert.match(ui,/requestApprovalStages\.map\(stage/);
 assert.doesNotMatch(ui,/row.module==='advances'\?\[\.\.\.requestApprovalStages,advanceFinanceStage/);
 assert.match(ui,/اعتماد مبلغ الصرف وتقييده/);
});
test('finance or general manager records payment only after director approval',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/cycleTransition\(b,'finance_approve'\)/);
 assert.match(ui,/تعميد وتوثيق الصرف الفعلي/);
 assert.match(backend,/const isFinance=u=>\['admin','finance'\]\.includes\(u.role\)\|\|isRequestFinanceActor\(u\)/);
 assert.match(backend,/projects_approve:'finance_review',finance_pay:'paid'/);
 assert.match(backend,/if\(!body.confirm_payment\)/);
 assert.match(backend,/projects_approved_by:u.email/);
 assert.match(backend,/paid_by:u.email/);
 assert.match(backend,/if\(!isFinance\(u\)/);
 assert.match(backend,/if\(action==='finance_pay'\)\{/);
});
test('company employee dashboard offers live KPIs and filtered staff report export',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../app/employee-dashboard.tsx',import.meta.url),'utf8');
 assert.match(ui,/import EmployeeReportsDashboard from '.\/employee-dashboard'/);
 assert.match(ui,/permittedRead\(user\|\|\{\},'employees'\)&&<details/);
 assert.match(ui,/onOpenEmployees=\{\(\)=>setModule\('employees'\)\}/);
 for(const label of ['لوحة كشوف موظفي الشركات','فلترة كشف الموظفين حسب الشركة','فلترة كشف الموظفين حسب المشروع','فلترة كشف الموظفين حسب الحالة','فلترة كشف الموظفين حسب القسم','فلترة كشف الموظفين حسب الكفالة','كشف مختصر','كشف وظيفي ومشاريع','كشف التواصل','كشف مفصل (للمخولين)','تصدير كشف Excel','طباعة / حفظ PDF'])assert.ok(board.includes(label),label);
 assert.match(board,/employees=useMemo\(\(\)=>rows.filter\(r=>r.module==='employees'/);
 assert.match(board,/!r.data\?\._archived&&!r.data\?\._deleted/);
 assert.match(board,/const canDetailed=\['admin','hr'\]/);
 assert.match(board,/const canContact=canDetailed\|\|user\?\.role==='administrative_assistant'/);
 assert.match(board,/const table=\[fields.map\(x=>x\[1\]\),\.\.\.filtered.map/);
 assert.match(board,/workbookBytes\(table\)/);
 assert.match(board,/filtered.slice\(0,100\)/);
 assert.match(board,/جميع النتائج المطابقة، وليس أول 100 فقط/);
 assert.match(board,/companyDisplayName\(row.company\)/);
});

test('employee requests end at HR; finance is a separate disbursement operation',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const mod=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 assert.equal(requestApprovalStages.length,3);
 assert.equal(requestApprovalStages.some(stage=>stage.id==='finance'),false);
 assert.match(mod,/workflow=\['draft','project_manager','projects_director','hr','approved'\]/);
 assert.match(ui,/المدير المباشر ← مجدي محجوب، المدير العام \/ إدارة المشاريع ← م\. محمد يوسف، شؤون الموظفين/);
 assert.match(server,/routedRequest&&current==='finance'\?'approved'/);
 assert.match(server,/legacy_finance_stage_migrated_at/);
 assert.match(server,/action==='disburse'/);
});
test('leave and advance approvals show assigned project manager and horizontal stages',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const print=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 for(const term of ['request-approval-guide','request-approval-summary','approvalStages','المدير المباشر المختص','دورة اعتماد الطلب'])assert.ok(ui.includes(term),term);
 for(const term of ['Direct Manager','Project Manager','التسلسل: إعداد الطلب'])assert.ok(print.includes(term),term);
});
test('payroll approval no longer depends on project managers and retains director authorization',()=>{
 const cycle=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(cycle,/await ensureAssignedPayrollManager\(/);
 assert.match(cycle,/!isProjectsDirector\(u\)\|\|!permission\(u,'payroll','approve'\)/);
 assert.match(cycle,/!e.data.split_confirmed/);
 assert.match(cycle,/const chargedProject=await db.prepare/);
 assert.match(ui,/اعتماد إدارة المشاريع وإرسال للصرف/);
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
 const batch={id:'b1',module:'payroll_batches',company:'مسكن الكيان',data:{month:'2026-11'}};
 assert.equal(visible(u,batch,all),false); // Unlinked monthly headers must not be disclosed.
 all.push({id:'pay1',module:'payroll',company:'مسكن الكيان',data:{batch_id:'b1',employee_id:'e1',project_id:'p1'}});
 assert.equal(visible(u,batch,all),true);
});

test('existing employee can be chosen as project manager and linked to scoped approvals',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/اختيار أحد الموظفين لتعيينه مدير مشروع/);
 assert.match(ui,/aria-label="اختيار المدير المباشر لتعيينه مدير مشروع"/);
 assert.match(ui,/employee_id:managerSetup\.employeeId\|\|null/);
 assert.match(ui,/employeeId:employee\?\.id\|\|''/);
 assert.match(backend,/if\(body\.action==='onboard_project_manager'\)/);
 assert.match(backend,/employeeRow=await db\.prepare/);
 assert.match(backend,/الموظف مرتبط بحساب دخول آخر/);
 assert.match(backend,/employee_id=\?,companies=\?,projects=\?,username=\?/);
 assert.match(backend,/project_manager_account:email,is_project_manager:true/);
 assert.match(backend,/manager_email:email,manager_name:adminMagdi\?magdiProjectManagerName:name/);
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

test('direct manager remains editable independently from project approval ownership',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/setEmployeeDirectManager\(data,resolved,Boolean\(data\._direct_manager_manual\)\)/);
 assert.match(backend,/set_employee_direct_manager/);
 assert.match(backend,/employee_direct_manager_updated/);
 assert.match(backend,/if\(d\._direct_manager_manual\)continue/);
 assert.doesNotMatch(backend,/data\.direct_manager=\{name:data\.project_manager\.name,email:managerEmail/);
 assert.match(ui,/const projectManagerEmail=String\(chosenProject\?\.data\?\.manager_email/);
 assert.match(ui,/function EmployeeDirectManagerCell\(/);
 assert.match(ui,/onSave=\{saveEmployeeDirectManager\}/);
 assert.match(ui,/direct_manager_id:manager\?\.id\|\|''/);
 assert.match(ui,/direct_name:directRow\?\.data\.name\|\|employeeData\.manager/);
});

test('direct manager is a prominent employee register column and remains in employee snapshots',()=>{
 assert.deepEqual(employeeRegisterFields.slice(1,4).map(f=>f.key),['code','name','manager']);
 assert.equal(employeeRegisterValue({data:{manager:'المشرف المحدد'}},'manager',[]),'المشرف المحدد');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/EmployeeDirectManagerCell employee=\{row\}/);
 assert.match(ui,/حفظ\<\/button\>\<button type="button" disabled=\{disabled\}/);
 assert.match(ui,/تظهر الأسماء المعتمدة سابقًا حتى دون حساب دخول/);
 assert.match(ui,/<\/fieldset>;\n}\nfunction ManagerEmployeePicker\(/);
 assert.match(backend,/data\.direct_manager=\{name:snapshot\.manager,email:snapshot\.manager_email/);
 assert.match(backend,/if\(mod==='employees'&&typeof body\.data\?\._direct_manager_manual==='boolean'\)/);
 assert.match(backend,/!e\.data\._direct_manager_manual&&String\(e\.data\.manager_email/);
});

test('manager assignment supports one director for multiple projects with employee-name previews',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 for(const phrase of ['تحديد كل المشاريع المعروضة','عرض أسماء موظفي المشروع','أسماء الموظفين الذين سيُربطون بهذا المدير','المشاريع والموظفون المرتبطون','المشاريع المختارة'])assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/ids:\[\.\.\.new Set\(\[\.\.\.p\.ids,\.\.\.shownEligible\.map\(r=>r\.id\)\]\)\]/);
 assert.match(ui,/const linkedEmployees=rows\.filter/);
 assert.match(backend,/const syncEmployees:any\[\]=\[\]/);
 assert.match(backend,/direct_manager_id:directoryIds\.get\(employee\.company\)/);
 assert.match(backend,/for\(const project of selected\)/);
 assert.match(backend,/for\(const employee of syncEmployees\.filter/);
 assert.match(backend,/employees_linked:syncEmployees\.length/);
});

test('project manager form uses searched authorized name and department with server validation',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-label="فلترة أسماء مدراء المشاريع"/);
 assert.match(ui,/aria-label="اختيار اسم مدير المشروع من القائمة"/);
 assert.match(ui,/aria-label="اختيار الإدارة والقسم من القائمة"/);
 assert.match(ui,/aria-label="بريد حساب المدير المحدد"/);
 assert.match(erp,/const canonicalName=isMagdiGeneralManagerAccount\(member,data\.name\)/);
 assert.match(erp,/يجب اختيار اسم المدير من القائمة المعتمدة/);
 assert.match(erp,/registeredDepartments\.has\(department\)/);
});

test('invalid and cross-company scopes fail closed without crashing modules',async()=>{
 const {visible}=await import('../lib/modules.mjs');
 const projects=[
  {id:'p-a',module:'projects',company:'Alpha',data:{manager_email:'manager@example.test'}},
  {id:'p-b',module:'projects',company:'Beta',data:{manager_email:'manager@example.test'}}
 ];
 const manager={role:'project_manager',email:'manager@example.test',companies:'["Alpha"]',projects:'["p-a"]'};
 assert.equal(visible(manager,projects[0],projects),true);
 assert.equal(visible(manager,projects[1],projects),false);
 const directory={id:'d-b',module:'project_managers',company:'Beta',data:{email:'manager@example.test'}};
 assert.equal(visible(manager,directory,[...projects,directory]),false);
 assert.equal(visible({...manager,projects:'not-json'},projects[0],projects),false);
 assert.equal(visible({...manager,companies:'not-json'},projects[0],projects),false);
 assert.equal(visible({...manager,projects:'{}'},projects[0],projects),false);
 assert.equal(visible({...manager,projects:'[]'},projects[0],projects),false);
});
test('admin integrity report is read-only and scans linked HR modules',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/if\(mod==='integrity_report'\)/);
 assert.match(erp,/if\(u.role!=='admin'\)throw Error\('403'\)/);
 for(const type of ['missing_project','company_mismatch','manager_mismatch','missing_manager_directory','missing_request_employee','missing_payroll_batch'])assert.ok(erp.includes(type),type);
 assert.match(ui,/module=integrity_report/);
 assert.match(ui,/الفحص التشغيلي وترابط البيانات/);
 assert.match(ui,/integrityReport\.issues/);
});
test('projects register separates name, numeric code, manager, and employee cost values',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/projectRegisterFields as projectRegisterBaseFields,projectRegisterValue/);
 assert.match(ui,/module==='projects'\?projectRegisterValue\(r,f\.key,rows\)/);
 assert.match(ui,/module==='employees'\?tableFields:projectRegisterFields/);
 assert.equal(projectRegisterFields.find(f=>f.key==='code').label,'رمز المشروع');
 assert.equal(projectRegisterFields.find(f=>f.key==='manager_name').label,'اسم مدير المشروع');
});
test('manager onboarding lets projects be selected before entering email and identifies reassignments',async()=>{
 const {canSelectManagerProject,managerReassignmentConflicts}=await import('../lib/manager-assignment.mjs');
 const projects=[
  {id:'p1',module:'projects',company:'مسكن الكيان',data:{name:'الواحة'}},
  {id:'p2',module:'projects',company:'مسكن الكيان',data:{name:'الرمال',manager_email:'OLD@EXAMPLE.TEST'}},
  {id:'p3',module:'projects',company:'رياح الاعمار',data:{name:'الياسمين'}}
 ];
 assert.equal(canSelectManagerProject(projects[0],''),true);
 assert.equal(canSelectManagerProject(projects[1],''),true);
 assert.equal(canSelectManagerProject(projects[2],'مسكن الكيان'),false);
 assert.deepEqual(managerReassignmentConflicts(projects,['p1','p2'],'new@example.test').map(p=>p.id),['p2']);
 assert.deepEqual(managerReassignmentConflicts(projects,['p2'],'old@example.test'),[]);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/confirm_reassign:conflicts\.length>0/);
 assert.match(ui,/onChange=\{e=>setManagerSetup\(p=>\(\{\.\.\.p,email:e\.target\.value\}\)\)\}/);
 assert.match(backend,/transferredProjects\.set\(assigned/);
 assert.match(backend,/scope\.filter\(\(id:string\)=>!projectIds\.includes\(id\)\)/);
});
test('project register removes quick manager assignment and adds guarded deletion',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/<th>تعيين مدير المشروع<\/th>/);
 assert.match(ui,/module==='projects'&&user\?\.role==='admin'&&<button[^>]*onClick=\{\(\)=>deleteProject\(row\)\}>حذف المشروع/);
 assert.match(ui,/module==='projects'&&f\.key==='manager_email'/);
 assert.match(ui,/managerChanged.*?assign_project_manager/s);
 assert.match(backend,/if\(body\.action==='delete_project'\)/);
 assert.match(backend,/if\(linked\)throw Error\('لا يمكن حذف المشروع لوجود سجلات مرتبطة به/);
 assert.match(backend,/_deleted:true,_deleted_at:now,_deleted_by:u\.email/);
 assert.match(backend,/project_deleted/);
 assert.match(backend,/const result=await db\.batch\(statements\)/);
});
test('procurement department role appears in user forms and validates with limited access',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/<option value="procurement">قسم المشتريات<\/option>/);
 assert.match(ui,/\['procurement','قسم المشتريات'\]/);
 assert.match(ui,/procurement:'قسم المشتريات'/);
 assert.match(backend,/\['hr','administrative_assistant','finance','procurement','administrative_manager'/);
 assert.equal(canRead('procurement','projects'),true);
 assert.equal(canRead('procurement','company_profiles'),true);
 assert.equal(canRead('procurement','employees'),false);
 assert.equal(canRead('procurement','payroll'),false);
 assert.equal(canWrite('procurement','projects'),false);
});
test('project manager contact email is shared while login identities remain unique',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/const projectManagerContactEmail='mskn\.kayan@gmail\.com'/);
 assert.match(erp,/const projectManagerContactEmail='mskn\.kayan@gmail\.com'/);
 assert.match(erp,/body\.role==='project_manager'\?projectManagerContactEmail/);
 assert.match(erp,/username,projectManagerContactEmail\)\)/);
 assert.match(erp,/SET role='project_manager',employee_id=\?,companies=\?,projects=\?,username=\?,contact_email=\?/);
 assert.match(ui,/readOnly=\{memberRole==='project_manager'\}/);
 assert.match(ui,/readOnly=\{memberEdit\.role==='project_manager'\}/);
 assert.match(ui,/بريد التواصل: <span dir="ltr">\{m\.contact_email\|\|'غير محدد'\}/);
});
test('project manager directory uses actual members columns and lives within projects workspace',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.doesNotMatch(erp,/SELECT [^\n]*display_name[^\n]* FROM members/);
 assert.match(erp,/SELECT email,role,is_active,companies,username FROM members WHERE lower\(email\)=\?/);
 assert.match(erp,/member\.username\|\|data\.email/);
 assert.match(ui,/allowed\.filter\(k=>modules\[k\]\.group===g&&!\['project_managers','repayments','leave_dues','returns'\]\.includes\(k\)\)/);
 assert.match(ui,/k==='projects'&&module==='project_managers'/);
 assert.match(ui,/aria-label="تبويبات المشاريع ومدراء المشاريع"/);
 assert.match(ui,/onClick=\{\(\)=>setModule\('project_managers'\)\}>مدراء المشاريع وربط الموظفين/);
});
test('project manager directory supports audited, guarded deletion without removing login accounts',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/module==='project_managers'&&user\?\.role==='admin'&&<button[^>]*onClick=\{\(\)=>deleteProjectManager\(row\)\}>حذف المدير/);
 assert.match(ui,/async function deleteProjectManager\(row\)/);
 assert.match(ui,/action:'delete_project_manager',module:'project_managers',id:row\.id,revision:row\.revision/);
 assert.match(ui,/لن يُحذف حساب الدخول/);
 assert.match(backend,/if\(body\.action==='delete_project_manager'\)/);
 assert.match(backend,/mod!=='project_managers'\|\|!old\|\|u\.role!=='admin'/);
 assert.match(backend,/record\.module==='projects'/);
 assert.match(backend,/data\.direct_manager_id/);
 assert.match(backend,/project_manager_deleted/);
 assert.match(backend,/_delete_reason:reason/);
 assert.doesNotMatch(backend,/DELETE FROM records WHERE module='project_managers'/);
});
test('project manager editor shows selected name and preserves registered account identity',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-label="اسم مدير المشروع المحدد" readOnly value=\{edit\.data\.name\|\|''\}/);
 assert.match(ui,/const existingRecord=directory\.find/);
 assert.match(ui,/existingRecord&&existingRecord\.id!==edit\.id/);
 assert.match(ui,/تم فتح سجله الحالي للتعديل/);
 assert.match(ui,/تم إعداد سجل جديد للمدير المختار دون تعديل حساب المدير السابق/);
 assert.match(ui,/formError&&<div role="alert"/);
 assert.match(erp,/if\(recordData&&String\(recordData\.email/);
 assert.match(erp,/لا يمكن تغيير حساب مدير مشروع مسجل إلى حساب آخر/);
});
test('eight approved project managers are selectable without duplicating Othman',async()=>{
 const {preferredProjectManagers,preferredManagerForName,suggestedProjectsForManager}=await import('../lib/project-manager-roster.mjs');
 assert.deepEqual(preferredProjectManagers.map(p=>p.name),['م محمداحمد','م الهادي الرحيمة','م محمد يوسف','أ مصعب عبد القيوم','م مجدي محجوب','أ. عثمان محمد أحمد','م محمد إسماعيل','م. أمجد فؤاد']);
 assert.equal(preferredManagerForName('م محمد اسماعيل')?.id,'mohamed_ismail');
 assert.equal(preferredManagerForName('أ.عثمان محمداحمد')?.id,'othman');
 assert.equal(preferredManagerForName('م امجد فؤاد')?.id,'amjad_fouad');
 for(const name of ['م محمد أحمد','م الهادي الرحمة','م الهادي الرحيمة','أ.مصعب عبد القيوم','أ عثمان محمد أحمد'])assert.ok(preferredManagerForName(name),name);
 assert.equal(preferredManagerForName('م الهادي الرحمة')?.id,preferredManagerForName('م الهادي الرحيمة')?.id);
 assert.equal(preferredManagerForName('اسم غير معتمد'),null);
 const rows=[
  {id:'p1',module:'projects',company:'مسكن الكيان',data:{name:'مشروع 1'}},
  {id:'p2',module:'projects',company:'مسكن الكيان',data:{name:'مشروع 2'}},
  {id:'p3',module:'projects',company:'رياح الاعمار',data:{name:'مشروع 3'}},
  {id:'e1',module:'employees',company:'مسكن الكيان',data:{project_id:'p1',manager:'م الهادي الرحمة'}},
  {id:'e2',module:'employees',company:'مسكن الكيان',data:{project_id:'p2',manager_email:'alhadi@example.test'}},
  {id:'e3',module:'employees',company:'رياح الاعمار',data:{project_id:'p3',manager:'م الهادي الرحيمة'}}
 ];
 assert.deepEqual(suggestedProjectsForManager(rows,'alhadi','مسكن الكيان','alhadi@example.test'),['p1','p2']);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/suggestedProjectsForManager\(rows,m\.profileId,m\.company,m\.email\)/);
 assert.match(ui,/ids:suggested/);
 assert.match(ui,/اختر أحد المدراء السبعة/);
 assert.match(erp,/updatedEmployee=\{\.\.\.d,manager:String\(directory\.name/);
 assert.match(erp,/employees_linked:syncEmployees\.length/);
});


test('annual leave paid, unpaid and mixed days retain correct annual entitlement without double charge',()=>{
 const base={employee_id:'employee-test',leave_type:'annual',ticket:'no',start:'2026-11-22',end:'2026-11-26',days:5,holiday_policy:'include'};
 const norm=data=>normalize('leave',{company:'مسكن الكيان',data:{...base,...data}});
 const full=norm({leave_payment:'paid',unpaid_days:0});
 assert.equal(full.paid_days,5);assert.equal(full.unpaid_days,0);assert.equal(full.balance_deducted,true);
 const unpaid=norm({leave_payment:'unpaid',unpaid_days:0});
 assert.equal(unpaid.paid_days,0);assert.equal(unpaid.unpaid_days,5);assert.equal(unpaid.balance_deducted,false);
 const mixed=norm({leave_payment:'mixed',unpaid_days:2});
 assert.equal(mixed.paid_days,3);assert.equal(mixed.unpaid_days,2);assert.equal(mixed.balance_deducted,true);
 const legacy=norm({unpaid_days:0});
 assert.equal(legacy.leave_payment,'paid');assert.equal(legacy.paid_days,5);
 const noSalary=norm({leave_type:'unpaid',unpaid_days:0});
 assert.equal(noSalary.paid_days,0);assert.equal(noSalary.unpaid_days,5);assert.equal(noSalary.balance_deducted,false);
 assert.throws(()=>norm({leave_payment:'mixed',unpaid_days:5}),/الأيام غير المدفوعة/);
 assert.throws(()=>norm({leave_payment:'mixed',unpaid_days:0}),/الأيام غير المدفوعة/);
});
test('integrated financial screens keep one linked record per leave and never pay unpaid annual days',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/kind:module==='leave'\?'leave_dues':'repayments'/);
 assert.match(ui,/سداد السلفة والسدادات السابقة/);
 assert.match(ui,/مستحقات الإجازة المرتبطة بالطلب/);
 assert.match(server,/data.days=Math.max\(0,paidDays\)/);
 assert.match(server,/مستحقات هذه الإجازة مسجلة بالفعل/);
 assert.match(server,/SUM\(CAST\(COALESCE\(json_extract\(data,'\$\.paid_days'\),json_extract\(data,'\$\.days'\)\)/);
 assert.match(server,/السداد يتجاوز الرصيد المتبقي/);
});

test('employee leave entitlement and contract expiration honor explicit automatic and manual modes',()=>{
 const base={name:'موظف اختبار',code:'TEST-700',hire_date:'2021-04-01',salary:7000,sponsorship:'no',working_company:'مسكن الكيان'};
 const save=data=>normalize('employees',{company:'مسكن الكيان',data:{...base,...data}});
 const automatic=save({leave_balance_mode:'auto',contract_expiry_mode:'auto',contract_expiry:'2038-12-30'});
 assert.equal(automatic.leave_balance_mode,'auto');
 assert.notEqual(automatic.contract_expiry,'2038-12-30');
 assert.equal(automatic.contract_expiry.length,10);
 const manual=save({leave_balance_mode:'manual',manual_leave_entitlement:43.5,contract_expiry_mode:'manual',contract_expiry:'2038-12-30'});
 assert.equal(manual.manual_leave_entitlement,43.5);
 assert.equal(manual.leave_balance_mode,'auto'); // Manually entered contract expiry controls automatic leave accrual.
 assert.equal(manual.contract_expiry,'2038-12-30');
 assert.equal(manual.contract_expiry_mode,'manual');
 assert.throws(()=>save({leave_balance_mode:'manual',manual_leave_entitlement:'',contract_expiry_mode:'auto'}),/أدخل إجمالي رصيد/);
 assert.throws(()=>save({leave_balance_mode:'auto',contract_expiry_mode:'manual',contract_expiry:'2020-01-01'}),/تاريخ انتهاء العقد/);
 const legacy=save({});
 assert.equal(legacy.leave_balance_mode,'auto');
 assert.equal(legacy.contract_expiry_mode,'auto');
});
test('manual leave entitlement is honored consistently in UI and backend final-approval balance check',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.ok(ui.includes("d.contract_expiry_mode!=='manual'&&d.leave_balance_mode==='manual'?Number(d.manual_leave_entitlement||0)"));
 assert.ok(server.includes("e.contract_expiry_mode!=='manual'&&e.leave_balance_mode==='manual'?Number(e.manual_leave_entitlement||0)"));
 assert.match(ui,/طريقة تحديد انتهاء العقد/);
});

test('automatic advance installments skip deferred months and stop at actual remaining balance',async()=>{
 const source=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const first=source.indexOf('const validMonth='),last=source.indexOf('export async function POST(req)');
 assert.ok(first>0&&last>first);
 const {calculateScheduledAdvances}=await import('../lib/payroll-advance-schedule.mjs');
 const schedule=runInNewContext(source.slice(first,last)+';({autoAdvanceAllocations,allocateEditedAdvanceTotal})',{cents:x=>Math.round(Number(x||0)*100),calculateScheduledAdvances});
 const loan={id:'loan-a',status:'paid',data:{employee_id:'employee-a',amount:1200,installments:3,installment_amount:400,final_installment:400,first_month:'2026-11',date:'2026-11-01',paid_at:'2026-11-01T12:00:00Z',schedule_mode:'auto',deferred_months:['2026-12']}};
 const context={loans:[loan],sums:new Map()};
 const alloc=(month,cap=Infinity)=>schedule.autoAdvanceAllocations(context,'employee-a',month,cap);
 assert.equal(alloc('2026-11')[0].amount,400);
 assert.equal(alloc('2026-12').length,0);
 assert.equal(alloc('2027-01')[0].amount,400);
 assert.equal(alloc('2027-02')[0].amount,400);
 assert.equal(alloc('2027-02',15000)[0].amount,150);
 assert.equal(alloc('2027-02',0).length,0);
 context.sums.set('loan-a',115000);
 assert.equal(alloc('2027-02')[0].amount,50);
 context.sums.set('loan-a',120000);
 assert.equal(alloc('2027-02').length,0);
 loan.data.schedule_mode='manual';
 context.sums.set('loan-a',0);
 assert.equal(alloc('2026-11').length,0);
 loan.data.schedule_mode='auto';
 assert.throws(()=>schedule.allocateEditedAdvanceTotal(context,'employee-a','2026-11',130000),/يتجاوز الرصيد/);
 assert.equal(schedule.allocateEditedAdvanceTotal(context,'employee-a','2026-11',60000)[0].amount,600);
});
test('payroll installment posting remains tied to confirmed finance payment and loan postponement is audited',()=>{
 const payroll=readFileSync(new URL('../backend/payroll-cycle.ts',import.meta.url),'utf8');
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(payroll,/autoAdvanceAllocations\(advanceContext,e.id,month,Math.max\(0,cents\(salary\)-cents\(attendance.absence_deduction\)\)\)/);
 assert.match(payroll,/autoAdvanceAllocations\(advanceContext,old.employee_id,batch.data.month,scheduledCap\)/);
 assert.match(payroll,/if\(action==='finance_pay'\)\{\s*for\(const allocation of financeAllocations\)/);
 assert.match(payroll,/payroll_reference:String\(body\.reference\)\.trim\(\)/);
 assert.match(payroll,/advance_allocations\.reduce\(\(n,a\)=>n\+cents\(a\.amount\),0\)!==cents\(d\.advance_deduction\)/);
 assert.match(erp,/action==='configure_advance_schedule'/);
 assert.match(erp,/advance_schedule_change/);
 assert.match(erp,/_payroll_batch_id\)throw Error/);
 assert.match(payroll,/status='paid' AND mutation=\?/);
 assert.match(payroll,/NOT EXISTS\(SELECT 1 FROM records WHERE module='repayments' AND code=\?\)/);
});

test('employee requests are assigned to project owner, and director cannot approve finance',async()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const {requestApprovalStages}=await import('../lib/request-approval.mjs');
 assert.equal(requestApprovalStages[0].title,'اعتماد المدير المباشر');
 assert.match(backend,/const managerEmail=String\(employeeData\.manager_email/);
 assert.match(backend,/details\.direct_manager=\{name:managerName/);
 assert.match(backend,/هذا الطلب بانتظار اعتماد المدير المباشر المحدد/);
 assert.match(backend,/current==='finance'&&routedRequest&&!\['admin','hr'\].includes\(u.role\)/);
 assert.match(ui,/اعتماد المدير المباشر/);
});
test('project manager can see own employee requests but a separate supervisor cannot',async()=>{
 const {visible}=await import('../backend/modules.mjs');
 const employee={id:'e',module:'employees',company:'مسكن الكيان',data:{project_id:'p',manager_email:'supervisor@example.test'}};
 const project={id:'p',module:'projects',company:'مسكن الكيان',data:{manager_email:'projectowner@example.test'}};
 const requests=['leave','advances','resignations'].map((module,i)=>({id:String(i),module,company:'مسكن الكيان',data:{employee_id:'e'}}));
 const rows=[employee,project,...requests];
 const supervisor={role:'project_manager',email:'supervisor@example.test',projects:'[]',companies:'*'};
 const owner={...supervisor,email:'projectowner@example.test',projects:'["p"]'};
 for(const request of requests){
  assert.equal(visible(supervisor,request,rows),true);
  assert.equal(visible(owner,request,rows),false);
 }
 assert.equal(visible(owner,project,rows),true);
 assert.equal(visible({...owner,companies:'["رياح الاعمار"]'},requests[0],rows),false);
});
test('project manager picker offers onboarding for an inactive roster member rather than disabled choices',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/value\.startsWith\('pending:'\)/);
 assert.match(ui,/setManagerSetup\(\{employeeId:'',name:selected\.name/);
 assert.match(ui,/setModule\('project_managers'\)/);
 assert.match(ui,/m\.eligible\?m\.email:'pending:'\+m\.id/);
 assert.doesNotMatch(ui,/key=\{m\.id\} disabled=\{!m\.eligible\}/);
});
test('advance repayment ledger is embedded and sidebar hides redundant repayment navigation without losing finance modules',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(ui,/سجل سداد السلف — داخل ملف السلف/);
 assert.match(ui,/const printRepayments=\(\)=>/);
 assert.match(ui,/@page\{size:A4 landscape;margin:12mm\}/);
 assert.match(ui,/onClick=\{printRepayments\}>طباعة سجل السداد المعروض/);
 assert.match(ui,/module==='advances'&&permittedRead\(user\|\|\{\},'repayments'\)/);
 assert.match(ui,/r\.module==='repayments'&&!r\.data\?\._deleted/);
 assert.match(ui,/!\['project_managers','repayments','leave_dues','returns'\]\.includes\(k\)/);
 assert.match(ui,/setLinkedFinance\(\{kind:'repayments',parentId:row.id/);
 assert.match(ui,/سداد افتتاحي/);
 assert.match(modules,/repayments:\{label:'سداد السلف'/);
 assert.match(modules,/leave_dues:\{label:'مستحقات الإجازة'/);
});

test('leave dues require general manager approval before finance payout with immutable login roles',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 assert.match(backend,/body.action==='leave_dues_workflow'/);
 assert.match(backend,/decision==='submit'&&state==='draft'&&canSubmit/);
 assert.match(backend,/decision==='approve'&&state==='projects_director'&&isDirector/);
 assert.match(backend,/decision==='pay'&&state==='approved'&&isFinance/);
 assert.match(backend,/if\(mod==='leave_dues'\)throw Error\('مستحقات الإجازة تعتمد حصريًا/);
 assert.match(backend,/advance_installments|leave_dues_workflow/);
 assert.match(ui,/مسار مستحقات الإجازة: مدير إدارة المشاريع/);
 assert.match(ui,/توثيق صرف المستحقات/);
 assert.match(schema,/f\('deduction_reason','بيان الخصومات'\)/);
 assert.match(schema,/f\('other_description','تفاصيل الإضافات'\)/);
});

test('V86 annual leave automatically splits paid days and unpaid days in UI and backend',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const register=readFileSync(new URL('../lib/employee-register.mjs',import.meta.url),'utf8');
 assert.match(ui,/const automaticLeaveSplit=/);
 assert.match(ui,/Math\.floor\(balance\.remaining\+1e-8\)/);
 assert.match(ui,/leave_type==='annual'&&f\.key==='unpaid_days'/);
 assert.match(ui,/payload\.data=\{\.\.\.payload\.data,\.\.\.split\}/);
 assert.match(backend,/async function calculateAnnualLeaveSplit/);
 assert.match(backend,/if\(mod==='leave'&&next==='approved'&&details\.leave_type==='annual'\)/);
 assert.match(backend,/if\(mod==='leave'&&data\.leave_type==='annual'\)/);
 assert.match(backend,/contract_expiry_mode==='manual'/);
 assert.match(register,/Number\(item\.data\.paid_days/);
 const split=(available,days)=>{const paid=Math.min(days,Math.max(0,Math.floor(available+1e-8)));return {paid,unpaid:days-paid}};
 assert.deepEqual(split(21,30),{paid:21,unpaid:9});
 assert.deepEqual(split(0,30),{paid:0,unpaid:30});
 assert.deepEqual(split(50,30),{paid:30,unpaid:0});
 assert.deepEqual(split(5,30),{paid:5,unpaid:25});
});

test('V87 manual contract date accrues leave from hire date, not saved manual 84 days',()=>{
 const employee={hire_date:'2022-01-04',contract_expiry_mode:'manual',contract_expiry:'2027-01-04',leave_balance_mode:'manual',manual_leave_entitlement:84};
 assert.equal(leaveAccrualAsOf(employee,'2026-11-22'),'2027-01-04');
 assert.equal(annualLeave(employee.hire_date,leaveAccrualAsOf(employee)).accrued,114);
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/contract_expiry_mode:'manual',leave_balance_mode:'auto'/);
 assert.match(backend,/e.contract_expiry_mode!=='manual'&&e.leave_balance_mode==='manual'/);
});

// Regression: a return in a prior month must not rewrite the current month's payroll.
test('return-to-work sync targets actual return month and restores active employment without reviving terminated employees',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(erp,/const month=String\(data\.actual_return\)\.slice\(0,7\)/);
 assert.match(erp,/employment_status:employeeData\.employment_status==='terminated'/);
 assert.match(erp,/employee_status:employeeData\.employee_status==='terminated'/);
 assert.match(erp,/data\.payroll_sync_month=month/);
 assert.match(erp,/return_record_id:id/);
});

test('appointment and return views tolerate nested historical data without a full-page render crash',async()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const returns=await import('../lib/return-to-work.mjs');
 assert.match(ui,/class HRViewErrorBoundary extends Component/);
 assert.match(ui,/safeRecordText\(value\.name\?\?value\.display_name/);
 assert.match(ui,/export default function ERP\(\)\{return <HRViewErrorBoundary>/);
 assert.doesNotThrow(()=>returns.availableReturnLeaves(null));
 assert.deepEqual(returns.returnToWorkRegister(null),[]);
 const records=[
  {id:'leave-legacy',module:'leave',company:'مسكن الكيان',status:'approved',data:{employee_id:'employee-a',start:'2026-11-01',end:'2026-11-10'}},
  {id:'return-legacy',module:'returns',company:'مسكن الكيان',status:'completed',data:{leave_id:'leave-legacy',actual_return:'2026-11-11'}}
 ];
 assert.deepEqual(returns.returnToWorkRegister(records).map(r=>[r.completed,r.actualReturn]),[[true,'2026-11-11']]);
});

test('GM ledger posting activates installments only once, after final approval',async()=>{
 const {calculateScheduledAdvances,loanFirstMonth}=await import('../lib/payroll-advance-schedule.mjs');
 const approved={id:'advance-a',module:'advances',status:'approved',data:{employee_id:'e1',amount:1000,installments:2,first_month:'2026-10'}};
 const paid={...approved,status:'paid',data:{...approved.data,paid_at:'2026-11-23T13:00:00Z'}};
 assert.deepEqual(calculateScheduledAdvances({loans:[approved],sums:new Map()},'e1','2026-11',500000),[]);
 assert.deepEqual(calculateScheduledAdvances({loans:[paid],sums:new Map()},'e1','2026-10',500000),[]);
 assert.deepEqual(calculateScheduledAdvances({loans:[paid],sums:new Map()},'e1','2026-11',500000),[{advance_id:'advance-a',amount:500}]);
 assert.equal(loanFirstMonth(paid),'2026-11');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(api,/loans:\[\.\.\.paidLoans,\{\.\.\.old,status:'paid',data\}\]/);
 assert.match(api,/advance_total_received/);
});
test('advance actions are horizontal, director approves and employee prints linked receipt',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 for(const label of ['إرسال','اعتماد','تعديل','رفض','حذف','اعتماد مبلغ الصرف وتقييده','طباعة سند الصرف'])assert.ok(ui.includes(label),label);
 assert.match(ui,/className="advance-row-actions"/);
 assert.match(ui,/flexDirection:'row',alignItems:'center',flexWrap:'nowrap'/);
 assert.match(ui,/onClick=\{\(\)=>advanceReceipt\(row\)\}/);
 assert.match(backend,/const managerEmail=String\(employeeData\.manager_email/);
 assert.match(backend,/details\.direct_manager=\{name:managerName/);
 assert.match(backend,/body.action==='gm_approve_advance'/);
 assert.match(backend,/payment_reference:reference/);
});
test('admin approval bypasses missing supervisor login without changing employee/project records',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(backend,/const adminOverride=u.role==='admin'/);
 assert.match(backend,/!managerEmail&&!adminOverride/);
 assert.match(backend,/!adminOverride&&\(!manager\|\|manager.is_active===false/);
 assert.match(backend,/admin_override:true/);
 assert.match(ui,/user\?\.role==='admin'\|\|String\(user\?\.email/);
});
test('return save computes payroll attendance in its own transaction and suggests date only after leave end',()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const start=backend.indexOf("if(mod==='returns'){\n if(!returnLeaveRecord)");
 const end=backend.indexOf('const centsOf=',start);
 assert.ok(start>0&&end>start);
 const block=backend.slice(start,end);
 assert.match(block,/const currentPayrollMonth=String\(data.actual_return/);
 assert.match(block,/const returnAttendance=returnPeriodAttendance\(leaveData,data.actual_return,currentPayrollMonth\)/);
 assert.match(block,/const referenceSalary=Number\(employeeData.salary/);
 assert.match(block,/returnSyncUpdates.push\(db.prepare/);
 assert.match(ui,/actual_return:expected&&expected<=today\?expected:''/);
 assert.match(ui,/يمكن تصحيحه يدويًا/);
});

test('GM unified approval posts final advance ledger immediately, leaving the receipt printable',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/async function gmApproveAllStages\(row\)/);
 assert.match(ui,/await post\(\{action:'transition',module:row.module,id:row.id,revision,decision:'approve'/);
 assert.match(ui,/await post\(\{action:'gm_approve_advance',module:'advances',id:row.id,revision\}/);
 assert.match(ui,/اعتماد السلفة وقيدها/);
 assert.match(ui,/اعتماد الإجازة بالكامل/);
 assert.match(api,/const isDirector=u.role==='admin'&&u.is_active!==false/);
 assert.match(api,/advance_disbursement_ledger/);
 assert.match(api,/advance_recorded_in_employee_ledger:true/);
});
test('leave payment actions show pending/paid, remove obsolete finance-for-payout label and mirror payout in employee ledger',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 for(const label of ['حالة الطلب','قيد الصرف','تم الصرف','صرف المبلغ','المبلغ المستحق / المصروف','استكمال اعتماد الإجازة','سجل مستحقات الإجازة المصروفة للموظف'])assert.ok(ui.includes(label),label);
 assert.match(ui,/module==='leave'\?\(\(\)=>\{if\(row.status==='rejected'\)/);
 assert.match(ui,/const canFinance=isRequestFinanceActor\(user\)/);
 assert.match(api,/const ledger=Array.isArray\(employeeData.leave_payment_ledger\)/);
 assert.match(api,/ledger.some\(\(entry:any\)=>String\(entry.dues_id\)===String\(old.id\)\)/);
 assert.match(api,/leave_dues_paid_total:Math.round/);
 assert.match(api,/employeeLedgerStatement=db.prepare\("UPDATE records SET data=/);
 assert.match(api,/\.{3}\(employeeLedgerStatement\?\[employeeLedgerStatement\]:\[\]\)/);
 assert.match(api,/employee_ledger_updated:decision==='pay'/);
});

test('direct GM advance action idempotently posts monetary ledger and prevents duplication',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(api,/if\(existingLedger.some\(\(entry:any\)=>String\(entry.advance_id\)===String\(old.id\)\)\)/);
 assert.match(api,/UPDATE records SET data=\?,status='paid'/);
 assert.match(api,/module='employees' AND company=\? AND revision=\?/);
 assert.match(api,/gm_approved_by:u.email/);
 assert.match(api,/receipt_no:reference/);
 assert.match(ui,/gmFinalizeAdvance\(row\)/);
 assert.doesNotMatch(ui,/onClick=\{\(\)=>financeApproveAdvance\(row\)\}/);
});

test('Musab finance controller may approve advance amount with single ledger posting and no duplicate financial stage',async()=>{
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const {isRequestFinanceActor,requestApprovalOwners}=await import('../backend/modules.mjs');
 assert.equal(requestApprovalOwners.finance.name.includes('مصعب عبد القيوم'),true);
 assert.equal(isRequestFinanceActor({role:'project_manager',email:requestApprovalOwners.finance.email,is_active:true}),true);
 assert.equal(isRequestFinanceActor({role:'finance',email:requestApprovalOwners.finance.email,is_active:true}),true);
 assert.equal(isRequestFinanceActor({role:'project_manager',email:'unassigned@example.com',is_active:true}),false);
 assert.equal(isRequestFinanceActor({role:'finance',email:requestApprovalOwners.finance.email,is_active:false}),false);
 assert.match(backend,/!isRequestFinanceActor\(u\)/);
 assert.match(backend,/!isRequestFinanceActor\(u\)/);
 assert.match(backend,/final_approved_by:u.email/);
 assert.match(backend,/advance_disbursement_ledger/);
 assert.match(ui,/isRequestFinanceActor\(user\)&&<button type="button" className="primary" disabled=\{saving\} onClick=\{\(\)=>gmFinalizeAdvance\(row\)\}>اعتماد مبلغ الصرف وتقييده/);
 assert.match(ui,/قيد العمل/);
 assert.match(ui,/تم القيد والصرف/);
 assert.match(ui,/row.data.final_approved_by/);
});


test('leave dues and post-leave return are nested under their parent HR navigation while preserving permissions',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 assert.match(ui,/!\['project_managers','repayments','leave_dues','returns'\]\.includes\(k\)/);
 assert.match(ui,/aria-label=\{\['leave','leave_dues'\]\.includes\(module\)\?'تبويبات الإجازات':'تبويبات التعيين والمباشرة'\}/);
 assert.match(ui,/\['leave','leave_dues'\]\.includes\(module\)\?\[\['leave','طلبات الإجازات'\],\['leave_dues','مستحقات الإجازة'\]\]/);
 assert.match(ui,/\['appointments','التعيين والمباشرة'\],\['returns','المباشرة بعد الإجازة'\]/);
 assert.match(ui,/\.filter\(\(\[key\]\)=>allowed\.includes\(key\)\)/);
 assert.match(modules,/returns:\{label:'المباشرة بعد الإجازة'/);
 assert.match(modules,/leave_dues:\{label:'مستحقات الإجازة'/);
});


test('monthly advance deduction appears in loan register, both receipts and backend payroll schedule',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const paper=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const backendModules=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 const payroll=readFileSync(new URL('../lib/payroll-advance-schedule.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 for(const source of [modules,backendModules]){
  assert.ok(source.includes("f('monthly_deduction','مبلغ الاستقطاع الشهري','number')"));
  assert.ok(source.includes("out.monthly_deduction=regularCents/100"));
 }
 assert.ok(ui.includes("col('مبلغ الاستقطاع الشهري / Monthly Deduction'"));
 assert.ok(ui.includes("مبلغ الاستقطاع الشهري الجديد"));
 assert.ok(paper.includes("f.key==='monthly_deduction'"));
 assert.ok(payroll.includes("loan.data.monthly_deduction"));
 assert.ok(api.includes("kind==='set_amount'"));
 assert.ok(api.includes("advance_schedule_change"));
});

test('manual advance installment uses configured amount with final balance cap and paid-only scheduling',async()=>{
 const {calculateScheduledAdvances}=await import('../lib/payroll-advance-schedule.mjs');
 const loan={id:'test-loan',status:'paid',data:{amount:5000,employee_id:'employee-test',installments:10,monthly_deduction:500,first_month:'2026-12',paid_at:'2026-11-23'}};
 const ctx={loans:[loan],sums:new Map()};
 assert.deepEqual(calculateScheduledAdvances(ctx,'employee-test','2026-12'),[{advance_id:'test-loan',amount:500}]);
 ctx.loans[0].data.monthly_deduction=750;
 assert.deepEqual(calculateScheduledAdvances(ctx,'employee-test','2026-12'),[{advance_id:'test-loan',amount:750}]);
 ctx.sums.set('test-loan',480000);
 assert.deepEqual(calculateScheduledAdvances(ctx,'employee-test','2026-12'),[{advance_id:'test-loan',amount:200}]);
 ctx.loans[0].status='approved';
 assert.deepEqual(calculateScheduledAdvances(ctx,'employee-test','2026-12'),[]);
});


test('approved advance remains in progress until finance or general manager posts payout, with no duplicate approval gate',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/row.status==='approved'\|\|row.status==='finance_approved'\?'قيد العمل'/);
 assert.match(ui,/const isAdvancePendingPayout=r=>r.module==='advances'/);
 assert.match(ui,/pendingStages.includes\(r.status\)\|\|isAdvancePendingPayout\(r\)/);
 assert.match(ui,/isRequestFinanceActor\(user\)&&<button type="button" className="primary" disabled=\{saving\} onClick=\{\(\)=>gmFinalizeAdvance\(row\)\}>اعتماد مبلغ الصرف وتقييده/);
 assert.match(api,/if\(mod!=='advances'\|\|!old\|\|!isRequestFinanceActor\(u\)\|\|!\['approved','finance_approved'\].includes\(old.status\)\)/);
 assert.match(api,/existingLedger.some/);
 assert.match(api,/status='paid'/);
});


test('executive HR dashboard replaces bulky landing cards and uses deployed commit revision',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA/);
 assert.match(ui,/NEXT_PUBLIC_MASKAN_BUILD_VERSION/);
 assert.match(ui,/MASKAN HR · \{buildVersion\} · CLOUD/);
 assert.match(ui,/الملخص التنفيذي/);
 assert.match(ui,/ملخص الشركات/);
 assert.match(ui,/صافي مسير الشهر/);
 assert.match(ui,/كشوف الموظفين والفلاتر التفصيلية/);
 assert.doesNotMatch(ui,/من أين تبدأ؟/);
 assert.doesNotMatch(ui,/MASKAN HR · V87 · CLOUD/);
});


test('new HR records receive automatic immutable database-sequenced document numbers',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const paper=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 assert.match(erp,/nextval\('hr.project_code_seq'\)::text AS serial/);
 assert.match(erp,/data.document_no=prefix\+'-'\+saudiDate\(\).slice\(0,4\)/);
 assert.match(erp,/if\(old\)\{\s*const originalNo=/);
 assert.match(erp,/appointments:'APT'/);
 assert.match(erp,/leave:'LEV'/);
 assert.match(erp,/advances:'ADV'/);
 assert.match(ui,/f.key==='document_no'\?<input type="text" readOnly/);
 assert.match(paper,/row.data\?\.document_no\|\|row.data\?\.reference\|\|row.code/);
});


test('Dashboard navigation and compact executive layout do not expose recent activity',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const start=ui.indexOf("{module==='overview'&&(()=>{");
 const end=ui.indexOf("\\n{spec&&<>",start);
 const dashboard=ui.slice(start,end);
 assert.match(ui,/<LayoutDashboard size=\{19\}\/>Dashboard<\/button>/);
 assert.match(ui,/overview:'Dashboard \| لوحة المؤشرات'/);
 assert.match(dashboard,/dashboard-company-summary/);
 assert.match(dashboard,/ملخص الشركات/);
 assert.match(dashboard,/الملخص التنفيذي/);
 assert.doesNotMatch(dashboard,/آخر العمليات/);
 assert.doesNotMatch(dashboard,/activity-list/);
 assert.doesNotMatch(dashboard,/من أين تبدأ/);
});


test('release identifier is generated every build and approved advance guidance is actionable',()=>{
 const cfg=readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(cfg,/const buildVersion='V'\+now\.slice/);
 assert.match(cfg,/NEXT_PUBLIC_MASKAN_BUILD_VERSION:buildVersion/);
 assert.match(ui,/const buildVersion=process\.env\.NEXT_PUBLIC_MASKAN_BUILD_VERSION/);
 assert.match(ui,/حالة «قيد العمل» تعني اكتمال الاعتمادات الإدارية/);
 assert.match(ui,/اعتماد مبلغ الصرف وتقييده/);
 assert.doesNotMatch(ui,/قيد العمل حتى اعتماد صرف المبلغ من المدير العام أو المالية؛ التعديل المباشر للطلب متاح للمسودات فقط/);
});


test('employee advance ledger distinguishes approved unpaid loans from disbursed loans and allows authorized payout',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/const issued=loans.filter\(advance=>advance.status==='paid'&&advance.data\?\.paid_at\)/);
 assert.match(ui,/const pendingDisbursement=loans.filter\(advance=>\['approved','finance_approved'\]/);
 assert.match(ui,/معتمد بانتظار الصرف/);
 assert.match(ui,/السلف المقيدة والمصروفة/);
 assert.match(ui,/pendingDisbursement.reduce/);
 assert.match(ui,/رصيد المتبقي|الرصيد المتبقي/);
 assert.match(ui,/اعتماد الصرف وربطه بالرواتب/);
 assert.match(ui,/isRequestFinanceActor\(user\)&&<button type="button" className="primary" disabled=\{saving\} onClick=\{async\(\)=>\{await gmFinalizeAdvance\(loan\)/);
 const schedule=readFileSync(new URL('../lib/payroll-advance-schedule.mjs',import.meta.url),'utf8');
 assert.match(schedule,/loan\?\.status==='paid'&&loan.data\?\.paid_at/);
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(backend,/advance_disbursement_ledger/);
 assert.match(backend,/const allocations=calculateScheduledAdvances\(context,data.employee_id,month,beforeLoan\)/);
 assert.match(backend,/status='paid'/);
});


test('advance payout reports actual open payroll linkage and retains immutable approved payroll batches',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/payroll_synced:synced.length,first_deduction_month:nextMonth/);
 assert.match(erp,/existing_payroll_months:existingPayrollMonths/);
 assert.match(erp,/تم قيد السلفة؛ سيُحسب القسط عند توليد المسير القادم/);
 assert.match(erp,/const drafts=new Set\(batches.filter\(\(b:any\)=>\['draft','manager_review'\]/);
 assert.match(ui,/result.first_deduction_month/);
 assert.match(ui,/result.note/);
 assert.match(ui,/الرصيد المتبقي = السلف المقيدة والمصروفة/);
});


test('historical unnumbered appointment forms can be safely backfilled and new forms get sequence numbers',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(erp,/body.action==='backfill_appointment_numbers'/);
 assert.match(erp,/if\(u.role!=='admin'\)throw Error\('403'\)/);
 assert.match(erp,/document_no_backfilled_at:now/);
 assert.match(erp,/appointment_number_backfill/);
 assert.match(erp,/COALESCE\(NULLIF\(TRIM\(data::jsonb->>'document_no'\),''\),''\)=''/);
 assert.match(erp,/\['appointments','employees'\]\.includes\(mod\)&&!originalNo/);
 assert.match(erp,/data.document_no=\(mod==='employees'\?'EMP':'APT'\)/);
 assert.match(ui,/action:'backfill_appointment_numbers'/);
 assert.match(ui,/استكمال الترقيم التلقائي/);
 assert.match(ui,/module==='appointments'&&f.key==='document_no'\?<input type="text" readOnly/);
});


test('employee forms show immutable automatically generated numbers and preserve unchanged legacy manager link',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../lib/modules.mjs',import.meta.url),'utf8');
 const backendModules=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/رقم النموذج: <b>\{edit.data\?\.document_no/);
 assert.match(ui,/module!=='employees'&&!tableFields.some/);
 assert.match(ui,/module==='employees'&&f.key==='document_no'/);
 assert.match(ui,/f.key==='document_no'\?<input type="text" readOnly/);
 assert.match(ui,/لم يتم حفظ التعديل:/);
 for(const x of [modules,backendModules])assert.match(x,/f\('document_no','رقم نموذج بيانات الموظف'\)/);
 assert.match(api,/const managerAssignmentUnchanged=Boolean/);
 assert.match(api,/if\(managerAssignmentUnchanged\)\{/);
 assert.match(api,/\['appointments','employees'\]\.includes\(mod\)&&!originalNo/);
 assert.match(api,/mod==='employees'\?'EMP':'APT'/);
});


test('new appointment can create the full employee master and probation in one atomic write',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const modules=readFileSync(new URL('../backend/modules.mjs',import.meta.url),'utf8');
 assert.match(ui,/action:'hire_from_appointment'/);
 assert.match(ui,/تعيين موظف جديد وإضافته للسجل تلقائيًا/);
 assert.match(ui,/setNewHire/);
 assert.match(backend,/body.action==='hire_from_appointment'/);
 assert.match(backend,/employee_created_from_appointment/);
 assert.match(backend,/appointment_hire_created/);
 assert.match(backend,/if\(duplicate\)throw Error/);
 assert.match(backend,/probation_end:probationEnd/);
 assert.match(backend,/db.batch\(\[/);
 assert.match(modules,/f\('probation_end','نهاية فترة التجربة','date'\)/);
 assert.match(modules,/f\('employee_id','الموظف','employee'\)/);
});


test('every HR register and printed form exposes the persistent form number and linked employee or leave references',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const paper=readFileSync(new URL('../app/operations.tsx',import.meta.url),'utf8');
 assert.match(ui,/!tableFields\.some\(f=>f\.key==='document_no'\)&&<th>رقم النموذج<\/th>/);
 assert.match(ui,/!tableFields\.some\(f=>f\.key==='document_no'\)&&<td><code dir="ltr">\{row\.data\?\.document_no\|\|'—'\}<\/code><\/td>/);
 assert.match(paper,/const docNo=row\.data\?\.document_no\|\|row\.data\?\.reference/);
 assert.match(paper,/مرجع ملف الموظف \/ Employee File/);
 assert.match(paper,/مرجع طلب الإجازة \/ Leave Reference/);
 assert.match(paper,/const parentLeave=row\.data\?\.leave_id/);
});


test('new hire searchable registered master data and authorized manager linking',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/\['job','department','nationality'\]\.map\(key=>/);
 assert.match(ui,/r\.module==='employees'&&!r\.data\?\._deleted/);
 assert.match(ui,/<datalist id=\{'hire-filter-'\+key\}>/);
 assert.match(ui,/placeholder=\{'ابحث أو اختر '\+title\}/);
 assert.match(ui,/const available=employeeManagerOptions\[edit\.company\]\|\|\[\]/);
 assert.match(ui,/id="new-hire-manager-list" role="listbox"/);
 assert.match(api,/const manager=choices\.find\(\(m:any\)=>normalizeManagerName/);
 assert.match(api,/المدير المباشر غير موجود في القائمة المسجلة/);
 assert.match(api,/setEmployeeDirectManager\(employee,/);
});


test('appointment direct manager search is populated and supports registered pending-login supervisors',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 assert.match(ui,/\['members','audit','projects','project_managers','employees','appointments'\]\.includes\(module\)/);
 assert.match(ui,/id="new-hire-manager-search" type="text" role="combobox"/);
 assert.match(ui,/id="new-hire-manager-list" role="listbox"/);
 assert.match(ui,/setNewHireManagerOpen\(true\)/);
 assert.match(ui,/filtered\.map\(m=><button type="button" role="option"/);
 assert.match(ui,/setEdit\(prev=>\(\{\.\.\.prev,data:\{\.\.\.prev\.data,direct_manager:m\.name\}\}\)\)/);
 assert.match(ui,/مسجل في الدليل — يلزم ربط حساب للاعتماد/);
 assert.match(api,/role IN \('project_manager','admin','hr'\)/);
 assert.match(api,/direct_manager_pending_approval_link=true/);
 assert.match(api,/resolveEmployeeDirectManager\(db,company,manager\.email,manager\.name,true\)/);
 assert.match(api,/project_manager_choices/);
});


test('working company register displays the resolved label without a second enum lookup',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/const value=employeeRegisterValue\(row,f.key,rows\);if\(f.key==='working_company'\)return value\|\|'—';/);
 assert.equal(employeeRegisterValue({company:'مسكن الكيان',data:{working_company:'المعايير العصرية'}},'working_company',[]),'مؤسسة المعايير العصرية لأعمال التكييف');
});


test('document serial validators accept real numeric sequence values',()=>{
 const erp=readFileSync(new URL('../backend/erp.ts',import.meta.url),'utf8');
 const validators=[...erp.matchAll(/\/\^\\d\{4,(?:8|12)\}\$\//g)].map(m=>m[0]);
 assert.ok(validators.length>=6);
 for(const source of validators){
  const re=new RegExp(source.slice(1,-1));
  assert.equal(re.test('1163'),true);
  assert.equal(re.test('001163'),true);
  assert.equal(re.test('abc123'),false);
 }
 assert.ok(!erp.includes(String.raw`/^\\d{4,12}$/`));
 assert.ok(!erp.includes(String.raw`/^\\d{4,8}$/`));
});


test('advance amount and installment count immediately populate monthly deduction',()=>{
 const ui=readFileSync(new URL('../app/ui.tsx',import.meta.url),'utf8');
 assert.match(ui,/module==='advances'&&\['amount','installments'\]\.includes\(f.key\)/);
 assert.match(ui,/data\.monthly_deduction=cents>0&&Number\.isInteger\(count\)&&count>=1&&count<=60\?String\(Math\.floor\(cents\/count\)\/100\):''/);
 assert.equal(Math.floor(Math.round(7500*100)/10)/100,750);
 assert.equal(Math.floor(Math.round(9000*100)/9)/100,1000);
 assert.equal(Math.floor(Math.round(100*100)/3)/100,33.33);
});
