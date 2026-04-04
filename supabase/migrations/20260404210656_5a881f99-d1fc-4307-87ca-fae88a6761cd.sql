
-- Community resources table
CREATE TABLE public.community_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text DEFAULT 'Geral',
  tags text[] DEFAULT '{}',
  resource_type text NOT NULL DEFAULT 'link' CHECK (resource_type IN ('file', 'link')),
  file_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  external_url text,
  access_rule text NOT NULL DEFAULT 'all' CHECK (access_rule IN ('all', 'level', 'tier')),
  min_level integer,
  allowed_tier_ids uuid[],
  created_by uuid NOT NULL REFERENCES public.community_members(id),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_community_resources_community ON public.community_resources(community_id);
CREATE INDEX idx_community_resources_category ON public.community_resources(community_id, category);

-- RLS
ALTER TABLE public.community_resources ENABLE ROW LEVEL SECURITY;

-- Members can view published resources of their communities
CREATE POLICY "Members can view published resources"
ON public.community_resources FOR SELECT
TO authenticated
USING (
  is_published = true
  AND EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community_resources.community_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  )
);

-- Staff can view all resources (including unpublished)
CREATE POLICY "Staff can view all resources"
ON public.community_resources FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community_resources.community_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  )
);

-- Staff can insert resources
CREATE POLICY "Staff can insert resources"
ON public.community_resources FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community_resources.community_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  )
);

-- Staff can update resources
CREATE POLICY "Staff can update resources"
ON public.community_resources FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community_resources.community_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  )
);

-- Staff can delete resources
CREATE POLICY "Staff can delete resources"
ON public.community_resources FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community_resources.community_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  )
);

-- Storage bucket for resource files
INSERT INTO storage.buckets (id, name, public) VALUES ('community-resources', 'community-resources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Members can view resource files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'community-resources');

CREATE POLICY "Staff can upload resource files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-resources');

CREATE POLICY "Staff can delete resource files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'community-resources');
