const CACHE='maskan-erp-enterprise-v1.2-production-hardened';
const SHELL=['/','/index.html','/assets/style.css','/assets/app.js','/assets/repair-2026-08-07.js','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          if(response.ok)caches.open(CACHE).then(cache=>cache.put('/index.html',response.clone()));
          return response;
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});