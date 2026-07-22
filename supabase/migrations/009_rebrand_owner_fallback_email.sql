-- 009_rebrand_owner_fallback_email.sql
--
-- Christiaan's marketing site moved to streamline-automations.co.za. Every
-- footer/email display reference to the old streamline-automations.agency
-- domain got a plain text swap in this same change — except one place that
-- isn't a text swap at all: create_tenant()'s owner-email FALLBACK
-- ('owner+' || v_slug || '@streamline-automations.agency', used only when a
-- signup provides no real email) is baked into the live function body itself
-- by migration 004. Editing that file does nothing to the database — only a
-- new CREATE OR REPLACE actually changes what's live.
--
-- This is a pure literal change inside the function body copied verbatim
-- from 004_wizard_services_and_goal.sql (confirmed unmodified since — 005
-- only dropped the old 11-arg overload, 006/007/008 touched businesses and
-- bookings, neither touches create_tenant). The parameter list is completely
-- unchanged, so — unlike 004 itself, which appended new params and triggered
-- the CREATE OR REPLACE overload trap (005) — this IS a true in-place
-- replace. Re-grant at the bottom is only a formality: the signature hasn't
-- changed, so the existing grant already covers it; included to make the
-- lockdown explicit and self-contained in this file regardless.

create or replace function public.create_tenant(
  p_business_name text,
  p_owner_name    text,
  p_niche         text,
  p_suburb        text default null,
  p_whatsapp      text default null,
  p_email         text default null,
  p_instagram     text default null,
  p_accent_colour text default null,
  p_base_url      text default 'https://book.streamline-automations.co.za',
  p_prospect_id   uuid default null,
  p_source        text default 'self-serve',
  p_services      jsonb default null,
  p_goal          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, streamline_hq, extensions
as $$
declare
  v_base        text := rtrim(coalesce(nullif(trim(p_base_url), ''), 'https://book.streamline-automations.co.za'), '/');
  v_slug_base   text;
  v_slug        text;
  v_suffix      int  := 1;
  v_pin         text;
  v_pin_hash    text;
  v_accent      text;
  v_accent_dark text;
  v_ig_handle   text;
  v_ig_url      text;
  v_r int; v_g int; v_b int;
  v_p_name text; v_p_niche text; v_p_slug text; v_p_wa text; v_p_email text; v_p_ig text; v_p_owner text;
  v_name text; v_niche_raw text; v_niche_key text; v_email text; v_wa text; v_ig_in text; v_owner text;
  v_prospect_id uuid;
begin
  if p_prospect_id is not null then
    select business_name, niche, slug, whatsapp_e164, email, instagram_handle, owner_first_name
      into v_p_name, v_p_niche, v_p_slug, v_p_wa, v_p_email, v_p_ig, v_p_owner
      from streamline_hq.prospects
     where id = p_prospect_id;
    if not found then
      raise exception 'prospect % not found', p_prospect_id;
    end if;
  end if;

  v_name      := coalesce(nullif(trim(p_business_name), ''), nullif(trim(v_p_name), ''));
  v_niche_raw := coalesce(nullif(lower(trim(p_niche)), ''), nullif(lower(trim(v_p_niche)), ''));
  v_wa        := coalesce(nullif(trim(p_whatsapp), ''), nullif(trim(v_p_wa), ''));
  v_ig_in     := coalesce(nullif(trim(p_instagram), ''), nullif(trim(v_p_ig), ''));
  v_owner     := coalesce(nullif(trim(p_owner_name), ''), nullif(trim(v_p_owner), ''));

  if coalesce(v_name, '') = '' then
    raise exception 'business_name is required';
  end if;
  if coalesce(v_niche_raw, '') = '' then
    raise exception 'niche is required';
  end if;

  v_niche_key := case
    when v_niche_raw ~ 'nail'                                    then 'nails'
    when v_niche_raw ~ 'lash'                                    then 'lashes'
    when v_niche_raw ~ 'brow|microblad|pmu'                      then 'brows'
    when v_niche_raw ~ 'barber'                                  then 'barber'
    when v_niche_raw ~ 'hair'                                    then 'hair'
    when v_niche_raw ~ 'spa|massage|facial|skin|aesthet|beauty'  then 'spa'
    else 'default'
  end;

  if coalesce(nullif(trim(v_p_slug), ''), '') <> '' then
    v_slug := trim(v_p_slug);
  else
    v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_slug_base = '' then v_slug_base := 'salon'; end if;
    v_slug := v_slug_base;
    if exists (select 1 from public.businesses where id = v_slug) and coalesce(trim(p_suburb), '') <> '' then
      v_slug := v_slug_base || '-' || trim(both '-' from regexp_replace(lower(trim(p_suburb)), '[^a-z0-9]+', '-', 'g'));
    end if;
    while exists (select 1 from public.businesses where id = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := v_slug_base || '-' || v_suffix::text;
    end loop;
  end if;

  v_email := coalesce(
    nullif(lower(trim(p_email)), ''),
    nullif(lower(trim(v_p_email)), ''),
    'owner+' || v_slug || '@streamline-automations.co.za'
  );

  v_pin      := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
  v_pin_hash := encode(digest(v_pin, 'sha256'), 'hex');

  if p_accent_colour ~ '^#[0-9A-Fa-f]{6}$' then
    v_accent := upper(p_accent_colour);
  else
    v_accent := case v_niche_key
      when 'nails'  then '#C084FC'
      when 'lashes' then '#B76E79'
      when 'hair'   then '#0EA5E9'
      when 'brows'  then '#A16207'
      when 'spa'    then '#0D9488'
      when 'barber' then '#475569'
      else '#A8456B'
    end;
  end if;
  v_r := floor(('x' || substr(v_accent, 2, 2))::bit(8)::int * 0.78);
  v_g := floor(('x' || substr(v_accent, 4, 2))::bit(8)::int * 0.78);
  v_b := floor(('x' || substr(v_accent, 6, 2))::bit(8)::int * 0.78);
  v_accent_dark := '#' || lpad(to_hex(v_r), 2, '0') || lpad(to_hex(v_g), 2, '0') || lpad(to_hex(v_b), 2, '0');

  v_ig_handle := nullif(regexp_replace(coalesce(v_ig_in, ''), '^.*instagram\.com/|@|/$', '', 'g'), '');
  v_ig_url    := case when v_ig_handle is not null then 'https://instagram.com/' || v_ig_handle else null end;

  if p_prospect_id is null then
    insert into streamline_hq.prospects (
      source, business_name, slug, niche, suburb,
      whatsapp_e164, email, instagram_handle,
      owner_first_name, status, lead_temp, opted_in
    ) values (
      coalesce(nullif(trim(p_source), ''), 'self-serve'), v_name, v_slug, v_niche_raw, nullif(trim(p_suburb), ''),
      v_wa, v_email, v_ig_handle,
      v_owner, 'inbound', 'inbound', true
    )
    returning id into v_prospect_id;
  else
    v_prospect_id := p_prospect_id;
  end if;

  insert into public.businesses (
    id, slug, name, tagline, accent_color, accent_dark,
    owner_email, phone, admin_pin_hash,
    working_days, working_hours, slot_interval, advance_days, same_day,
    show_streamline_promo, is_streamline_owned, instagram_url, prospect_id, goal
  ) values (
    v_slug, v_slug, v_name, null, v_accent, v_accent_dark,
    v_email, v_wa, v_pin_hash,
    '[1,2,3,4,5,6]'::jsonb, '{"start":8,"end":17}'::jsonb, 30, 30, true,
    true, true, v_ig_url, v_prospect_id, nullif(trim(p_goal), '')
  )
  on conflict (id) do update set
    name                  = excluded.name,
    accent_color          = excluded.accent_color,
    accent_dark           = excluded.accent_dark,
    owner_email           = excluded.owner_email,
    phone                 = coalesce(excluded.phone, public.businesses.phone),
    admin_pin_hash        = excluded.admin_pin_hash,
    show_streamline_promo = true,
    is_streamline_owned   = true,
    instagram_url         = coalesce(excluded.instagram_url, public.businesses.instagram_url),
    prospect_id           = excluded.prospect_id,
    goal                  = coalesce(excluded.goal, public.businesses.goal);

  -- services: the wizard's explicit, owner-edited menu when given (idempotent —
  -- same "don't double-seed" guard seed_service_presets() itself uses), else the
  -- legacy fuzzy-niche preset seeder (manual/n8n path, unchanged).
  if p_services is not null and jsonb_typeof(p_services) = 'array' and jsonb_array_length(p_services) > 0 then
    if not exists (select 1 from public.services where business_id = v_slug) then
      insert into public.services (business_id, name, duration, price, sort_order)
      select v_slug,
             trim(both from (elem->>'name')),
             (elem->>'duration')::int,
             trim(both from (elem->>'price')),
             ord::int
      from jsonb_array_elements(p_services) with ordinality as t(elem, ord)
      where coalesce(trim(elem->>'name'), '') <> '';
    end if;
  else
    perform public.seed_service_presets(v_slug, v_niche_key);
  end if;

  return jsonb_build_object(
    'slug',        v_slug,
    'pin',         v_pin,
    'public_url',  v_base || '/?biz=' || v_slug,
    'admin_url',   v_base || '/admin?biz=' || v_slug,
    'prospect_id', v_prospect_id
  );
end;
$$;

-- Signature unchanged from 004/005 — this re-grant is a no-op in practice,
-- kept only so this file is self-contained and doesn't rely on a reader
-- checking 005 to know the function is still locked to service_role.
revoke all on function public.create_tenant(text,text,text,text,text,text,text,text,text,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_tenant(text,text,text,text,text,text,text,text,text,uuid,text,jsonb,text) to service_role;

-- Rollback:
--   re-apply the body above with the .agency domain restored on the one
--   v_email fallback line.
