-- Fix for "stack depth limit exceeded" due to recursive pruning triggers
-- Root cause: prune_call_scheduling() deletes from the same tables that fire the trigger,
-- causing nested trigger invocations. We guard using pg_trigger_depth() and
-- reduce trigger events to INSERT/UPDATE only.

-- 1) Replace pruning function with recursion guard
CREATE OR REPLACE FUNCTION public.prune_call_scheduling()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Prevent re-entrancy from deletes triggered by this function
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- Delete expired children first; sessions last (CASCADE covers children as well)
  DELETE FROM public.call_scheduling_queue WHERE expires_at < now();
  DELETE FROM public.call_scheduling_logs WHERE expires_at < now();
  DELETE FROM public.call_scheduling_sessions WHERE expires_at < now();

  RETURN NULL; -- statement-level trigger
END
$$;

-- 2) Recreate triggers to avoid firing on DELETE (which can re-enter pruning)
-- Drop existing triggers
DROP TRIGGER IF EXISTS trg_prune_on_csq ON public.call_scheduling_queue;
DROP TRIGGER IF EXISTS trg_prune_on_csl ON public.call_scheduling_logs;
DROP TRIGGER IF EXISTS trg_prune_on_css ON public.call_scheduling_sessions;

-- Recreate triggers only for INSERT/UPDATE to reduce recursion surface
CREATE TRIGGER trg_prune_on_csq
AFTER INSERT OR UPDATE ON public.call_scheduling_queue
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();

CREATE TRIGGER trg_prune_on_csl
AFTER INSERT OR UPDATE ON public.call_scheduling_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();

CREATE TRIGGER trg_prune_on_css
AFTER INSERT OR UPDATE ON public.call_scheduling_sessions
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_call_scheduling();