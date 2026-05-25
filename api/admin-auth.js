// api/admin-auth.js — verify PIN, mint a signed session token.
const { getSupabase, signToken, sha256, readBody } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
    .single();

  if (error || !business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  if (sha256(pin) !== business.admin_pin_hash) {
    res.status(401).json({ error: 'Incorrect PIN' });
    return;
  }

  res.status(200).json({ token: signToken(businessId), businessId });
};
