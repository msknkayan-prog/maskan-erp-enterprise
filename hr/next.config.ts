// The public version is generated on every build, not manually maintained.
// The timestamp is in Asia/Riyadh and changes with each successful deployment build.
const now=new Date(Date.now()+3*60*60*1000).toISOString();
const buildVersion='V'+now.slice(0,10).replaceAll('-','')+'.'+now.slice(11,19).replaceAll(':','');
export default {env:{NEXT_PUBLIC_MASKAN_BUILD_VERSION:buildVersion},async headers(){return [{source:'/reset',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'}]}];}};
