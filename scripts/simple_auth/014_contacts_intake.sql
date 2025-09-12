-- Contacts intake for public-facing form submissions
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.contacts_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  email TEXT,
  country TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.contacts_intake ENABLE ROW LEVEL SECURITY;

-- Reset policies to avoid duplicates on re-run
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS contacts_intake_read   ON public.contacts_intake;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS contacts_intake_insert ON public.contacts_intake;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS contacts_intake_update ON public.contacts_intake;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS contacts_intake_delete ON public.contacts_intake;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Read: owner or collaborator
CREATE POLICY contacts_intake_read
  ON public.contacts_intake
  FOR SELECT
  USING (public.is_owner_or_collaborator(user_id, FALSE));

-- Insert/Update/Delete: owner only
CREATE POLICY contacts_intake_insert
  ON public.contacts_intake
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY contacts_intake_update
  ON public.contacts_intake
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY contacts_intake_delete
  ON public.contacts_intake
  FOR DELETE
  USING (auth.uid() = user_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_contacts_intake_created_at ON public.contacts_intake(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_intake_user_id    ON public.contacts_intake(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_intake_email      ON public.contacts_intake(email);
CREATE INDEX IF NOT EXISTS idx_contacts_intake_phone      ON public.contacts_intake(phone);