// sw.js — offline shell for the Streamline booking admin PWA.
// Strategy:
//   - HTML / JS / CSS / JSON  → NETWORK-FIRST, fall back to cache when offline.
//     Stops the SW from pinning users to a stale deploy after every push.
//   - Same-origin static (images, fonts, manifest blobs) → cache-first.
//   - Supabase + /api/* → never cached, always network.
// Bump CACHE_VERSION on any sw.js change to force the activate hook to drop
// the old cache from previously-installed PWAs.
const CACHE_VERSION = 'sa-admin-v3';
const CACHE = CACHE_VERSION;

// Seed cache with the app shell so offline first-paint still works.
const SHELL = [
  '/admin',
  '/admin.html',
  '/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      // skipWaiting ensures a new SW activates immediately rather than waiting
      // for every tab of the old SW to close.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // clients.claim forces already-open tabs to immediately use this SW.
      .then(() => self.clients.claim())
  );
});

// Manual "force update" message — admin.html sends this on a tap to skip ahead.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isNetworkOnly(url) {
  return url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/');
}

// Network-first: try network, on success update cache, on failure serve cache.
// This is what keeps the admin fresh after deploys while still working offline.
function networkFirst(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok && req.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || caches.match('/admin.html')));
}

// Cache-first: serve cache, fall back to network and populate.
function cacheFirst(req) {
  return caches.match(req).then((hit) =>
    hit || fetch(req).then((res) => {
      if (res && res.ok && req.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (isNetworkOnly(url)) return;

  // HTML + the dynamic app code → network-first so deploys land immediately.
  const acceptsHtml = req.headers.get('accept') && req.headers.get('accept').includes('text/html');
  const isHtmlPath  = url.pathname === '/' || url.pathname.endsWith('.html')
                      || url.pathname === '/admin' || url.pathname === '/index';
  if (acceptsHtml || isHtmlPath) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Everything else (fonts, images, the supabase-js CDN bundle) → cache-first.
  e.respondWith(cacheFirst(req));
});
