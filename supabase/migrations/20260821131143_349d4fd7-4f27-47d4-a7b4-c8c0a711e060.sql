-- ─────────────────────────────────────────────────────────────
-- 1) circle_certificates: remove leitura pública irrestrita
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS certificates_public_read ON public.circle_certificates;

CREATE POLICY certificates_select_owner
  ON public.circle_certificates FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT cm.id FROM public.community_members cm WHERE cm.user_id = auth.uid())
  );

CREATE POLICY certificates_select_admin
  ON public.circle_certificates FOR SELECT TO authenticated
  USING (public.can_admin_community(community_id));

-- Verificação pública por código exato (não permite enumeração/listagem).
CREATE OR REPLACE FUNCTION public.verify_circle_certificate(p_code text)
RETURNS TABLE (
  student_name text,
  course_name text,
  creator_name text,
  hours integer,
  certificate_code text,
  issued_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.student_name, c.course_name, c.creator_name, c.hours,
         c.certificate_code, c.issued_at
  FROM public.circle_certificates c
  WHERE p_code IS NOT NULL
    AND length(btrim(p_code)) BETWEEN 6 AND 64
    AND c.certificate_code = upper(btrim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_circle_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_circle_certificate(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) storage: bucket "community" — ownership do caminho
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_community_path_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parts text[];
  v_seg text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR _name IS NULL THEN RETURN false; END IF;

  v_parts := storage.foldername(_name);
  IF v_parts IS NULL OR array_length(v_parts, 1) IS NULL THEN RETURN false; END IF;

  -- pasta própria do usuário
  IF v_parts[1] = v_uid::text THEN RETURN true; END IF;

  -- avatars/<member_id>-... : apenas membros do próprio usuário
  IF v_parts[1] = 'avatars' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.user_id = v_uid
        AND split_part(_name, '/', 2) LIKE cm.id::text || '-%'
    );
  END IF;

  -- namespaces prefixados: <ns>/<uuid>/...
  IF v_parts[1] IN ('events', 'courses', 'live-covers', 'classroom') THEN
    v_seg := v_parts[2];
  ELSE
    v_seg := v_parts[1];
  END IF;

  IF v_seg IS NULL OR v_seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  v_id := v_seg::uuid;

  -- comunidade: membro ativo ou admin
  IF public.is_community_member(v_id) OR public.can_admin_community(v_id) THEN
    RETURN true;
  END IF;

  -- curso da comunidade (classroom/<course_id>/...)
  RETURN EXISTS (
    SELECT 1 FROM public.circle_courses cc
    WHERE cc.id = v_id
      AND (public.is_community_member(cc.community_id) OR public.can_admin_community(cc.community_id))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.storage_community_path_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_community_path_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can upload community files" ON storage.objects;
CREATE POLICY "Authenticated users can upload community files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community'
    AND public.storage_community_path_allowed(name)
  );

-- ─────────────────────────────────────────────────────────────
-- 3) storage: bucket "community-resources" — só staff da comunidade
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_resource_path_admin(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_seg text;
BEGIN
  IF auth.uid() IS NULL OR _name IS NULL THEN RETURN false; END IF;
  v_parts := storage.foldername(_name);
  IF v_parts IS NULL OR array_length(v_parts, 1) IS NULL THEN RETURN false; END IF;
  v_seg := v_parts[1];
  IF v_seg IS NULL OR v_seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN public.can_admin_community(v_seg::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_resource_path_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_resource_path_admin(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff can upload resource files" ON storage.objects;
CREATE POLICY "Staff can upload resource files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-resources'
    AND public.storage_resource_path_admin(name)
  );

DROP POLICY IF EXISTS "Staff can delete resource files" ON storage.objects;
CREATE POLICY "Staff can delete resource files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-resources'
    AND public.storage_resource_path_admin(name)
  );