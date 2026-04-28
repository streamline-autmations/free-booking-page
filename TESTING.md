# Test Script for Supabase Connection

## Quick Test

This script tests the Supabase connection and database setup.

### Test 1: Verify Supabase CLI Installation
```bash
supabase --version
# Expected: supabase-cli/2.78.1
```

### Test 2: Check Connection to Supabase
```bash
# Get connection string
supabase connection string
# Expected: postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB]
```

### Test 3: Verify Tables Exist
```bash
supabase db shell

-- In the shell, run:
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: businesses, services, blocked_slots, bookings
```

### Test 4: Check Demo Business
```bash
supabase db shell

SELECT * FROM businesses WHERE id = 'demo-salon';
-- Expected: 1 row with demo-salon data

SELECT * FROM services WHERE business_id = 'demo-salon';
-- Expected: 3 rows with services
```

### Test 5: Verify RLS Policies
```bash
supabase db shell

-- Check policies exist
SELECT schemaname, tablename, policyname, permissive 
FROM pg_policies 
WHERE schemaname = 'public';
-- Expected: Policies listed for all tables
```

### Test 6: Test Anonymous Read Access
```bash
# Use psql with anon key
psql "postgresql://[HOST]:[PORT]/[DB]?sslmode=require"

-- Should be able to SELECT
SELECT * FROM businesses LIMIT 1;
-- Expected: Returns data

-- Should NOT be able to INSERT
INSERT INTO businesses (id, name) VALUES ('test', 'Test');
-- Expected: Permission denied error
```

### Test 7: Test Webhook Endpoint
```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/booking-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-salon",
    "businessName": "Demo Salon",
    "ownerEmail": "test@example.com",
    "customer": {
      "name": "Test User",
      "email": "test@example.com",
      "phone": "1234567890",
      "note": "Test booking"
    },
    "booking": {
      "service": "Test Service",
      "serviceId": "test-service",
      "duration": 60,
      "price": "$50",
      "date": "2026-04-29",
      "time": "10:00",
      "dateFormatted": "Thursday, 29 April 2026",
      "timeFormatted": "10:00 AM"
    },
    "submittedAt": "2026-04-28T10:00:00Z"
  }'
# Expected: {"success": true, "data": {...}}
# Check bookings table: SELECT * FROM bookings;
```

### Test 8: Test Netlify Functions (If Deployed)
```bash
# Test admin-auth function
curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/admin-auth \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-salon", "pin": "1234"}'
# Expected: {"token": "...", "businessId": "demo-salon"}

# Test admin-save function
curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/admin-save \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-salon",
    "type": "services",
    "data": {"services": []},
    "token": "your-token-here"
  }'
# Expected: {"success": true}
```

### Test 9: Test Browser Page

1. Open browser: `https://your-domain.com/?biz=demo-salon`
2. Verify page loads
3. Check services display
4. Try to book
5. Verify booking appears in dashboard

### Test 10: Check Database After Test Booking
```bash
supabase db shell

SELECT * FROM bookings ORDER BY created_at DESC LIMIT 5;
-- Expected: Your test booking appears
```

## Troubleshooting

If any test fails:

1. **Check environment variables**
   ```bash
   cat .env
   # Verify all values are correct
   ```

2. **Check Supabase project status**
   ```bash
   supabase status
   ```

3. **Check migration status**
   ```bash
   supabase db diff
   ```

4. **Redeploy migrations**
   ```bash
   supabase db reset
   supabase db push
   ```

## Success Criteria

All tests pass ✓
- [ ] Supabase CLI works
- [ ] Connection established
- [ ] Tables created
- [ ] Demo data present
- [ ] RLS policies active
- [ ] Anonymous SELECT works
- [ ] Anonymous INSERT denied
- [ ] Webhook endpoint responds
- [ ] Netlify functions work
- [ ] Browser page loads
- [ ] Booking saves to DB
