/**
 * Fonte de verdade da exposição das RPCs SECURITY DEFINER (QA Onda 0 — SEC/IF).
 *
 * Motivação: o Supabase Security Advisor reportou
 * `anon_security_definer_function_executable` em dezenas de funções. Revogar em
 * massa quebraria RLS (várias funções são predicados de policy) e o checkout
 * anônimo. Este arquivo classifica cada função e é consumido pelo teste
 * contratual `src/test/rpc-exposure-contract.test.ts`, que impede que o
 * frontend passe a chamar uma RPC classificada como server-only.
 *
 * Remediation do advisor:
 * - 0028: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
 * - 0029: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
 */

/** Só executam como gatilho de tabela; não precisam de EXECUTE para anon/authenticated. */
export const TRIGGER_ONLY_FUNCTIONS = [
  "create_storefront_for_workspace",
  "enforce_plan_product_limit",
  "enforce_plan_product_limit_on_restore",
  "fn_decrement_like_count",
  "fn_enforce_sync_owner_admin",
  "fn_generate_affiliate_code",
  "fn_increment_comment_count",
  "fn_increment_like_count",
  "fn_increment_post_counts",
  "fn_increment_resource_event_count",
  "fn_sync_storefront_avatar_to_members",
  "fn_sync_tier_to_circle_plan",
  "fn_sync_workspace_plan_from_subscription",
  "fn_update_member_count",
  "handle_new_user",
  "sync_member_profile_across_communities",
] as const;

/** Cron/Edge Functions apenas (service_role ou owner). Nunca chamáveis do browser. */
export const SERVICE_ONLY_FUNCTIONS = [
  // P0: devolvia o segredo de cron para qualquer chave anon.
  "cron_secret",
  "cron_invoke",
  "cron_run_finish",
  "cron_runs_sweep",
  "cleanup_rate_limits",
  "cleanup_auth_verification_codes",
  "expire_overdue_workspace_plans",
  "rls_auto_enable",
  "sync_workspace_plan",
  "grant_tier_entitlement",
  "revoke_tier_entitlement",
  "increment_product_sales",
  "redeem_coupon",
  "release_coupon",
  "can_access_course_debug",
] as const;

/** Exigem sessão; `anon` revogado. */
export const AUTHENTICATED_ONLY_FUNCTIONS = [
  "batch_reorder_lessons",
  "batch_reorder_modules",
  "can_access_classroom_course",
  "can_access_event",
  "generate_recurring_occurrences",
  "generate_unique_slug",
  "join_community",
  "soft_delete_post",
  "update_community_space",
  "set_community_pricing_model",
  "set_community_pricing_model_v2",
  "resolve_member_tiers",
  "increment_invite_link_uses",
  "get_creator_balance",
  "get_reserve_balance",
  "get_revenue_by_source",
  "get_revenue_by_tier",
  "get_top_communities_revenue",
  "get_top_tiers_revenue",
  "get_daily_revenue_by_source",
  "get_entitlement_source_breakdown",
  "get_workspace_plan",
] as const;

/**
 * `anon` intencional: fluxos públicos reais (checkout sem login e landing de
 * comunidade). Mantidas como estão — o WARN do advisor é aceito por projeto.
 */
export const INTENTIONAL_ANON_FUNCTIONS = [
  "complete_checkout_session",
  "get_checkout_session_public",
  "get_community_public_plans",
  // Verificação pública de certificado por código exato (sem enumeração).
  "verify_circle_certificate",
] as const;

/**
 * Predicados usados dentro de policies de RLS. Revogar EXECUTE aqui quebraria
 * leitura pública legítima (storefront/landing), porque a policy é avaliada com
 * o papel do chamador. Mantidos intencionalmente.
 */
export const RLS_PREDICATE_FUNCTIONS = [
  "has_role",
  "is_admin_user",
  "is_community_member",
  "is_community_workspace_admin",
  "is_conversation_member",
  "is_workspace_admin",
  "is_workspace_member",
  "has_active_circle_subscription",
  "get_community_ids_for_user",
  "get_community_member_id",
  "get_community_member_ids_for_user",
  "workspace_accepts_public_writes",
] as const;

export const SERVER_ONLY_FUNCTIONS: readonly string[] = [
  ...TRIGGER_ONLY_FUNCTIONS,
  ...SERVICE_ONLY_FUNCTIONS,
];
