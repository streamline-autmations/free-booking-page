// sw.js — offline shell for the Streamline booking admin PWA.
const CACHE = 'sa-admin-v1';
const SHELL = [
  '/admin',
  '/admin.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Supabase API + the admin /api functions must always go to the network
  // (fresh data / writes). The app handles offline reads from localStorage.
  if (url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/')) return;

  // Cache-first for the app shell + static assets, falling back to the cached
  // admin page so the app still opens with no connection.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/admin.html'))
    )
  );
});
