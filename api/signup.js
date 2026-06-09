// api/signup.js
// PUBLIC self-serve signup. A salon fills the /start form and instantly gets a
// free booking page + admin PWA. This is the inbound, consent-first sibling of
// the cold-outreach build (n8n Workflow B2) — both call the SAME create_tenant()
// RPC so the two paths can never drift.
//
// Defence in depth for a public endpoint:
//   1. honeypot field (bots fill hidden inputs)
//   2. Cloudflare Turnstile captcha (free)  — verified server-side
//   3. per-IP rate-limit (best-effort, in-memory sliding window)
//   4. service-role key stays server-side only; create_tenant is service_role-only
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   — already set
//   TURNSTILE_SECRET_KEY                 — Cloudflare Turnstile secret (server-side).
//                                          If unset, captcha verification is SKIPPED
//                                          (so the page works before keys are wired),
//                                          mirroring the graceful BREVO_API_KEY pattern.
//   PUBLIC_BASE_URL                      — e.g. https://book.streamline-automations.co.za
//   BREVO_API_KEY, BREVO_FROM            — welcome email (optional; skipped if unset)

const { getSupabase, readBody } = require('./_auth');

const NICHES = ['nails', 'lashes', 'hair', 'brows', 'spa', 'barber'];

// ---- best-effort per-IP rate-limit -----------------------------------------
// In-memory only: each warm serverless instance keeps its own window, so this is
// a soft control. Turnstile is the real bot defence. Window: 5 signups / 10 min.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 5;
const rlHits = new Map(); // ip -> number[] (timestamps)
function rateLimited(ip, now) {
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  // opportunistic cleanup so the map can't grow unbounded
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

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true }; // not wired yet → don't block signups
  if (!token) return { ok: false, reason: 'captcha missing' };
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') form.append('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.success, reason: (j['error-codes'] || []).join(',') };
  } catch (e) {
    return { ok: false, reason: 'captcha verify failed' };
  }
}

