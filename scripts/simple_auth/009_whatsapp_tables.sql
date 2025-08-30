-- WhatsApp tables modeled after calls and call_history
-- Idempotent: safe to run multiple times

-- WhatsApp (like calls)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT,
  recipient_phone TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'in_progress')),
  body TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WhatsApp history (like call_history)
CREATE TABLE IF NOT EXISTS public.whatsapp_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL,
  cost NUMERIC,
  notes TEXT,
  ai_summary TEXT,
  sentiment TEXT,
  message_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and permissive policies similar to base schema
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Drop existing policies to avoid duplication on re-run
  PERFORM 1;
  BEGIN
    DROP POLICY IF EXISTS all_auth_read ON public.whatsapp_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    DROP POLICY IF EXISTS all_auth_read ON public.whatsapp_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_history;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

CREATE POLICY all_auth_read   ON public.whatsapp_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_insert ON public.whatsapp_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_update ON public.whatsapp_messages FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_delete ON public.whatsapp_messages FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY all_auth_read   ON public.whatsapp_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_insert ON public.whatsapp_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_update ON public.whatsapp_history FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY all_auth_delete ON public.whatsapp_history FOR DELETE USING (auth.uid() IS NOT NULL);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_history_date        ON public.whatsapp_history(message_date DESC);
