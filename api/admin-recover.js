// api/admin-recover.js — self-serve "I lost my PIN".
//
// Why this exists: the admin panel is PIN-only. Before this endpoint, the PIN
// was shown once on the signup success screen and emailed once — and if an
// owner lost that email their ONLY route back in was messaging us. That made a
// fully self-serve product depend on a human for its most common failure.
//
// We store only the SHA-256 hash of the PIN, so it can't be re-sent — recovery
// necessarily means issuing a new one. The new PIN goes exclusively to the
// email already on the business record, so whoever asks learns nothing they
// didn't already have.
//
// Response is deliberately identical whether or not the business exists and
// whether or not the email matched. Otherwise this becomes a free oracle for
// "which slugs exist" and "who owns them".

const { getSupabase, sha256, readBody } = require('./_auth');
const { sendEmail, emailShell, pinAndLinksHtml } = require('./_email');

// Two sliding windows. The IP window stops someone walking the slug list; the
// per-business window stops repeated resets being used to lock a real owner out
// of their own PIN by spamming this endpoint. In-memory and therefore
// per-instance — a soft control, same posture as the signup rate-limit.
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 5;
const BIZ_WINDOW_MS = 60 * 60 * 1000;
const BIZ_MAX = 3;

const ipHits = new Map();
const bizHits = new Map();

function hit(map, key, windowMs, max, now) {
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  map.set(key, arr);
  if (map.size > 5000) {
    for (const [k, v] of map) {
      const live = v.filter((t) => now - t < windowMs);
      if (live.length === 0) map.delete(k); else map.set(k, live);
    }
  }
  return arr.length > max;
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Same shape create_tenant() generates: 4 digits, 1000-9999.
function newPin() {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

module.exports = async (req, res) => {
  // One response for every outcome. Never branch this on what we found.
  const generic = () => res.status(200).json({
    ok: true,
    message: 'If that business and email match our records, a new PIN is on its way.',
  });

  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    const { businessId, email } = readBody(req);
    const slug = String(businessId || '').trim().toLowerCase();
    const mail = String(email || '').trim().toLowerCase();
    if (!slug || !mail) {
      res.status(400).json({ error: 'Business and email are both required.' });
      return;
    }

    const now = Date.now();
    if (hit(ipHits, clientIp(req), IP_WINDOW_MS, IP_MAX, now)) {
      res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
      return;
    }
    // Counted before the lookup so a miss costs an attacker the same as a hit.
    if (hit(bizHits, slug, BIZ_WINDOW_MS, BIZ_MAX, now)) {
      generic();
      return;
    }

    const supabase = getSupabase();
    const { data: biz, error } = await supabase
      .from('businesses')
      .select('id, name, owner_email, accent_color')
      .eq('id', slug)
      .maybeSingle();

    if (error) {
      res.status(502).json({ error: 'Could not process that right now. Please try again.' });
      return;
    }
    // Unknown business, or the email doesn't match the one on file.
    if (!biz || !biz.owner_email || biz.owner_email.trim().toLowerCase() !== mail) {
      generic();
      return;
    }

    const pin = newPin();
    const { error: upErr } = await supabase
      .from('businesses')
      .update({ admin_pin_hash: sha256(pin) })
      .eq('id', slug);
    if (upErr) {
      res.status(500).json({ error: 'Could not reset your PIN. Please try again.' });
      return;
    }

    const base = (process.env.PUBLIC_BASE_URL || 'https://book.streamline-automations.co.za').replace(/\/+$/, '');
    const publicUrl = `${base}/?biz=${slug}`;
    const adminUrl = `${base}/admin?biz=${slug}`;

    const html = emailShell({
      accent: biz.accent_color,
      eyebrow: 'Your new admin PIN',
      heading: biz.name || slug,
      intro: 'You asked to reset the PIN for your booking page. Here it is — your old PIN no longer works. '
           + 'If this wasn\'t you, someone knows your business link and email; nothing else about your account has changed.',
      bodyHtml: pinAndLinksHtml({ accent: biz.accent_color, publicUrl, adminUrl, pin }),
    });
    await sendEmail(biz.owner_email, `Your new PIN for ${biz.name || slug}`, html);

    generic();
  } catch (e) {
    res.status(500).json({ error: 'Could not process that right now. Please try again.' });
  }
};
