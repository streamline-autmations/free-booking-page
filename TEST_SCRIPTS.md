# 🚀 SUPABASE DRY RUN TEST - ONE-CLICK GUIDE

## What This Does
Tests the complete Supabase booking system locally before deploying to production.

## Prerequisites
- [ ] Docker Desktop installed and running
- [ ] Supabase CLI installed (`supabase --version` = 2.78.1)
- [ ] Node.js/Python for local web server

---

## ⚡ QUICK START (Copy-Paste)

Open PowerShell as Administrator and run:

```powershell
# 1. Navigate to project
cd C:\Users\User\booking-page

# 2. Start local Supabase (takes 1-2 minutes)
supabase start

# 3. Apply database schema
supabase db push

# 4. Start web server (in new PowerShell window)
python -m http.server 8080

# 5. Open browser to:
#    http://localhost:8080/?biz=style-studio
```

---

## 📋 STEP-BY-STEP DETAILED GUIDE

### Step 1: Verify Environment ✅
```powershell
supabase --version
# Should show: 2.78.1

docker --version  
# Should show: Docker 29.x.x
```

**If Docker not running:**
1. Open Docker Desktop
2. Wait for whale icon to appear in system tray
3. Ensure it says "Docker Desktop is running"

---

### Step 2: Start Local Supabase 🐳
```powershell
cd C:\Users\User\booking-page
supabase start
```

**Expected Output:**
```
Starting Docker containers...
  ✓ Database started (PostgreSQL 15)
  ✓ Studio started (http://localhost:54321)
  ✓ API started (http://localhost:54321)
```

**Time:** 1-2 minutes first time

**⚠️ Troubleshooting:**
- If fails: `supabase stop` then `supabase start` again
- Check Docker: Settings → Resources → Memory ≥ 4GB

---

### Step 3: Apply Database Schema 🗄️
```powershell
supabase db push
```

**Expected Output:**
```
Finished supabase/migrations/001_initial_schema.sql
```

**What was created:**
- ✅ `businesses` table
- ✅ `services` table  
- ✅ `blocked_slots` table
- ✅ `bookings` table
- ✅ Row Level Security (RLS) policies
- ✅ Demo business: `demo-salon`
- ✅ Demo services: Gel Manicure, Acrylic Set, Gel Pedicure

---

### Step 4: Verify Database in Studio 🔍

Open browser: **http://localhost:54321/studio**

Login with credentials (shown in `supabase start` output)

**Check businesses:**
```sql
SELECT * FROM businesses;
```
Should see `demo-salon` row

**Check services:**
```sql
SELECT * FROM services;
```
Should see 3 services for demo-salon

---

### Step 5: Create Your Test Business "Style Studio" ✂️

In Supabase Studio SQL Editor, run:

```sql
-- Add Style Studio
INSERT INTO businesses (
  id, name, tagline, accent_color, accent_dark, 
  owner_email, phone, admin_pin_hash, webhook_url,
  working_days, working_hours, slot_interval, advance_days
)
VALUES (
  'style-studio',
  'Style Studio Hair Salon',
  'Premium haircuts & styling',
  '#d8b4fe',
  '#7c3aed',
  'owner@stylestudio.com',
  '+1234567890',
  encode(digest('2468', 'sha256'), 'hex'),
  '',
  '[1,2,3,4,5,6]',
  '{"start":9,"end":19}',
  30,
  30
);

-- Add services
INSERT INTO services (business_id, name, duration, price, sort_order) VALUES
  ('style-studio', 'Men''s Haircut', 30, '$45', 1),
  ('style-studio', 'Women''s Cut & Style', 90, '$120', 2),
  ('style-studio', 'Color Treatment', 120, '$200', 3),
  ('style-studio', 'Deep Conditioning', 45, '$60', 4),
  ('style-studio', 'Hair & Beard Combo', 45, '$70', 5);
```

**Verify it worked:**
```sql
SELECT * FROM businesses WHERE id = 'style-studio';
SELECT * FROM services WHERE business_id = 'style-studio';
```
Should see 1 business + 5 services

---

### Step 6: Start Web Server 🌐

Open **new PowerShell window**:

```powershell
cd C:\Users\User\booking-page
python -m http.server 8080
```

**Expected Output:**
```
Serving HTTP on 0.0.0.0 port 8080...
```

**Leave this running!** (Open new window for next steps)

---

### Step 7: Test Booking Flow 🎯

Open browser: **http://localhost:8080/?biz=style-studio**

