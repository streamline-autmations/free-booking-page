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
      // Free-tier cap. Premium businesses bypass.
      const FREE_SERVICE_CAP = 5;
      const incoming = (data.services || []).length;
      if (incoming > FREE_SERVICE_CAP) {
        const { data: biz } = await supabase
          .from('businesses').select('is_premium').eq('id', businessId).maybeSingle();
        if (!biz || !biz.is_premium) {
          res.status(402).json({ error: `Free plan is capped at ${FREE_SERVICE_CAP} services. Upgrade to add more.` });
          return;
        }
      }
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
      // Free tier may only set accent colours from the preset palette.
      const PRESETS = ['#A8456B','#7B3FE4','#0D9488','#F87171','#84CC16','#475569'];
      if (typeof data.accentColor === 'string') {
        const hex = data.accentColor.trim().toUpperCase();
        const isPreset = PRESETS.includes(hex);
        if (!isPreset) {
          const { data: biz } = await supabase
            .from('businesses').select('is_premium').eq('id', businessId).maybeSingle();
          if (!biz || !biz.is_premium) {
            res.status(402).json({ error: 'Custom colours unlock on premium. Pick a preset or upgrade.' });
            return;
          }
        }
        patch.accent_color = data.accentColor;
      }
      const { error } = await supabase.from('businesses').update(patch).eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'logo') {
      // Logo upload is free for every salon. Empty string clears.
      const raw = data && data.logo_url;
      const url = raw == null ? null : String(raw).trim();
      const value = url === '' ? null : url;
      if (value && !/^https:\/\/res\.cloudinary\.com\//i.test(value)) {
        res.status(400).json({ error: 'Logo URL must come from Cloudinary' });
        return;
      }
      const { error } = await supabase.from('businesses').update({ logo_url: value }).eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'image') {
      // Hero/banner image — free for every salon. Empty string clears.
      const raw = data && data.image_url;
      const url = raw == null ? null : String(raw).trim();
      const value = url === '' ? null : url;
      if (value && !/^https:\/\/res\.cloudinary\.com\//i.test(value)) {
        res.status(400).json({ error: 'Banner URL must come from Cloudinary' });
        return;
      }
      const { error } = await supabase.from('businesses').update({ image_url: value }).eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'social') {
      // Accepts: { instagram_url, facebook_url } — either or both. Empty string clears.
      const patch = {};
      const clean = (s) => {
        if (s === null || s === undefined) return undefined;
        const t = String(s).trim();
        if (t === '') return null;
        // Accept either @handle or full URL; store normalised URL.
        if (/^https?:\/\//i.test(t)) return t;
        if (t.startsWith('@')) return t; // keep handle, footer code resolves it
        return t;
      };
      const ig = clean(data.instagram_url);
      const fb = clean(data.facebook_url);
      if (ig !== undefined) patch.instagram_url = ig;
      if (fb !== undefined) patch.facebook_url = fb;
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: 'Nothing to save' });
        return;
      }
      const { error } = await supabase.from('businesses').update(patch).eq('id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'stylist_add') {
      const name = (data && typeof data.name === 'string') ? data.name.trim() : '';
      if (!name) { res.status(400).json({ error: 'Name required' }); return; }
      const photo = (data && data.photo_url) ? String(data.photo_url).trim() : null;
      if (photo && !/^https:\/\/res\.cloudinary\.com\//i.test(photo)) {
        res.status(400).json({ error: 'Photo URL must come from Cloudinary' });
        return;
      }
      const { count, error: cErr } = await supabase
        .from('stylists').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
      if (cErr) { res.status(500).json({ error: cErr.message }); return; }
      const { data: ins, error } = await supabase
        .from('stylists')
        .insert({ business_id: businessId, name, photo_url: photo, sort_order: count || 0 })
        .select('id, name, photo_url, sort_order')
        .single();
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ success: true, stylist: ins });
      return;
    } else if (type === 'stylist_update') {
      const id = data && data.stylist_id;
      if (!id) { res.status(400).json({ error: 'stylist_id required' }); return; }
      const { data: existing, error: lErr } = await supabase
        .from('stylists').select('id, business_id').eq('id', id).maybeSingle();
      if (lErr) { res.status(500).json({ error: lErr.message }); return; }
      if (!existing || existing.business_id !== businessId) {
        res.status(403).json({ error: 'Stylist not found' });
        return;
      }
      const patch = {};
      if (typeof data.name === 'string') {
        const n = data.name.trim();
        if (!n) { res.status(400).json({ error: 'Name cannot be empty' }); return; }
        patch.name = n;
      }
      if (data.photo_url !== undefined) {
        const raw = data.photo_url;
        const url = raw == null ? null : String(raw).trim();
        const value = url === '' ? null : url;
        if (value && !/^https:\/\/res\.cloudinary\.com\//i.test(value)) {
          res.status(400).json({ error: 'Photo URL must come from Cloudinary' });
          return;
        }
        patch.photo_url = value;
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: 'Nothing to update' });
        return;
      }
      const { error } = await supabase.from('stylists').update(patch).eq('id', id).eq('business_id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'stylist_delete') {
      const id = data && data.stylist_id;
      if (!id) { res.status(400).json({ error: 'stylist_id required' }); return; }
      const { data: existing, error: lErr } = await supabase
        .from('stylists').select('id, business_id').eq('id', id).maybeSingle();
      if (lErr) { res.status(500).json({ error: lErr.message }); return; }
      if (!existing || existing.business_id !== businessId) {
        res.status(403).json({ error: 'Stylist not found' });
        return;
      }
      const { error } = await supabase.from('stylists').delete().eq('id', id).eq('business_id', businessId);
      if (error) { res.status(500).json({ error: error.message }); return; }
    } else if (type === 'stylist_reorder') {
      const order = (data && Array.isArray(data.order)) ? data.order : null;
      if (!order) { res.status(400).json({ error: 'order array required' }); return; }
      const { data: rows, error: lErr } = await supabase
        .from('stylists').select('id').eq('business_id', businessId);
      if (lErr) { res.status(500).json({ error: lErr.message }); return; }
      const owned = new Set((rows || []).map(r => r.id));
      if (order.length !== owned.size || !order.every(id => owned.has(id))) {
        res.status(400).json({ error: 'order must contain exactly this business\'s stylists' });
        return;
      }
      for (let i = 0; i < order.length; i++) {
        const { error } = await supabase
          .from('stylists').update({ sort_order: i }).eq('id', order[i]).eq('business_id', businessId);
        if (error) { res.status(500).json({ error: error.message }); return; }
      }
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
