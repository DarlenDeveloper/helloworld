-- Add snapshot columns to store contact details on batch membership
ALTER TABLE public.batch_contacts
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Helpful index for ordering/filtering by creation time per batch (if not existing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_batch_contacts_batch_created'
  ) THEN
    CREATE INDEX idx_batch_contacts_batch_created ON public.batch_contacts(batch_id, created_at DESC);
  END IF;
END $$;
