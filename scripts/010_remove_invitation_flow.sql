-- Remove invitation-based flow and use simple org creation / account_emails mapping
-- 1) Drop invites artifacts (RPC, policies, table, type) if present
-- 2) Add org member insert policies for first member and account_emails mapping
-- 3) Redefine ensure_org_for_new_user to create org or attach via account_emails

-- 1) Drop invites artifacts
DO $$
BEGIN
  -- Drop invite RPC if exists
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'invite_org_email'
  ) THEN
    DROP FUNCTION IF EXISTS public.invite_org_email(UUID, TEXT, public.org_role, UUID);
  END IF;

  -- Drop invite policies if the table exists
  IF to_regclass('public.organization_invites') IS NOT NULL THEN
    -- policies created in 007/009 and base ones
    DROP POLICY IF EXISTS org_invites_select_member ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_insert_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_update_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_delete_admin ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_select_invited ON public.organization_invites;
    DROP POLICY IF EXISTS org_invites_update_invited ON public.organization_invites;
  END IF;

  -- Drop table and type if present
  IF to_regclass('public.organization_invites') IS NOT NULL THEN
    DROP TABLE public.organization_invites CASCADE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'invite_status'
  ) THEN
    DROP TYPE public.invite_status;
  END IF;
END $$;

-- 2) Policies to allow first member and account_emails-based joins
DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    -- Remove any prior invited-insert policy
    DROP POLICY IF EXISTS orgm_insert_invited ON public.organization_members;

    -- Allow first member insertion into a freshly created org
    DROP POLICY IF EXISTS orgm_insert_first_member ON public.organization_members;
    CREATE POLICY orgm_insert_first_member ON public.organization_members
    FOR INSERT WITH CHECK (
      organization_members.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = organization_members.organization_id
      )
    );

    -- Allow user to join an org if their email is listed in account_emails
    DROP POLICY IF EXISTS orgm_insert_by_account_email ON public.organization_members;
    CREATE POLICY orgm_insert_by_account_email ON public.organization_members
    FOR INSERT WITH CHECK (
      organization_members.user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.account_emails e
        JOIN public.profiles p ON lower(p.email) = lower(e.email)
        WHERE p.id = auth.uid()
          AND e.organization_id = organization_members.organization_id
      )
    );
  END IF;
END $$;

-- 3) Redefine ensure_org_for_new_user to create org or attach via account_emails
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
  v_org_name TEXT;
  v_role_text TEXT;
  v_role public.org_role;
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

  -- If the email exists in account_emails, attach to that org
  SELECT organization_id INTO v_org
  FROM public.account_emails
  WHERE lower(email) = v_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org, NEW.id, 'agent')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, is_primary = TRUE;

    RETURN NEW;
  END IF;

  -- Otherwise, create a new organization for this user
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

  INSERT INTO public.account_emails (organization_id, user_id, email, is_primary)
  VALUES (v_org, NEW.id, v_email, TRUE)
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, is_primary = TRUE;

  RETURN NEW;
END;
$$;
