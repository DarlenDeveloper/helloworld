-- Shift access control from user_id to organization_id and enforce org-based access
-- 1) Add organization_id to domain tables
-- 2) Backfill organization_id using get_user_org_id(user_id)
-- 3) RLS: allow members of the org to access rows
-- 4) BEFORE INSERT trigger to set organization_id from current user's membership
-- 5) Remove auto-org creation in ensure_org_for_new_user()
-- 6) Create helper to explicitly create an org + admin membership

-- 1) Add organization_id columns (nullable initially for backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contact_batches' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.contact_batches ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.campaigns ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_batches' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.campaign_batches ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='calls' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.calls ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='call_history' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.call_history ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_login_logs' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.user_login_logs ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_base_articles' AND column_name='organization_id'
  ) THEN
    ALTER TABLE public.knowledge_base_articles ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2) Backfill with get_user_org_id(user_id)
UPDATE public.contacts SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.contact_batches SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.campaigns SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.calls SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.call_history SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.user_login_logs SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
UPDATE public.knowledge_base_articles SET organization_id = public.get_user_org_id(user_id) WHERE organization_id IS NULL;
-- campaign_batches derives org via campaign; set using campaign org when null
UPDATE public.campaign_batches cb SET organization_id = c.organization_id FROM public.campaigns c WHERE cb.campaign_id = c.id AND cb.organization_id IS NULL;

-- 3) RLS policies: org-based
-- Enable RLS (if not already); drop old user_id-based policies and add new ones
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- Helper to (re)apply a simple member policy
CREATE OR REPLACE FUNCTION public._apply_org_member_policies(_tbl regclass) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS org_%s_all ON %s', _tbl::text, _tbl::text);
  EXECUTE format('CREATE POLICY org_%s_all ON %s FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))', _tbl::text, _tbl::text);
END; $$;

SELECT public._apply_org_member_policies('public.contacts'::regclass);
SELECT public._apply_org_member_policies('public.contact_batches'::regclass);
SELECT public._apply_org_member_policies('public.campaigns'::regclass);
SELECT public._apply_org_member_policies('public.campaign_batches'::regclass);
SELECT public._apply_org_member_policies('public.calls'::regclass);
SELECT public._apply_org_member_policies('public.call_history'::regclass);
SELECT public._apply_org_member_policies('public.user_login_logs'::regclass);
SELECT public._apply_org_member_policies('public.knowledge_base_articles'::regclass);

-- 4) BEFORE INSERT trigger: inject organization_id from current user's membership
CREATE OR REPLACE FUNCTION public.set_org_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org UUID; BEGIN
  v_org := public.get_user_org_id(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User must belong to an organization to create records' USING ERRCODE='P0001';
  END IF;
  NEW.organization_id := COALESCE(NEW.organization_id, v_org);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_org_contacts ON public.contacts;
CREATE TRIGGER trg_set_org_contacts BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_contact_batches ON public.contact_batches;
CREATE TRIGGER trg_set_org_contact_batches BEFORE INSERT ON public.contact_batches FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_campaigns ON public.campaigns;
CREATE TRIGGER trg_set_org_campaigns BEFORE INSERT ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_campaign_batches ON public.campaign_batches;
CREATE TRIGGER trg_set_org_campaign_batches BEFORE INSERT ON public.campaign_batches FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_calls ON public.calls;
CREATE TRIGGER trg_set_org_calls BEFORE INSERT ON public.calls FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_call_history ON public.call_history;
CREATE TRIGGER trg_set_org_call_history BEFORE INSERT ON public.call_history FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_user_login_logs ON public.user_login_logs;
CREATE TRIGGER trg_set_org_user_login_logs BEFORE INSERT ON public.user_login_logs FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

DROP TRIGGER IF EXISTS trg_set_org_kb ON public.knowledge_base_articles;
CREATE TRIGGER trg_set_org_kb BEFORE INSERT ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION public.set_org_on_insert();

-- 5) Ensure new users are only attached via invite; do not auto-create orgs
CREATE OR REPLACE FUNCTION public.ensure_org_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org UUID; v_email TEXT; v_role public.org_role; BEGIN
  -- If already a member, nothing to do
  IF EXISTS(SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) THEN RETURN NEW; END IF;

  -- email
  v_email := COALESCE(NEW.email, (SELECT email FROM auth.users WHERE id = NEW.id));
  v_email := lower(v_email);

  -- Check invite
  SELECT organization_id, role INTO v_org, v_role
  FROM public.organization_invites
  WHERE lower(email) = v_email AND status='pending'
  ORDER BY created_at ASC LIMIT 1;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (v_org, NEW.id, v_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.account_emails(organization_id, user_id, email, is_primary)
    VALUES (v_org, NEW.id, v_email, TRUE)
    ON CONFLICT (email) DO NOTHING;

    UPDATE public.organization_invites SET status='accepted', accepted_at=NOW()
    WHERE organization_id = v_org AND lower(email)=v_email AND status='pending';
  END IF;

  -- No else branch: do not auto-create orgs
  RETURN NEW;
END; $$;

-- 6) Helper to explicitly create an organization + admin membership for current user
CREATE OR REPLACE FUNCTION public.create_organization(p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org UUID; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  INSERT INTO public.organizations(name, created_by) VALUES (p_name, auth.uid()) RETURNING id INTO v_org;
  INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (v_org, auth.uid(), 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN v_org;
END; $$;
