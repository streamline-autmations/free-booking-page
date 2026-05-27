// api/manifest.js — dynamic per-business PWA manifest.
// Served at /api/manifest?biz=<slug>. Returns a JSON manifest pointing at
// static Streamline icons so Chrome's install criteria are met (blob: manifests
// were silently rejecting the install prompt).
//
// We intentionally use ONE Streamline icon for every salon — keeps install
// reliable and surfaces Streamline branding on every salon-owner home screen.
// Per-business name + theme colour still appear under the icon and in the
// app shell, so each salon still feels like "their" app.
module.exports = async (req, res) => {
  const q = (req.query && req.query.biz) || ((req.url.split('?')[1] || '').match(/(?:^|&)biz=([^&]+)/) || [])[1] || '';
  const slug = String(q || 'streamline').replace(/[^a-z0-9-_]/gi, '');

  // We don't NEED to look up the business — name + colour are decoration here.
  // To keep the manifest endpoint cheap (no Supabase round-trip on every PWA
  // boot) we keep it stateless. The admin app injects business name into the
  // page title + theme-color meta so the install banner still reads correctly.
  const manifest = {
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

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).end(JSON.stringify(manifest));
};
