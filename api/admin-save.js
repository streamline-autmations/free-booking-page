// api/admin-save.js — PIN-validated writes for services, hours, branding, booking status.
const { getSupabase, verifyToken, readBody } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { businessId, type, data, token } = readBody(req);
  if (!businessId || !type) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  if (!verifyToken(token, businessId)) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  const supabase = getSupabase();

  try {
    if (type === 'services') {
      await supabase.from('services').delete().eq('business_id', businessId);
      if (data.services && data.services.length > 0) {
        const rows = data.services.map((s, i) => ({
          business_id: businessId,
          name: s.name,
          duration: s.duration,
          price: s.price,
          sort_order: i,
        }));
        const { error } = await supabase.from('services').insert(rows);
        if (error) { res.status(500).json({ error: error.message }); return; }
      }
    } else if (type === 'hours') {
      const patch = { working_days: data.workingDays, working_hours: data.workingHours };
      // Allow the Hours form to save the slot grid in the same request.
      if (typeof data.slotInterval === 'number' && data.slotInterval >= 5 && data.slotInterval <= 240) {
        patch.slot_interval = Math.round(data.slotInterval);
      }
      const { error } = await supabase
        .from('businesses')
        .update(patch)
        .eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'slot_interval') {
      const v = Number(data && data.slot_interval);
      if (!Number.isFinite(v) || v < 5 || v > 240) {
        res.status(400).json({ error: 'slot_interval must be 5-240 minutes' });
        return;
      }
      const { error } = await supabase
        .from('businesses')
        .update({ slot_interval: Math.round(v) })
        .eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'branding') {
      const patch = {};
      if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim();
      if (typeof data.accentColor === 'string') patch.accent_color = data.accentColor;
      const { error } = await supabase.from('businesses').update(patch).eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'booking_status') {
      const allowed = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
      if (!data.bookingId || !allowed.includes(data.status)) {
        res.status(400).json({ error: 'Invalid booking status' });
        return;
      }
      const { error } = await supabase
        .from('bookings')
        .update({ status: data.status })
        .eq('id', data.bookingId)
        .eq('business_id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else {
      res.status(400).json({ error: `Unknown save type: ${type}` });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'Server error' });
    return;
  }

  res.status(200).json({ success: true });
};
