-- Minimal table for simple contact form submissions
-- Run this in Supabase SQL editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.contact_form_submissions (
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
ALTER TABLE public.contact_form_submissions ENABLE ROW LEVEL SECURITY;

-- Drop old policies safely (for re-runs)
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS cfs_read   ON public.contact_form_submissions;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS cfs_insert ON public.contact_form_submissions;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS cfs_update ON public.contact_form_submissions;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS cfs_delete ON public.contact_form_submissions;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Read: owner or collaborator (matches your existing schema approach)
-- Requires helper function public.is_owner_or_collaborator(user_id, include_self boolean)
CREATE POLICY cfs_read
  ON public.contact_form_submissions
  FOR SELECT
  USING (public.is_owner_or_collaborator(user_id, FALSE));

-- Insert/Update/Delete: owner only
CREATE POLICY cfs_insert
  ON public.contact_form_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY cfs_update
  ON public.contact_form_submissions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY cfs_delete
  ON public.contact_form_submissions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_cfs_user_created ON public.contact_form_submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfs_email        ON public.contact_form_submissions(email);
CREATE INDEX IF NOT EXISTS idx_cfs_phone        ON public.contact_form_submissions(phone);