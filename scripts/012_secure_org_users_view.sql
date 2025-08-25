-- Secure the organization_users view and widen profiles select to same-organization users
-- 1) Recreate organization_users as SECURITY INVOKER and org-scoped
-- 2) Add profiles policy to allow SELECT by org members (in addition to self)

-- 1) Recreate view with security_invoker and explicit org membership predicate
DO $$
BEGIN
  IF to_regclass('public.organization_users') IS NOT NULL THEN
    DROP VIEW public.organization_users;
  END IF;
END $$;

CREATE VIEW public.organization_users WITH (security_invoker = true) AS
SELECT
  m.organization_id,
  m.user_id,
  m.role,
  m.created_at,
  p.full_name,
  p.email
FROM public.organization_members m
JOIN public.profiles p ON p.id = m.user_id
WHERE public.is_org_member(m.organization_id);

-- 2) Profiles: allow org members to SELECT profiles of users in the same organization
-- Keep existing self-access policies. Add an org-wide read policy.
DO $$
BEGIN
  -- Ensure RLS is enabled
  EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

  -- Create policy if not exists (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_same_org'
  ) THEN
    CREATE POLICY profiles_select_same_org ON public.profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.organization_members me
        JOIN public.organization_members other
          ON other.organization_id = me.organization_id
        WHERE me.user_id = auth.uid()
          AND other.user_id = profiles.id
      )
    );
  END IF;
END $$;
