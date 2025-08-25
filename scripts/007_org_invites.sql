-- Organization Invitations for adding employees by email
-- Creates organization_invites, policies, RPC to invite by email,
-- and updates the ensure_org_for_new_user() provisioning function to honor invites.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

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

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- Policies: members can view, admins can manage
DROP POLICY IF EXISTS org_invites_select_member ON public.organization_invites;
CREATE POLICY org_invites_select_member ON public.organization_invites
FOR SELECT USING (
  is_org_member(organization_id)
);

DROP POLICY IF EXISTS org_invites_insert_admin ON public.organization_invites;
CREATE POLICY org_invites_insert_admin ON public.organization_invites
FOR INSERT WITH CHECK (
  is_org_member(organization_id, 'admin')
);

DROP POLICY IF EXISTS org_invites_update_admin ON public.organization_invites;
CREATE POLICY org_invites_update_admin ON public.organization_invites
FOR UPDATE USING (
  is_org_member(organization_id, 'admin')
);

DROP POLICY IF EXISTS org_invites_delete_admin ON public.organization_invites;
CREATE POLICY org_invites_delete_admin ON public.organization_invites
FOR DELETE USING (
  is_org_member(organization_id, 'admin')
);

-- RPC: Invite an email into an organization with a role
CREATE OR REPLACE FUNCTION public.invite_org_email(p_org UUID, p_email TEXT, p_role public.org_role, p_invited_by UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Ensure caller is admin of the org
  IF NOT is_org_member(p_org, 'admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_invites(organization_id, email, role, invited_by, status)
  VALUES (p_org, lower(p_email), p_role, p_invited_by, 'pending')
  ON CONFLICT (organization_id, lower(email))
  DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, status = 'pending', created_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update provisioning function to accept invites
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
  v_invite_role public.org_role;
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

  -- If invited, attach to that organization instead of creating a new one
  SELECT organization_id, role INTO v_org, v_invite_role
  FROM public.organization_invites
  WHERE lower(email) = v_email AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    -- Add membership with invite role
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org, NEW.id, v_invite_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    -- Record primary account email for the new user in this org
    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO NOTHING;

    -- Mark invite accepted
    UPDATE public.organization_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE organization_id = v_org AND lower(email) = v_email AND status = 'pending';

    RETURN NEW;
  END IF;

  -- Otherwise, create a brand new org and make the user admin (original behavior)
  INSERT INTO public.organizations (name, created_by)
  VALUES (COALESCE(v_email, 'New Organization'), NEW.id)
  RETURNING id INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, NEW.id, 'admin');

  IF v_email IS NOT NULL THEN
    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
