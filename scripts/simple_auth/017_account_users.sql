-- Accounts RBAC (replaces collaborators with independent secondary users)
-- Safe to run multiple times (idempotent drops where needed)

-- 0) Required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Helper: update_timestamp() (idempotent)
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$f$;

-- 2) Drop old collaborator artifacts if they exist (ignore if missing)
DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP FUNCTION IF EXISTS public.is_owner_or_collaborator(uuid, boolean) CASCADE';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'DROP TABLE IF EXISTS public.user_collaboration_invitations CASCADE';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    EXECUTE 'DROP TABLE IF EXISTS public.user_collaborators CASCADE';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END
$$ LANGUAGE plpgsql;

-- 3) New mapping: account_users (owner -> member)
CREATE TABLE IF NOT EXISTS public.account_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_account_users UNIQUE (owner_user_id, member_user_id)
);

ALTER TABLE public.account_users ENABLE ROW LEVEL SECURITY;

-- Drop any existing account_users policies, then recreate cleanly
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='account_users'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.account_users', r.policyname);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- Policies: owners manage membership rows; members can read their membership
CREATE POLICY account_users_read ON public.account_users
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR auth.uid() = member_user_id
  );

CREATE POLICY account_users_insert ON public.account_users
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY account_users_update ON public.account_users
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY account_users_delete ON public.account_users
  FOR DELETE
  USING (auth.uid() = owner_user_id);

CREATE INDEX IF NOT EXISTS idx_account_users_owner ON public.account_users(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_users_member ON public.account_users(member_user_id);

DROP TRIGGER IF EXISTS trg_update_account_users_timestamp ON public.account_users;
CREATE TRIGGER trg_update_account_users_timestamp
BEFORE UPDATE ON public.account_users
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- 4) Secondary user metadata table (public.users) - per-owner scoped
-- Note: id is uuid; user_ref_id is human-friendly code like '001'
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_ref_id VARCHAR(10) NULL, -- e.g., '001'
  name VARCHAR(100) NOT NULL,   -- legal/company name for the secondary user entry
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NULL,
  pin VARCHAR(4) NOT NULL,      -- 4-digit PIN (kept as requested)
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  CONSTRAINT uq_owner_user_ref UNIQUE (owner_user_id, user_ref_id)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='users'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.users', r.policyname);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- Owners can read/write their secondary user metadata
-- Members can read their own metadata row (by email match) for transparency
CREATE POLICY users_read ON public.users
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM auth.users au
      WHERE au.id = auth.uid() AND lower(au.email) = lower(public.users.email)
    )
  );

CREATE POLICY users_insert ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY users_update ON public.users
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY users_delete ON public.users
  FOR DELETE
  USING (auth.uid() = owner_user_id);

DROP TRIGGER IF EXISTS trg_update_users_timestamp ON public.users;
CREATE TRIGGER trg_update_users_timestamp
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- 5) Helper function for RLS across domain tables:
-- Owner-or-admin (admin membership via account_users, must be active)
CREATE OR REPLACE FUNCTION public.is_owner_or_admin(p_owner UUID, require_admin BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $sql$
SELECT (
  auth.uid() = p_owner
  OR EXISTS (
    SELECT 1
    FROM public.account_users au
    WHERE au.owner_user_id = p_owner
      AND au.member_user_id = auth.uid()
      AND au.is_active = TRUE
      AND (NOT require_admin OR lower(au.role) = 'admin')
  )
);
$sql$;

-- 6) Rewire RLS on domain tables to is_owner_or_admin

