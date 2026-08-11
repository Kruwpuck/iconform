// ponytail: shared input-validation helpers — filename sanitizer + logo guard + body-size cap

export const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

/** Strip path-traversal chars, control chars, and collapse whitespace; cap at 150 chars. */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    // strip ASCII control chars \x00–\x1f
    .replace(/[\x00-\x1f]/g, '')
    // strip forbidden path/shell chars and ".." sequences
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    // collapse internal whitespace runs
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

/**
 * Accept only png/jpeg/jpg/webp data-URIs ≤ 2 MB.
 * Rejects SVG and any other MIME type.
 */
export function isValidLogo(logo: string): boolean {
  const match = logo.match(/^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/);
  if (!match) return false;
  const payload = match[2];
  // base64 length → byte count (upper bound)
  return payload.length * 3 / 4 <= 2 * 1024 * 1024;
}
