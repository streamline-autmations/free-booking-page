# Supabase Migration — Complete Setup Guide

## Overview
This migration moves the booking system from localStorage to Supabase for centralized data management, real-time availability checking, and multi-client support.

## Project Structure
```
booking-page/
├── index.html                    # Main booking page (Supabase-enabled)
├── admin.html                    # Admin panel
├── explainer.html                # Printable guide
├── booking-workflow.json         # n8n workflow
├── .env                          # Environment variables
├── .gitignore
├── add-client.sql                # SQL template for new businesses
├── netlify.toml                  # Netlify configuration
├── SUPABASE_SETUP.md            # Original setup guide
├── QUICK_REFERENCE.md           # Quick command reference
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       └── booking-webhook/
│           └── index.ts
└── netlify/
    └── functions/
        ├── admin-auth.js         # PIN verification
        ├── admin-save.js         # Save services/hours
        └── admin-block.js        # Block/unblock slots
```

## Environment Variables (.env)
```bash
# Supabase URL
SUPABASE_URL=https://ighqgqyzlkhmspflbzsh.supabase.co

# Anon key (safe to expose in client-side code)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnaHFncXl6bGtobXNwZmxienNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzg5NzksImV4cCI6MjA5MjkxNDk3OX0.PZdDy9CUCJYqxSUuLFjoWBgNjVnpCYw0LtXPTEwuIK8

# Service role key (KEEP SECRET - only used in Netlify Functions)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMzODk3OSwiZXhwIjoyMDkyOTE0OTc5fQ.hGZV1l3C-tWAQmR1QybxEUVgLfONLnjsdrJ1nSBsBWA

# Optional: For local development
SUPABASE_API_URL=http://localhost:54321
```

## Database Schema

### Tables
- **businesses** — Business configuration
- **services** — Service offerings per business
- **blocked_slots** — Blocked dates/times
- **bookings** — Customer bookings

### RLS Policies
- Public SELECT access on all tables (for reading)
- No direct INSERT/UPDATE/DELETE for `anon` role
- All writes go through Netlify Functions using service role key

## Deploy Steps

### 1. Deploy to Supabase
```bash
# Login to Supabase
supabase login

# Link to your project (get REF from Supabase dashboard)
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push

# Or run the SQL manually in SQL Editor
# Copy content from supabase/migrations/001_initial_schema.sql
```

### 2. Verify Supabase Setup
```bash
# Check connection
supabase status

# View tables in web dashboard
# https://supabase.com/dashboard/project/YOUR_REF/database
```

### 3. Deploy Netlify Functions
```bash
# Deploy to Netlify (connect your repo)
# Netlify will auto-detect netlify.toml

# Or deploy manually
npm install -g netlify-cli
ntl deploy --prod
```

### 4. Set Netlify Environment Variables
In Netlify Dashboard → Site Settings → Environment Variables:
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Adding New Clients

### Method 1: SQL (Recommended)
1. Open Supabase SQL Editor
2. Run `add-client.sql` with your values
3. Done!

### Method 2: Admin Panel (After Initial Setup)
1. Visit `/?biz=demo-salon`
2. Login with PIN `1234`
3. Add services and configure hours
4. Changes save directly to Supabase

### Method 3: Manual SQL Insert
```sql
INSERT INTO businesses (id, name, tagline, accent_color, accent_dark, 
  owner_email, admin_pin_hash, webhook_url, working_days, working_hours)
VALUES (
  'my-salon',
  'My Salon',
  'Best salon in town',
  '#7B3FE4',
  '#5b21b6',
  'me@mysalon.com',
  encode(digest('1234', 'sha256'), 'hex'),
  '',
  '[1,2,3,4,5]',
  '{"start":9,"end":18}'
);

INSERT INTO services (business_id, name, duration, price, sort_order) VALUES
  ('my-salon', 'Cut & Style', 45, '$50', 1);
```

## Testing

### Test Business
URL: `https://your-domain.com/?biz=demo-salon`
PIN: `1234`

### Admin Panel
URL: `https://your-domain.com/admin?biz=demo-salon`
PIN: `1234`

### Test Booking Flow
1. Visit booking page
2. Select a service
3. Pick a date/time
4. Fill in details
5. Submit
6. Check Supabase dashboard → bookings table

## Verification Commands

```bash
# Check Supabase connection
supabase db shell
> SELECT * FROM businesses;

# Check bookings
supabase db shell
> SELECT * FROM bookings ORDER BY created_at DESC;

# Check blocked slots
supabase db shell
> SELECT * FROM blocked_slots;

# Check services
supabase db shell
> SELECT * FROM services;
```

## Architecture

### Data Flow
```
Client (Browser)
  ↓ HTTPS (Anon key)
Supabase (Read: businesses, services, blocked_slots, bookings)
  ↑ HTTPS (Service role key)
Netlify Functions (Write: admin operations)
```

### Security Model
1. **Client-side** (index.html):
   - Uses `SUPABASE_ANON_KEY` (safe to expose)
   - Can only READ data
   - Cannot directly write to database

2. **Server-side** (Netlify Functions):
   - Uses `SUPABASE_SERVICE_ROLE_KEY` (kept secret)
   - Has full read/write access
   - Validates PIN before allowing writes

3. **Database**:
   - RLS policies enforce access control
   - All writes go through service role

## Troubleshooting

### Issue: "Business not found"
- Check URL has correct `?biz=business-id`
- Verify business exists in `businesses` table
- Check `businesses.id` matches URL param

### Issue: "No times available"
- Check `services` table has entries for this business
- Check `blocked_slots` for date being blocked
- Check `bookings` for existing bookings filling slots
- Verify `working_hours` and `slot_interval` in business config

### Issue: "Unauthorized" in admin
- Verify PIN matches (check encoded in `admin_pin_hash`)
- Try: `SELECT encode(digest('1234', 'sha256'), 'hex')`

### Issue: Webhook not firing
- Check `businesses.webhook_url` is set
- Verify n8n endpoint is accessible
- Check browser console for errors

### Issue: Netlify functions error
- Check env vars are set in Netlify
- Verify `SUPABASE_SERVICE_KEY` is correct
- Check function logs in Netlify dashboard

## Production Checklist

- [ ] Supabase migrations applied
- [ ] Business records created
- [ ] Services configured per business
- [ ] Netlify deployed with env vars
- [ ] Test booking completed
- [ ] Admin login tested
- [ ] Webhook endpoint verified
- [ ] Custom domain configured (if needed)
- [ ] SSL certificate active
- [ ] Backup strategy in place

## Maintenance

### Daily
- Check for new bookings
- Monitor failed webhooks

### Weekly
- Review blocked slots
- Analyze booking patterns

### Monthly
- Database backup (use Supabase backups)
- Review and archive old bookings

## Support

For issues:
1. Check browser console for JavaScript errors
2. Check network tab for failed requests
3. Verify all environment variables
4. Check Supabase logs in dashboard
5. Verify Netlify function logs

## Security Notes

- Never commit `.env` to version control
- Keep service role key secret
- Use HTTPS in production
- Regularly rotate PIN codes
- Monitor failed login attempts
- Implement rate limiting on functions (future enhancement)
