// api/_brand.js
// The shared free-tier + branding contract. Three surfaces have to agree on
// these rules — the signup wizard (start.html), the admin panel (admin.html),
// and the server that validates their writes (api/signup.js, api/admin-save.js).
// When they disagreed, owners hit paywalls for things they never did:
//
//   - The wizard's swatches and admin's BRAND_PRESETS had ZERO colours in
//     common, so every self-serve signup got "Custom colours unlock on
//     premium" the first time they touched the branding form — for a colour
//     the wizard had handed them.
//   - The wizard accepted 20 services and create_tenant inserted them all,
//     but admin capped free plans at 5, leaving those owners unable to save
//     the services step at all.
//   - Signup stored logos in Supabase storage while admin only accepted
//     Cloudinary URLs.
//
// Everything a free owner can legitimately end up with must be accepted here.

// ---------------------------------------------------------------------------
// Accent colours
// ---------------------------------------------------------------------------
// The palette shown as swatches in BOTH the wizard and admin. Muted, single
// light source, nothing above ~60% saturation so it sits calmly behind content.
// Mirrored as markup in start.html and as BRAND_PRESETS in admin.html — keep
// the three in sync (scripts/check-brand-sync.mjs enforces it).
const PALETTE = [
  { name: 'Rose',   value: '#B25C7C' },
  { name: 'Clay',   value: '#C76B52' },
  { name: 'Ochre',  value: '#C39A4E' },
  { name: 'Sage',   value: '#6E8C6F' },
  { name: 'Teal',   value: '#3E8E8E' },
  { name: 'Indigo', value: '#5B6CB0' },
  { name: 'Plum',   value: '#7C5A93' },
  { name: 'Navy',   value: '#33415C' },
];

// Colours the system itself assigned before this palette existed, and which
// live tenants are still on. They're no longer offered as swatches, but they
// must stay VALID or those owners get paywalled out of their own branding
// form the moment they rename their business.
//
//   - the six original admin presets
//   - the niche-keyed defaults create_tenant() falls back to when a caller
//     sends no accent colour (see 004_wizard_services_and_goal.sql)
const LEGACY_ACCENTS = [
  '#A8456B', '#7B3FE4', '#0D9488', '#F87171', '#84CC16', '#475569', // original admin presets
  '#C084FC', '#B76E79', '#0EA5E9', '#A16207',                       // create_tenant niche defaults
];

const FREE_ACCENTS = new Set(
  [...PALETTE.map((p) => p.value), ...LEGACY_ACCENTS].map((h) => h.toUpperCase())
);

// Is this a colour a free plan may keep? Premium bypasses the check entirely.
function isFreeAccent(hex) {
  if (typeof hex !== 'string') return false;
  return FREE_ACCENTS.has(hex.trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------
// Free plans get five services. The wizard must never let someone create more
// than this, or they'd land in admin unable to save the services step.
const FREE_SERVICE_CAP = 5;

// ---------------------------------------------------------------------------
// Image sources
// ---------------------------------------------------------------------------
// Admin uploads straight to Cloudinary from the browser; the signup endpoint
// uploads to the Supabase `deliverables` bucket server-side. Both are ours, so
// both are trusted — anything else is rejected so these columns can't be
// pointed at arbitrary third-party URLs.
function isAllowedImageUrl(url) {
  if (!url) return false;
  const s = String(url).trim();
  if (/^https:\/\/res\.cloudinary\.com\//i.test(s)) return true;
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (base) {
    const prefix = `${base}/storage/v1/object/public/`.toLowerCase();
    if (s.toLowerCase().startsWith(prefix)) return true;
  }
  return false;
}

module.exports = {
  PALETTE,
  LEGACY_ACCENTS,
  isFreeAccent,
  FREE_SERVICE_CAP,
  isAllowedImageUrl,
};
