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



ERROR:  2BP01: cannot drop type org_role because other objects depend on it
DETAIL:  function is_org_member(uuid,org_role) depends on type org_role
policy org_contacts_all on table contacts depends on function is_org_member(uuid,org_role)
policy org_contact_batches_all on table contact_batches depends on function is_org_member(uuid,org_role)
policy org_campaigns_all on table campaigns depends on function is_org_member(uuid,org_role)
policy org_campaign_batches_all on table campaign_batches depends on function is_org_member(uuid,org_role)
policy org_calls_all on table calls depends on function is_org_member(uuid,org_role)
policy org_call_history_all on table call_history depends on function is_org_member(uuid,org_role)
policy org_user_login_logs_all on table user_login_logs depends on function is_org_member(uuid,org_role)
policy org_knowledge_base_articles_all on table knowledge_base_articles depends on function is_org_member(uuid,org_role)
HINT:  Use DROP ... CASCADE to drop the dependent objects too.
CONTEXT:  SQL statement "DROP TYPE public.org_role"
PL/pgSQL function inline_code_block line 7 at SQL statement
