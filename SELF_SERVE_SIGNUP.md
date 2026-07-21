# Self-serve signup (`/start`)

A public, consent-first signup. A business owner steps through a 6-step wizard at
**`/start`** and instantly gets their own free booking page + admin PWA. It's the
inbound sibling of the cold-outreach build — both paths now call the **same**
`create_tenant()` RPC, so they can't drift.

## The wizard

`start.html` is a single-page, vanilla-JS wizard (no framework, no build step) with
6 steps, state kept in one JS object and mirrored to `sessionStorage` (logo excluded —
too large to persist) so an accidental refresh doesn't lose progress:

1. **Business type** — tap-to-select grid of category tiles (not a dropdown), sourced
   from `api/_niche-catalog.js`'s `CATEGORIES`. Last tile, "Something else," reveals a
   free-text business-type input for anything outside the curated list.
2. **About you & your business** — business name, owner name, suburb, WhatsApp, email,
   optional Instagram.
3. **Your goal** — optional single-select chips (more bookings / less WhatsApp
   back-and-forth / fewer no-shows / look more professional), personalization only,
   never blocks progress.
4. **Your services** — editable rows pre-filled from the chosen category's starter
   menu (or one blank row for "Something else"); rename, reprice, remove, or add rows.
   At least one service is required to continue.
5. **Make it yours** — accent colour + optional logo, same as before.
6. **Review & launch** — summary with per-section edit links, consent checkbox,
   honeypot, submit.

## Pieces

| Piece | File | What it does |
|---|---|---|
| Catalog | `api/_niche-catalog.js` | Single source of truth for the wizard's business-type categories: id, label, one-line example, and starter service menu. Mirrored (presentation-only) as a JS object literal in `start.html` so the wizard renders instantly with no fetch. **Only** the self-serve wizard reads this — the manual/n8n path is untouched (see below). |
| RPC | `create_tenant(...)`, extended by `supabase/migrations/004_wizard_services_and_goal.sql` | Inserts (or upserts, if called with an existing `p_prospect_id` — that's how Workflow B2 re-runs against a prospect it already has) the business + 30-min slot logic + random 4-digit PIN (SHA-256 hashed, plaintext returned once) + links an `streamline_hq.prospects` lead (`source='self-serve'` by default for this page, `status='inbound'`, `lead_temp='inbound'`, `opted_in=true`). Services: if the caller passes `p_services` (a jsonb array — always sent by the wizard), those exact rows are inserted (idempotent, won't double-insert on a repeat call for the same business); otherwise it falls back to the legacy fuzzy-niche `seed_service_presets(...)` seeder (manual/n8n path, unchanged). `p_goal` is stored on `businesses.goal`, personalization only. Returns `{slug, pin, public_url, admin_url, prospect_id}`. `service_role`-only. **Note:** the function actually deployed on the shared `streamline-admin` Supabase project is the source of truth — it was extended for Workflow B2's prospect-upsert flow by migrations that live outside this repo, so `supabase/migrations/003_create_tenant.sql` here is historical only; `004_wizard_services_and_goal.sql` was written against the live definition, not the stale 003 file. |
| Page | `start.html` (route `/start`) | The 6-step wizard described above. Honeypot + Turnstile + consent checkbox + privacy link + soft "follow for tips" nudge. Success screen shows links + PIN + add-to-home-screen steps + "share your page 🎉". |
| Endpoint | `api/signup.js` | Honeypot → rate-limit → validate (category or custom niche, 1-20 sanitized services, optional goal) → verify Turnstile → `create_tenant` (service role) → optional logo upload (`deliverables` bucket) → welcome email (Brevo) → returns links + PIN. |

## Losing your PIN (`api/admin-recover.js`)

The admin panel is PIN-only, and the PIN is stored as a SHA-256 hash — so it can
never be re-sent, only replaced. Before this endpoint existed, an owner who lost
the welcome email had exactly one route back in: messaging us. That single gap
made the whole "fully self-serve" claim depend on a human.

The **Forgot your PIN?** link under the admin numpad opens an inline panel: enter
the email on the business record, and the server issues a new PIN and mails it
there along with both page links (which also covers "I've lost my page URL").

Deliberate properties, don't "simplify" these away:

- The response is **byte-identical** whether the business exists, the email
  matched, or neither. Otherwise the screen becomes an oracle for which slugs
  exist and who owns them.
- Two rate-limit windows: per-IP (5 / 15 min) stops someone walking the slug
  list; per-business (3 / hour) stops repeated resets being used to lock a real
  owner out. The per-business counter increments **before** the lookup so a miss
  costs an attacker exactly what a hit does.
- The new PIN only ever goes to the address already stored on the business, so a
  stranger who triggers a reset learns nothing and gains nothing.

## Free-plan contract (`api/_brand.js`)

Three surfaces have to agree on what a free owner is allowed: the wizard, the
admin panel, and the server that validates their writes. When they disagreed,
people hit paywalls for things they never did — every one of these was a real bug:

| Rule | Where it bit |
|---|---|
| **Accent colours** | The wizard's swatches and admin's presets had *zero* colours in common, so every self-serve signup got "Custom colours unlock on premium" the first time they opened the branding form — for a colour the wizard gave them. Now both render `PALETTE`, and free tier may always **keep** its current colour; only an actual *change* is gated. That covers auto-assigned niche defaults and hand-set one-offs no palette will ever list. |
| **Service cap** | The wizard accepted 20 services and `create_tenant` inserted them all, but admin caps free at 5 — leaving those owners permanently unable to save the services step. Both now read `FREE_SERVICE_CAP`; the wizard disables "add" at the cap and `sanitizeServices` truncates as a backstop. |
| **Image sources** | Signup uploads logos to Supabase storage, admin uploads to Cloudinary, and admin's validator rejected anything not Cloudinary. `isAllowedImageUrl()` accepts both and nothing else. |

Run `npm run check` (`scripts/check-sync.mjs`) after touching any of this. It
fails if the catalog, goals, palette or service cap drift between
`api/_niche-catalog.js`, `api/_brand.js`, `start.html` and `admin.html`, and if
any preset menu is longer than the free cap.

## Display typography per business type

`index.html` used Cormorant Garamond — a boutique salon serif — for *every*
tenant, which is right for a lash studio and wrong for a cleaning company. The
wizard category is stored on `businesses.category`
(`006_business_category.sql`) and non-beauty categories switch to Outfit, loaded
on demand so beauty pages never pay for a font they don't render.

**A null category keeps the original serif**, so every tenant created before
this — and every manual/n8n build — is untouched. Only an explicit non-beauty
category changes anything. The size/weight/tracking corrections under
`[data-display="sans"]` exist because Cormorant's small x-height means reusing
its sizes with a grotesque lands much heavier.

The category is written by `api/signup.js` in its own statement *after*
`create_tenant` returns, with the error swallowed — the shared RPC is not
touched, and a missing column can never cost someone the page they just made.

## Adding a new business category

Edit `api/_niche-catalog.js`'s `CATEGORIES` array (id, label, example, starter
services) and mirror the same entry into the `CATALOG` object literal near the top
of `start.html`'s `<script>`. No SQL or `api/signup.js` changes needed — the wizard
always sends its own edited services array, so a new category never depends on a
matching row existing in `seed_service_presets()`.

Then: keep the starter menu at or under `FREE_SERVICE_CAP` (5), decide whether it
belongs in `SANS_DISPLAY_CATEGORIES` in `index.html` (leave it out to keep the
boutique serif), and run `npm run check` to confirm the mirror matches.

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
