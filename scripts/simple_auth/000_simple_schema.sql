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

-- 3) RLS: collaborator-based access across domain tables
-- Owner-or-collaborator can read; owner can write. Owners can also
-- read collaborators' login logs.

-- Calls
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='calls' LOOP
    EXECUTE format('DROP POLICY %I ON public.calls', r.policyname);
  END LOOP;
END $;
CREATE POLICY calls_read   ON public.calls FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY calls_insert ON public.calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY calls_update ON public.calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY calls_delete ON public.calls FOR DELETE USING (auth.uid() = user_id);

-- Campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='campaigns' LOOP
    EXECUTE format('DROP POLICY %I ON public.campaigns', r.policyname);
  END LOOP;
END $;
CREATE POLICY campaigns_read   ON public.campaigns FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY campaigns_delete ON public.campaigns FOR DELETE USING (auth.uid() = user_id);

-- Contact batches
ALTER TABLE public.contact_batches ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contact_batches' LOOP
    EXECUTE format('DROP POLICY %I ON public.contact_batches', r.policyname);
  END LOOP;
END $;
CREATE POLICY contact_batches_read   ON public.contact_batches FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY contact_batches_insert ON public.contact_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contact_batches_update ON public.contact_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contact_batches_delete ON public.contact_batches FOR DELETE USING (auth.uid() = user_id);

-- Campaign <-> Batch linking (no owner column; leave authenticated)
ALTER TABLE public.campaign_batches ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='campaign_batches' LOOP
    EXECUTE format('DROP POLICY %I ON public.campaign_batches', r.policyname);
  END LOOP;
END $;
CREATE POLICY campaign_batches_read   ON public.campaign_batches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_insert ON public.campaign_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_update ON public.campaign_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_delete ON public.campaign_batches FOR DELETE USING (auth.uid() IS NOT NULL);

-- Call history
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='call_history' LOOP
    EXECUTE format('DROP POLICY %I ON public.call_history', r.policyname);
  END LOOP;
END $;
CREATE POLICY call_history_read   ON public.call_history FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY call_history_insert ON public.call_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY call_history_update ON public.call_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY call_history_delete ON public.call_history FOR DELETE USING (auth.uid() = user_id);

-- Knowledge base articles
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_articles' LOOP
    EXECUTE format('DROP POLICY %I ON public.knowledge_base_articles', r.policyname);
  END LOOP;
END $;
CREATE POLICY kba_read   ON public.knowledge_base_articles FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY kba_insert ON public.knowledge_base_articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY kba_update ON public.knowledge_base_articles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY kba_delete ON public.knowledge_base_articles FOR DELETE USING (auth.uid() = user_id);

-- Contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contacts' LOOP
    EXECUTE format('DROP POLICY %I ON public.contacts', r.policyname);
  END LOOP;
END $;
CREATE POLICY contacts_read   ON public.contacts FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY contacts_insert ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contacts_update ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contacts_delete ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- User login logs: allow self, and owners to see collaborator logs
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;
DO $ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_login_logs' LOOP
    EXECUTE format('DROP POLICY %I ON public.user_login_logs', r.policyname);
  END LOOP;
END $;
CREATE POLICY ull_read   ON public.user_login_logs FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.user_collaborators c
    WHERE c.owner_user_id = auth.uid() AND c.collaborator_user_id = user_id
  )
);
CREATE POLICY ull_insert ON public.user_login_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ull_update ON public.user_login_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ull_delete ON public.user_login_logs FOR DELETE USING (auth.uid() = user_id);

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_batches_created_at ON public.contact_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_date ON public.call_history(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_kb_created_at ON public.knowledge_base_articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_created_at ON public.user_login_logs(created_at DESC);
