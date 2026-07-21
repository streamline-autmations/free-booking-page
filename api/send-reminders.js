// api/send-reminders.js
// Runs daily via Vercel Cron (see vercel.json) and emails every customer with
// a booking tomorrow a reminder. Backs up the "cut down no-shows" goal the
// signup wizard has offered since it was built — until this existed, that
// promise had nothing behind it beyond the one confirmation email sent at
// booking time, sometimes weeks earlier.
//
// Runs once a day rather than checking a rolling N-hours-ahead window: this
// product has no per-business timezone field, everything else in the
// codebase already assumes a single South African timezone, and a single
// daily pass keeps this comfortably inside Vercel Hobby's cron-frequency
// limits. See 008_booking_reminders.sql for reminder_sent_at.
//
// Guarded by CRON_SECRET (optional): if set, requires
// `Authorization: Bearer <secret>` — otherwise Vercel's own Cron header
// vercel-cron is trusted. Without CRON_SECRET set, the endpoint is open the
// way most of this app's optional protections are (e.g. Turnstile) — set it
// in Vercel once this ships so a stranger can't trigger reminder sends by
// hitting the URL directly.

const { getSupabase } = require('./_auth');
const { esc, sendEmail, emailShell } = require('./_email');

function fmtDate(iso) {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}
function fmt12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const am = h < 12;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m || 0).padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
}
function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function reminderEmailHtml(b, biz) {
  return emailShell({
    accent: biz.accent_color,
    eyebrow: "Tomorrow's appointment",
    heading: biz.name,
    intro: `Hi ${esc(b.customer_name)}, just a reminder — you're booked in tomorrow.`,
    bodyHtml: `
      <div style="border-top:1px solid #E8E2D9;padding-top:18px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6B6258">Service</span><span style="font-weight:600">${esc(b.service_name)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6B6258">When</span><span style="font-weight:600">${esc(fmtDate(b.booking_date))} · ${esc(fmt12(b.booking_time))}</span></div>
        ${biz.phone ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6B6258">Contact</span><span style="font-weight:600">${esc(biz.phone)}</span></div>` : ''}
      </div>
      <p style="margin:22px 0 0;color:#6B6258;font-size:13px;line-height:1.6">
        Need to change something? Reply to this email and ${esc(biz.name)} will sort it.
      </p>`,
  });
}

module.exports = async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const supabase = getSupabase();
    const targetDate = tomorrowIso();

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, business_id, service_name, booking_date, booking_time, customer_name, customer_email')
      .eq('booking_date', targetDate)
      .neq('status', 'cancelled')
      .is('reminder_sent_at', null)
      .not('customer_email', 'is', null);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!bookings || bookings.length === 0) {
      res.status(200).json({ date: targetDate, candidates: 0, sent: 0 });
      return;
    }

    const bizIds = [...new Set(bookings.map((b) => b.business_id))];
    const { data: businesses } = await supabase
      .from('businesses').select('id, name, phone, accent_color').in('id', bizIds);
    const bizById = new Map((businesses || []).map((b) => [b.id, b]));

    let sent = 0;
    let failed = 0;
    for (const b of bookings) {
      const biz = bizById.get(b.business_id);
      if (!biz) continue; // orphaned booking — skip rather than crash the whole run
      const html = reminderEmailHtml(b, biz);
      const result = await sendEmail(b.customer_email, `Reminder: your appointment tomorrow with ${biz.name}`, html);
      if (result.skipped) continue; // no BREVO_API_KEY configured yet — nothing to mark
      if (result.ok) {
        await supabase.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id);
        sent++;
      } else {
        failed++;
      }
    }

    res.status(200).json({ date: targetDate, candidates: bookings.length, sent, failed });
  } catch (e) {
    res.status(500).json({ error: 'send-reminders crashed', message: (e && e.message) || String(e) });
  }
};
