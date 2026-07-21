-- add-client.sql
-- Run this in the Supabase SQL Editor to onboard a new salon by hand.
-- Replace all CAPS values. (Workflow B2 does the same thing automatically.)
-- After this runs the tenant's page is immediately usable: a real SA service
-- menu is seeded and slot logic (30-min granularity, Mon–Sat 8–17) is set.

-- 1) Create the business with sane day-one defaults.
INSERT INTO public.businesses (
  id, name, tagline, accent_color, accent_dark, owner_email, phone,
  admin_pin_hash, webhook_url, working_days, working_hours, slot_interval,
  advance_days, same_day
)
VALUES (
  'BUSINESS-ID-HYPHENATED',   -- e.g. 'true-reflection-nails'  (this is the ?biz= slug)
  'BUSINESS NAME',            -- e.g. 'True Reflection Nails'
  'TAGLINE',                  -- e.g. 'Professional nail care in Sandton'
  '#A8456B',                  -- accent (pick from the admin palette)
  '#8a3458',                  -- accent dark
  'OWNER@EMAIL.COM',          -- owner email (gets the new-booking notification)
  'PHONE NUMBER',             -- e.g. '+27 71 234 5678'
  encode(digest('4DIGIT_PIN', 'sha256'), 'hex'),  -- admin PIN, e.g. '1234'
  '',                         -- optional n8n webhook URL
  '[1,2,3,4,5,6]',            -- working days (0=Sun … 6=Sat) → Mon–Sat
  '{"start":8,"end":17}',     -- working hours
  30,                         -- 30-minute slot granularity
  30,                         -- advance booking window (days)
  true                        -- allow same-day bookings
);

-- 2) Seed the SA service presets for the salon's niche so the page is usable
--    the moment it's delivered. Niche is one of:
--    'nails' | 'lashes' | 'hair' | 'brows' | 'spa' | 'barber'
--    (see supabase/migrations/002_seed_service_presets.sql for the menus).
--    This manual path is unchanged and still only knows the 6 niches above.
--    The self-serve /start wizard has its own, larger catalog now (see
--    api/_niche-catalog.js + SELF_SERVE_SIGNUP.md) and always sends its own
--    edited service list straight to create_tenant() instead of calling
--    seed_service_presets() — so onboarding a business by hand in one of the
--    newer categories means inserting its services directly instead of
--    calling this function.
SELECT public.seed_service_presets('BUSINESS-ID-HYPHENATED', 'NICHE');

-- After running:
--   Booking: https://booking-page-beta.vercel.app/?biz=BUSINESS-ID-HYPHENATED
--   Admin:   https://booking-page-beta.vercel.app/admin?biz=BUSINESS-ID-HYPHENATED
--   PIN:     the 4DIGIT_PIN you hashed above
-- The owner can then rename/retune services in the admin Services tab.
