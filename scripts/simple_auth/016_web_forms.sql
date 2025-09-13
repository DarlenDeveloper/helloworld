-- Web Forms submissions table (read-only listing UI)
-- Idempotent: safe to run multiple times

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.web_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  form_name TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  metadata JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK to organizations if table exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations') THEN
    ALTER TABLE public.web_forms
    ADD CONSTRAINT web_forms_org_fk
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;

-- Enable RLS
ALTER TABLE public.web_forms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for re-runs
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS wf_read_members ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS wf_insert_admin_or_manager ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS wf_update_admin_or_manager ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS wf_delete_admin_or_manager ON public.web_forms;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Read: any member of the organization
CREATE POLICY wf_read_members
  ON public.web_forms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = web_forms.organization_id
        AND m.user_id = auth.uid()
    )
  );

-- Insert/Update/Delete: admins or managers in the organization
CREATE POLICY wf_insert_admin_or_manager
  ON public.web_forms
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = web_forms.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin','manager')
    )
  );

CREATE POLICY wf_update_admin_or_manager
  ON public.web_forms
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = web_forms.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin','manager')
    )
  );

CREATE POLICY wf_delete_admin_or_manager
  ON public.web_forms
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = web_forms.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin','manager')
    )
  );

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_web_forms_org_time ON public.web_forms (organization_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_forms_email ON public.web_forms ((lower(email)));
CREATE INDEX IF NOT EXISTS idx_web_forms_phone ON public.web_forms (phone);
CREATE INDEX IF NOT EXISTS idx_web_forms_form_name ON public.web_forms ((lower(form_name)));
CREATE INDEX IF NOT EXISTS idx_web_forms_metadata_gin ON public.web_forms USING GIN (metadata);