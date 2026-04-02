-- Remove unique constraint that limits one community per workspace
ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS uq_community_workspace;

-- Remove any legacy unique indexes on workspace_id
DROP INDEX IF EXISTS public.communities_workspace_id_key;
DROP INDEX IF EXISTS public.uq_community_workspace;