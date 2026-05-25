# Admin PWA + Vercel functions — cutover

Branch: **`admin-pwa-vercel`**. Nothing here is live until you set the
Vercel env vars and merge to `main` (Vercel auto-deploys `main`).

## What changed
- The admin backend moved from Netlify functions to **Vercel** serverless
  functions in `/api/` (`admin-auth`, `admin-save`, `admin-block`). The old
  `admin.html` called `/.netlify/functions/*`, which don't exist on Vercel —
  so admin login + every edit was 404 in production. Now fixed.
- Admin writes are **PIN-validated server-side** (signed token bound to the
  business + 12h expiry) instead of the old client-only token check.
- `admin.html` is now an installable **PWA** with a free/locked feature split
  (Services, Hours, Block Time, Bookings + status management, and a "More"
  tab with install, branding, and the locked premium upsell cards).
- New `vercel.json` rewrites `/admin` → `/admin.html`.

## 🔴 You must do this before/at merge

1. **Set Vercel env vars** (Project → Settings → Environment Variables, for
   Production):
   - `SUPABASE_URL` = `https://lpjwfjkgqpgydzozuusj.supabase.co`
   - `SUPABASE_SERVICE_KEY` = the unified project's **service_role** key
   - `ADMIN_TOKEN_SECRET` = any long random string (e.g. `openssl rand -hex 32`)
   Without these the `/api` functions return 500 and admin login fails.

2. **Rotate the old leaked service key** (still outstanding from the earlier
   booking cutover — the old key is in git history). Generate a fresh
   service_role key and use that for `SUPABASE_SERVICE_KEY` above.

3. **Merge to go live:** `git checkout main; git merge admin-pwa-vercel; git push`
   Vercel deploys; admin is then live at
   `booking-page-beta.vercel.app/admin?biz={slug}`.

## Notes
- **App icon** is generated on the fly (canvas: accent→orange gradient +
  business initial), so it's installable with no asset work. If you want a
  branded PNG icon later, drop in 192/512 PNGs and point the manifest at them.
- The 8 locked premium cards link to **wa.me/27837797935**. Their wording is
  kept identical to Workflow F's booking-triggered upsell.
- The old `netlify/functions/*` + `netlify.toml` are left in place (harmless,
  unused on Vercel) — delete them once you're happy on Vercel.
