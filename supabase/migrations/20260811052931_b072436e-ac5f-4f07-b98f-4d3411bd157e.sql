-- QA Onda 0 / SEC-060 (etapa 2): as funções abaixo mantinham GRANT EXECUTE para
-- PUBLIC, então o REVOKE de anon/authenticated da etapa 1 não surtiu efeito.
-- Prova: anon ainda executava public.cleanup_rate_limits() (HTTP 204).

-- ============================================================
-- 1) TRIGGER-ONLY
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_storefront_for_workspace() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_product_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_product_limit_on_restore() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_decrement_like_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_sync_owner_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_generate_affiliate_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_increment_comment_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_increment_like_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_increment_post_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_increment_resource_event_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_storefront_avatar_to_members() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_tier_to_circle_plan() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_workspace_plan_from_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_member_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_member_profile_across_communities() FROM PUBLIC;

-- ============================================================
-- 2) SERVICE/CRON-ONLY
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_course_debug(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, numeric, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_tier_entitlement(uuid, uuid, uuid, text, uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_tier_entitlement(uuid, uuid, uuid) FROM PUBLIC;

-- ============================================================
-- 3) AUTHENTICATED-ONLY: remove PUBLIC e concede só a authenticated.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_reorder_lessons(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_reorder_modules(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_classroom_course(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_classroom_course(uuid, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_event(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_event(uuid, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_occurrences(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_recurring_occurrences(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_unique_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_unique_slug(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_community(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_community(uuid, uuid, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_post(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_community_space(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_community_space(uuid, uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_community_pricing_model(uuid, text, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_community_pricing_model(uuid, text, integer, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_community_pricing_model_v2(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_community_pricing_model_v2(uuid, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_member_tiers(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_member_tiers(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_creator_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_balance(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_reserve_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reserve_balance(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_source(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_source(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_tier(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_tier(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_top_communities_revenue(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_communities_revenue(uuid, timestamptz, timestamptz, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_top_tiers_revenue(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_tiers_revenue(uuid, timestamptz, timestamptz, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_daily_revenue_by_source(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue_by_source(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_entitlement_source_breakdown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entitlement_source_breakdown(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_workspace_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_plan(uuid) TO authenticated;

-- ============================================================
-- 4) MANTIDAS COM PUBLIC INTENCIONALMENTE:
--    get_community_public_plans (landing pública), predicados de RLS
--    (is_*, has_role, has_active_circle_subscription, get_community_*_for_user).
-- ============================================================
