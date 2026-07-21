-- 007_lock_down_bookings.sql
--
-- The public booking form (index.html) inserts directly into `bookings` using
-- the anon key. 001_initial_schema.sql's own comment says "No direct write
-- access for anon - all writes through service role" — but a live probe
-- against production just proved anon CAN insert, with zero rate-limiting,
-- honeypot, or validation. Confirmed exploitable:
--
--   - Anyone can script-flood any tenant's calendar with fake bookings and
--     make every slot look taken, using nothing but the public anon key that
--     ships in every page's HTML.
--   - customer_email is fully attacker-controlled, and
--     api/send-booking-emails.js mails a "Booking confirmed" to whatever
--     address is submitted — a harassment vector against arbitrary third
--     parties, sent through Streamline's own Brevo account.
--   - No unique constraint stops two bookings landing on the exact same
--     slot; a live probe inserted the same business/date/time twice with no
--     error.
--
-- Like create_tenant() before it (005_drop_legacy_create_tenant_overload.sql),
-- this table's live policies have drifted from what 001 describes — some
-- undocumented change (outside this repo's migration history) granted anon
-- INSERT. Rather than guess the policy's name, this finds and drops whatever
-- INSERT policies currently exist on `bookings`, then revokes the INSERT
-- grant outright. All booking creation now goes through
-- api/create-booking.js (service role, honeypot, rate-limited, server-side
-- price/duration/availability validation) instead of a direct client insert.

-- 1) Drop every existing INSERT policy on bookings, whatever it's named.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookings' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.bookings', pol.policyname);
  end loop;
end $$;

-- 2) Revoke the grant itself — belt and suspenders. service_role bypasses
--    RLS and already has full access; it needs nothing granted explicitly.
revoke insert on public.bookings from anon, authenticated;

-- 3) Stop two bookings landing on the same business/date/time/stylist.
--    coalesce() on stylist_id because a plain UNIQUE index treats every NULL
--    as distinct from every other NULL — without it, two single-provider
--    businesses (no stylist assigned) could still double-book a slot.
--    Cancelled bookings are excluded so a cancelled slot can be rebooked.
create unique index if not exists bookings_slot_unique
  on public.bookings (business_id, booking_date, booking_time, coalesce(stylist_id::text, ''))
  where status <> 'cancelled';

-- Rollback:
--   drop index if exists public.bookings_slot_unique;
--   grant insert on public.bookings to anon; -- NOT recommended — this is the hole we just closed
