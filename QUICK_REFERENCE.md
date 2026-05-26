# Kilo CLI + Supabase Quick Reference

## Installation Verification ✅

```powershell
# Kilo CLI
kilo --help        # Show all commands
kilo version       # Check version
kilo models        # List available models

# Supabase CLI
supabase --version        # Check version (2.78.1)
supabase --help           # Show all commands
```

## Essential Commands

### Kilo CLI
```powershell
# Interactive TUI
kilo

# Run task with message
kilo run "add input validation to signup form"
kilo run "setup supabase webhook"

# Session management
kilo session list          # List all sessions
kilo session delete <id>   # Delete session
kilo export               # Export sessions

# Authentication & MCP
kilo auth                  # Manage AI providers
kilo mcp list              # List MCP servers
kilo mcp add               # Add MCP server
kilo mcp auth <name>       # OAuth authenticate

# Tools
kilo upgrade               # Update Kilo
kilo plugin <module>       # Install plugin
```

### Supabase CLI
```powershell
# Authentication
supabase login             # Login to Supabase
supabase logout            # Logout

# Project Management
supabase link --project-ref <REF>    # Link to project
supabase connection string           # Get connection string

# Local Development
supabase init              # Initialize project
supabase start             # Start local dev (needs Docker)
supabase stop              # Stop local dev
supabase reset             # Reset database

# Database
supabase db push           # Push schema changes
supabase db reset          # Reset to migrations
supabase db dump           # Dump database
supabase db restore        # Restore database
supabase db seed           # Seed database

# Functions (Edge Functions)
supabase functions list                # List functions
supabase functions deploy <name>       # Deploy function
supabase functions serve <name>        # Serve locally

# Storage
supabase storage ls         # List files
supabase storage cp         # Copy files

# Inspect
supabase inspect db rels    # Inspect relationships
supabase status             # Check status
```

## Project Setup (Step-by-Step)

```powershell
# 1. Initialize
supabase init

# 2. Start local development
supabase start             # Requires Docker

# 3. Create migrations
# Edit supabase/migrations/*.sql

# 4. Apply migrations
supabase db push           # For development
# OR
supabase db reset          # Reset + push

# 5. Deploy
supabase deploy            # Deploy all changes
```

## Environment Variables (.env)

```bash
# Required
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGc... (from project settings)

# Optional (for local development)
SUPABASE_API_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (for admin access)
```

## Common Workflows

### Deploy Webhook Function
```powershell
# Navigate to functions directory
cd supabase/functions/booking-webhook

# Deploy
supabase functions deploy booking-webhook
```

### Check Database
```powershell
# Start local studio
supabase studio

# Or use CLI
supabase db shell
```

### Reset Everything
```powershell
supabase stop
supabase db reset
supabase start
```

## Kilo MCP Setup

```powershell
# List MCP servers
kilo mcp list

# Add MCP server (if needed)
kilo mcp add

# Follow prompts:
# - Name: supabase
# - Command: supabase
# - Args: ["mcp", "serve"]
```

## Troubleshooting

### Issue: "Docker is not running"
```powershell
# Start Docker Desktop, then:
supabase start
```

### Issue: "Anonymous key is not authorized"
```powershell
# Check your .env file
# Verify SUPABASE_URL and SUPABASE_ANON_KEY
# Re-copy from Supabase Dashboard → Project → Settings → API
```

### Issue: Port already in use
```powershell
# Stop running instance
supabase stop

# Or use different ports
supabase start --no-browser --db-port 54322 --api-port 54323 --studio-port 54324
```

## File Structure

```
booking-page/
├── index.html              # Main booking page
├── admin.html              # Admin panel
├── explainer.html          # Printable guide
├── booking-workflow.json   # n8n workflow
├── SUPABASE_SETUP.md       # This setup guide
├── .env                    # Environment variables
└── supabase/
    ├── migrations/
    │   └── 001_initial_schema.sql
    └── functions/
        └── booking-webhook/
            ├── index.ts
            └── deno.json
```

## Links

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Kilo CLI Docs](https://kilo.ai/docs/cli/)
- [Database Best Practices](https://supabase.com/docs/guides/database)