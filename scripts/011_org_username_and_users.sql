-- Add organization username (slug) and an org users view
-- 1) Add username column to organizations and populate
-- 2) Create helper to slugify and trigger to set username on insert
-- 3) Create view organization_users for convenience

-- 1) Add username column
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 2) Slugify helper and trigger
CREATE OR REPLACE FUNCTION public.slugify(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  s TEXT;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN NULL;
  END IF;
  s := lower(p_text);
  s := regexp_replace(s, '\\s+', '-', 'g'); -- spaces to dash
  s := regexp_replace(s, '[^a-z0-9\-]', '', 'g'); -- strip non-alnum/dash
  s := regexp_replace(s, '\\-+', '-', 'g'); -- squish dashes
  s := trim(both '-' from s);
  IF s = '' THEN
    RETURN NULL;
  END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_username()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  IF NEW.username IS NULL OR NEW.username = '' THEN
    base := public.slugify(NEW.name);
    IF base IS NULL THEN
      base := encode(gen_random_bytes(6), 'hex');
    END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE username = candidate AND id <> NEW.id) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix::TEXT;
    END LOOP;
    NEW.username := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_org_username ON public.organizations;
CREATE TRIGGER trg_set_org_username
BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_org_username();

-- Backfill existing usernames
UPDATE public.organizations o
SET username = COALESCE(public.slugify(o.name), encode(gen_random_bytes(6), 'hex'))
WHERE o.username IS NULL;

-- 3) Organization users view (members joined with profiles)
CREATE OR REPLACE VIEW public.organization_users AS
SELECT
  m.organization_id,
  m.user_id,
  m.role,
  m.created_at,
  p.full_name,
  p.email
FROM public.organization_members m
JOIN public.profiles p ON p.id = m.user_id;
