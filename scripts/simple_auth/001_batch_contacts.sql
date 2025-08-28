-- Junction table linking contacts to contact_batches
CREATE TABLE IF NOT EXISTS public.batch_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.contact_batches(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.batch_contacts ENABLE ROW LEVEL SECURITY;

-- Permissive RLS for authenticated users (consistent with simple_auth policies)
DO $$
BEGIN
  DROP POLICY IF EXISTS all_auth_read ON public.batch_contacts;
  DROP POLICY IF EXISTS all_auth_insert ON public.batch_contacts;
  DROP POLICY IF EXISTS all_auth_update ON public.batch_contacts;
  DROP POLICY IF EXISTS all_auth_delete ON public.batch_contacts;

  CREATE POLICY all_auth_read ON public.batch_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_insert ON public.batch_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_update ON public.batch_contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY all_auth_delete ON public.batch_contacts FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_batch_contacts_batch ON public.batch_contacts(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_contacts_contact ON public.batch_contacts(contact_id);
