-- 008_booking_reminders.sql
--
-- "Cut down no-shows" has been an option in the signup wizard's goal step
-- since it was built (api/_niche-catalog.js GOALS), with copy promising a
-- confirmation email keeps people showing up. But there was never any actual
-- reminder mechanism — just the one confirmation email sent at booking time,
-- days or weeks before the appointment. This column backs that promise with
-- a real feature: api/send-reminders.js (run daily via Vercel Cron) emails
-- customers the day before their appointment.
--
-- Same idempotency pattern as bookings.email_sent_at: null until sent, set
-- once, checked before sending again so a retried/duplicate cron run can
-- never double-email someone.

alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

comment on column public.bookings.reminder_sent_at is
  'Set once api/send-reminders.js successfully emails this customer their day-before reminder. Null = not yet sent (or not yet due).';

-- Rollback:
--   alter table public.bookings drop column if exists reminder_sent_at;
