-- Organization-based RBAC and account email mapping
-- This script creates:
--  - organizations
--  - organization_members (user <-> org with role)
--  - account_emails (additional account emails under an org)
--  - helper functions
--  - RLS policies
--  - trigger to auto-create org + admin for first account email

-- Roles for organization membership
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    CREATE TYPE public.org_role AS ENUM ('admin', 'manager', 'agent', 'viewer');
  END IF;
END $$;

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members of an organization with role
CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

-- Additional account emails linked to an org and user
CREATE TABLE IF NOT EXISTS public.account_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_account_emails_org ON public.account_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_account_emails_user ON public.account_emails(user_id);

-- RLS enable
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_emails ENABLE ROW LEVEL SECURITY;

-- Helper: check if the current auth user is member of the given org with optional role
CREATE OR REPLACE FUNCTION public.is_org_member(p_org UUID, p_role public.org_role DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org
      AND m.user_id = auth.uid()
      AND (p_role IS NULL OR m.role = p_role)
  );
$$;

-- Helper: get an org id for a user (first one found)
CREATE OR REPLACE FUNCTION public.get_user_org_id(p_user UUID)
RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = p_user
  ORDER BY created_at ASC
  LIMIT 1;
$$;

-- Policies: organizations
DROP POLICY IF EXISTS org_select_own ON public.organizations;
CREATE POLICY org_select_own ON public.organizations
FOR SELECT USING (
  is_org_member(id)
);

DROP POLICY IF EXISTS org_insert_self ON public.organizations;
CREATE POLICY org_insert_self ON public.organizations
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS org_update_admin ON public.organizations;
CREATE POLICY org_update_admin ON public.organizations
FOR UPDATE USING (
  is_org_member(id, 'admin')
);

DROP POLICY IF EXISTS org_delete_admin ON public.organizations;
CREATE POLICY org_delete_admin ON public.organizations
FOR DELETE USING (
  is_org_member(id, 'admin')
);

-- Policies: organization_members
DROP POLICY IF EXISTS orgm_select_member ON public.organization_members;
CREATE POLICY orgm_select_member ON public.organization_members
FOR SELECT USING (
  is_org_member(organization_id)
);

DROP POLICY IF EXISTS orgm_insert_admin ON public.organization_members;
CREATE POLICY orgm_insert_admin ON public.organization_members
FOR INSERT WITH CHECK (
  is_org_member(organization_id, 'admin')
);

DROP POLICY IF EXISTS orgm_update_admin ON public.organization_members;
CREATE POLICY orgm_update_admin ON public.organization_members
FOR UPDATE USING (
  is_org_member(organization_id, 'admin')
);

DROP POLICY IF EXISTS orgm_delete_admin ON public.organization_members;
CREATE POLICY orgm_delete_admin ON public.organization_members
FOR DELETE USING (
  is_org_member(organization_id, 'admin')
);

-- Policies: account_emails
DROP POLICY IF EXISTS ae_select_member ON public.account_emails;
CREATE POLICY ae_select_member ON public.account_emails
FOR SELECT USING (
  is_org_member(organization_id)
);

DROP POLICY IF EXISTS ae_insert_admin_or_self ON public.account_emails;
CREATE POLICY ae_insert_admin_or_self ON public.account_emails
FOR INSERT WITH CHECK (
  is_org_member(organization_id, 'admin')
  OR auth.uid() = user_id
);

DROP POLICY IF EXISTS ae_update_admin_or_self ON public.account_emails;
CREATE POLICY ae_update_admin_or_self ON public.account_emails
FOR UPDATE USING (
  is_org_member(organization_id, 'admin')
  OR auth.uid() = user_id
);

DROP POLICY IF EXISTS ae_delete_admin_or_self ON public.account_emails;
CREATE POLICY ae_delete_admin_or_self ON public.account_emails
FOR DELETE USING (
  is_org_member(organization_id, 'admin')
  OR auth.uid() = user_id
);

-- Trigger function: ensure an organization exists for a new user and make them admin
CREATE OR REPLACE FUNCTION public.ensure_org_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
  v_org UUID;
  v_email TEXT;
BEGIN
  -- If the user is already a member of any org, do nothing
  SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) INTO v_exists;
  IF v_exists THEN
    RETURN NEW;
  END IF;

  -- Determine email from profiles or auth.users
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    v_email := NEW.email;
  ELSE
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
  END IF;

  -- Create a new organization and set the new user as admin
  INSERT INTO public.organizations (name, created_by)
  VALUES (COALESCE(v_email, 'New Organization'), NEW.id)
  RETURNING id INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, NEW.id, 'admin');

  -- Record primary account email for the org
  IF v_email IS NOT NULL THEN
    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to profiles creation (profiles are created on auth.users insert by an existing trigger)
DROP TRIGGER IF EXISTS trg_ensure_org_for_new_user ON public.profiles;
CREATE TRIGGER trg_ensure_org_for_new_user
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_org_for_new_user();

-- Helper function: add an additional account email under the same organization as the user
CREATE OR REPLACE FUNCTION public.add_account_email(p_user_id UUID, p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_id UUID;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.organization_members
  WHERE user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User % does not belong to any organization', p_user_id USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
  VALUES (v_org, p_user_id, p_email, FALSE)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
