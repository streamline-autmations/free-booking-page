// api/manifest.js — dynamic per-business PWA manifest.
// Served at /api/manifest?biz=<slug>. Returns a JSON manifest pointing at
// static Streamline icons so Chrome's install criteria are met (blob: manifests
// were silently rejecting the install prompt).
//
// We intentionally use ONE Streamline icon for every salon — keeps install
// reliable and surfaces Streamline branding on every salon-owner home screen.
// Per-business name + theme colour still appear under the icon and in the
// app shell, so each salon still feels like "their" app.
function qp(req, key) {
  if (req.query && req.query[key]) return req.query[key];
  const m = (req.url.split('?')[1] || '').match(new RegExp('(?:^|&)' + key + '=([^&]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

module.exports = async (req, res) => {
  const slug = String(qp(req, 'biz') || 'streamline').replace(/[^a-z0-9-_]/gi, '');
  // app=book → the CUSTOMER booking page manifest (premium "add to home screen").
  // Anything else → the admin/owner dashboard manifest (default, unchanged).
  const isBook = String(qp(req, 'app')) === 'book';

  // We don't NEED to look up the business — name + colour are decoration here.
  // To keep the manifest endpoint cheap (no Supabase round-trip on every PWA
  // boot) we keep it stateless. The page injects business name into the title +
  // theme-color meta so the install prompt still reads correctly.
  let manifest;
  if (isBook) {
    const name = String(qp(req, 'name') || 'Bookings').slice(0, 60) || 'Bookings';
    manifest = {
      id: `/?biz=${slug}`,            // stable identity → Chrome mints a real WebAPK
      name: name,
      short_name: name.slice(0, 20),
      description: `Book your next appointment with ${name}.`,
      start_url: `/?biz=${slug}`,
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#FAF8F5',
      theme_color: '#A8456B',
      icons: [
        { src: '/icons/sl-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/sl-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/sl-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  } else {
    manifest = {
      id: `/admin?biz=${slug}`,       // stable identity → Chrome mints a real WebAPK
      name: 'Streamline Bookings',
      short_name: 'Bookings',
      description: 'Your booking dashboard — every appointment, in one app.',
      start_url: `/admin?biz=${slug}`,
      scope: '/admin',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#7B3FE4',
      icons: [
        { src: '/icons/sl-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/sl-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/sl-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  }

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).end(JSON.stringify(manifest));
};
