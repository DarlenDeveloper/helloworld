-- Temporary transport for Call Scheduling (auto-pruned after 24h)
-- Scope: per-user via RLS. These tables act as a staging bridge to the call backend.
-- Cleanup strategy: statement-level triggers prune rows older than 24h on any write.

-- 1) Sessions table: one row per "Start Call Batch" action
CREATE TABLE IF NOT EXISTS public.call_scheduling_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL, -- auth.uid()
  batch_id UUID NOT NULL REFERENCES public.contact_batches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  totals JSONB,                                    -- { enqueued, skipped, errored }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.call_scheduling_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS css_select ON public.call_scheduling_sessions;
  DROP POLICY IF EXISTS css_insert ON public.call_scheduling_sessions;
  DROP POLICY IF EXISTS css_update ON public.call_scheduling_sessions;

  CREATE POLICY css_select ON public.call_scheduling_sessions
    FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE));

  CREATE POLICY css_insert ON public.call_scheduling_sessions
    FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE));

  CREATE POLICY css_update ON public.call_scheduling_sessions
    FOR UPDATE USING (public.is_owner_or_admin(owner_id, TRUE));
END $$;

CREATE INDEX IF NOT EXISTS idx_css_owner ON public.call_scheduling_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_css_batch ON public.call_scheduling_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_css_created ON public.call_scheduling_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_css_expires ON public.call_scheduling_sessions(expires_at);

-- 2) Queue table: rows to be transported to the call backend
CREATE TABLE IF NOT EXISTS public.call_scheduling_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.call_scheduling_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL, -- auth.uid()
  batch_id UUID NOT NULL REFERENCES public.contact_batches(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  target_phone TEXT,                                 -- send as-is; do NOT enforce format here
  payload JSONB,                                     -- optional extra metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.call_scheduling_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS csq_select ON public.call_scheduling_queue;
  DROP POLICY IF EXISTS csq_insert ON public.call_scheduling_queue;

  CREATE POLICY csq_select ON public.call_scheduling_queue
    FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE));

  CREATE POLICY csq_insert ON public.call_scheduling_queue
    FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE));
END $$;

CREATE INDEX IF NOT EXISTS idx_csq_session ON public.call_scheduling_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_csq_owner ON public.call_scheduling_queue(owner_id);
CREATE INDEX IF NOT EXISTS idx_csq_batch ON public.call_scheduling_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_csq_contact ON public.call_scheduling_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_csq_created ON public.call_scheduling_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_csq_expires ON public.call_scheduling_queue(expires_at);

-- 3) Logs table: lightweight audit of enqueue results
CREATE TABLE IF NOT EXISTS public.call_scheduling_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.call_scheduling_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL, -- auth.uid()
  contact_id UUID,                                    -- nullable for session-level messages
  action TEXT NOT NULL CHECK (action IN ('enqueued','skipped','failed')),
  detail JSONB,                                       -- { reason?, error?, phone?, ... }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.call_scheduling_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS csl_select ON public.call_scheduling_logs;
  DROP POLICY IF EXISTS csl_insert ON public.call_scheduling_logs;

  CREATE POLICY csl_select ON public.call_scheduling_logs
    FOR SELECT USING (public.is_owner_or_admin(owner_id, FALSE));

  CREATE POLICY csl_insert ON public.call_scheduling_logs
    FOR INSERT WITH CHECK (public.is_owner_or_admin(owner_id, TRUE));
END $$;

CREATE INDEX IF NOT EXISTS idx_csl_session ON public.call_scheduling_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_csl_owner ON public.call_scheduling_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_csl_contact ON public.call_scheduling_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_csl_created ON public.call_scheduling_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_csl_expires ON public.call_scheduling_logs(expires_at);

-- 4) Prune function and triggers
CREATE OR REPLACE FUNCTION public.prune_call_scheduling()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete expired children first to minimize FK churn; sessions last (CASCADE also covers children)
  DELETE FROM public.call_scheduling_queue WHERE expires_at < now();
  DELETE FROM public.call_scheduling_logs WHERE expires_at < now();
  DELETE FROM public.call_scheduling_sessions WHERE expires_at < now();
  RETURN NULL; -- statement-level trigger
END
$$;

-- Fire pruning on any write to these tables
DROP TRIGGER IF EXISTS trg_prune_on_csq ON public.call_scheduling_queue;
CREATE TRIGGER trg_prune_on_csq
AFTER INSERT OR UPDATE OR DELETE ON public.call_scheduling_queue
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();

DROP TRIGGER IF EXISTS trg_prune_on_csl ON public.call_scheduling_logs;
CREATE TRIGGER trg_prune_on_csl
AFTER INSERT OR UPDATE OR DELETE ON public.call_scheduling_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();

DROP TRIGGER IF EXISTS trg_prune_on_css ON public.call_scheduling_sessions;
CREATE TRIGGER trg_prune_on_css
AFTER INSERT OR UPDATE OR DELETE ON public.call_scheduling_sessions
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();