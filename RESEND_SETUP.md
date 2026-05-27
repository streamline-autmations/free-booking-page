# Resend setup — booking confirmation emails

The `/api/send-booking-emails` function is built and called automatically
after every successful booking insert. It will **silently no-op** until
the three env vars below are set in Vercel, then start sending.

## One-time setup (≈ 10 min, mostly waiting for DNS)

1. **Create a Resend account** at https://resend.com — free tier covers
   100 emails/day, 3000/month. Use the same email you want to manage
   sending from.

2. **Add and verify the sending domain** `streamline-automations.agency`
   - Resend → Domains → Add Domain
   - Resend gives you 3 DNS records (one TXT for SPF, one CNAME for DKIM,
     one TXT for DMARC). Paste them in your domain registrar's DNS
     settings (where you bought streamline-automations.agency).
   - Click **Verify**. Can take 1–60 min for DNS to propagate.
   - **Until verified**, you can still test by sending only to the email
     address that owns the Resend account (the sandbox restriction).

3. **Create an API key** → Resend → API Keys → Create → name it
   "booking-page production". Copy the value (starts with `re_…`).

4. **Add three env vars to Vercel** (Settings → Environment Variables,
   set all three for Production AND Preview):

   | Name              | Value                                                                        |
   |-------------------|------------------------------------------------------------------------------|
   | `RESEND_API_KEY`  | the `re_…` value from step 3                                                 |
   | `RESEND_FROM`     | `Streamline Bookings <bookings@streamline-automations.agency>`               |
   | `PUBLIC_BASE_URL` | `https://booking-page-beta.vercel.app` (or your custom domain once it's set) |

5. **Redeploy** (Vercel → Deployments → latest → ⋯ → Redeploy).

## Verify

Make a test booking on the Bardot page with your own email as the
customer email. You should receive two emails (one as customer, one
as owner since Bardot.owner_email is your gmail).

Server response while testing:
```bash
curl -X POST https://booking-page-beta.vercel.app/api/send-booking-emails \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<a real booking uuid>"}'
```
Expected: `{"sent":2,"ok":true,...}` when fully set up, or
`{"skipped":true,"reason":"RESEND_API_KEY not set"}` until then.

## Sandbox mode (before domain is verified)

If you want to test before DNS verifies, set:
- `RESEND_FROM` = `Streamline <onboarding@resend.dev>`

That uses Resend's own verified sandbox sender, but recipients are
restricted to the email that owns the Resend account.
