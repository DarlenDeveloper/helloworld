-- WhatsApp-specific batches and campaigns (separate from generic contact batches and campaigns)
-- Idempotent and aligned with the simple_auth permissive RLS approach

-- 1) WhatsApp contact batches
CREATE TABLE IF NOT EXISTS public.whatsapp_contact_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_contact_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS all_auth_read   ON public.whatsapp_contact_batches;
  DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_contact_batches;
  DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_contact_batches;
  DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_contact_batches;

  CREATE POLICY all_auth_read   ON public.whatsapp_contact_batches FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.whatsapp_contact_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.whatsapp_contact_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.whatsapp_contact_batches FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_batches_created ON public.whatsapp_contact_batches(created_at DESC);

-- 2) Junction: whatsapp batch contacts (with snapshot columns)
CREATE TABLE IF NOT EXISTS public.whatsapp_batch_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.whatsapp_contact_batches(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  -- Snapshot columns for ease of use without joining back to contacts
  name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_batch_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS all_auth_read   ON public.whatsapp_batch_contacts;
  DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_batch_contacts;
  DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_batch_contacts;
  DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_batch_contacts;

  CREATE POLICY all_auth_read   ON public.whatsapp_batch_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.whatsapp_batch_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.whatsapp_batch_contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.whatsapp_batch_contacts FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_batch_contacts_batch ON public.whatsapp_batch_contacts(batch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_batch_contacts_contact ON public.whatsapp_batch_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_batch_contacts_batch_created ON public.whatsapp_batch_contacts(batch_id, created_at DESC);

-- 3) WhatsApp campaigns
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed')) DEFAULT 'draft',
  target_contacts INTEGER DEFAULT 0,
  completed_sends INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.00,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS all_auth_read   ON public.whatsapp_campaigns;
  DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_campaigns;
  DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_campaigns;
  DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_campaigns;

  CREATE POLICY all_auth_read   ON public.whatsapp_campaigns FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.whatsapp_campaigns FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.whatsapp_campaigns FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.whatsapp_campaigns FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created ON public.whatsapp_campaigns(created_at DESC);

-- 4) WhatsApp campaign <-> batch linking
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.whatsapp_contact_batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_campaign_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS all_auth_read   ON public.whatsapp_campaign_batches;
  DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_campaign_batches;
  DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_campaign_batches;
  DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_campaign_batches;

  CREATE POLICY all_auth_read   ON public.whatsapp_campaign_batches FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.whatsapp_campaign_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.whatsapp_campaign_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.whatsapp_campaign_batches FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_batches_campaign ON public.whatsapp_campaign_batches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_batches_batch    ON public.whatsapp_campaign_batches(batch_id);

-- 5) WhatsApp campaign queue (per-contact dispatch state)
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','done','failed')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_campaign_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS all_auth_read   ON public.whatsapp_campaign_contacts;
  DROP POLICY IF EXISTS all_auth_insert ON public.whatsapp_campaign_contacts;
  DROP POLICY IF EXISTS all_auth_update ON public.whatsapp_campaign_contacts;
  DROP POLICY IF EXISTS all_auth_delete ON public.whatsapp_campaign_contacts;

  CREATE POLICY all_auth_read   ON public.whatsapp_campaign_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.whatsapp_campaign_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.whatsapp_campaign_contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.whatsapp_campaign_contacts FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_campaign_contact ON public.whatsapp_campaign_contacts(campaign_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_contacts_status ON public.whatsapp_campaign_contacts(campaign_id, status);

-- 6) RPC to populate WhatsApp campaign queue from whatsapp_campaign_batches -> whatsapp_batch_contacts
CREATE OR REPLACE FUNCTION public.populate_whatsapp_campaign_contacts(p_campaign UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH to_insert AS (
    SELECT DISTINCT cb.campaign_id, bc.contact_id
    FROM public.whatsapp_campaign_batches cb
    JOIN public.whatsapp_batch_contacts bc ON bc.batch_id = cb.batch_id
    WHERE cb.campaign_id = p_campaign
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_campaign_contacts cc
        WHERE cc.campaign_id = cb.campaign_id AND cc.contact_id = bc.contact_id
      )
  )
  INSERT INTO public.whatsapp_campaign_contacts(campaign_id, contact_id)
  SELECT campaign_id, contact_id FROM to_insert
  RETURNING 1;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN COALESCE(inserted_count, 0);
END $$;
