-- ============================================================================
-- ONDA 2 (QA MVP) — P0 CB-REORDER-IDOR — SQL PREPARADA, NÃO APLICADA
-- Autorização de aplicação pendente (rodada sem migrations).
--
-- Achado (leitura de pg_proc em 2026-08-11):
--   public.batch_reorder_lessons(jsonb) e public.batch_reorder_modules(jsonb)
--   são SECURITY DEFINER e fazem UPDATE apenas por id, SEM checar dono.
--   As tabelas course_modules/course_lessons têm RLS correta
--   (is_workspace_member via courses.workspace_id), mas o SECURITY DEFINER
--   contorna a RLS: qualquer usuário autenticado pode reordenar
--   módulos/aulas de cursos de OUTRO workspace (escrita cross-tenant / IDOR).
--
-- Correção: reaplicar o mesmo predicado da RLS dentro das funções.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.batch_reorder_lessons(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE course_lessons AS cl
  SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE cl.id = (item->>'id')::uuid
    AND EXISTS (
      SELECT 1
      FROM course_modules cm
      JOIN courses c ON c.id = cm.course_id
      WHERE cm.id = cl.module_id
        AND public.is_workspace_member(c.workspace_id)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_reorder_modules(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE course_modules AS cm
  SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE cm.id = (item->>'id')::uuid
    AND EXISTS (
      SELECT 1
      FROM courses c
      WHERE c.id = cm.course_id
        AND public.is_workspace_member(c.workspace_id)
    );
END;
$function$;

-- Reforço de exposição (idempotente com o hardening da Onda 0)
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) TO authenticated, service_role;
