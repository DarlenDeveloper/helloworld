-- Clean up org_role dependencies so the type can be dropped safely
-- Resolves error:
-- cannot drop type org_role because other objects depend on it
--   function is_org_member(uuid,org_role) depends on type org_role
--   policy org_*_all ... depends on function is_org_member(uuid,org_role)

-- 1) Drop org_*_all policies that depend on is_org_member
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE policyname LIKE 'org_%_all'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2) Drop the function that references org_role
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_org_member'
      AND n.nspname = 'public'
  ) THEN
    -- Drop the specific signature that uses org_role
    DROP FUNCTION IF EXISTS public.is_org_member(UUID, public.org_role) CASCADE;
  END IF;
END $$;

-- 3) Drop the org_role type now that dependencies are removed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    DROP TYPE public.org_role;
  END IF;
END $$;
