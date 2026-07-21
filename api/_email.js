// api/_email.js
// One Brevo sender + one HTML shell for every transactional email we send.
// Previously the signup welcome email carried its own copy of this; PIN
// recovery would have made two, so it lives here now.
//
// Env: BREVO_API_KEY, BREVO_FROM. If the key is unset the send is skipped
// gracefully rather than throwing — a missing mail key must never be the
// reason someone can't create or recover their page.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseSender(s) {
  const m = String(s).match(/^(.*?)\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { email: String(s).trim() };
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_FROM || 'Streamline Bookings <noreply@streamline-automations.co.za>';
  if (!apiKey || !to) return { skipped: true };
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

// Shared card shell so every email looks like it came from the same product.
// `accent` tints the eyebrow, links and button; falls back to the house rose.
function emailShell({ accent, eyebrow, heading, intro, bodyHtml }) {
  const a = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : '#B25C7C';
  return `<!doctype html><html><body style="margin:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1815">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:16px;border:1px solid #E8E2D9;padding:32px 28px">
      <div style="font-size:13px;font-weight:600;color:${a};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">${esc(eyebrow)}</div>
      <h1 style="margin:0 0 6px;font-size:26px;font-weight:600;color:#1B1815">${esc(heading)}</h1>
      <p style="margin:0 0 22px;color:#6B6258;font-size:14px;line-height:1.6">${intro}</p>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#A39A8E;font-size:11px;margin:18px 0 0;letter-spacing:0.04em">
      Booking by Streamline · <a href="https://streamline-automations.agency/" style="color:#A39A8E">streamline-automations.agency</a>
    </p>
  </div></body></html>`;
}

// The PIN block + the two links, shared by the welcome and recovery emails so
// an owner sees the same thing in both places.
function pinAndLinksHtml({ accent, publicUrl, adminUrl, pin }) {
  const a = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : '#B25C7C';
  return `
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
    <div style="margin-top:22px"><a href="${esc(adminUrl)}" style="display:inline-block;background:${a};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px">Open your dashboard</a></div>`;
}

module.exports = { esc, sendEmail, emailShell, pinAndLinksHtml };
