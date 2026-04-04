
-- Table for post attachments
CREATE TABLE public.community_post_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_post_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_post_attachments_post ON public.community_post_attachments(post_id);
CREATE INDEX idx_post_attachments_uploader ON public.community_post_attachments(uploader_id);

-- RLS: Members of the community can view attachments
CREATE POLICY "Community members can view post attachments"
ON public.community_post_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_posts cp
    JOIN community_members cm ON cm.community_id = cp.community_id
    WHERE cp.id = post_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
  )
);

-- RLS: Uploader can insert
CREATE POLICY "Members can upload attachments"
ON public.community_post_attachments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.id = uploader_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
  )
);

-- RLS: Uploader or admin can delete
CREATE POLICY "Uploader or admin can delete attachments"
ON public.community_post_attachments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.id = uploader_id AND cm.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM community_posts cp
    JOIN community_members cm ON cm.community_id = cp.community_id
    WHERE cp.id = post_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);

-- Storage bucket (private — access via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-post-attachments', 'community-post-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Members can upload post attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'community-post-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Members can read own post attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'community-post-attachments'
);

CREATE POLICY "Members can delete own post attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'community-post-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
