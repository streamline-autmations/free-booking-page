-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- BUSINESSES table
CREATE TABLE businesses (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tagline         TEXT,
  accent_color    TEXT DEFAULT '#7B3FE4',
  accent_dark     TEXT DEFAULT '#5b21b6',
  logo_url        TEXT,
  owner_email     TEXT NOT NULL,
  phone           TEXT,
  admin_pin_hash  TEXT NOT NULL,
  webhook_url     TEXT,
  working_days    JSONB DEFAULT '[1,2,3,4,5,6]',
  working_hours   JSONB DEFAULT '{"start":8,"end":17}',
  slot_interval   INT DEFAULT 30,
  advance_days    INT DEFAULT 30,
  same_day        BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICES table
CREATE TABLE services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  duration    INT NOT NULL,
  price       TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BLOCKED SLOTS table
CREATE TABLE blocked_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('day', 'slot')),
  time        TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BOOKINGS table
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     TEXT REFERENCES businesses(id),
  service_name    TEXT NOT NULL,
  service_id      TEXT,
  booking_date    DATE NOT NULL,
  booking_time    TEXT NOT NULL,
  duration        INT,
  price           TEXT,
  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  customer_note   TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS POLICIES

-- Enable RLS on all tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can read businesses (for loading the page config)
CREATE POLICY "Public read businesses"
  ON businesses FOR SELECT
  TO anon
  USING (true);

-- Anyone can read services
CREATE POLICY "Public read services"
  ON services FOR SELECT
  TO anon
  USING (true);

-- Anyone can read blocked slots
CREATE POLICY "Public read blocked slots"
  ON blocked_slots FOR SELECT
  TO anon
  USING (true);

-- Anyone can read bookings for a business (for checking availability)
CREATE POLICY "Public read bookings"
  ON bookings FOR SELECT
  TO anon
  USING (true);

-- No direct write access for anon - all writes through service role

-- INSERT a demo business to test with
INSERT INTO businesses (id, name, tagline, accent_color, accent_dark, owner_email, admin_pin_hash, webhook_url, working_days, working_hours, slot_interval, advance_days)
VALUES (
  'demo-salon',
  'Demo Salon',
  'Your tagline here',
  '#c084fc',
  '#9333ea',
  'your-email@example.com',
  encode(digest('1234', 'sha256'), 'hex'),
  '',
  '[1,2,3,4,5,6]',
  '{"start":8,"end":17}',
  30,
  30
);

INSERT INTO services (business_id, name, duration, price, sort_order) VALUES
  ('demo-salon', 'Gel Manicure', 60, 'R280', 1),
  ('demo-salon', 'Acrylic Full Set', 90, 'R420', 2),
  ('demo-salon', 'Gel Pedicure', 75, 'R320', 3);