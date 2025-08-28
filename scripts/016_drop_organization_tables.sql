-- Drop all organization-related tables only, in safe order.
-- This script removes tables used by the organization model without modifying other schema parts.

-- 1) Drop triggers on organizations table (if any) that would block dropping the table
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_username') THEN
      DROP TRIGGER trg_set_org_username ON public.organizations;
    END IF;
  END IF;
END $$;

-- 2) Drop organization-related tables in dependency order
DO $$
BEGIN
  IF to_regclass('public.organization_invites') IS NOT NULL THEN
    DROP TABLE public.organization_invites CASCADE;
  END IF;

  IF to_regclass('public.organization_members') IS NOT NULL THEN
    DROP TABLE public.organization_members CASCADE;
  END IF;

  IF to_regclass('public.account_emails') IS NOT NULL THEN
    DROP TABLE public.account_emails CASCADE;
  END IF;

  IF to_regclass('public.organizations') IS NOT NULL THEN
    DROP TABLE public.organizations CASCADE;
  END IF;
END $$;

-- 3) Optionally drop enum types if they are no longer needed (safe to keep if unsure)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    DROP TYPE public.invite_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    DROP TYPE public.org_role;
  END IF;
END $$;



