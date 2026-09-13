/**
 * Billiger, stabiler Text-Hash (FNV-1a, 32 Bit).
 *
 * Zweck: erkennen, ob sich ein Kapiteltext seit dem letzten Fakten-Check **verändert** hat —
 * nur dann lohnt ein neuer Aufruf. Kein Sicherheits-Hash; Kollisionen sind hier unkritisch.
 */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}
