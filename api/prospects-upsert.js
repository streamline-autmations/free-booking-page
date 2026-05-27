// api/prospects-upsert.js
// Called by n8n Workflow A. Accepts an array of normalised prospect rows and
// upserts them into streamline_hq.prospects via service-role. Keeps the
// Supabase service key OUT of n8n — n8n only needs PROSPECTS_INGEST_TOKEN.
//
// Env:
//   SUPABASE_URL              already set
//   SUPABASE_SERVICE_KEY      already set
//   PROSPECTS_INGEST_TOKEN    shared secret n8n includes in Authorization header
//
// Request body: { rows: [ { business_name, slug, niche, suburb, ... } ] }
// Conflict target: slug (unique).
const { createClient } = require('@supabase/supabase-js');

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const expected = process.env.PROSPECTS_INGEST_TOKEN;
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!expected || got !== expected) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    const { rows } = readBody(req);
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'rows[] required' });
      return;
    }

    // Whitelist columns so an upstream typo doesn't fail the whole batch.
    const ALLOWED = new Set([
      'source','business_name','slug','niche','suburb','phone_e164','whatsapp_e164',
      'email','website','instagram_handle','instagram_followers',
      'google_rating','google_reviews_count','raw_data','status',
      'image_url','logo_url','image_urls','owner_first_name',
    ]);
    const cleaned = rows
      .map((r) => {
        const out = {};
        for (const k of Object.keys(r)) if (ALLOWED.has(k)) out[k] = r[k];
        return out;
      })
      .filter((r) => r.slug && r.business_name);

    if (cleaned.length === 0) {
      res.status(400).json({ error: 'No valid rows after filter' });
      return;
    }

    const sb = createClient(url, key, {
      db: { schema: 'streamline_hq' },
      auth: { persistSession: false },
    });

    // ignoreDuplicates:false → INSERT...ON CONFLICT UPDATE; behaviour matches
    // the original Workflow A intent (refresh fields when slug already known).
    const { data, error } = await sb
      .from('prospects')
      .upsert(cleaned, { onConflict: 'slug', ignoreDuplicates: false })
      .select('id, slug');

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ upserted: data ? data.length : 0, rows: data });
  } catch (e) {
    res.status(500).json({ error: 'prospects-upsert crashed', message: e && e.message || String(e) });
  }
};
