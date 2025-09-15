-- Collaborators schema (compat-friendly). Run this if 012_collaborators.sql fails in your environment.

-- 1) Create enum types using DO $$ blocks (avoids CREATE TYPE IF NOT EXISTS incompatibility)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collaborator_role') THEN
    CREATE TYPE public.collaborator_role AS ENUM ('viewer','editor');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','revoked','expired');
  END IF;
END
$$;

-- 2) Collaboration tables
CREATE TABLE IF NOT EXISTS public.user_collaboration_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  role public.collaborator_role NOT NULL DEFAULT 'viewer',
  status public.invitation_status NOT NULL DEFAULT 'pending',
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_invite_owner_email_pending UNIQUE (owner_user_id, invitee_email, status)
);

CREATE TABLE IF NOT EXISTS public.user_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collaborator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.collaborator_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_owner_collaborator UNIQUE (owner_user_id, collaborator_user_id)
);

-- 3) RLS enable
ALTER TABLE public.user_collaboration_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_collaborators ENABLE ROW LEVEL SECURITY;

-- 4) Drop old policies if present (safe, no DO-block needed)
DROP POLICY IF EXISTS inv_owner_rw ON public.user_collaboration_invitations;
DROP POLICY IF EXISTS inv_invitee_read ON public.user_collaboration_invitations;
DROP POLICY IF EXISTS inv_invitee_accept_update ON public.user_collaboration_invitations;

DROP POLICY IF EXISTS coll_read_by_party ON public.user_collaborators;
DROP POLICY IF EXISTS coll_insert_by_party ON public.user_collaborators;
DROP POLICY IF EXISTS coll_update_owner_only ON public.user_collaborators;
DROP POLICY IF EXISTS coll_delete_owner_only ON public.user_collaborators;

-- 5) Invitations policies
-- Owner can read/write their invitations
CREATE POLICY inv_owner_rw ON public.user_collaboration_invitations
  FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Invitee can read pending invitations addressed to their email
CREATE POLICY inv_invitee_read ON public.user_collaboration_invitations
  FOR SELECT
  USING (
    status = 'pending'::public.invitation_status AND
    lower(invitee_email) = lower(COALESCE((auth.jwt() ->> 'email')::text, ''))
  );

-- Invitee can accept their own pending invitation (update status to accepted)
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

-- 6) Collaborator policies
-- Owner or collaborator can read
CREATE POLICY coll_read_by_party ON public.user_collaborators
  FOR SELECT
  USING (auth.uid() = owner_user_id OR auth.uid() = collaborator_user_id);

-- Insert allowed by owner (inviting) or collaborator (accepting)
CREATE POLICY coll_insert_by_party ON public.user_collaborators
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = collaborator_user_id);

-- Update and delete allowed only by owner
CREATE POLICY coll_update_owner_only ON public.user_collaborators
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY coll_delete_owner_only ON public.user_collaborators
  FOR DELETE
  USING (auth.uid() = owner_user_id);

-- 7) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_inv_owner ON public.user_collaboration_invitations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_email ON public.user_collaboration_invitations(lower(invitee_email));
CREATE INDEX IF NOT EXISTS idx_inv_status ON public.user_collaboration_invitations(status);
CREATE INDEX IF NOT EXISTS idx_coll_owner ON public.user_collaborators(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_coll_collaborator ON public.user_collaborators(collaborator_user_id);

-- 8) Symmetric collaborator predicate
-- Allows access if: self OR accepted collaborator in either direction
CREATE OR REPLACE FUNCTION public.is_owner_or_collaborator(p_owner UUID, require_editor BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
SELECT (
  auth.uid() = p_owner
  OR EXISTS (
    SELECT 1
    FROM public.user_collaborators c
    WHERE (
      (c.owner_user_id = p_owner AND c.collaborator_user_id = auth.uid())
      OR
      (c.owner_user_id = auth.uid() AND c.collaborator_user_id = p_owner)
    )
    AND (NOT require_editor OR c.role = 'editor')
  )
);
$$;
