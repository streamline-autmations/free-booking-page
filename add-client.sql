-- add-client.sql
-- Run this in Supabase SQL Editor for each new salon
-- Replace all CAPS values with actual data

-- Add new business
INSERT INTO businesses (id, name, tagline, accent_color, accent_dark, owner_email, phone, admin_pin_hash, webhook_url, working_days, working_hours, slot_interval, advance_days)
VALUES (
  'BUSINESS-ID-HYPHENATED',  -- e.g., 'true-reflection-nails'
  'BUSINESS NAME',            -- e.g., 'True Reflection Nails'
  'TAGLINE',                  -- e.g., 'Professional nail care in Sandton'
  '#ACCENT_COLOR_HEX',        -- e.g., '#c084fc'
  '#ACCENT_DARK_HEX',         -- e.g., '#9333ea'
  'OWNER@EMAIL.COM',          -- e.g., 'owner@salon.co.za'
  'PHONE NUMBER',             -- e.g., '+27 71 234 5678'
  encode(digest('4DIGIT_PIN', 'sha256'), 'hex'),  -- e.g., '1234'
  'YOUR_N8N_WEBHOOK_URL',     -- e.g., 'https://webhook.site/xxx...' or ''
  '[1,2,3,4,5,6]',            -- working days (0=Sun, 1=Mon, etc.)
  '{"start":8,"end":17}',     -- working hours
  30,                         -- slot interval in minutes
  30                          -- advance booking days
);

-- Add services for this business
INSERT INTO services (business_id, name, duration, price, sort_order) VALUES
  ('BUSINESS-ID-HYPHENATED', 'SERVICE 1', 60, 'RPRICE', 1),
  ('BUSINESS-ID-HYPHENATED', 'SERVICE 2', 90, 'RPRICE', 2),
  ('BUSINESS-ID-HYPHENATED', 'SERVICE 3', 30, 'RPRICE', 3);

-- After running, the salon can be accessed at:
-- Booking: https://your-domain.com/?biz=BUSINESS-ID-HYPHENATED
-- Admin:   https://your-domain.com/admin?biz=BUSINESS-ID-HYPHENATED
-- PIN:     4DIGIT_PIN (from admin_pin_hash above)