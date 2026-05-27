// api/admin-block.js — PIN-validated add/remove of blocked days & slots.
const { getSupabase, verifyToken, readBody } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { businessId, action, blockData, blockId, token } = readBody(req);
  if (!businessId) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  if (!verifyToken(token, businessId)) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  const supabase = getSupabase();

  // Free-tier gate — blocked slots are a premium feature.
  {
    const { data: biz } = await supabase
      .from('businesses').select('is_premium').eq('id', businessId).maybeSingle();
    if (!biz || !biz.is_premium) {
      res.status(402).json({ error: 'Blocking time off unlocks on premium.' });
      return;
    }
  }

  try {
    if (action === 'add') {
      const { error } = await supabase.from('blocked_slots').insert({
        business_id: businessId,
        date: blockData.date,
        type: blockData.type,
        time: blockData.time || null,
        reason: blockData.reason || null,
      });
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (action === 'remove') {
      const { error } = await supabase
        .from('blocked_slots')
        .delete()
        .eq('id', blockId)
        .eq('business_id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'Server error' });
    return;
  }

  res.status(200).json({ success: true });
};
