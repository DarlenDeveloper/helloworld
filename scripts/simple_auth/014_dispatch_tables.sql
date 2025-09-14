-- New tables for dispatch session management and per-attempt results
-- Filtered by auth.uid() via RLS so each user only sees their own records.

-- 1) Sessions: one row per dispatch run (campaign-dispatch or channel-specific)
CREATE TABLE IF NOT EXISTS public.dispatch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL, -- auth.uid()
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  channel TEXT NOT NULL CHECK (channel IN ('call','whatsapp','email')),
  config JSONB,                     -- { CONTACTS_PER_SESSION, SESSION_MS, GAP_MS, note }
  totals JSONB,                     -- { queued, sent, failed, invalid, duration_ms, dispatched }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS ds_select ON public.dispatch_sessions;
  DROP POLICY IF EXISTS ds_insert ON public.dispatch_sessions;
  DROP POLICY IF EXISTS ds_update ON public.dispatch_sessions;

  CREATE POLICY ds_select ON public.dispatch_sessions
    FOR SELECT USING (auth.uid() = owner_id);
  CREATE POLICY ds_insert ON public.dispatch_sessions
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
  CREATE POLICY ds_update ON public.dispatch_sessions
    FOR UPDATE USING (auth.uid() = owner_id);
END $$;

CREATE INDEX IF NOT EXISTS idx_dispatch_sessions_owner ON public.dispatch_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_sessions_started ON public.dispatch_sessions(started_at);

-- 2) Events: one row per processed contact within a session
CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dispatch_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL, -- auth.uid()
  campaign_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call','whatsapp','email')),
  action TEXT NOT NULL CHECK (action IN ('selected','skipped','invalid','sent','failed','done')),
  detail JSONB,                      -- { to, reason, error, http_status?, payload? }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS de_select ON public.dispatch_events;
  DROP POLICY IF EXISTS de_insert ON public.dispatch_events;

  CREATE POLICY de_select ON public.dispatch_events
    FOR SELECT USING (auth.uid() = owner_id);
  CREATE POLICY de_insert ON public.dispatch_events
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
END $$;

CREATE INDEX IF NOT EXISTS idx_dispatch_events_session ON public.dispatch_events(session_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_owner ON public.dispatch_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_campaign ON public.dispatch_events(campaign_id);