-- Calls
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='calls') THEN
    EXECUTE 'ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='calls' LOOP
      EXECUTE format('DROP POLICY %I ON public.calls', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY calls_read   ON public.calls   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY calls_insert ON public.calls   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY calls_update ON public.calls   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY calls_delete ON public.calls   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Campaigns
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    EXECUTE 'ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='campaigns' LOOP
      EXECUTE format('DROP POLICY %I ON public.campaigns', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY campaigns_read   ON public.campaigns   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY campaigns_insert ON public.campaigns   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY campaigns_update ON public.campaigns   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY campaigns_delete ON public.campaigns   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Contact batches
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contact_batches') THEN
    EXECUTE 'ALTER TABLE public.contact_batches ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contact_batches' LOOP
      EXECUTE format('DROP POLICY %I ON public.contact_batches', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY contact_batches_read   ON public.contact_batches   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contact_batches_insert ON public.contact_batches   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contact_batches_update ON public.contact_batches   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contact_batches_delete ON public.contact_batches   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Campaign <-> Batch linking (authenticated): keep open per previous design
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaign_batches') THEN
    EXECUTE 'ALTER TABLE public.campaign_batches ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='campaign_batches' LOOP
      EXECUTE format('DROP POLICY %I ON public.campaign_batches', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY campaign_batches_read   ON public.campaign_batches FOR SELECT USING (auth.uid() IS NOT NULL)$ddl$;
    EXECUTE $ddl$CREATE POLICY campaign_batches_insert ON public.campaign_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)$ddl$;
    EXECUTE $ddl$CREATE POLICY campaign_batches_update ON public.campaign_batches FOR UPDATE USING (auth.uid() IS NOT NULL)$ddl$;
    EXECUTE $ddl$CREATE POLICY campaign_batches_delete ON public.campaign_batches FOR DELETE USING (auth.uid() IS NOT NULL)$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Call history
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='call_history') THEN
    EXECUTE 'ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='call_history' LOOP
      EXECUTE format('DROP POLICY %I ON public.call_history', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY call_history_read   ON public.call_history   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY call_history_insert ON public.call_history   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY call_history_update ON public.call_history   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY call_history_delete ON public.call_history   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Contacts
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts') THEN
    EXECUTE 'ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contacts' LOOP
      EXECUTE format('DROP POLICY %I ON public.contacts', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY contacts_read   ON public.contacts   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_insert ON public.contacts   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_update ON public.contacts   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_delete ON public.contacts   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Contacts intake
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts_intake') THEN
    EXECUTE 'ALTER TABLE public.contacts_intake ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contacts_intake' LOOP
      EXECUTE format('DROP POLICY %I ON public.contacts_intake', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY contacts_intake_read   ON public.contacts_intake   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_intake_insert ON public.contacts_intake   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_intake_update ON public.contacts_intake   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY contacts_intake_delete ON public.contacts_intake   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;
-- Knowledge base
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='knowledge_base_articles') THEN
    EXECUTE 'ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_articles' LOOP
      EXECUTE format('DROP POLICY %I ON public.knowledge_base_articles', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY kba_read   ON public.knowledge_base_articles   FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY kba_insert ON public.knowledge_base_articles   FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY kba_update ON public.knowledge_base_articles   FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY kba_delete ON public.knowledge_base_articles   FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Dispatch sessions/events
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dispatch_sessions') THEN
    EXECUTE 'ALTER TABLE public.dispatch_sessions ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_sessions' LOOP
      EXECUTE format('DROP POLICY %I ON public.dispatch_sessions', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY ds_select ON public.dispatch_sessions FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY ds_insert ON public.dispatch_sessions FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY ds_update ON public.dispatch_sessions FOR UPDATE USING (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dispatch_events') THEN
    EXECUTE 'ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_events' LOOP
      EXECUTE format('DROP POLICY %I ON public.dispatch_events', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY de_select ON public.dispatch_events FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY de_insert ON public.dispatch_events FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

-- Call scheduling (24h transport)
DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='call_scheduling_sessions') THEN
    EXECUTE 'ALTER TABLE public.call_scheduling_sessions ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='call_scheduling_sessions' LOOP
      EXECUTE format('DROP POLICY %I ON public.call_scheduling_sessions', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY css_select ON public.call_scheduling_sessions FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY css_insert ON public.call_scheduling_sessions FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY css_update ON public.call_scheduling_sessions FOR UPDATE USING (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='call_scheduling_queue') THEN
    EXECUTE 'ALTER TABLE public.call_scheduling_queue ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='call_scheduling_queue' LOOP
      EXECUTE format('DROP POLICY %I ON public.call_scheduling_queue', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY csq_select ON public.call_scheduling_queue FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY csq_insert ON public.call_scheduling_queue FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;

DO $b$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='call_scheduling_logs') THEN
    EXECUTE 'ALTER TABLE public.call_scheduling_logs ENABLE ROW LEVEL SECURITY';
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='call_scheduling_logs' LOOP
      EXECUTE format('DROP POLICY %I ON public.call_scheduling_logs', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY csl_select ON public.call_scheduling_logs FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY csl_insert ON public.call_scheduling_logs FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE))$ddl$;
  END IF;
END
$b$ LANGUAGE plpgsql;
-- Optional rewiring for Email/WhatsApp tables (if present) to is_owner_or_admin RBAC
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='emails') THEN
    ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='emails' LOOP
      EXECUTE format('DROP POLICY %I ON public.emails', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY emails_read   ON public.emails FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY emails_insert ON public.emails FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY emails_update ON public.emails FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY emails_delete ON public.emails FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_history') THEN
    ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='email_history' LOOP
      EXECUTE format('DROP POLICY %I ON public.email_history', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY email_history_read   ON public.email_history FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY email_history_insert ON public.email_history FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY email_history_update ON public.email_history FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY email_history_delete ON public.email_history FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_messages') THEN
    ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_messages' LOOP
      EXECUTE format('DROP POLICY %I ON public.whatsapp_messages', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY whatsapp_messages_read   ON public.whatsapp_messages FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_messages_insert ON public.whatsapp_messages FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_messages_update ON public.whatsapp_messages FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_messages_delete ON public.whatsapp_messages FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_history') THEN
    ALTER TABLE public.whatsapp_history ENABLE ROW LEVEL SECURITY;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_history' LOOP
      EXECUTE format('DROP POLICY %I ON public.whatsapp_history', r.policyname);
    END LOOP;
    EXECUTE $ddl$CREATE POLICY whatsapp_history_read   ON public.whatsapp_history FOR SELECT USING (public.is_owner_or_admin(user_id, FALSE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_history_insert ON public.whatsapp_history FOR INSERT WITH CHECK (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_history_update ON public.whatsapp_history FOR UPDATE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
    EXECUTE $ddl$CREATE POLICY whatsapp_history_delete ON public.whatsapp_history FOR DELETE USING (public.is_owner_or_admin(user_id, TRUE))$ddl$;
  END IF;
END
$$ LANGUAGE plpgsql;