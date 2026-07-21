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
const { findCategory, GOALS, findGoal } = require('./_niche-catalog');
const { FREE_SERVICE_CAP } = require('./_brand');
const { esc, sendEmail, emailShell, pinAndLinksHtml } = require('./_email');

const GOAL_IDS = GOALS.map((g) => g.id);

// Wizard sends its own edited/pre-filled service menu; keep it sane server-side.
// Capped at the same FREE_SERVICE_CAP admin enforces — creating more here than
// admin will let them save would strand the owner behind a 402 on the services
// step forever. The wizard already stops them at the cap; this is the backstop,
// so it truncates rather than rejecting (never block someone from getting a page).
function sanitizeServices(input) {
  if (!Array.isArray(input)) return null;
  const rows = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name || '').trim().slice(0, 60);
    const price = String(raw.price || '').trim().slice(0, 20);
    const durationNum = Number(raw.duration);
    if (!name || !price) continue;
    if (!Number.isFinite(durationNum) || durationNum < 5 || durationNum > 480) continue;
    rows.push({ name, duration: Math.round(durationNum), price });
    if (rows.length >= FREE_SERVICE_CAP) break;
  }
  return rows;
}

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
  // Captcha is OPT-IN. The always-on protections are the honeypot + rate-limit.
  // To turn Turnstile back on: set TURNSTILE_ENFORCE='true' in Vercel, add the
  // widget back to start.html, and make sure the site key + this secret belong
  // to the SAME Cloudflare widget (with the live domain on its hostname list).
  if (process.env.TURNSTILE_ENFORCE !== 'true' || !secret) return { ok: true, skipped: true };
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

function welcomeEmailHtml({ businessName, ownerName, publicUrl, adminUrl, pin, accent, goalTip }) {
  // If they told us what they're here for, answer it instead of giving everyone
  // the same generic "share your page" line.
  const nextStep = goalTip
    || 'Share your page with clients so they can book in a tap — every booking lands in your dashboard automatically.';
  return emailShell({
    accent,
    eyebrow: 'Your booking page is live',
    heading: businessName,
    intro: `Hi ${esc(ownerName || 'there')}, everything's set up. Keep this email — it has your private admin PIN.`,
    bodyHtml: pinAndLinksHtml({ accent, publicUrl, adminUrl, pin }) + `
      <p style="margin:24px 0 0;color:#6B6258;font-size:13px;line-height:1.7">
        <strong style="color:#1B1815">Add it to your phone:</strong> open your booking page in your browser,
        tap <em>Share</em> → <em>Add to Home Screen</em>. It'll behave like an app.<br><br>
        ${esc(nextStep)}
      </p>`,
  });
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
      businessName, ownerName, niche, customNiche, suburb, whatsapp, email,
      instagram, accentColour, logoDataUrl, consent, turnstileToken,
      services, goal,
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

    // niche: either a known catalog id, or 'other' + a free-text label the
    // owner typed themselves (stored as the real niche value, not the
    // literal string "other", so HQ reporting gets a meaningful category).
    const nicheLower = String(niche || '').trim().toLowerCase();
    let finalNiche = nicheLower;
    if (nicheLower === 'other') {
      const custom = String(customNiche || '').trim();
      if (!custom) missing.push('customNiche');
      else finalNiche = custom.slice(0, 60);
    } else if (!nicheLower || !findCategory(nicheLower)) {
      missing.push('niche');
    }

    const cleanServices = sanitizeServices(services);
    if (!cleanServices || cleanServices.length === 0) missing.push('services');

    if (!suburb || !String(suburb).trim()) missing.push('suburb');
    if (!whatsapp || !String(whatsapp).trim()) missing.push('whatsapp');
    if (!isEmail(email)) missing.push('email');
    if (consent !== true) missing.push('consent');
    if (missing.length) {
      res.status(400).json({ error: 'Please complete all required fields.', fields: missing });
      return;
    }

    // goal is personalization-only — silently ignore anything unrecognized
    // rather than blocking signup over it.
    const cleanGoal = GOAL_IDS.includes(String(goal || '').trim()) ? String(goal).trim() : null;

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
      p_niche: finalNiche,
      p_suburb: String(suburb).trim(),
      p_whatsapp: String(whatsapp).trim(),
      p_email: String(email).trim().toLowerCase(),
      p_instagram: instagram ? String(instagram).trim() : null,
      p_accent_colour: accentColour ? String(accentColour).trim() : null,
      p_base_url: base,
      p_services: cleanServices,
      p_goal: cleanGoal,
    });
    if (error) {
      res.status(500).json({ error: 'Could not create your page. Please try again.', detail: error.message });
      return;
    }

    const result = data || {};
    const slug = result.slug;

    // 5b) record the chosen category so the delivered page can pick a display
    // typeface that suits the trade (see 006_business_category.sql). Kept as
    // its own statement, and its error deliberately swallowed: create_tenant
    // has already succeeded by this point, so nothing here — including this
    // column not existing yet — may cost someone the page they just made.
    if (slug) {
      const { error: catErr } = await supabase
        .from('businesses')
        .update({ category: nicheLower })
        .eq('id', slug);
      if (catErr) console.warn(`[signup] could not set category for ${slug}: ${catErr.message}`);
    }

    // 6) optional logo (non-blocking)
    if (logoDataUrl && slug) {
      const logoUrl = await uploadLogo(supabase, slug, logoDataUrl);
      if (logoUrl) {
        await supabase.from('businesses').update({ logo_url: logoUrl }).eq('id', slug);
      }
    }

    // 7) welcome email with all their details (non-blocking on failure)
    const goalMeta = findGoal(cleanGoal);
    const html = welcomeEmailHtml({
      businessName: String(businessName).trim(),
      ownerName: String(ownerName).trim(),
      publicUrl: result.public_url,
      adminUrl: result.admin_url,
      pin: result.pin,
      accent: accentColour,
      goalTip: goalMeta && goalMeta.tip,
    });
    await sendEmail(String(email).trim(), `Your ${String(businessName).trim()} booking page is live 🎉`, html);

    res.status(200).json({
      ok: true,
      slug,
      pin: result.pin,
      publicUrl: result.public_url,
      adminUrl: result.admin_url,
      goalTip: (goalMeta && goalMeta.tip) || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'signup crashed', message: (e && e.message) || String(e) });
  }
};
