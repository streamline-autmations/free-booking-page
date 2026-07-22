# Premium roadmap — brainstorm

Ideas for what else could justify a premium upgrade, grounded in what comparable
booking tools (Fresha, Setmore, Square Appointments) already charge for, plus one
pricing inconsistency this pass turned up that's worth a look.

## ⚠️ Found while doing this pass: check "Multiple staff calendars"

`admin.html`'s `LOCKED_FEATURES` lists **"Multiple staff calendars"** as a paid
Client Magnet feature (R12,000 + R1,199/mo) — but the stylist feature
(`stylist_add`/`stylist_update`/`stylist_delete`/`stylist_reorder` in
`api/admin-save.js`) is **fully free today**, no premium check anywhere in that
code path. `giggles-n-kurls-bryanston` (a real tenant) already has three
stylists set up on the free plan. Either the marketing copy is stale, or the
feature was meant to be gated and never was — worth deciding which, since right
now the sales copy promises something for money that's already free.

## What free already does better than the competition

Worth knowing before deciding what to charge for — these are usually paywalled
elsewhere and aren't here:

- **Multi-staff calendars** — free (see the inconsistency above). Fresha/Square
  typically charge per seat/location for this.
- **Automated no-show reminder emails** — free (built this session). SMS
  reminders are the natural premium tier *above* this, not a replacement for it.
- **A real self-serve PIN recovery flow** — most small-tool competitors in this
  price bracket don't bother with this at all; it's usually "email support."

## Ideas grounded in what Fresha/Setmore/Square actually gate

- **Deposits / prepayment before booking.** The single most requested feature
  in this category — kills no-shows better than any reminder can, and is
  something owners are used to paying for elsewhere. Already listed as a
  headline premium feature; worth prioritizing first.
- **SMS reminders.** Real per-message cost makes this a clean, defensible
  premium gate — unlike the free email reminders, this one can't just be given
  away.
- **Customer database / repeat-client recognition.** "This person has booked
  4 times, last time was 6 weeks ago" — rebook nudges, birthday offers.
  Fresha/Square both treat this as a core paid CRM feature.
- **Waitlist for full slots.** When a day is fully booked, let a customer join
  a waitlist and get notified on a cancellation — increases bookings without
  the owner doing anything.
- **Package deals / gift vouchers.** Prepaid bundles ("5 sessions for the price
  of 4") and giftable vouchers — both come up constantly in this business
  category (salons, trainers) and neither exists today.
- **Instagram feed embed on the booking page.** Setmore does this; low effort,
  makes the free page feel more like "their whole online presence" rather than
  just a form.
- **Custom domain / white-label.** Already on the list — standard premium
  lever across every competitor in this space.
- **Analytics dashboard.** Already on the list — busiest times, revenue,
  repeat-client rate. The admin "last 30 days" stat added this session is a
  small free taste of this; a full dashboard is the natural upsell above it.

## Not investigated here

Actual payment collection (deposits, packages, vouchers) needs a real payment
processor decision (Stripe / PayFast / Yoco / Paystack) — bigger scope than a
brainstorm pass, flagged as its own future decision rather than assumed here.
