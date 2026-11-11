'use client';
import {useEffect,useState,type FormEvent} from 'react';

const rememberedEmailKey='maskan-hr-remembered-email';
export default function Login(){
  const [email,setEmail]=useState('');
  const [remember,setRemember]=useState(true);
  const [savePassword,setSavePassword]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    try{const saved=localStorage.getItem(rememberedEmailKey);if(saved){setEmail(saved);setRemember(true);}else setRemember(false);}catch{setRemember(false);}
  },[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const form=new FormData(e.currentTarget);
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});
      if(!r.ok){const d=await r.json();throw Error(d.error||'تعذر تسجيل الدخول');}
      try{if(remember)localStorage.setItem(rememberedEmailKey,email.trim());else localStorage.removeItem(rememberedEmailKey);}catch{}
      // Use the browser's encrypted/password-manager credential store where supported.
      // Never persist raw passwords to localStorage, cookies or application records.
      if(savePassword&&typeof window!=='undefined'&&(window as any).PasswordCredential&&navigator.credentials?.store){
        try{const credential=new (window as any).PasswordCredential({id:email.trim(),password:String(form.get('password')||''),name:'Maskan HR'});await navigator.credentials.store(credential);}catch{/* Browser/password manager controls saving and permissions. */}
      }
      window.location.href='/';
    }catch(err){setError(err instanceof Error?err.message:'تعذر تسجيل الدخول');}
    finally{setBusy(false);}
  }
  return <main dir="rtl" style={{width:'min(94%,460px)',margin:'clamp(22px,6vh,70px) auto',padding:'clamp(24px,5vw,38px)',background:'#fff',borderRadius:22,border:'1px solid #e0e5dd',boxShadow:'0 12px 44px #122e2910',textAlign:'right'}}>
    <img src="/maskan-logo.jpg" alt="شعار شركة مسكن الكيان للمقاولات" style={{width:104,height:100,objectFit:'contain',display:'block',margin:'0 auto 12px'}}/>
    <p style={{textAlign:'center',fontWeight:800,fontSize:19,color:'#193c35',margin:'0 0 5px'}}>شركة مسكن الكيان للمقاولات</p>
    <div style={{height:2,width:100,background:'#bc9b61',margin:'16px auto 26px'}}/>
    <h1 style={{fontSize:30,color:'#193c35',textAlign:'center',marginBottom:8}}>شؤون الموظفين</h1>
    <p style={{textAlign:'center',color:'#718178',fontSize:14,marginBottom:10}}>شركة مسكن الكيان للمقاولات</p><p style={{textAlign:'center',fontSize:12,color:'#a18348',marginBottom:25,fontWeight:700}}>الإصدار V57</p>
    <form onSubmit={submit} autoComplete="on">
      <label htmlFor="hr-email" style={{display:'block',marginBottom:9,fontWeight:600}}>اسم المستخدم أو البريد الإلكتروني</label>
      <input id="hr-email" name="email" type="text" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required dir="ltr" style={{borderColor:'#d9c7a6',minHeight:48,marginBottom:19}}/>
      <label htmlFor="hr-password" style={{display:'block',marginBottom:9,fontWeight:600}}>كلمة المرور</label>
      <input id="hr-password" name="password" type="password" autoComplete="current-password" required minLength={8} style={{borderColor:'#d9c7a6',minHeight:48}}/>
      <label style={{display:'flex',alignItems:'center',gap:9,marginTop:16,fontSize:14,color:'#42594e',cursor:'pointer'}}>
        <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} style={{width:17,minHeight:17,height:17,accentColor:'#193c35'}}/>
        تذكّر اسم المستخدم أو البريد الإلكتروني
      </label>
      <label style={{display:'flex',alignItems:'center',gap:9,marginTop:10,fontSize:14,color:'#42594e',cursor:'pointer'}}>
        <input type="checkbox" checked={savePassword} onChange={e=>setSavePassword(e.target.checked)} style={{width:17,minHeight:17,height:17,accentColor:'#bc9b61'}}/>
        حفظ كلمة المرور في مدير كلمات المرور بالمتصفح
      </label>
      <p style={{fontSize:12,color:'#7a8981',marginTop:6}}>يُطلب حفظ كلمة المرور من المتصفح عند تسجيل الدخول إن كان يدعم ذلك. قد تحتاج إلى اختيار «حفظ» مرة واحدة. لن تُحفظ كلمة المرور في قاعدة بيانات المنصة أو التخزين المحلي.</p>
      {error&&<p role="alert" style={{color:'#a33'}}>{error}</p>}
      <button disabled={busy} type="submit" style={{width:'100%',marginTop:16,background:'#193c35',borderColor:'#193c35',color:'white',minHeight:48,fontWeight:700}}>{busy?'جارٍ تسجيل الدخول…':'دخول'}</button>
    </form>
    <a href="/reset" style={{display:'block',textAlign:'right',marginTop:19,color:'#193c35',fontWeight:600}}>إعادة تعيين كلمة المرور</a>
    <p style={{marginTop:22,marginBottom:0,fontSize:12,textAlign:'center',color:'#84938b'}}>استخدم حساب المنصة المسجل لديك. الحسابات والصلاحيات تُدار من الإدارة.</p>
  </main>;
}
