/* Service worker : l'app s'ouvre même sans réseau (dernière version en cache). */
const V = 'lego-shell-20261123222246', IMG = 'lego-img-1';
const SHELL = ['./', 'index.html', 'standalone.js', 'calc.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'xlsx.full.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/googleapis\.com|accounts\.google\.com|brickfact\.com/.test(u.host)) return; // jamais en cache
  const isAsset = /\/(img|figs|sto|icons)\//.test(u.pathname) || /\.(webp|jpg|png)$/.test(u.pathname) || u.host === 'cdnjs.cloudflare.com';
  if (isAsset) {
    // Images : cache d'abord (elles ne changent pas), réseau sinon.
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(IMG).then(ca => ca.put(e.request, c)); } return res; })));
  } else {
    // Page, scripts et données : réseau d'abord (toujours la dernière version), cache si hors ligne.
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ca => ca.put(e.request, c)); } return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  }
});
