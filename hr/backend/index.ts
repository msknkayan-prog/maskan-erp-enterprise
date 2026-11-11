// @ts-nocheck
import {context,env,sessionActive} from './runtime.ts';
import * as clientFinance from './client-finance.ts';
import * as erp from './erp.ts';import * as attendance from './attendance.ts';import * as files from './files.ts';import * as migration from './migration.ts';import * as payrollCycle from './payroll-cycle.ts';
const handlers={erp,attendance,files,migration,'payroll-cycle':payrollCycle,'client-finance':clientFinance};
Deno.serve(async req=>{try{if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/health')){await env.DB.prepare('SELECT 1 AS ready').first();return Response.json({ok:true,build:'HR-INDEPENDENT-R1'});}if(req.method==='POST'&&new URL(req.url).pathname.endsWith('/login-username')){
 const input=await req.json().catch(()=>({}));
 const username=String(input.username||'').trim().replace(/\s+/g,' ').toLowerCase();
 const password=input.password;
 const fail=()=>Response.json({error:'بيانات الدخول غير صحيحة أو تجاوزت محاولات الدخول المتاحة'},{status:401});
 if(!/^[\p{L}][\p{L}\p{N} ._-]{2,63}$/u.test(username)||typeof password!=='string'||password.length>256||password.length<8)return fail();
 const member=await env.DB.prepare('SELECT email FROM members WHERE lower(username)=? AND is_active=true').bind(username).first();
 if(!member)return fail();
 const result=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/token?grant_type=password',{
   method:'POST',
   headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json'},
   body:JSON.stringify({email:member.email,password}),cache:'no-store'
 });
 if(!result.ok)return fail();
 const session=await result.json();
 return Response.json({access_token:session.access_token,refresh_token:session.refresh_token,expires_in:session.expires_in},{headers:{'Cache-Control':'private, no-store'}});
 }
 const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return Response.json({error:'يرجى تسجيل الدخول'},{status:401});const response=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:authorization,apikey:Deno.env.get('SUPABASE_ANON_KEY')!}});if(!response.ok)return Response.json({error:'جلسة غير صالحة'},{status:401});const user=await response.json();if(!user.id||!user.email||!user.email_confirmed_at)return Response.json({error:'حساب غير مؤكد'},{status:403});const claims=JSON.parse(atob(authorization.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(!await sessionActive(claims.session_id,user.id))return Response.json({error:'جلسة منتهية'},{status:401});const permittedMember=await env.DB.prepare('SELECT is_active FROM members WHERE lower(email)=?').bind(user.email.toLowerCase()).first();if(!permittedMember||permittedMember.is_active===false)return Response.json({error:'حساب المستخدم غير نشط أو لا يملك صلاحية الدخول'},{status:403});const name=new URL(req.url).pathname.split('/').at(-1);const handler=handlers[name]?.[req.method];if(!handler)return Response.json({error:'غير موجود'},{status:404});return await context.run({userId:user.id,email:user.email,displayName:user.user_metadata?.display_name||user.email},()=>handler(req));}catch{return Response.json({error:'تعذر الاتصال بالخدمة'},{status:503});}});
