# Self-serve signup (`/start`)

A public, consent-first signup. A salon fills in the form at **`/start`** and instantly
gets their own free booking page + admin PWA. It's the inbound sibling of the cold-outreach
build — both paths now call the **same** `create_tenant()` RPC, so they can't drift.

## Pieces

| Piece | File | What it does |
|---|---|---|
| RPC | `supabase/migrations/003_create_tenant.sql` | `create_tenant(...)` — inserts business + seeds niche menu + 30-min slot logic + random 4-digit PIN (SHA-256 hashed, plaintext returned once) + an **inbound, opted-in** lead in `streamline_hq.prospects` (`source='self-serve'`, `status='inbound'`, `lead_temp='inbound'`, `opted_in=true`). Returns `{slug, pin, public_url, admin_url, prospect_id}`. `service_role`-only. |
| Page | `start.html` (route `/start`) | Salon-styled form. Honeypot + Turnstile + consent checkbox + privacy link + soft "follow for tips" nudge. Success screen shows links + PIN + add-to-home-screen steps + "share your page 🎉". |
| Endpoint | `api/signup.js` | Honeypot → rate-limit → validate → verify Turnstile → `create_tenant` (service role) → optional logo upload (`deliverables` bucket) → welcome email (Brevo) → returns links + PIN. |

## Security

- **Honeypot** `company_url` (off-screen). Filled ⇒ silent no-op. *Always on.*
- **Rate-limit** — best-effort in-memory sliding window (5 / 10 min / IP). *Always on.*
- **Cloudflare Turnstile** (free) — **OPT-IN, currently OFF.** The widget was removed from the page and the server skips verification unless `TURNSTILE_ENFORCE='true'`. To re-enable: set that env var, add the widget back to `start.html`, and ensure the site key + `TURNSTILE_SECRET_KEY` belong to the **same** Cloudflare widget with the live domain on its hostname list.
- **Service-role key** stays server-side; `create_tenant` is `service_role`-only (`revoke`d from anon/authenticated).

## Environment variables (Vercel)

| Var | Status | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | already set | shared project `lpjwfjkgqpgydzozuusj` |
| `PUBLIC_BASE_URL` | already set (booking emails) | e.g. `https://book.streamline-automations.co.za` — used for the returned links |
| `BREVO_API_KEY`, `BREVO_FROM` | already set (booking emails) | reused for the welcome email; if unset the email is skipped (signup still succeeds) |
| `TURNSTILE_SECRET_KEY` | **NEW — add to enforce captcha** | from Cloudflare → Turnstile. Until set, captcha is skipped. |

## Going live with real captcha (2 steps)

1. Cloudflare dashboard → **Turnstile** → create a widget (free). Add your domain.
2. Copy the **Site key** into `start.html` (`data-sitekey="…"`, currently the always-pass test key `1x00000000000000000000AA`) and set the **Secret key** as `TURNSTILE_SECRET_KEY` in Vercel.

That's it — the widget already renders and the endpoint already verifies the token once the secret is present.

## Note for streamline-admin (Prompt B)

Refactor Workflow **B2** to call this same `create_tenant()` RPC (keep its Telegram trigger +
delivery-link behaviour) so manual + self-serve builds share one path. Workflow **F** upsells
on first booking regardless of how the tenant was created. HQ dashboard should surface
`source='self-serve'` rows as a distinct, opted-in segment.
