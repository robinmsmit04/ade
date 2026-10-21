// Never cache authenticated responses, API data, media or HTML.
const CACHE='crew-static-v1';
const STATIC=['/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-icon.png','/icon.svg','/manifest.webmanifest','/offline.html'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin || event.request.method!=='GET')return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;}if(STATIC.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});
