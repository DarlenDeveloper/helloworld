-- Remove all organization logic and simplify access for all authenticated users
-- This script drops org-related objects (tables, functions, triggers, policies)
-- and configures permissive RLS so all authenticated users can read/write data.

-- A) Drop triggers that reference org functions
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ensure_org_for_new_user') THEN
      DROP TRIGGER trg_ensure_org_for_new_user ON public.profiles;
    END IF;
  END IF;

  -- Drop BEFORE INSERT org-setting triggers on domain tables if present
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_contacts') THEN
    DROP TRIGGER trg_set_org_contacts ON public.contacts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_contact_batches') THEN
    DROP TRIGGER trg_set_org_contact_batches ON public.contact_batches;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_campaigns') THEN
    DROP TRIGGER trg_set_org_campaigns ON public.campaigns;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_campaign_batches') THEN
    DROP TRIGGER trg_set_org_campaign_batches ON public.campaign_batches;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_calls') THEN
    DROP TRIGGER trg_set_org_calls ON public.calls;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_call_history') THEN
    DROP TRIGGER trg_set_org_call_history ON public.call_history;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_user_login_logs') THEN
    DROP TRIGGER trg_set_org_user_login_logs ON public.user_login_logs;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_kb') THEN
    DROP TRIGGER trg_set_org_kb ON public.knowledge_base_articles;
  END IF;

  -- Drop username trigger if organizations table exists
  IF to_regclass('public.organizations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_org_username') THEN
      DROP TRIGGER trg_set_org_username ON public.organizations;
    END IF;
  END IF;
END $$;

-- B) Drop views referencing org tables
DO $$
BEGIN
  IF to_regclass('public.organization_users') IS NOT NULL THEN
    DROP VIEW public.organization_users;
  END IF;
END $$;

-- C) Drop policies that rely on org functions across tables
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop org_*_all policies created by _apply_org_member_policies (script 008)
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE policyname LIKE 'org_%_all'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- Drop specific org policies on org tables if they exist
  IF to_regclass('public.organizations') IS NOT NULL THEN
    DROP POLICY IF EXISTS org_select_own ON public.organizations;
    DROP POLICY IF EXISTS org_insert_self ON public.organizations;
    DROP POLICY IF EXISTS org_update_admin ON public.organizations;
    DROP POLICY IF EXISTS org_delete_admin ON public.organizations;
  END IF;

  IF to_regclass('public.organization_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS orgm_select_member ON public.organization_members;
    DROP POLICY IF EXISTS orgm_insert_admin ON public.organization_members;
    DROP POLICY IF EXISTS orgm_insert_first_member ON public.organization_members;
    DROP POLICY IF EXISTS orgm_insert_by_account_email ON public.organization_members;
    DROP POLICY IF EXISTS orgm_update_admin ON public.organization_members;
    DROP POLICY IF EXISTS orgm_delete_admin ON public.organization_members;
  END IF;

  IF to_regclass('public.account_emails') IS NOT NULL THEN
    DROP POLICY IF EXISTS ae_select_member ON public.account_emails;
    DROP POLICY IF EXISTS ae_insert_admin_or_self ON public.account_emails;
    DROP POLICY IF EXISTS ae_update_admin_or_self ON public.account_emails;
    DROP POLICY IF EXISTS ae_delete_admin_or_self ON public.account_emails;
  END IF;

  IF to_regclass('public.organization_invites') IS NOT NULL THEN
    DROP POLICY IF EXISTS org_invites_select_member ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_insert_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_update_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_delete_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_select_invited ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_update_invited ON public.organization_invites;
  END IF;

  -- Drop profiles org-read policy from 012 if exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_same_org'
  ) THEN
    DROP POLICY profiles_select_same_org ON public.profiles;
  END IF;
END $$;

-- D) Drop functions (ensure triggers were dropped above)
DO $$
BEGIN
  -- RPCs
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_organization') THEN
    DROP FUNCTION public.create_organization(TEXT);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'invite_org_email') THEN
    DROP FUNCTION public.invite_org_email(UUID, TEXT, public.org_role, UUID);
  END IF;

  -- Utilities
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_org_for_new_user') THEN
    DROP FUNCTION public.ensure_org_for_new_user();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_org_on_insert') THEN
    DROP FUNCTION public.set_org_on_insert();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_org_member') THEN
    DROP FUNCTION public.is_org_member(UUID, public.org_role);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_org_id') THEN
    DROP FUNCTION public.get_user_org_id(UUID);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_apply_org_member_policies') THEN
    DROP FUNCTION public._apply_org_member_policies(regclass);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_org_username') THEN
    DROP FUNCTION public.set_org_username();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'slugify') THEN
    DROP FUNCTION public.slugify(TEXT);
  END IF;
END $$;

-- E) Drop org-related tables
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

-- F) Drop enum types if unused
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    DROP TYPE public.invite_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    DROP TYPE public.org_role;
  END IF;
END $$;

-- G) Configure permissive RLS: all authenticated users can read/write
DO $$
DECLARE
  t TEXT;
  pol RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'public.profiles',
    'public.calls',
    'public.campaigns',
    'public.contact_batches',
    'public.campaign_batches',
    'public.call_history',
    'public.knowledge_base_articles',
    'public.user_login_logs',
    'public.contacts'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
      -- Drop all existing policies on the table
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = split_part(t, '.', 2)
      LOOP
        EXECUTE format('DROP POLICY %I ON %s', pol.policyname, t);
      END LOOP;
      -- Create permissive policies
      EXECUTE format('CREATE POLICY all_auth_read ON %s FOR SELECT USING (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_insert ON %s FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_update ON %s FOR UPDATE USING (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_delete ON %s FOR DELETE USING (auth.uid() IS NOT NULL)', t);
    EXCEPTION WHEN undefined_table THEN
      -- Table not present; skip
      NULL;
    END;
  END LOOP;
END $$;
