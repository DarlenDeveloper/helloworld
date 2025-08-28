+-- Simple Auth and Global Access Schema
-- Apply this to a fresh Supabase project.
-- Provides:
--  - profiles table + trigger on auth.users insert
--  - domain tables (no organization columns)
--  - permissive RLS so any authenticated user can read/write data

-- 0) Ensure required extensions (gen_random_uuid)
-- Supabase usually has pgcrypto/pg_uuid available, but keep safe check
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Profiles table and trigger on auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS profiles_all_auth_read ON public.profiles;
  DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
  DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
  DROP POLICY IF EXISTS profiles_self_delete ON public.profiles;
END $$;

-- Allow all authenticated users to read any profile
CREATE POLICY profiles_all_auth_read ON public.profiles
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only the user (id = auth.uid()) can insert/update/delete their own profile
CREATE POLICY profiles_self_insert ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_self_update ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY profiles_self_delete ON public.profiles
FOR DELETE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2) Domain tables (no organization scoping)

-- Calls
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'in_progress')),
  duration INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed')) DEFAULT 'draft',
  target_contacts INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contact batches
CREATE TABLE IF NOT EXISTS public.contact_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign <-> Batch linking
CREATE TABLE IF NOT EXISTS public.campaign_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.contact_batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Call history
CREATE TABLE IF NOT EXISTS public.call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL,
  duration INTEGER,
  cost NUMERIC,
  notes TEXT,
  ai_summary TEXT,
  sentiment TEXT,
  call_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Knowledge base articles
CREATE TABLE IF NOT EXISTS public.knowledge_base_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User login logs
CREATE TABLE IF NOT EXISTS public.user_login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  status TEXT,
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) RLS: permissive policies for authenticated users on domain tables
DO $$
DECLARE
  t TEXT;
  pol RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'public.calls',
    'public.campaigns',
    'public.contact_batches',
    'public.campaign_batches',
    'public.call_history',
    'public.knowledge_base_articles',
    'public.user_login_logs',
    'public.contacts'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
      -- Drop existing policies to avoid duplication errors in re-runs
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = split_part(t, '.', 2)
      LOOP
        EXECUTE format('DROP POLICY %I ON %s', pol.policyname, t);
      END LOOP;
      -- Create permissive policies
      EXECUTE format('CREATE POLICY all_auth_read ON %s FOR SELECT USING (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_insert ON %s FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_update ON %s FOR UPDATE USING (auth.uid() IS NOT NULL)', t);
      EXECUTE format('CREATE POLICY all_auth_delete ON %s FOR DELETE USING (auth.uid() IS NOT NULL)', t);
    EXCEPTION WHEN undefined_table THEN
      -- Table not present; skip
      NULL;
    END;
  END LOOP;
END $$;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_batches_created_at ON public.contact_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_date ON public.call_history(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_kb_created_at ON public.knowledge_base_articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_created_at ON public.user_login_logs(created_at DESC);


https://eumrsrxeebqsquccnjmr.supabase.co
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1bXJzcnhlZWJxc3F1Y2Nuam1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzODczNTQsImV4cCI6MjA3MTk2MzM1NH0.67a2LuaiWrtCK3ETeDF5903U2sCbV2jVvM6xntxi8c0
