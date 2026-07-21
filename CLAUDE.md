# booking-page — project notes

## Supabase

- **Project URL:** https://lpjwfjkgqpgydzozuusj.supabase.co
- **Project ref:** `lpjwfjkgqpgydzozuusj`
- **Account (GitHub/Supabase login):** `streamline-dev-ai`
- **Account email:** `streamline.dev.build@gmail.com`

This is the **unified** Streamline project — shared with the sibling
`streamline-admin` repo (n8n Workflow B2, prospects, HQ dashboard). Bookings
here join the same `streamline_hq.prospects` funnel that repo owns. See
`MIGRATION_CUTOVER.md` for how/why this repo moved onto it.

`ighqgqyzlkhmspflbzsh` is the **old, retired** standalone Supabase project this
repo ran on *before* that cutover. It's not part of the live system — don't
point migrations, MCP connections, or env vars at it.

## Structure

- Static HTML + Vercel serverless functions (`api/*.js`, CommonJS), no build
  step, no framework.
- `start.html` — public self-serve signup wizard (`/start`).
- `index.html` — the delivered booking page every tenant gets.
- `admin.html` — PIN-gated owner dashboard (PWA).
- `api/_niche-catalog.js`, `api/_brand.js` — shared contracts (business-type
  catalog, free-tier accent palette + service cap + image-source rules).
  Duplicated as inline data in `start.html`/`admin.html` for zero-round-trip
  rendering — run `npm run check` after touching any of it to catch drift.
- See `SELF_SERVE_SIGNUP.md` for the full wizard + free-plan-contract writeup.

## Booking flow hardening (migrations 007/008)

- `api/create-booking.js` is now the **only** way a booking gets created.
  `index.html` used to insert into `bookings` directly with the anon key —
  confirmed live-exploitable (no honeypot/rate-limit, tamperable price, no
  double-booking protection, and `send-booking-emails.js` would mail
  whatever `customer_email` was submitted). `007_lock_down_bookings.sql`
  revokes anon's INSERT grant outright and adds a unique index so a slot
  can't be double-booked even under a race.
- `api/send-reminders.js` runs daily via Vercel Cron (`vercel.json`) and
  emails customers with a booking the next day — backs up the "cut down
  no-shows" goal option that previously had no mechanism behind it. Needs
  `008_booking_reminders.sql` (`bookings.reminder_sent_at`). Optional
  `CRON_SECRET` env var locks the endpoint to Vercel's own cron trigger.
- Admin's Bookings tab stats row gained a **"30 days"** tile — the existing
  panel (today / 7 days / all time) was entirely forward-looking with no
  recent-activity signal.
- `index.html` now ships static `og:`/`twitter:` meta tags (generic — this
  is a static file, so there's no per-request rendering to inject a specific
  business's name/logo into what a crawler sees) plus a JS patch for
  unfurlers that do run JS.
