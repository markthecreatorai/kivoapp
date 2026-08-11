-- ============================================================================
-- ONDA 2 (QA MVP) — P0 CB-REORDER-IDOR — PREPARADA, NÃO APLICADA
--
-- Achado (pg_proc, 2026-08-11): batch_reorder_lessons(jsonb) e
-- batch_reorder_modules(jsonb) são SECURITY DEFINER e fazem
-- `UPDATE ... WHERE id = ...` sem checar dono, contornando a RLS de
-- course_modules/course_lessons (que exige is_workspace_member via
-- courses.workspace_id). Qualquer usuário autenticado podia reordenar
-- aulas/módulos de cursos de outro workspace (escrita cross-tenant).
--
-- Correção FAIL-CLOSED e ATÔMICA:
--   1) valida o payload (array, id uuid, position int >= 0, sem duplicatas);
--   2) exige que TODOS os ids existam e pertençam a workspace onde o chamador
--      é membro (mesmo predicado da RLS — política de edição realmente
--      vigente no produto: `is_workspace_member`, sem inventar papel novo);
--   3) só então executa o UPDATE, em uma única instrução.
-- Qualquer item inexistente, inválido ou fora do workspace aborta TODA a
-- chamada com EXCEPTION (a função roda em uma transação, logo nada é gravado).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.batch_reorder_lessons(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total    int;
  v_distinct int;
  v_allowed  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _reorder_lessons (id uuid NOT NULL, position int NOT NULL)
    ON COMMIT DROP;

  -- Cast estrito: id inválido ou position inválida levanta erro aqui.
  INSERT INTO _reorder_lessons (id, position)
  SELECT (item->>'id')::uuid, (item->>'position')::int
  FROM jsonb_array_elements(items) AS item;

  SELECT count(*), count(DISTINCT id) INTO v_total, v_distinct FROM _reorder_lessons;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'items must not be empty' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'duplicate lesson id in payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM _reorder_lessons WHERE position < 0) THEN
    RAISE EXCEPTION 'position must be >= 0' USING ERRCODE = '22023';
  END IF;

  -- Autorização: todos os ids precisam existir E estar em workspace do chamador.
  SELECT count(*) INTO v_allowed
  FROM _reorder_lessons r
  JOIN course_lessons cl ON cl.id = r.id
  JOIN course_modules cm ON cm.id = cl.module_id
  JOIN courses c ON c.id = cm.course_id
  WHERE public.is_workspace_member(c.workspace_id);

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'unauthorized or unknown lesson in payload' USING ERRCODE = '42501';
  END IF;

  UPDATE course_lessons AS cl
  SET position = r.position
  FROM _reorder_lessons r
  WHERE cl.id = r.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_reorder_modules(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total    int;
  v_distinct int;
  v_allowed  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _reorder_modules (id uuid NOT NULL, position int NOT NULL)
    ON COMMIT DROP;

  INSERT INTO _reorder_modules (id, position)
  SELECT (item->>'id')::uuid, (item->>'position')::int
  FROM jsonb_array_elements(items) AS item;

  SELECT count(*), count(DISTINCT id) INTO v_total, v_distinct FROM _reorder_modules;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'items must not be empty' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'duplicate module id in payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM _reorder_modules WHERE position < 0) THEN
    RAISE EXCEPTION 'position must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_allowed
  FROM _reorder_modules r
  JOIN course_modules cm ON cm.id = r.id
  JOIN courses c ON c.id = cm.course_id
  WHERE public.is_workspace_member(c.workspace_id);

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'unauthorized or unknown module in payload' USING ERRCODE = '42501';
  END IF;

  UPDATE course_modules AS cm
  SET position = r.position
  FROM _reorder_modules r
  WHERE cm.id = r.id;
END;
$function$;

-- Grants mínimos (idempotente com o hardening de RPC da Onda 0)
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) TO authenticated, service_role;
