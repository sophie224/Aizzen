/**
 * Two-letter initials for an avatar chip.
 *
 * Avatars are decorative: the full name is always rendered beside them, so a
 * collision between two people's initials is never load-bearing.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
