import {NextResponse} from 'next/server';
const json=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return json('مصدر الطلب غير صالح',403);
 try{
  if(Number(req.headers.get('content-length')||0)>16000)return json('الطلب كبير',413);
  const d=await req.json();
  if(typeof d.password!=='string'||d.password.length<12||d.password.length>128)return json('اختر كلمة مرور من 12 إلى 128 حرفًا',400);
  const base=process.env.SUPABASE_URL!;const key=process.env.SUPABASE_PUBLISHABLE_KEY!;
  let access='';
  if(typeof d.token_hash==='string'&&/^[a-zA-Z0-9_-]{20,256}$/.test(d.token_hash)){
   const verificationUrl=new URL('/auth/v1/verify',base);
   verificationUrl.searchParams.set('token',d.token_hash);
   verificationUrl.searchParams.set('type',d.token_type==='invite'?'invite':'recovery');
   const verification=await fetch(verificationUrl,{redirect:'manual',cache:'no-store'});
   const location=verification.headers.get('location');
   if(location&&verification.status>=300&&verification.status<400){
    const fragment=new URLSearchParams(new URL(location,base).hash.slice(1));
    if(['recovery','invite'].includes(fragment.get('type')||''))access=fragment.get('access_token')||'';
   }
   if(!access)return json('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',401);
  }else if(typeof d.access_token==='string'&&d.access_token.length<8000){access=d.access_token;}
  if(!access)return json('افتح رابط الاستعادة من بريدك أو الصقه في الحقل المخصص',401);
  const headers={apikey:key,Authorization:'Bearer '+access,'Content-Type':'application/json'};
  const check=await fetch(base+'/auth/v1/user',{headers,cache:'no-store'});
  if(!check.ok)return json('انتهت صلاحية رابط الاستعادة. اطلب رابطًا جديدًا.',401);
  const update=await fetch(base+'/auth/v1/user',{method:'PUT',headers,body:JSON.stringify({password:d.password}),cache:'no-store'});
  if(!update.ok){const failure=await update.json().catch(()=>({}));return json(failure.code==='same_password'?'اختر كلمة مرور مختلفة عن السابقة.':failure.code==='weak_password'?'كلمة المرور ضعيفة؛ استخدم كلمة أطول وأكثر تنوعًا.':'تعذر تغيير كلمة المرور؛ اطلب رابط استعادة جديدًا وحاول مجددًا.',400);}
  await fetch(base+'/auth/v1/logout?scope=global',{method:'POST',headers,cache:'no-store'}).catch(()=>{});
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});response.cookies.delete('hr_access');response.cookies.delete('hr_refresh');return response;
 }catch{return json('تعذر الاتصال بخدمة استعادة الحساب',503);}
}
