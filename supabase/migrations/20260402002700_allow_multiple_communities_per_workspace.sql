-- Allow multiple communities per workspace.
-- The old model enforced one community per workspace via uq_community_workspace.
-- New Circles UX supports creating multiple communities, so we remove that constraint.

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS uq_community_workspace;
