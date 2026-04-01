
-- Backfill: copy storefront avatar to owner/admin community members
UPDATE community_members cm
SET avatar_url = s.avatar_url, updated_at = now()
FROM communities c
JOIN storefronts s ON s.workspace_id = c.workspace_id
WHERE cm.community_id = c.id
  AND cm.role IN ('OWNER', 'ADMIN')
  AND cm.sync_with_kivo = true
  AND (cm.avatar_url IS NULL OR cm.avatar_url = '')
  AND s.avatar_url IS NOT NULL
  AND s.avatar_url != '';

-- Trigger: when storefront avatar changes, sync to owner/admin members
CREATE OR REPLACE FUNCTION public.fn_sync_storefront_avatar_to_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url AND NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
    UPDATE community_members cm
    SET avatar_url = NEW.avatar_url, updated_at = now()
    FROM communities c
    WHERE c.workspace_id = NEW.workspace_id
      AND cm.community_id = c.id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.sync_with_kivo = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_storefront_avatar ON storefronts;
CREATE TRIGGER trg_sync_storefront_avatar
  AFTER UPDATE ON storefronts
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_storefront_avatar_to_members();
