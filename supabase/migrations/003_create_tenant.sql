-- 003_create_tenant.sql
-- Single source of truth for tenant creation.
--
-- Both the public self-serve signup endpoint (api/signup.js, this repo) and n8n
-- Workflow B2 (manual Telegram builds) call this ONE RPC so the two paths can
-- never drift. It atomically:
--   1. inserts the business with day-one defaults (show_streamline_promo=true)
--   2. seeds the niche service menu via seed_service_presets()
--   3. sets working hours + 30-min slot logic
--   4. generates a random 4-digit PIN, stores its SHA-256 hash, returns plaintext ONCE
--   5. inserts an inbound lead row into streamline_hq.prospects
--      (source='self-serve', opted_in=true, status='inbound', lead_temp='inbound')
--   6. links business.prospect_id back to that lead
-- Returns: { slug, pin, public_url, admin_url, prospect_id }
--
-- The plaintext PIN is returned only here — it is never persisted in clear text.

-- ---------------------------------------------------------------------------
-- 1) Schema: make the inbound self-serve lead representable.
--    The existing CHECK constraints predate self-serve, so extend them. Additive
--    only — no existing rows or values are touched.
-- ---------------------------------------------------------------------------

-- consent flag: explicit opt-in captured at signup (POPIA). Defaults false so
-- cold-outreach prospects (which never opted in) keep correct semantics.
alter table streamline_hq.prospects
  add column if not exists opted_in boolean not null default false;

-- allow source='self-serve'
alter table streamline_hq.prospects drop constraint if exists prospects_source_check;
alter table streamline_hq.prospects add constraint prospects_source_check
  check (source = any (array[
    'google_maps','instagram','snupit','yellow_pages','manual','self-serve'
  ]));

-- allow lead_temp='inbound' (in addition to the existing temperature values)
alter table streamline_hq.prospects drop constraint if exists prospects_lead_temp_chk;
alter table streamline_hq.prospects add constraint prospects_lead_temp_chk
  check (lead_temp is null or lead_temp = any (array[
    'hot','warm','cold','unknown','inbound'
  ]));

-- ---------------------------------------------------------------------------
-- 2) The RPC.
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant(
  p_business_name text,
  p_owner_name    text,
  p_niche         text,
  p_suburb        text default null,
  p_whatsapp      text default null,
  p_email         text default null,
  p_instagram     text default null,
  p_accent_colour text default null,
  p_base_url      text default 'https://book.streamline-automations.co.za'
)
returns jsonb
language plpgsql
security definer
set search_path = public, streamline_hq, extensions
as $$
declare
  v_base        text  := rtrim(coalesce(nullif(trim(p_base_url), ''), 'https://book.streamline-automations.co.za'), '/');
  v_slug_base   text;
  v_slug        text;
  v_suffix      int   := 1;
  v_pin         text;
  v_pin_hash    text;
  v_accent      text;
  v_accent_dark text;
  v_ig_handle   text;
  v_ig_url      text;
  v_r int; v_g int; v_b int;
  v_prospect_id uuid;
begin
  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'business_name is required';
  end if;
  if coalesce(trim(p_niche), '') = '' then
    raise exception 'niche is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email is required';
  end if;

  -- --- slug: kebab-case the business name, fall back to +suburb, then +counter ---
  v_slug_base := regexp_replace(lower(trim(p_business_name)), '[^a-z0-9]+', '-', 'g');
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then v_slug_base := 'salon'; end if;

  v_slug := v_slug_base;
  -- if the bare name is taken, try appending the suburb once for a nicer slug
  if exists (select 1 from public.businesses where id = v_slug) and coalesce(trim(p_suburb),'') <> '' then
    v_slug := v_slug_base || '-' || trim(both '-' from regexp_replace(lower(trim(p_suburb)), '[^a-z0-9]+', '-', 'g'));
  end if;
  -- then fall back to numeric suffixes until unique
  while exists (select 1 from public.businesses where id = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix::text;
  end loop;

  -- --- 4-digit PIN (1000–9999), store hex SHA-256 to match api/_auth.js sha256() ---
  v_pin := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
  v_pin_hash := encode(digest(v_pin, 'sha256'), 'hex');

  -- --- accent colour + derived dark shade ---
  if p_accent_colour ~ '^#[0-9A-Fa-f]{6}$' then
    v_accent := upper(p_accent_colour);
    v_r := floor(('x' || substr(v_accent, 2, 2))::bit(8)::int * 0.78);
    v_g := floor(('x' || substr(v_accent, 4, 2))::bit(8)::int * 0.78);
    v_b := floor(('x' || substr(v_accent, 6, 2))::bit(8)::int * 0.78);
    v_accent_dark := '#' || lpad(to_hex(v_r), 2, '0') || lpad(to_hex(v_g), 2, '0') || lpad(to_hex(v_b), 2, '0');
  else
    v_accent := '#A8456B';
    v_accent_dark := '#8a3458';
  end if;

  -- --- instagram handle/url ---
  v_ig_handle := nullif(regexp_replace(coalesce(p_instagram, ''), '^.*instagram\.com/|@|/$', '', 'g'), '');
  v_ig_url := case when v_ig_handle is not null then 'https://instagram.com/' || v_ig_handle else null end;

  -- --- 1. the business ---
  insert into public.businesses (
    id, slug, name, tagline, accent_color, accent_dark,
    owner_email, phone, admin_pin_hash,
    working_days, working_hours, slot_interval, advance_days, same_day,
    show_streamline_promo, instagram_url
  ) values (
    v_slug, v_slug, trim(p_business_name), null, v_accent, v_accent_dark,
    lower(trim(p_email)), nullif(trim(p_whatsapp), ''), v_pin_hash,
    '[1,2,3,4,5,6]'::jsonb, '{"start":8,"end":17}'::jsonb, 30, 30, true,
    true, v_ig_url
  );

  -- --- 2. seed the niche menu (idempotent) + slot logic already set above ---
  perform public.seed_service_presets(v_slug, lower(trim(p_niche)));

  -- --- 3. the inbound, opted-in lead ---
  insert into streamline_hq.prospects (
    source, business_name, slug, niche, suburb,
    whatsapp_e164, email, instagram_handle,
    owner_first_name, status, lead_temp, opted_in
  ) values (
    'self-serve', trim(p_business_name), v_slug, lower(trim(p_niche)), nullif(trim(p_suburb), ''),
    nullif(trim(p_whatsapp), ''), lower(trim(p_email)), v_ig_handle,
    nullif(trim(p_owner_name), ''), 'inbound', 'inbound', true
  )
  returning id into v_prospect_id;

  -- --- 4. link the business to its lead ---
  update public.businesses set prospect_id = v_prospect_id where id = v_slug;

  return jsonb_build_object(
    'slug',        v_slug,
    'pin',         v_pin,
    'public_url',  v_base || '/?biz=' || v_slug,
    'admin_url',   v_base || '/admin?biz=' || v_slug,
    'prospect_id', v_prospect_id
  );
end;
$$;

-- Lock the function down: only the service role (server-side) may call it.
revoke all on function public.create_tenant(text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_tenant(text,text,text,text,text,text,text,text,text) to service_role;

-- Rollback:
--   drop function if exists public.create_tenant(text,text,text,text,text,text,text,text,text);
--   (constraint/column changes are additive and safe to leave in place)
