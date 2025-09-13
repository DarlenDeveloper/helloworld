-- Web Forms submissions table (user-scoped by auth.uid())
-- Idempotent: safe to run multiple times

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.web_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_name TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  metadata JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.web_forms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for re-runs
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS wf_read_auth ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS wf_read_self ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Read: only rows owned by the authenticated user
CREATE POLICY wf_read_self
  ON public.web_forms
  FOR SELECT
  USING (auth.uid() = user_id);

-- Note:
--  - No INSERT/UPDATE/DELETE policies are defined here (default deny).
--    Use service role or separate backend to populate this table.

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_web_forms_user_time ON public.web_forms (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_forms_email ON public.web_forms ((lower(email)));
CREATE INDEX IF NOT EXISTS idx_web_forms_phone ON public.web_forms (phone);
CREATE INDEX IF NOT EXISTS idx_web_forms_form_name ON public.web_forms ((lower(form_name)));
CREATE INDEX IF NOT EXISTS idx_web_forms_metadata_gin ON public.web_forms USING GIN (metadata);