-- Restore account_emails-based join and remove invite checks from automatic provisioning
-- Goal: Anyone can create their own organization (admin sign-up), but joining an existing
-- organization should NOT require invites at the DB level. Invites are enforced only
-- by the Employee Sign Up UI.

-- 1) Reinstate policy to allow joining an org when user's email is listed in account_emails
DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    -- Ensure clean state
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

-- 2) Redefine ensure_org_for_new_user to attach by account_emails or create a new org.
--    This version does NOT require invites for attachment.
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

  -- Otherwise, create a new organization for this user (admin or role from metadata)
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

-- 3) Ensure trigger on public.profiles uses this function
DROP TRIGGER IF EXISTS trg_ensure_org_for_new_user ON public.profiles;
CREATE TRIGGER trg_ensure_org_for_new_user
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_org_for_new_user();
