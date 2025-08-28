-- Enforce a hard limit of 1000 contacts per batch
CREATE OR REPLACE FUNCTION public.check_batch_contacts_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.batch_contacts WHERE batch_id = NEW.batch_id;
  IF cnt >= 1000 THEN
    RAISE EXCEPTION 'Contact batch limit reached (1000) for batch %', NEW.batch_id USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_check_batch_contacts_limit ON public.batch_contacts;
CREATE TRIGGER trg_check_batch_contacts_limit
BEFORE INSERT ON public.batch_contacts
FOR EACH ROW EXECUTE FUNCTION public.check_batch_contacts_limit();
