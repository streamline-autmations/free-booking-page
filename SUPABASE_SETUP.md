# Supabase Setup Guide for Booking System

## Prerequisites Installed ✅

- **Kilo CLI**: `@kilocode/cli` installed globally
  - Run: `kilo` (interactive TUI) or `kilo run "message"`
  - Version: Check with `kilo --help`
  
- **Supabase CLI**: `supabase` installed via Scoop
  - Version: 2.78.1
  - Update: `scoop update supabase`

## Quick Start Commands

### 1. Initialize Supabase Project
```powershell
# Login to Supabase (opens browser)
supabase login

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Initialize local development
supabase init
```

### 2. Start Local Development
```powershell
# Start Supabase local development (requires Docker)
supabase start

# Run SQL migrations
supabase db reset
supabase db push
```

### 3. Kilo CLI Commands
```powershell
# Launch Kilo interactive TUI
kilo

# Run a specific task
kilo run "setup supabase integration"

# Check available models
kilo models

# Manage MCP servers
kilo mcp list
kilo mcp add
```

## Environment Variables

Create a `.env` file in your project root:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Optional, for admin access

# Optional: For local development
SUPABASE_API_URL=http://localhost:54321
```

## Database Schema (SQL)

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Bookings table
create table if not exists bookings (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  
  -- Business info
  business_id text not null,
  business_name text not null,
  
  -- Customer info
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  customer_note text,
  
  -- Booking info
  service_id text not null,
  service_name text not null,
  service_duration integer not null,
  service_price text not null,
  booking_date date not null,
  booking_time text not null,
  booking_date_formatted text not null,
  booking_time_formatted text not null,
  
  -- Status
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  confirmed_at timestamp with time zone,
  
  -- Metadata
  submitted_at timestamp with time zone not null
);

-- Indexes for performance
create index idx_bookings_business_id on bookings(business_id);
create index idx_bookings_customer_email on bookings(customer_email);
create index idx_bookings_date on bookings(booking_date);
create index idx_bookings_status on bookings(status);

-- Row Level Security (RLS)
alter table bookings enable row level security;

-- Public policies (adjust based on your needs)
create policy "Allow public inserts for booking requests"
  on bookings for insert
  with check (true);

create policy "Allow authenticated users to view bookings"
  on bookings for select
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users to update bookings"
  on bookings for update
  using (auth.role() = 'authenticated');
```

## Webhook Integration

### Update `index.html` Webhook URL

```javascript
const CONFIG = {
  // ... existing config ...
  webhookUrl: "https://your-project.supabase.co/functions/v1/booking-webhook",
  // or for local dev:
  // webhookUrl: "http://localhost:54321/functions/v1/booking-webhook",
};
```

### Create Edge Function for Webhook

Create `supabase/functions/booking-webhook/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const payload = await req.json();
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  // Insert booking into database
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      business_id: payload.businessId,
      business_name: payload.businessName,
      customer_name: payload.customer.name,
      customer_email: payload.customer.email,
      customer_phone: payload.customer.phone,
      customer_note: payload.customer.note || "",
      service_id: payload.booking.serviceId,
      service_name: payload.booking.service,
      service_duration: payload.booking.duration,
      service_price: payload.booking.price,
      booking_date: payload.booking.date,
      booking_time: payload.booking.time,
      booking_date_formatted: payload.booking.dateFormatted,
      booking_time_formatted: payload.booking.timeFormatted,
      submitted_at: payload.submittedAt,
    });
  
  if (error) {
    console.error("Error inserting booking:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Deploy the function:
```powershell
supabase functions deploy booking-webhook
```

## Admin Panel Database Queries

### Get All Bookings
```sql
select * from bookings order by booking_date desc, booking_time desc;
```

### Get Today's Bookings
```sql
select * from bookings 
where booking_date = current_date 
order by booking_time;
```

### Get Bookings by Status
```sql
select * from bookings 
where status = 'confirmed' 
order by booking_date, booking_time;
```

## VS Code Integration

1. **Install Kilo Extension**:
   - Open VS Code
   - Search for "Kilo" in Extensions
   - Install `Kilo AI` extension

2. **Connect to MCP**:
   - Open Command Palette (Ctrl+Shift+P)
   - Run: `Kilo: Configure MCP`
   - Add Supabase MCP server if available

3. **Use Kilo in VS Code**:
   - Right-click files → "Ask Kilo"
   - Use inline prompts with Ctrl+K
   - Generate code, refactor, debug

## Common Workflows

### Daily Operations
```powershell
# Check today's bookings
supabase db shell
> select * from bookings where booking_date = current_date;

# Update booking status
supabase db shell
> update bookings set status = 'confirmed' where id = '...';
```

### Development
```powershell
# Reset local database
supabase db reset

# Push schema changes
supabase db push

# Start local studio
supabase studio
```

### Deployment
```powershell
# Deploy all changes
supabase deploy

# Deploy specific function
supabase functions deploy booking-webhook
```

## Troubleshooting

### Docker Issues
- Ensure Docker Desktop is running
- Check Docker settings: Expose daemon on tcp://localhost:2375
- Restart Docker if `supabase start` fails

### Authentication Issues
- Run `supabase login` again
- Check project reference with `supabase link --project-ref YOUR_REF`

### Network Issues
- Verify Supabase URL in `.env`
- Check CORS settings in Supabase Dashboard
- Ensure webhook URL is accessible

## Resources

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli/getting-started)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Database Best Practices](https://supabase.com/docs/guides/database)
- [Kilo CLI Documentation](https://kilo.ai/docs/cli/)