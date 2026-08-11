-- QA Onda 0 / SEC-060: exposição de funções SECURITY DEFINER a `anon`.
-- Revogação GRANULAR por assinatura exata. Nada de REVOKE ... FROM PUBLIC em bloco.
-- Preservados: RPCs de checkout anônimo e predicados usados em policies de RLS.

-- ============================================================
-- 1) SERVICE/CRON-ONLY — P0: cron_secret vazava para anon.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.cron_secret() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_invoke(text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_run_finish(uuid, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_runs_sweep() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_auth_verification_codes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_overdue_workspace_plans() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_workspace_plan(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_tier_entitlement(uuid, uuid, uuid, text, uuid, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_tier_entitlement(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_sales(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, numeric, numeric, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_course_debug(uuid, uuid, uuid) FROM anon, authenticated;

-- Edge Functions usam service_role: garantir EXECUTE explícito.
GRANT EXECUTE ON FUNCTION public.cron_invoke(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_run_finish(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_runs_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_tier_entitlement(uuid, uuid, uuid, text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_tier_entitlement(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_product_sales(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, numeric, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_workspace_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_overdue_workspace_plans() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_course_debug(uuid, uuid, uuid) TO service_role;

-- ============================================================
-- 2) TRIGGER-ONLY — executam como owner da tabela; EXECUTE direto é desnecessário.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_storefront_for_workspace() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_product_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_product_limit_on_restore() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_decrement_like_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_sync_owner_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_generate_affiliate_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_increment_comment_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_increment_like_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_increment_post_counts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_increment_resource_event_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_storefront_avatar_to_members() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_tier_to_circle_plan() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_workspace_plan_from_subscription() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_member_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_member_profile_across_communities() FROM anon, authenticated;

-- ============================================================
-- 3) AUTHENTICATED-ONLY — revoga apenas `anon`.
--    Todas as call sites do app exigem sessão (userId/workspace).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_classroom_course(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_event(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_occurrences(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_unique_slug(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_community(uuid, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_post(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_community_space(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_community_pricing_model(uuid, text, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_community_pricing_model_v2(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_member_tiers(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_invite_link_uses(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_creator_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_reserve_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_source(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_tier(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_communities_revenue(uuid, timestamptz, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_tiers_revenue(uuid, timestamptz, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_revenue_by_source(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_entitlement_source_breakdown(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_plan(uuid) FROM anon;

-- ============================================================
-- 4) MANTIDAS INTENCIONALMENTE (sem alteração):
--    - Checkout anônimo: complete_checkout_session, get_checkout_session_public,
--      get_community_public_plans.
--    - Predicados de RLS: has_role, is_admin_user, is_community_member,
--      is_workspace_member/admin, is_conversation_member,
--      has_active_circle_subscription, get_community_*_for_user,
--      workspace_accepts_public_writes — a policy é avaliada com o papel do
--      chamador; revogar quebraria leitura pública legítima.
-- ============================================================
