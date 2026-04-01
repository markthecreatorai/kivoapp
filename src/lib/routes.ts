/**
 * Centralized route builders for Circles module.
 * Always use these helpers instead of hardcoding paths.
 */

export function circlePath(slug: string, section?: string): string {
  if (!section) return `/circles/${slug}`;
  return `/circles/${slug}/${section}`;
}

export function circleSettingsPath(slug: string, tab?: string): string {
  const base = `/circles/${slug}/settings`;
  return tab ? `${base}?section=${tab}` : base;
}

export function circlePostPath(slug: string, postId: string): string {
  return `/circles/${slug}/post/${postId}`;
}

export function circleProfilePath(slug: string, memberId?: string): string {
  return memberId ? `/circles/${slug}/profile/${memberId}` : `/circles/${slug}/profile`;
}

export function circleSpacePath(slug: string, spaceSlug: string): string {
  return `/circles/${slug}/spaces/${spaceSlug}`;
}
