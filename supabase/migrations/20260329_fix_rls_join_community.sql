-- =============================================================
-- Fix: RLS bypass para inserção de membros no fluxo de join
-- Necessário porque no signup o usuário ainda não tem sessão
-- ativa (aguarda confirmação de email), então auth.uid() é null
-- =============================================================

-- Função SECURITY DEFINER que pode inserir membros mesmo sem sessão ativa
-- Chamada via supabase.rpc('join_community', {...})
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid,
  p_user_id      uuid,
  p_display_name text,
  p_role         text DEFAULT 'MEMBER',
  p_status       text DEFAULT 'ACTIVE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Evita duplicatas silenciosamente
  INSERT INTO public.community_members (
    community_id,
    user_id,
    role,
    status,
    display_name
  )
  VALUES (
    p_community_id,
    p_user_id,
    p_role,
    p_status,
    p_display_name
  )
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Atualiza contador de membros da comunidade
  UPDATE public.communities
  SET member_count = (
    SELECT COUNT(*) FROM public.community_members
    WHERE community_id = p_community_id AND status = 'ACTIVE'
  )
  WHERE id = p_community_id;
END;
$$;

-- Grant de execução para usuários anon e autenticados
GRANT EXECUTE ON FUNCTION public.join_community TO anon, authenticated;

-- =============================================================
-- Fix: handle_new_user não deve criar workspace para MEMBROS
-- Membros são usuários que se cadastram via /c/:slug (landing)
-- Criadores se cadastram via /signup (que passa is_creator=true)
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id UUID;
  user_email TEXT;
  workspace_name TEXT;
  workspace_slug TEXT;
  is_creator BOOLEAN;
BEGIN
  -- Check if this is a creator signup (vs member signup)
  is_creator := COALESCE((NEW.raw_user_meta_data ->> 'is_creator')::boolean, false);

  -- Only create workspace for creator signups
  IF NOT is_creator THEN
    RETURN NEW;
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  workspace_name := split_part(user_email, '@', 1) || '''s Workspace';
  workspace_slug := public.generate_unique_slug(workspace_name);

  INSERT INTO public.workspaces (name, slug)
  VALUES (workspace_name, workspace_slug)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_members (user_id, workspace_id, role)
  VALUES (NEW.id, new_workspace_id, 'OWNER');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
