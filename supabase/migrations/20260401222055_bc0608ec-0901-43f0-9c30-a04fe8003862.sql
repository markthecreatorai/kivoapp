
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS about_gallery jsonb DEFAULT '[]';

-- Migrate existing data into gallery
UPDATE public.communities
SET about_gallery = (
  SELECT COALESCE(jsonb_agg(item ORDER BY pos), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('type', 'image', 'url', cover_image_url, 'position', 0) AS item, 0 AS pos
    WHERE cover_image_url IS NOT NULL AND cover_image_url != ''
    UNION ALL
    SELECT jsonb_build_object('type', 'video', 'url', about_video_url, 'position', 1) AS item, 1 AS pos
    WHERE about_video_url IS NOT NULL AND about_video_url != ''
  ) sub
)
WHERE (cover_image_url IS NOT NULL AND cover_image_url != '')
   OR (about_video_url IS NOT NULL AND about_video_url != '');
