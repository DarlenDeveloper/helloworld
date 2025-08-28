-- Campaign dispatch infrastructure for simple_auth schema
-- 1) Queue table: campaign_contacts
-- 2) Add webhook_url to campaigns
-- 3) RPC: populate_campaign_contacts(campaign_id)

-- 1) Queue table for per-contact dispatch state
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','done','failed')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS cc_all_auth_read ON public.campaign_contacts;
  DROP POLICY IF EXISTS cc_all_auth_insert ON public.campaign_contacts;
  DROP POLICY IF EXISTS cc_all_auth_update ON public.campaign_contacts;
  DROP POLICY IF EXISTS cc_all_auth_delete ON public.campaign_contacts;

  CREATE POLICY cc_all_auth_read   ON public.campaign_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY cc_all_auth_insert ON public.campaign_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY cc_all_auth_update ON public.campaign_contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY cc_all_auth_delete ON public.campaign_contacts FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_contact ON public.campaign_contacts(campaign_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON public.campaign_contacts(campaign_id, status);

-- 2) Add webhook URL column to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- 3) Populate queue from campaign_batches -> batch_contacts
CREATE OR REPLACE FUNCTION public.populate_campaign_contacts(p_campaign UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH to_insert AS (
    SELECT DISTINCT cb.campaign_id, bc.contact_id
    FROM public.campaign_batches cb
    JOIN public.batch_contacts bc ON bc.batch_id = cb.batch_id
    WHERE cb.campaign_id = p_campaign
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_contacts cc
        WHERE cc.campaign_id = cb.campaign_id AND cc.contact_id = bc.contact_id
      )
  )
  INSERT INTO public.campaign_contacts(campaign_id, contact_id)
  SELECT campaign_id, contact_id FROM to_insert
  RETURNING 1;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN COALESCE(inserted_count, 0);
END $$;