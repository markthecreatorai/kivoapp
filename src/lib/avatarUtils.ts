import type { User } from "@supabase/supabase-js";

/**
 * Resolve the best avatar URL from a Supabase auth user object.
 * Checks user_metadata fields commonly set by OAuth and manual uploads.
 */
export function getUserAvatarUrl(user: User | null | undefined): string | null {
  if (!user) return null;
  return (
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    null
  );
}

/**
 * Get display initials from a name or email.
 * Returns up to 2 uppercase characters.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }
  return email?.charAt(0).toUpperCase() || "U";
}

/**
 * Get the best display name from a Supabase auth user.
 */
export function getUserDisplayName(user: User | null | undefined): string {
  if (!user) return "Usuário";
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Usuário"
  );
}
