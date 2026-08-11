-- ============================================================================
-- ONDA 2 (QA MVP) — P0 CB-REORDER-IDOR — PREPARADA, NÃO APLICADA
--
-- Achado (pg_get_functiondef, 2026-08-11): batch_reorder_lessons(jsonb) e
-- batch_reorder_modules(jsonb) são SECURITY DEFINER e faziam
-- `UPDATE ... WHERE id = ...` sem qualquer checagem de dono, contornando a
-- RLS de course_lessons/course_modules (que condiciona escrita a
-- is_workspace_member(courses.workspace_id)). Qualquer usuário autenticado
-- podia reordenar aulas/módulos de cursos de outro workspace.
--
-- Correção FAIL-CLOSED e ATÔMICA:
--   1) exige sessão autenticada (auth.uid());
--   2) valida estrutura do payload: array jsonb, objetos com as chaves `id` e
--      `position`, `id` castável para uuid, `position` inteiro >= 0, sem ids
--      duplicados, array não vazio;
--   3) exige que TODOS os ids existam E pertençam a workspace que o chamador
--      pode editar segundo a política REAL já vigente (`is_workspace_member`,
--      o mesmo predicado das policies de course_lessons/course_modules —
--      nenhum papel novo é inventado aqui);
--   4) somente então executa UM único UPDATE.
-- Qualquer item inválido, inexistente ou não autorizado aborta a chamada com
-- EXCEPTION ANTES de qualquer UPDATE. Não existe caminho que aplique um
-- subconjunto: payload misto (ids próprios + ids alheios) não grava nada.
-- Sem tabelas temporárias — a validação roda sobre o próprio payload, o que
-- mantém a função reentrante dentro de uma mesma transação.
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
  v_negative int;
  v_allowed  int;
BEGIN
  -- 1) Autenticação obrigatória.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- 2) Estrutura do payload.
  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ? 'id')
       OR NOT (item ? 'position')
       OR item->>'id' IS NULL
       OR item->>'position' IS NULL
  ) THEN
    RAISE EXCEPTION 'each item must be an object with id and position'
      USING ERRCODE = '22023';
  END IF;

  -- Casts estritos: uuid/int inválido levanta erro aqui (fail-closed).
  SELECT count(*), count(DISTINCT p.id), count(*) FILTER (WHERE p.position < 0)
    INTO v_total, v_distinct, v_negative
  FROM (
    SELECT (item->>'id')::uuid AS id, (item->>'position')::int AS position
    FROM jsonb_array_elements(items) AS item
  ) p;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'items must not be empty' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'duplicate lesson id in payload' USING ERRCODE = '22023';
  END IF;
  IF v_negative > 0 THEN
    RAISE EXCEPTION 'position must be >= 0' USING ERRCODE = '22023';
  END IF;

  -- 3) Autorização: todo id precisa existir E estar em workspace editável.
  SELECT count(*) INTO v_allowed
  FROM (
    SELECT DISTINCT (item->>'id')::uuid AS id
    FROM jsonb_array_elements(items) AS item
  ) p
  JOIN course_lessons cl ON cl.id = p.id
  JOIN course_modules cm ON cm.id = cl.module_id
  JOIN courses c ON c.id = cm.course_id
  WHERE public.is_workspace_member(c.workspace_id);

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'unauthorized or unknown lesson in payload'
      USING ERRCODE = '42501';
  END IF;

  -- 4) Único UPDATE, já autorizado.
  UPDATE course_lessons AS cl
  SET position = p.position
  FROM (
    SELECT (item->>'id')::uuid AS id, (item->>'position')::int AS position
    FROM jsonb_array_elements(items) AS item
  ) p
  WHERE cl.id = p.id;
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
  v_negative int;
  v_allowed  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ? 'id')
       OR NOT (item ? 'position')
       OR item->>'id' IS NULL
       OR item->>'position' IS NULL
  ) THEN
    RAISE EXCEPTION 'each item must be an object with id and position'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT p.id), count(*) FILTER (WHERE p.position < 0)
    INTO v_total, v_distinct, v_negative
  FROM (
    SELECT (item->>'id')::uuid AS id, (item->>'position')::int AS position
    FROM jsonb_array_elements(items) AS item
  ) p;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'items must not be empty' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'duplicate module id in payload' USING ERRCODE = '22023';
  END IF;
  IF v_negative > 0 THEN
    RAISE EXCEPTION 'position must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_allowed
  FROM (
    SELECT DISTINCT (item->>'id')::uuid AS id
    FROM jsonb_array_elements(items) AS item
  ) p
  JOIN course_modules cm ON cm.id = p.id
  JOIN courses c ON c.id = cm.course_id
  WHERE public.is_workspace_member(c.workspace_id);

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'unauthorized or unknown module in payload'
      USING ERRCODE = '42501';
  END IF;

  UPDATE course_modules AS cm
  SET position = p.position
  FROM (
    SELECT (item->>'id')::uuid AS id, (item->>'position')::int AS position
    FROM jsonb_array_elements(items) AS item
  ) p
  WHERE cm.id = p.id;
END;
$function$;

-- Grants mínimos, por ASSINATURA EXATA (idempotente com o hardening de RPC da
-- Onda 0): anon e PUBLIC sem EXECUTE; só sessão autenticada e service_role.
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) TO service_role;