#### Test 1: Page Loads ✅
- [ ] Business name: "Style Studio Hair Salon"
- [ ] Tagline: "Premium haircuts & styling"
- [ ] Purple accent color (#d8b4fe)
- [ ] 5 services displayed

#### Test 2: Select Service ✅
1. Click **"Men's Haircut"** ($45, 30 min)
2. Should auto-advance to Step 2
3. Title: "Select a date"

#### Test 3: Pick Date ✅
1. Available dates shown (today + 30 days)
2. Click today or tomorrow
3. Time slots appear below

#### Test 4: Pick Time ✅
1. Available times shown (9:00 AM onwards)
2. Click **9:00 AM**
3. Continue button appears
4. Click **Continue →**

#### Test 5: Fill Details ✅
Fill in form:
- Name: `Test User`
- Email: `test@example.com`
- Phone: `555-123-4567`
- Note: `Test booking - please confirm`

#### Test 6: Submit Booking ✅
1. Click **Confirm Booking Request →**
2. Button shows loading spinner
3. Success page appears with checkmark ✓
4. Message: "Thanks Test User! We've received your request..."

---

### Step 8: Verify in Database 🔍

In Supabase Studio SQL Editor:

```sql
-- Check bookings
SELECT * FROM bookings 
WHERE business_id = 'style-studio'
ORDER BY created_at DESC;
```

**Should see:**
```
service_name    | customer_name | booking_date | booking_time | status
----------------|---------------|--------------|--------------|--------
Men's Haircut   | Test User     | 2026-04-28   | 09:00        | pending
```

```sql
-- Check all data counts
SELECT 'businesses' as t, count(*) as c FROM businesses
UNION ALL
SELECT 'services', count(*) FROM services
UNION ALL 
SELECT 'bookings', count(*) FROM bookings;
```

---

### Step 9: Test Demo Business (Sanity Check) ✅

Open: **http://localhost:8080/?biz=demo-salon**

Should see:
- [ ] "Demo Salon" (not Style Studio)
- [ ] Purple accent (different shade)
- [ ] 3 nail services
- [ ] Can book successfully

---

## 🔍 TROUBLESHOOTING

### Problem: "Docker is not running"
**Solution:**
1. Open Docker Desktop
2. Wait for whale icon (system tray)
3. Click "Start" if stopped
4. Run `supabase start` again

---

### Problem: "Port already in use"
**Solution:**
```powershell
# Stop existing Supabase
supabase stop

# Start on different ports
supabase start --db-port 54322 --api-port 54323 --studio-port 54324
```

---

### Problem: "Business not found"
**Solution:**
Check URL has correct `?biz=` parameter:
- ✅ Correct: `?biz=style-studio`
- ❌ Wrong: `?biz=Style Studio` (no spaces)

---

### Problem: "No times available"
**Possible reasons:**
1. Service duration too long for time slots
2. All slots already booked
3. Date fully blocked

**Fix:** Try different date or service

---

### Problem: "Cannot connect to database"
**Solution:**
```powershell
# Reset everything
supabase db reset
supabase db push

# Restart
supabase stop
supabase start
```

---

## 🧪 ADVANCED TESTS

### Test A: Double-Booking Prevention
1. Book Men's Haircut for 9:00 AM
2. Refresh page
3. Try to book 9:00 AM again
4. **Expected:** Slot unavailable or error

### Test B: Admin PIN Verification
1. Open: `http://localhost:8080/admin?biz=style-studio`
2. Enter PIN: `2468`
3. **Expected:** Admin panel loads

**Wrong PIN:**
1. Enter PIN: `9999`
2. **Expected:** "Incorrect PIN" error

### Test C: Blocked Slots

In SQL Editor, block a slot:
```sql
INSERT INTO blocked_slots (business_id, date, type, time)
VALUES ('style-studio', '2026-04-29', 'slot', '09:00');
```

Refresh booking page, select 2026-04-29:
- **Expected:** 9:00 AM not available

---

## 📊 FINAL VERIFICATION

Run this checklist:

- [ ] Local Supabase started
- [ ] Database schema applied (`supabase db push`)
- [ ] Style Studio business created via SQL
- [ ] 5 services visible on booking page
- [ ] Can select date
- [ ] Can select time
- [ ] Can submit booking
- [ ] Booking appears in database
- [ ] Demo-salon still works

**If all ✅: SYSTEM READY FOR PRODUCTION!** 🎉

---

## 🚀 NEXT STEPS

### Deploy to Production:
```powershell
# 1. Link to Supabase
supabase login
supabase link --project-ref YOUR_REF

# 2. Push database
supabase db push

# 3. Deploy Netlify
git push origin main
# Netlify auto-deploys

# 4. Set environment variables
# Netlify Dashboard → Settings → Environment Variables
```

### Add More Businesses:
Edit `add-client.sql` with your data, run in SQL Editor

---

## 🎯 QUICK REFERENCE

```powershell
# Start local
docker start           # Start Docker
supabase start         # Start Supabase
python -m http.server 8080  # Web server

# Access
http://localhost:8080/?biz=style-studio
http://localhost:8080/admin?biz=style-studio
http://localhost:54321/studio  # Database

# Stop
supabase stop          # Stop Supabase
# Ctrl+C               # Stop web server
```

---

## 📄 FILES MODIFIED

- ✅ `supabase/migrations/001_initial_schema.sql` - Database schema
- ✅ `supabase/functions/booking-webhook/index.ts` - Webhook handler
- ✅ `netlify/functions/admin-auth.js` - Admin auth
- ✅ `netlify/functions/admin-save.js` - Save config
- ✅ `netlify/functions/admin-block.js` - Block slots
- ✅ `netlify.toml` - Netlify config
- ✅ `index.html` - Frontend with Supabase integration
- ✅ `.env` - Environment config
- ✅ `add-client.sql` - Add new business template

---

## ❓ NEED HELP?

Check these files:
- `DEPLOYMENT.md` - Full deployment guide
- `TESTING.md` - Testing instructions
- `SUPABASE_CONNECTION_SUMMARY.md` - Implementation overview

Or run:
```powershell
supabase --help
```

---

**Good luck with your dry run! 🎉**

When you're ready to go live, just deploy to Supabase + Netlify!
