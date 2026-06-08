// api/send-booking-emails.js
// Sends two booking-confirmation emails (customer + salon owner) via Brevo.
// Called by the public booking page right after the bookings row is inserted.
// Idempotency: bookings.email_sent_at is set on success so repeat calls no-op.
//
// Env required:
//   BREVO_API_KEY        — from app.brevo.com → SMTP & API → API Keys
//   BREVO_FROM           — e.g. "Streamline Bookings <noreply@streamline-automations.co.za>"
//   PUBLIC_BASE_URL      — e.g. "https://book.streamline-automations.co.za" (for admin link in owner email)
// If BREVO_API_KEY is missing the function still returns 200 with {skipped:true}
// so the booking flow on the public page never fails because email isn't set up yet.

const { getSupabase, readBody } = require('./_auth');

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
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function priceStr(p) {
  if (p == null || p === '') return '';
  const n = Number(String(p).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return String(p);
  return 'R' + n.toLocaleString('en-ZA');
}

// Build a minimal .ics so customers can add to Google/Apple Calendar.
function makeIcs(b, biz) {
  const dt = (date, time) => date.replace(/-/g, '') + 'T' + (time + ':00').replace(/:/g, '').slice(0, 6);
  const start = dt(b.booking_date, b.booking_time);
  const endMin = (parseInt(b.booking_time.split(':')[0], 10) * 60 + parseInt(b.booking_time.split(':')[1] || '0', 10)) + (b.duration || 60);
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  const end = dt(b.booking_date, endTime);
  const uid = `${b.id}@streamline-automations.agency`;
  const summary = `${b.service_name} at ${biz.name}`;
  const desc = `Booking with ${biz.name}. ${biz.phone ? 'Phone: ' + biz.phone : ''}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Streamline//Booking//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dt(b.booking_date, b.booking_time)}Z`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${summary}`, `DESCRIPTION:${desc}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return Buffer.from(ics, 'utf8').toString('base64');
}

function customerEmailHtml(b, biz) {
  const accent = biz.accent_color || '#7B3FE4';
  const dateStr = fmtDate(b.booking_date);
  const timeStr = fmt12(b.booking_time);
  return `<!doctype html><html><body style="margin:0;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:14px;border:1px solid #ececec;padding:32px 28px">
      <div style="font-size:13px;font-weight:600;color:${accent};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">Booking confirmed</div>
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:600;color:#111827">${esc(biz.name)}</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6">Hi ${esc(b.customer_name)}, we've got you down. Here's your booking:</p>
      <div style="border-top:1px solid #ececec;padding-top:18px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6b7280">Service</span><span style="font-weight:600">${esc(b.service_name)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6b7280">When</span><span style="font-weight:600">${esc(dateStr)} · ${esc(timeStr)}</span></div>
        ${b.duration ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6b7280">Duration</span><span style="font-weight:600">${b.duration} min</span></div>` : ''}
        ${b.price ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6b7280">Price</span><span style="font-weight:600">${esc(priceStr(b.price))}</span></div>` : ''}
        ${biz.phone ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span style="color:#6b7280">Salon</span><span style="font-weight:600">${esc(biz.phone)}</span></div>` : ''}
      </div>
      <p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.6">
        Need to change something? Reply to this email and the salon will sort it.
      </p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin:18px 0 0;letter-spacing:0.04em">
      Booking by Streamline · streamline-automations.agency
    </p>
  </div></body></html>`;
}

function ownerEmailHtml(b, biz, adminUrl) {
  const accent = biz.accent_color || '#7B3FE4';
  const dateStr = fmtDate(b.booking_date);
  const timeStr = fmt12(b.booking_time);
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:14px;border:1px solid #e5e7eb;padding:28px 24px">
      <div style="font-size:13px;font-weight:700;color:${accent};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">New booking</div>
      <h1 style="margin:0 0 18px;font-size:22px;font-weight:700">${esc(b.customer_name)} · ${esc(b.service_name)}</h1>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px">
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px"><span style="color:#6b7280">When</span><span style="font-weight:600">${esc(dateStr)} · ${esc(timeStr)}</span></div>
        ${b.duration ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px"><span style="color:#6b7280">Duration</span><span style="font-weight:600">${b.duration} min</span></div>` : ''}
        ${b.price ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px"><span style="color:#6b7280">Price</span><span style="font-weight:600">${esc(priceStr(b.price))}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px"><span style="color:#6b7280">Phone</span><span style="font-weight:600">${esc(b.customer_phone || '—')}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px"><span style="color:#6b7280">Email</span><span style="font-weight:600">${esc(b.customer_email || '—')}</span></div>
        ${b.customer_note ? `<div style="padding:10px 12px;margin-top:10px;background:#faf8f5;border-radius:8px;font-size:13px;color:#374151"><strong style="color:#6b7280;font-weight:600">Note:</strong> ${esc(b.customer_note)}</div>` : ''}
      </div>
      <div style="margin-top:22px"><a href="${esc(adminUrl)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px;font-size:14px">Open admin</a></div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin:18px 0 0;letter-spacing:0.04em">
      You're getting this because you own ${esc(biz.name)} on Streamline.
    </p>
  </div></body></html>`;
}

async function sendEmail({ apiKey, from, to, reply_to, subject, html, attachments }) {
  // Parse "Name <email>" sender string into Brevo's { name, email } object.
  const parseSender = (s) => {
    const m = String(s).match(/^(.*?)\s*<([^>]+)>$/);
    return m ? { name: m[1].trim(), email: m[2].trim() } : { email: String(s).trim() };
  };
  const toList = (Array.isArray(to) ? to : [to]).map(e => ({ email: e }));
  const body = {
    sender: parseSender(from),
    to: toList,
    subject,
    htmlContent: html,
  };
  if (reply_to) body.replyTo = { email: reply_to };
  if (attachments && attachments.length) {
    body.attachment = attachments.map(a => ({ content: a.content, name: a.filename }));
  }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.BREVO_API_KEY;
    const from   = process.env.BREVO_FROM || 'Streamline Bookings <noreply@streamline-automations.co.za>';
    const base   = process.env.PUBLIC_BASE_URL || 'https://book.streamline-automations.co.za';

    const { bookingId } = readBody(req);
    if (!bookingId) { res.status(400).json({ error: 'bookingId required' }); return; }

    if (!apiKey) {
      // Don't block bookings just because email isn't configured yet.
      res.status(200).json({ skipped: true, reason: 'BREVO_API_KEY not set' });
      return;
    }

    const supabase = getSupabase();
    const { data: b, error: bErr } = await supabase
      .from('bookings').select('*').eq('id', bookingId).maybeSingle();
    if (bErr || !b) { res.status(404).json({ error: 'Booking not found' }); return; }

    // Idempotency — don't send twice if the function is retried.
    if (b.email_sent_at) { res.status(200).json({ skipped: true, reason: 'already sent' }); return; }

    const { data: biz, error: bizErr } = await supabase
      .from('businesses').select('*').eq('id', b.business_id).maybeSingle();
    if (bizErr || !biz) { res.status(404).json({ error: 'Business not found' }); return; }

    const adminUrl = `${base}/admin?biz=${biz.id}`;
    const replyTo  = biz.owner_email || undefined;

    const icsB64 = makeIcs(b, biz);
    const customerSubject = `Booking confirmed — ${biz.name} · ${fmtDate(b.booking_date)} ${fmt12(b.booking_time)}`;
    const ownerSubject    = `New booking — ${b.customer_name} · ${fmtDate(b.booking_date)} ${fmt12(b.booking_time)}`;

    const sends = [];
    if (b.customer_email) {
      sends.push(sendEmail({
        apiKey, from, reply_to: replyTo, to: b.customer_email,
        subject: customerSubject, html: customerEmailHtml(b, biz),
        attachments: [{ filename: 'booking.ics', content: icsB64 }],
      }));
    }
    if (biz.owner_email) {
      sends.push(sendEmail({
        apiKey, from, reply_to: b.customer_email || undefined, to: biz.owner_email,
        subject: ownerSubject, html: ownerEmailHtml(b, biz, adminUrl),
      }));
    }

    const results = await Promise.allSettled(sends);
    const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok));
    const allOk  = failed.length === 0 && results.length > 0;

    if (allOk) {
      await supabase.from('bookings').update({ email_sent_at: new Date().toISOString() }).eq('id', bookingId);
    }

    res.status(200).json({
      sent: results.length,
      ok: allOk,
      details: results.map(r => r.status === 'fulfilled' ? { status: r.value.status, body: r.value.body } : { error: String(r.reason) }),
    });
  } catch (e) {
    res.status(500).json({ error: 'send-booking-emails crashed', message: e && e.message || String(e) });
  }
};
