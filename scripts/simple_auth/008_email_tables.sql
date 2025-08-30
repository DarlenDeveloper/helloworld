-- Email tables modeled after calls and call_history
-- Idempotent: safe to run multiple times

-- Emails (like calls)
CREATE TABLE IF NOT EXISTS public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'in_progress')),
  subject TEXT,
  body TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email history (like call_history)
CREATE TABLE IF NOT EXISTS public.email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email_address TEXT NOT NULL,
  status TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  cost NUMERIC,
  notes TEXT,
  ai_summary TEXT,
  sentiment TEXT,
  email_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and permissive policies similar to base schema
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Drop existing policies to avoid duplication on re-run
  PERFORM 1;
  BEGIN
    DROP POLICY IF EXISTS all_auth_read ON public.emails;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_insert ON public.emails;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_update ON public.emails;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_delete ON public.emails;
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    DROP POLICY IF EXISTS all_auth_read ON public.email_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_insert ON public.email_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_update ON public.email_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_delete ON public.email_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

CREATE POLICY all_auth_read   ON public.emails        FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_insert ON public.emails        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_update ON public.emails        FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_delete ON public.emails        FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY all_auth_read   ON public.email_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_insert ON public.email_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_update ON public.email_history FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_delete ON public.email_history FOR DELETE USING (auth.uid() IS NOT NULL);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_emails_created_at          ON public.emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_history_date         ON public.email_history(email_date DESC);
