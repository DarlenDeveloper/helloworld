-- Collaborator-based RLS across domain tables and invitation acceptance policy
-- Safe to run multiple times: drops existing policies before re-creating

-- Ensure helper exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_owner_or_collaborator' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'public.is_owner_or_collaborator() not found. Run 012_collaborators.sql first.';
  END IF;
END $$;

-- Utility to drop all policies on a table
CREATE OR REPLACE FUNCTION public._drop_policies(_table regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = split_part(_table::text, '.', 1) AND tablename = split_part(_table::text, '.', 2)
  LOOP
    EXECUTE format('DROP POLICY %I ON %s', r.policyname, _table);
  END LOOP;
END $$;

-- Calls
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.calls');
CREATE POLICY calls_read   ON public.calls FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY calls_insert ON public.calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY calls_update ON public.calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY calls_delete ON public.calls FOR DELETE USING (auth.uid() = user_id);

-- Campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.campaigns');
CREATE POLICY campaigns_read   ON public.campaigns FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY campaigns_delete ON public.campaigns FOR DELETE USING (auth.uid() = user_id);

-- Contact batches
ALTER TABLE public.contact_batches ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.contact_batches');
CREATE POLICY contact_batches_read   ON public.contact_batches FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY contact_batches_insert ON public.contact_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contact_batches_update ON public.contact_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contact_batches_delete ON public.contact_batches FOR DELETE USING (auth.uid() = user_id);

-- Campaign <-> Batch linking (no owner column; authenticated access)
ALTER TABLE public.campaign_batches ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.campaign_batches');
CREATE POLICY campaign_batches_read   ON public.campaign_batches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_insert ON public.campaign_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_update ON public.campaign_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY campaign_batches_delete ON public.campaign_batches FOR DELETE USING (auth.uid() IS NOT NULL);

-- Call history
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.call_history');
CREATE POLICY call_history_read   ON public.call_history FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY call_history_insert ON public.call_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY call_history_update ON public.call_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY call_history_delete ON public.call_history FOR DELETE USING (auth.uid() = user_id);

-- Contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.contacts');
CREATE POLICY contacts_read   ON public.contacts FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY contacts_insert ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contacts_update ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contacts_delete ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- Knowledge base articles
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.knowledge_base_articles');
CREATE POLICY kba_read   ON public.knowledge_base_articles FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE));
CREATE POLICY kba_insert ON public.knowledge_base_articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY kba_update ON public.knowledge_base_articles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY kba_delete ON public.knowledge_base_articles FOR DELETE USING (auth.uid() = user_id);

-- User login logs: allow self, and owners to see collaborator logs
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;
SELECT public._drop_policies('public.user_login_logs');
CREATE POLICY ull_read   ON public.user_login_logs FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.user_collaborators c
    WHERE c.owner_user_id = auth.uid() AND c.collaborator_user_id = user_id
  )
);
CREATE POLICY ull_insert ON public.user_login_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ull_update ON public.user_login_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ull_delete ON public.user_login_logs FOR DELETE USING (auth.uid() = user_id);

-- Email tables, if present
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='emails') THEN
    ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
    PERFORM public._drop_policies('public.emails');
    EXECUTE $p$CREATE POLICY emails_read   ON public.emails FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE))$p$;
    EXECUTE $p$CREATE POLICY emails_insert ON public.emails FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY emails_update ON public.emails FOR UPDATE USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY emails_delete ON public.emails FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_history') THEN
    ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;
    PERFORM public._drop_policies('public.email_history');
    EXECUTE $p$CREATE POLICY email_history_read   ON public.email_history FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE))$p$;
    EXECUTE $p$CREATE POLICY email_history_insert ON public.email_history FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY email_history_update ON public.email_history FOR UPDATE USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY email_history_delete ON public.email_history FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
END $$;

-- WhatsApp tables, if present
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_messages') THEN
    ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
    PERFORM public._drop_policies('public.whatsapp_messages');
    EXECUTE $p$CREATE POLICY whatsapp_messages_read   ON public.whatsapp_messages FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE))$p$;
    EXECUTE $p$CREATE POLICY whatsapp_messages_insert ON public.whatsapp_messages FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY whatsapp_messages_update ON public.whatsapp_messages FOR UPDATE USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY whatsapp_messages_delete ON public.whatsapp_messages FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_history') THEN
    ALTER TABLE public.whatsapp_history ENABLE ROW LEVEL SECURITY;
    PERFORM public._drop_policies('public.whatsapp_history');
    EXECUTE $p$CREATE POLICY whatsapp_history_read   ON public.whatsapp_history FOR SELECT USING (public.is_owner_or_collaborator(user_id, FALSE))$p$;
    EXECUTE $p$CREATE POLICY whatsapp_history_insert ON public.whatsapp_history FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY whatsapp_history_update ON public.whatsapp_history FOR UPDATE USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY whatsapp_history_delete ON public.whatsapp_history FOR DELETE USING (auth.uid() = user_id)$p$;
  END IF;
END $$;

-- Invitation: allow invitee to update status to accepted (if not already set by 012)
DO $$ BEGIN
  BEGIN
    DROP POLICY IF EXISTS inv_invitee_accept_update ON public.user_collaboration_invitations;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  CREATE POLICY inv_invitee_accept_update ON public.user_collaboration_invitations
    FOR UPDATE
    USING (
      status = 'pending'::public.invitation_status
      AND lower(invitee_email) = lower(COALESCE((auth.jwt() ->> 'email')::text, ''))
    )
    WITH CHECK (
      lower(invitee_email) = lower(COALESCE((auth.jwt() ->> 'email')::text, ''))
      AND status = 'accepted'::public.invitation_status
    );
END $$;

-- Cleanup helper
DROP FUNCTION IF EXISTS public._drop_policies(regclass);