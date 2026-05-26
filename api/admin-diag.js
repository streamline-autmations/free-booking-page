// api/admin-diag.js — TEMPORARY diagnostic endpoint.
// Returns SHAPE-ONLY info about server env. Never returns secret values.
// Delete this file once SUPABASE_URL / SUPABASE_SERVICE_KEY are confirmed correct.
module.exports = async (req, res) => {
  function shape(name) {
    const raw = process.env[name];
    if (raw === undefined) return { name, present: false };
    const s = String(raw);
    return {
      name,
      present: true,
      length: s.length,
      first4: s.slice(0, 4),
      last4: s.slice(-4),
      starts_with_eyJ: s.startsWith('eyJ'),       // JWT marker (Supabase keys)
      starts_with_https: s.startsWith('https://'),
      has_leading_space: s !== s.trimStart(),
      has_trailing_space: s !== s.trimEnd(),
      has_quotes: /^["'].*["']$/.test(s),
      has_newline: /[\r\n]/.test(s),
      dot_count: (s.match(/\./g) || []).length,    // JWT should have 2 dots
    };
  }

  let supabasePackage = null;
  try {
    // Confirm the dependency actually resolved at runtime (catches missing-install).
    const pkg = require('@supabase/supabase-js/package.json');
    supabasePackage = { version: pkg.version };
  } catch (e) {
    supabasePackage = { error: String(e && e.message || e) };
  }

  let host = null;
  try { host = new URL(process.env.SUPABASE_URL || '').host; } catch {}

  res.status(200).json({
    node: process.version,
    vercel_env: process.env.VERCEL_ENV || null,
    region: process.env.VERCEL_REGION || null,
    supabase_url_host: host,
    supabase_package: supabasePackage,
    SUPABASE_URL: shape('SUPABASE_URL'),
    SUPABASE_SERVICE_KEY: shape('SUPABASE_SERVICE_KEY'),
    ADMIN_TOKEN_SECRET: shape('ADMIN_TOKEN_SECRET'),
  });
};
