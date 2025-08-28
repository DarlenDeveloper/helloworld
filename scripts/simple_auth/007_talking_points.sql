-- Talking points schema for analytics
-- 1) Categories (seeded)
-- 2) Events (realtime stream)
-- 3) Optional aggregates table

-- 1) Categories
CREATE TABLE IF NOT EXISTS public.talking_points_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.talking_points_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS tpc_all_auth_read ON public.talking_points_categories;
  DROP POLICY IF EXISTS tpc_all_auth_insert ON public.talking_points_categories;
  DROP POLICY IF EXISTS tpc_all_auth_update ON public.talking_points_categories;
  DROP POLICY IF EXISTS tpc_all_auth_delete ON public.talking_points_categories;

  CREATE POLICY tpc_all_auth_read   ON public.talking_points_categories FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY tpc_all_auth_insert ON public.talking_points_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY tpc_all_auth_update ON public.talking_points_categories FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY tpc_all_auth_delete ON public.talking_points_categories FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

-- Seed 7 categories (idempotent)
INSERT INTO public.talking_points_categories(name, slug)
VALUES
  ('Health','health'),
  ('Life','life'),
  ('Property','property'),
  ('Motor','motor'),
  ('Travel','travel'),
  ('Disability','disability'),
  ('Business','business')
ON CONFLICT (slug) DO NOTHING;

-- 2) Events (fine-grained realtime entries)
CREATE TABLE IF NOT EXISTS public.talking_points_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.talking_points_categories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.talking_points_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS tpe_all_auth_read ON public.talking_points_events;
  DROP POLICY IF EXISTS tpe_all_auth_insert ON public.talking_points_events;
  DROP POLICY IF EXISTS tpe_all_auth_update ON public.talking_points_events;
  DROP POLICY IF EXISTS tpe_all_auth_delete ON public.talking_points_events;

  CREATE POLICY tpe_all_auth_read   ON public.talking_points_events FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY tpe_all_auth_insert ON public.talking_points_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY tpe_all_auth_update ON public.talking_points_events FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY tpe_all_auth_delete ON public.talking_points_events FOR DELETE USING (auth.uid() IS NOT NULL);
END $$;

CREATE INDEX IF NOT EXISTS idx_tpe_category_created ON public.talking_points_events(category_id, created_at DESC);
