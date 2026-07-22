-- 010_logo_size_and_banner_preset.sql
--
-- Two new opt-in customization fields on the delivered booking page,
-- following the same shape as `category` (006) / `data-display`: an
-- explicit value flips a `data-*` attribute the CSS keys off, and null
-- (every existing tenant, forever, until they touch these settings)
-- renders exactly as it always has.
--
--   - logo_size: small | medium | large. Controls the hero avatar's
--     diameter (index.html's --logo-size custom property). Null = today's
--     default size, unchanged.
--   - banner_preset: id of a curated background treatment for tenants with
--     no uploaded photo (replacing the single generic gradient placeholder
--     with a small choice of accent-derived looks). Null = today's existing
--     placeholder gradient, unchanged.
--
-- Both nullable, both free-tier (this is craft/customization, not a premium
-- gate — the actual premium gate is the separate colour-theme preview work,
-- which deliberately stays out of PALETTE/isFreeAccent()).

alter table public.businesses
  add column if not exists logo_size text,
  add column if not exists banner_preset text;

alter table public.businesses
  add constraint businesses_logo_size_check
    check (logo_size is null or logo_size in ('small', 'medium', 'large'));

comment on column public.businesses.logo_size is
  'Hero avatar size on the public booking page: small | medium | large. Null = default size, unchanged from before this column existed.';
comment on column public.businesses.banner_preset is
  'Curated background id for tenants with no uploaded photo (see index.html BANNER_PRESETS). Null = the original generic gradient placeholder.';

-- Rollback:
--   alter table public.businesses drop constraint if exists businesses_logo_size_check;
--   alter table public.businesses drop column if exists logo_size;
--   alter table public.businesses drop column if exists banner_preset;
