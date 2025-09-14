-- Patch: make user_login_logs sharing symmetric between owner and collaborator
-- Safe to run multiple times

-- Ensure RLS is on (idempotent)
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

-- Replace only the READ policy to avoid duplicate policy errors on other tables
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS ull_read ON public.user_login_logs;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

CREATE POLICY ull_read
  ON public.user_login_logs
  FOR SELECT
  USING (
    -- Self
    auth.uid() = user_id
    -- Owner can read collaborator logs
    OR EXISTS (
      SELECT 1 FROM public.user_collaborators c
      WHERE c.owner_user_id = auth.uid()
        AND c.collaborator_user_id = user_id
    )
    -- Collaborator can read owner logs (symmetric)
    OR EXISTS (
      SELECT 1 FROM public.user_collaborators c
      WHERE c.owner_user_id = user_id
        AND c.collaborator_user_id = auth.uid()
    )
  );