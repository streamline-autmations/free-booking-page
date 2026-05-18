# Supabase Unification — Cutover Runbook (Option A)

Goal: move the booking page off its own Supabase project
(`ighqgqyzlkhmspflbzsh`) onto the unified Streamline project
(`lpjwfjkgqpgydzozuusj`), so bookings join the Lead Engine funnel.

## ✅ Done (safe, already applied)

- Booking schema recreated on the unified project in the **`public`**
  schema (exact current shape: `businesses, services, blocked_slots,
  bookings`) + RLS + anon-read policies, matching prod behaviour.
- Added unification columns to `public.businesses`: `slug`,
  `prospect_id` (→ `streamline_hq.prospects`), `show_streamline_promo`,
  `is_streamline_owned`.
- `streamline_hq.prospect_engagement` view (bookings + demo views per
  prospect) — powers the booking-triggered hot follow-up.
- `demo-salon` + 3 services seeded so the page is testable now.
- `index.html` repointed to the unified project's URL + **anon** key.
  This change is on branch **`unify-supabase`**, NOT `main`, so it does
  NOT auto-deploy until you run the cutover below.

## 🔴 Security — must fix, do not skip

`admin.html` has a **hardcoded Supabase service-role key** (line ~913),
committed to GitHub. That key = full DB access, bypasses RLS. Anyone who
opens the deployed admin page's source has it.
- Rotate that key in the OLD project's dashboard now (it's burned).
- Do NOT put any service-role key in `admin.html`. Admin privileged
  writes must go through the Netlify functions (`admin-auth/-save/-block`)
  which already read `process.env.SUPABASE_SERVICE_KEY` server-side.
- `admin.html` was left on the old project on purpose — repoint it only
  after it's switched to the functions-based path (no embedded key).

## Cutover steps (do in order)

1. **Migrate data** (I have no access to the old project, so you do this):
   - Old project SQL editor → export rows from `businesses`, `services`,
     `blocked_slots`, `bookings` (CSV or `INSERT` dump).
   - Unified project (`lpjwfjkgqpgydzozuusj`) SQL editor → import them
     into the same-named `public` tables. (Schema is identical.)
   - Backfill `slug` = `id` for existing businesses if you want clean
     ref-tracking: `update public.businesses set slug = id where slug is null;`
2. **Repoint n8n** (`booking-workflow.json` / "Streamline Booking System"):
   point its Supabase nodes at the unified project URL + that project's
   **service-role key**. This is what writes customer bookings.
3. **Netlify env** (Site settings → Environment variables): set
   `SUPABASE_URL=https://lpjwfjkgqpgydzozuusj.supabase.co` and
   `SUPABASE_SERVICE_KEY=<unified project's service_role key>`.
4. **Test on the branch** (Netlify deploy preview for `unify-supabase`,
   or run locally): load `?biz=demo-salon`, confirm services render,
   make a test booking, confirm it lands in unified `public.bookings`.
5. **Go live:** merge `unify-supabase` → `main`. Netlify deploys; the
   live page is now on the unified project.
6. **Verify** a real client URL works, then decommission the old project.

## After cutover — Lead Engine link

To wire a booking business to a prospect, set
`public.businesses.prospect_id` (and matching `slug`). Then
`streamline_hq.prospect_engagement` shows bookings per prospect, ready
for Workflow F (booking → hot follow-up) — that workflow is n8n work,
separate from this repo.
