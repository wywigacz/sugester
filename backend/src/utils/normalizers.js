/**
 * Client-side text normalization (mirrors ES char_filters for pre-processing).
 */

// α → Alpha (Greek alpha for Sony)
const ALPHA_RE = /α/g;

// Aperture: F2.8, F/2.8, f:2.8, f 2.8 → f/2.8
const APERTURE_RE = /[Ff]\s*[/:]\s*(\d)/g;

// Focal length: 70–200 mm, 70—200mm → 70-200mm
const FOCAL_RE = /(\d+)\s*[–—-]\s*(\d+)\s*mm\b/g;

// Mark variants: Mark II, Mk II, MkII, Mark 2 → MarkII
const MARK_RE = /\b(?:Mark|Mk)\s*(II|III|IV|V|2|3|4|5)\b/gi;

// Resolution: 24.2 Mpx, megapixels → 24.2MP
const RESOLUTION_RE = /\b(\d+(?:\.\d+)?)\s*(?:Mpx|megapixel[si]?|megapiksel[i]?)\b/gi;

// Unicode normalization
const UNICODE_MAP = {
  '\u2013': '-',  // en-dash
  '\u2014': '-',  // em-dash
  '\u201C': '"',  // left double quote
  '\u201D': '"',  // right double quote
  '\u201E': '"',  // low double quote
  '\u00A0': ' ',  // nbsp
};
const UNICODE_RE = new RegExp(`[${Object.keys(UNICODE_MAP).join('')}]`, 'g');

export function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(ALPHA_RE, 'Alpha')
    .replace(APERTURE_RE, 'f/$1')
    .replace(FOCAL_RE, '$1-$2mm')
    .replace(MARK_RE, 'Mark$1')
    .replace(RESOLUTION_RE, '$1MP')
    .replace(UNICODE_RE, (ch) => UNICODE_MAP[ch] || ch);
}

/**
 * Normalize a query string for cache keys:
 * lowercase, trim, collapse whitespace.
 */
export function normalizeCacheKey(q) {
  return (q || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Escape special Elasticsearch query characters.
 * Prevents user input like * OR AND from being interpreted as query syntax.
 */
export function escapeQueryString(q) {
  return (q || '').replace(/[+\-=&|><!(){}\[\]^"~*?:\\/]/g, '\\$&');
}
