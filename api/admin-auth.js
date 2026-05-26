// api/admin-auth.js — verify PIN, mint a signed session token.
const { getSupabase, signToken, sha256, readBody } = require('./_auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || '';
    let host = '';
    try { host = new URL(url).host; } catch {}
    if (!url || !key) {
      res.status(500).json({ error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_KEY missing' });
      return;
    }

    const { businessId, pin } = readBody(req);
    if (!businessId || !pin) {
      res.status(400).json({ error: 'Missing fields' });
      return;
    }

    const supabase = getSupabase();
    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, admin_pin_hash')
      .eq('id', businessId)
      .maybeSingle();

    if (error) {
      res.status(502).json({ error: 'DB error: ' + error.message, project: host });
      return;
    }
    if (!business) {
      res.status(404).json({ error: 'Business not found', project: host });
      return;
    }
    if (sha256(pin) !== business.admin_pin_hash) {
      res.status(401).json({ error: 'Incorrect PIN' });
      return;
    }

    res.status(200).json({ token: signToken(businessId), businessId });
  } catch (e) {
    // Surface the real error instead of letting Vercel render FUNCTION_INVOCATION_FAILED.
    res.status(500).json({
      error: 'admin-auth crashed',
      name: e && e.name || null,
      message: e && e.message || String(e),
    });
  }
};