// Upload an optional base64 data-URL logo to the public `deliverables` bucket and
// return its public URL. Never throws — a bad logo must not fail the signup.
async function uploadLogo(supabase, slug, dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:(image\/(png|jpe?g|webp|svg\+xml));base64,(.+)$/i);
    if (!m) return null;
    const contentType = m[1];
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('svg') ? 'svg'
      : 'jpg';
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 2 * 1024 * 1024) return null; // cap 2MB
    const path = `logos/${slug}.${ext}`;
    const { error } = await supabase.storage.from('deliverables').upload(path, buf, {
      contentType, upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from('deliverables').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

function welcomeEmailHtml({ businessName, ownerName, publicUrl, adminUrl, pin, accent }) {
  const a = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : '#A8456B';
  return `<!doctype html><html><body style="margin:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1815">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:16px;border:1px solid #E8E2D9;padding:32px 28px">
      <div style="font-size:13px;font-weight:600;color:${a};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">Your booking page is live</div>
      <h1 style="margin:0 0 6px;font-size:26px;font-weight:600;color:#1B1815">${esc(businessName)}</h1>
      <p style="margin:0 0 22px;color:#6B6258;font-size:14px;line-height:1.6">Hi ${esc(ownerName || 'there')}, everything's set up. Keep this email — it has your private admin PIN.</p>

      <div style="border-top:1px solid #E8E2D9;padding-top:18px">
        <p style="margin:0 0 4px;font-size:12px;color:#A39A8E;text-transform:uppercase;letter-spacing:0.05em">Your booking page</p>
        <p style="margin:0 0 16px"><a href="${esc(publicUrl)}" style="color:${a};font-weight:600;font-size:15px;text-decoration:none;word-break:break-all">${esc(publicUrl)}</a></p>

        <p style="margin:0 0 4px;font-size:12px;color:#A39A8E;text-transform:uppercase;letter-spacing:0.05em">Your admin dashboard</p>
        <p style="margin:0 0 16px"><a href="${esc(adminUrl)}" style="color:${a};font-weight:600;font-size:15px;text-decoration:none;word-break:break-all">${esc(adminUrl)}</a></p>

        <div style="background:#FAF8F5;border:1px solid #E8E2D9;border-radius:10px;padding:14px 16px;margin-top:8px">
          <p style="margin:0;font-size:12px;color:#A39A8E;text-transform:uppercase;letter-spacing:0.05em">Admin PIN</p>
          <p style="margin:4px 0 0;font-size:30px;font-weight:700;letter-spacing:0.18em;color:#1B1815">${esc(pin)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#6B6258">Keep this private — it's how you log in to manage bookings.</p>
        </div>
      </div>

      <div style="margin-top:22px"><a href="${esc(adminUrl)}" style="display:inline-block;background:${a};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px">Open your dashboard</a></div>

      <p style="margin:24px 0 0;color:#6B6258;font-size:13px;line-height:1.7">
        <strong style="color:#1B1815">Add it to your phone:</strong> open your booking page in your browser,
        tap <em>Share</em> → <em>Add to Home Screen</em>. It'll behave like an app.<br><br>
        Share your page with clients so they can book in a tap — every booking lands in your dashboard automatically.
      </p>
    </div>
    <p style="text-align:center;color:#A39A8E;font-size:11px;margin:18px 0 0;letter-spacing:0.04em">
      Booking by Streamline · <a href="https://streamline-automations.agency/" style="color:#A39A8E">streamline-automations.agency</a>
    </p>
  </div></body></html>`;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendWelcomeEmail(to, html, subject) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_FROM || 'Streamline Bookings <noreply@streamline-automations.co.za>';
  if (!apiKey || !to) return { skipped: true };
  const parseSender = (s) => {
    const mm = String(s).match(/^(.*?)\s*<([^>]+)>$/);
    return mm ? { name: mm[1].trim(), email: mm[2].trim() } : { email: String(s).trim() };
  };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: parseSender(from), to: [{ email: to }], subject, htmlContent: html }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    const body = readBody(req);
    const {
      businessName, ownerName, niche, suburb, whatsapp, email,
      instagram, accentColour, logoDataUrl, consent, turnstileToken,
      company_url, // honeypot — must stay empty
    } = body;

    // 1) honeypot: a real human never fills this hidden field.
    if (company_url) {
      res.status(200).json({ ok: true }); // silently no-op so bots learn nothing
      return;
    }

    // 2) rate-limit
    const ip = clientIp(req);
    if (rateLimited(ip, Date.now())) {
      res.status(429).json({ error: 'Too many signups from this network. Please try again in a few minutes.' });
      return;
    }

    // 3) validation
    const missing = [];
    if (!businessName || !String(businessName).trim()) missing.push('businessName');
    if (!ownerName || !String(ownerName).trim()) missing.push('ownerName');
    if (!niche || !NICHES.includes(String(niche).toLowerCase())) missing.push('niche');
    if (!suburb || !String(suburb).trim()) missing.push('suburb');
    if (!whatsapp || !String(whatsapp).trim()) missing.push('whatsapp');
    if (!isEmail(email)) missing.push('email');
    if (consent !== true) missing.push('consent');
    if (missing.length) {
      res.status(400).json({ error: 'Please complete all required fields.', fields: missing });
      return;
    }

    // 4) captcha
    const cap = await verifyTurnstile(turnstileToken, ip);
    if (!cap.ok) {
      res.status(403).json({ error: 'Captcha check failed. Please try again.', reason: cap.reason });
      return;
    }

    // 5) create the tenant via the single-source-of-truth RPC
    const supabase = getSupabase();
    const base = (process.env.PUBLIC_BASE_URL || 'https://book.streamline-automations.co.za').replace(/\/+$/, '');
    const { data, error } = await supabase.rpc('create_tenant', {
      p_business_name: String(businessName).trim(),
      p_owner_name: String(ownerName).trim(),
      p_niche: String(niche).toLowerCase(),
      p_suburb: String(suburb).trim(),
      p_whatsapp: String(whatsapp).trim(),
      p_email: String(email).trim().toLowerCase(),
      p_instagram: instagram ? String(instagram).trim() : null,
      p_accent_colour: accentColour ? String(accentColour).trim() : null,
      p_base_url: base,
    });
    if (error) {
      res.status(500).json({ error: 'Could not create your page. Please try again.', detail: error.message });
      return;
    }

    const result = data || {};
    const slug = result.slug;

    // 6) optional logo (non-blocking)
    if (logoDataUrl && slug) {
      const logoUrl = await uploadLogo(supabase, slug, logoDataUrl);
      if (logoUrl) {
        await supabase.from('businesses').update({ logo_url: logoUrl }).eq('id', slug);
      }
    }

    // 7) welcome email with all their details (non-blocking on failure)
    const html = welcomeEmailHtml({
      businessName: String(businessName).trim(),
      ownerName: String(ownerName).trim(),
      publicUrl: result.public_url,
      adminUrl: result.admin_url,
      pin: result.pin,
      accent: accentColour,
    });
    await sendWelcomeEmail(String(email).trim(), html, `Your ${String(businessName).trim()} booking page is live 🎉`);

    res.status(200).json({
      ok: true,
      slug,
      pin: result.pin,
      publicUrl: result.public_url,
      adminUrl: result.admin_url,
    });
  } catch (e) {
    res.status(500).json({ error: 'signup crashed', message: (e && e.message) || String(e) });
  }
};
