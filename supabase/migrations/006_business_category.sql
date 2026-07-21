-- 006_business_category.sql
--
-- Stores which wizard category a business picked, so the delivered booking
-- page can present itself appropriately. Until now index.html set Cormorant
-- Garamond — a boutique salon serif — for every tenant, which is right for a
-- lash studio and wrong for a cleaning company or a tutor.
--
-- Deliberately NOT threaded through create_tenant(). That function is shared
-- with n8n Workflow B2 and lives in a repo that isn't this one; appending
-- parameters to it already cost us a duplicate-overload incident once (see
-- 005_drop_legacy_create_tenant_overload.sql). api/signup.js already performs
-- a post-create update on this row for the logo, so the category rides along
-- there instead. Nothing about the shared RPC changes.
--
-- Null is the safe default and means "no explicit category": every business
-- created before this column existed keeps the original serif exactly as it
-- was. Only pages that opt in via a known non-beauty category look different.

alter table public.businesses
  add column if not exists category text;

comment on column public.businesses.category is
  'Wizard business-type id from api/_niche-catalog.js (e.g. nails, cleaning, petgrooming). '
  'Null for tenants created before this column, and for any manual/n8n build. '
  'Drives display typography on the public booking page; never gates behaviour.';

-- Rollback:
--   alter table public.businesses drop column if exists category;
