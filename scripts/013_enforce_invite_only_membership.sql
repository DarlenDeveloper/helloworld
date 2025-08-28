-- Enforce rule: any new organization can be created automatically for a new user,
-- but joining an existing organization requires a pending invite for the user's email.
-- This script restores the invite flow and removes auto-attach via account_emails.

-- 0) Ensure required enum type exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

-- 1) Ensure organization_invites table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.org_role NOT NULL DEFAULT 'agent',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Unique invite per org+email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_org_email
ON public.organization_invites(organization_id, lower(email));

-- Enable RLS for invites
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- 2) Policies for invites: members can view; admins can manage
DO $$
BEGIN
  -- Drop existing to avoid duplicates
  DROP POLICY IF EXISTS org_invites_select_member ON public.organization_invites;
  DROP POLICY IF EXISTS org_invites_insert_admin ON public.organization_invites;
  DROP POLICY IF EXISTS org_invites_update_admin ON public.organization_invites;
  DROP POLICY IF EXISTS org_invites_delete_admin ON public.organization_invites;

  CREATE POLICY org_invites_select_member ON public.organization_invites
  FOR SELECT USING (
    is_org_member(organization_id)
  );

  CREATE POLICY org_invites_insert_admin ON public.organization_invites
  FOR INSERT WITH CHECK (
    is_org_member(organization_id, 'admin')
  );

  CREATE POLICY org_invites_update_admin ON public.organization_invites
  FOR UPDATE USING (
    is_org_member(organization_id, 'admin')
  );

  CREATE POLICY org_invites_delete_admin ON public.organization_invites
  FOR DELETE USING (
    is_org_member(organization_id, 'admin')
  );
END $$;

-- 3) Provide RPC to create/update an invite (admin-only)
CREATE OR REPLACE FUNCTION public.invite_org_email(p_org UUID, p_email TEXT, p_role public.org_role, p_invited_by UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_org_member(p_org, 'admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_invites(organization_id, email, role, invited_by, status)
  VALUES (p_org, lower(p_email), p_role, p_invited_by, 'pending')
  ON CONFLICT (organization_id, lower(email))
  DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, status = 'pending', created_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 4) Remove policy that allowed joining via account_emails (violates invite rule)
DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS orgm_insert_by_account_email ON public.organization_members;
  END IF;
END $$;

-- 5) Redefine provisioning: attach only if invited; otherwise create a new org for the user
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
  v_role public.org_role;
  v_role_text TEXT;
  v_org_name TEXT;
BEGIN
  -- If the user is already a member of any org, do nothing
  SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) INTO v_exists;
  IF v_exists THEN
    RETURN NEW;
  END IF;

  -- Determine email from profiles or auth.users
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    v_email := lower(NEW.email);
  ELSE
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = NEW.id;
  END IF;

  -- Check pending invite for this email
  SELECT organization_id, role INTO v_org, v_role
  FROM public.organization_invites
  WHERE lower(email) = v_email AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    -- Accept invite: add membership with invited role and mark invite accepted
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org, NEW.id, v_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, is_primary = TRUE;

    UPDATE public.organization_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE organization_id = v_org AND lower(email) = v_email AND status = 'pending';

    RETURN NEW;
  END IF;

  -- No invite: create a brand new organization and make this user the first member
  SELECT COALESCE((au.raw_user_meta_data ->> 'org_name')::TEXT, v_email, 'New Organization')
       , (au.raw_user_meta_data ->> 'role')::TEXT
  INTO v_org_name, v_role_text
  FROM auth.users au
  WHERE au.id = NEW.id;

  IF v_role_text NOT IN ('admin','manager','agent','viewer') THEN
    v_role_text := 'admin';
  END IF;
  v_role := v_role_text::public.org_role;

  INSERT INTO public.organizations (name, created_by)
  VALUES (v_org_name, NEW.id)
  RETURNING id INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, NEW.id, v_role);

  IF v_email IS NOT NULL THEN
    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, is_primary = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

-- 6) Ensure trigger on public.profiles uses this function (profiles are created on auth.users insert)
DROP TRIGGER IF EXISTS trg_ensure_org_for_new_user ON public.profiles;
CREATE TRIGGER trg_ensure_org_for_new_user
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_org_for_new_user();
