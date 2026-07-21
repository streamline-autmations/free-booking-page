// api/create-booking.js
// PUBLIC endpoint for the booking form on every delivered page (index.html).
//
// Replaces a direct `supabaseClient.from('bookings').insert(...)` with the
// anon key. That path had none of the defences api/signup.js already has for
// its own public write endpoint — no honeypot, no rate-limit, and (confirmed
// against production before this was written) no server-side check that the
// slot, service, or price were real. Anyone with the anon key shipped in
// every page's HTML could flood a business's calendar, or submit a stranger's
// email address and have Streamline's own mailer send them a fake "booking
// confirmed" — see 007_lock_down_bookings.sql for the full writeup.
//
// This endpoint is the ONLY way to create a booking now: 007 revokes anon's
// INSERT grant on the table outright, so a client-side insert would simply
// fail closed even if someone bypassed this endpoint entirely.

const { getSupabase, readBody } = require('./_auth');

// ---- best-effort per-IP rate-limit -----------------------------------------
// Mirrors api/signup.js's window. Generous for a real customer (one booking
// takes one request); tight enough to blunt a flood script.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 8;
const rlHits = new Map();
function rateLimited(ip, now) {
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      const live = v.filter((t) => now - t < RL_WINDOW_MS);
      if (live.length === 0) rlHits.delete(k); else rlHits.set(k, live);
    }
  }
  return arr.length > RL_MAX;
}
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function parseTimeToMinutes(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function todayIsoInBusinessDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = readBody(req);
    const {
      businessId, serviceId, stylistId,
      bookingDate, bookingTime,
      customerName, customerEmail, customerPhone, customerNote,
      company_url, // honeypot — must stay empty
    } = body;

    // 1) honeypot: a real customer never fills this hidden field.
    if (company_url) {
      res.status(200).json({ ok: true }); // silently no-op so bots learn nothing
      return;
    }

    // 2) rate-limit
    const ip = clientIp(req);
    if (rateLimited(ip, Date.now())) {
      res.status(429).json({ error: 'Too many booking attempts from this network. Please try again shortly.' });
      return;
    }

    // 3) basic field validation
    const missing = [];
    if (!businessId) missing.push('businessId');
    if (!serviceId) missing.push('serviceId');
    if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate))) missing.push('bookingDate');
    if (!bookingTime || !/^\d{2}:\d{2}$/.test(String(bookingTime))) missing.push('bookingTime');
    if (!customerName || !String(customerName).trim()) missing.push('customerName');
    if (!isEmail(customerEmail)) missing.push('customerEmail');
    if (!customerPhone || String(customerPhone).replace(/\D/g, '').length < 7) missing.push('customerPhone');
    if (missing.length) {
      res.status(400).json({ error: 'Please complete all required fields.', fields: missing });
      return;
    }

    const supabase = getSupabase();

    // 4) the business must exist, and carries the scheduling rules we validate against.
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, working_days, working_hours, slot_interval, advance_days, same_day')
      .eq('id', businessId)
      .maybeSingle();
    if (bizErr || !biz) {
      res.status(404).json({ error: 'Business not found.' });
      return;
    }

    // 5) the service must be real and belong to this business — name, duration
    // and price are read from here, never trusted from the client, so a
    // tampered request can't book a premium service at a fake price.
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id, name, duration, price')
      .eq('id', serviceId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (svcErr || !svc) {
      res.status(400).json({ error: 'That service is no longer available. Please refresh and pick again.' });
      return;
    }

    // 6) optional stylist must belong to this business too.
    let stylistRow = null;
    if (stylistId) {
      const { data: st } = await supabase
        .from('stylists').select('id, name').eq('id', stylistId).eq('business_id', businessId).maybeSingle();
      if (!st) { res.status(400).json({ error: 'That team member is no longer available. Please pick again.' }); return; }
      stylistRow = st;
    }

    // 7) date must be a real calendar date, not in the past, within the
    // business's advance-booking window, on a working day, and (for today)
    // only if same-day booking is enabled — mirrors buildDateStrip() in
    // index.html so the server enforces exactly what the UI already offers.
    const day = new Date(`${bookingDate}T00:00:00`);
    if (Number.isNaN(day.getTime())) { res.status(400).json({ error: 'Invalid date.' }); return; }
    const today = todayIsoInBusinessDay(new Date());
    const diffDays = Math.round((day - today) / 86400000);
    const workingDays = Array.isArray(biz.working_days) ? biz.working_days : [1, 2, 3, 4, 5, 6];
    const advanceDays = Number.isFinite(biz.advance_days) ? biz.advance_days : 30;
    const sameDay = biz.same_day !== false;
    if (diffDays < 0 || diffDays > advanceDays) {
      res.status(400).json({ error: 'That date is outside the available booking window.' });
      return;
    }
    if (diffDays === 0 && !sameDay) {
      res.status(400).json({ error: 'Same-day booking is not available for this business.' });
      return;
    }
    if (!workingDays.includes(day.getDay())) {
      res.status(400).json({ error: 'That day is not available for booking.' });
      return;
    }

    // 8) time must fall inside working hours and end before closing.
    const { start, end } = biz.working_hours || { start: 8, end: 17 };
    const slotStart = parseTimeToMinutes(bookingTime);
    const slotEnd = slotStart + (svc.duration || 60);
    if (slotStart < start * 60 || slotEnd > end * 60) {
      res.status(400).json({ error: 'That time is outside working hours.' });
      return;
    }

    // 9) not on a blocked day/slot.
    const { data: blocked } = await supabase
      .from('blocked_slots').select('type, time').eq('business_id', businessId).eq('date', bookingDate);
    const dayBlocked = (blocked || []).some((b) => b.type === 'day');
    const slotBlocked = (blocked || []).some((b) => b.type === 'slot' && b.time === bookingTime);
    if (dayBlocked || slotBlocked) {
      res.status(409).json({ error: 'That time is no longer available. Please pick another.' });
      return;
    }

    // 10) not already booked — mirrors index.html's isSlotTaken() overlap
    // check exactly (any active booking that overlaps this time range on this
    // day blocks it, regardless of stylist — the client doesn't currently
    // distinguish by stylist either, so this doesn't change existing
    // behaviour). The unique index in 007 is the atomic backstop for the
    // exact-match race between this check and the insert below.
    const { data: existing } = await supabase
      .from('bookings')
      .select('booking_time, duration, status')
      .eq('business_id', businessId)
      .eq('booking_date', bookingDate)
      .neq('status', 'cancelled');
    const overlaps = (existing || []).some((b) => {
      const bStart = parseTimeToMinutes(b.booking_time);
      const bEnd = bStart + (b.duration || 60);
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (overlaps) {
      res.status(409).json({ error: 'That time was just booked by someone else. Please pick another.' });
      return;
    }

    // 11) create it. status starts 'pending' — same as before.
    const { data: inserted, error: insErr } = await supabase
      .from('bookings')
      .insert({
        business_id: businessId,
        service_name: svc.name,
        service_id: String(svc.id),
        booking_date: bookingDate,
        booking_time: bookingTime,
        duration: svc.duration,
        price: svc.price,
        customer_name: String(customerName).trim().slice(0, 120),
        customer_email: String(customerEmail).trim().toLowerCase(),
        customer_phone: String(customerPhone).trim().slice(0, 30),
        customer_note: customerNote ? String(customerNote).trim().slice(0, 500) : null,
        stylist_id: stylistRow ? stylistRow.id : null,
        status: 'pending',
        source: 'booking_page',
      })
      .select('id')
      .single();

    if (insErr) {
      // The unique index (007) is the only thing that can still fail here —
      // someone won the exact same slot in the race between step 10 and here.
      if (insErr.code === '23505') {
        res.status(409).json({ error: 'That time was just booked by someone else. Please pick another.' });
        return;
      }
      res.status(500).json({ error: 'Could not create your booking. Please try again.' });
      return;
    }

    res.status(200).json({ ok: true, id: inserted.id });
  } catch (e) {
    res.status(500).json({ error: 'create-booking crashed', message: (e && e.message) || String(e) });
  }
};
