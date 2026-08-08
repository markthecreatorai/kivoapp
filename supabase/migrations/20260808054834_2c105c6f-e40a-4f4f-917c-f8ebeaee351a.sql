CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(p_name text)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws public.workspaces;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_name := NULLIF(btrim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'workspace name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspaces (name, slug)
  VALUES (v_name, public.generate_unique_slug(v_name))
  RETURNING * INTO v_ws;

  INSERT INTO public.workspace_members (user_id, workspace_id, role)
  VALUES (auth.uid(), v_ws.id, 'OWNER'::public.workspace_role);

  RETURN v_ws;
END
$$;

REVOKE ALL ON FUNCTION public.create_workspace_with_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(text) TO authenticated;

-- Helper sem recursão para checar OWNER
CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'OWNER'::public.workspace_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners can delete their workspace" ON public.workspaces;
CREATE POLICY "Owners can delete their workspace" ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.is_workspace_owner(id));

DROP POLICY IF EXISTS "Owners can delete workspace memberships" ON public.workspace_members;
CREATE POLICY "Owners can delete workspace memberships" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (public.is_workspace_owner(workspace_id));