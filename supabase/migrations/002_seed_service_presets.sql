-- 002_seed_service_presets.sql
-- Day-one usefulness: a reusable seeder so every brand-new tenant lands with a
-- usable SA service menu and correct slot logic the moment its page is delivered.
--
-- Single source of truth for the niche presets (names / minutes / starting price).
-- Called by Workflow B2 (build + deliver) and by add-client.sql, e.g.:
--   select public.seed_service_presets('new-salon-slug', 'lashes');
--
-- Slot logic defaults live on public.businesses and are correct out of the box:
--   slot_interval = 30        (30-minute booking granularity)
--   working_hours = 8–17      (owner edits in admin → Hours)
--   working_days  = Mon–Sat
-- Per-service duration blocks + no-double-booking are enforced by the booking
-- page itself (index.html buildTimeSlots / isSlotTaken). Lunch breaks are handled
-- via the premium Block-time tool. Buffer time is a premium add-on (not seeded).
--
-- Idempotent: refuses to seed a business that already has services, so re-running
-- it (or B2 retrying) never duplicates a menu.

create or replace function public.seed_service_presets(p_business_id text, p_niche text)
returns integer
language plpgsql
as $$
declare
  v_existing int;
  v_rows     int := 0;
begin
  if p_business_id is null or p_niche is null then
    return 0;
  end if;

  -- Never double-seed an existing menu.
  select count(*) into v_existing from public.services where business_id = p_business_id;
  if v_existing > 0 then
    return 0;
  end if;

  insert into public.services (business_id, name, duration, price, sort_order)
  select p_business_id, p.name, p.duration, p.price, p.sort_order
  from (values
    -- niche,    name,                 minutes, price,   sort
    ('nails',    'Gel overlay',           75, 'R250',  1),
    ('nails',    'Acrylic full set',     120, 'R350',  2),
    ('nails',    'Fills',                 75, 'R250',  3),
    ('nails',    'Manicure',              45, 'R180',  4),
    ('nails',    'Pedicure',              60, 'R220',  5),

    ('lashes',   'Classic set',          120, 'R365',  1),
    ('lashes',   'Hybrid set',           135, 'R450',  2),
    ('lashes',   'Volume set',           150, 'R550',  3),
    ('lashes',   'Lash fill',             75, 'R300',  4),

    ('hair',     'Cut & style',           60, 'R280',  1),
    ('hair',     'Colour',               150, 'R750',  2),
    ('hair',     'Treatment',             45, 'R250',  3),
    ('hair',     'Blow-wave',             45, 'R180',  4),

    ('brows',    'Shape & tint',          30, 'R180',  1),
    ('brows',    'Lamination',            60, 'R350',  2),
    ('brows',    'Microblading',         120, 'R1200', 3),

    ('spa',      'Full body massage',     60, 'R450',  1),
    ('spa',      'Facial',                60, 'R400',  2),
    ('spa',      'Mani + pedi combo',    105, 'R380',  3),

    ('barber',   'Cut',                   30, 'R150',  1),
    ('barber',   'Cut & beard',           45, 'R220',  2),
    ('barber',   'Beard trim',            20, 'R100',  3)
  ) as p(niche, name, duration, price, sort_order)
  where p.niche = lower(p_niche);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Rollback:
--   drop function if exists public.seed_service_presets(text, text);
