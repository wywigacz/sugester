/**
 * Parameter extractor — extracts structured photo-video parameters from query text.
 * Used to add filters to ES queries when parametric intent is detected.
 */

const EXTRACTORS = [
  {
    name: 'aperture',
    pattern: /f\/(\d+\.?\d*)/i,
    extract: (m) => ({ 'params.aperture': `f/${m[1]}` }),
  },
  {
    name: 'focal_range',
    pattern: /(\d+)-(\d+)\s*mm/i,
    extract: (m) => ({
      'params.focal_length_min': parseInt(m[1], 10),
      'params.focal_length_max': parseInt(m[2], 10),
    }),
  },
  {
    name: 'focal_single',
    pattern: /\b(\d+)\s*mm\b/i,
    extract: (m) => ({
      'params.focal_length_min': parseInt(m[1], 10),
      'params.focal_length_max': parseInt(m[1], 10),
    }),
  },
  {
    name: 'video_resolution',
    pattern: /\b(\d+)[kK]\b/,
    extract: (m) => ({ 'params.video_resolution': `${m[1]}K` }),
  },
  {
    name: 'video_fps',
    pattern: /(\d+)\s*fps/i,
    extract: (m) => ({ 'params.video_fps': parseInt(m[1], 10) }),
  },
  {
    name: 'sensor_size',
    pattern: /\b(full\s*frame|pełna\s*klatka|ff)\b/i,
    extract: () => ({ 'params.sensor_size': 'Full Frame' }),
  },
  {
    name: 'sensor_size_apsc',
    pattern: /\b(aps-?c)\b/i,
    extract: () => ({ 'params.sensor_size': 'APS-C' }),
  },
  {
    name: 'sensor_size_m43',
    pattern: /\b(micro\s*4\/3|m43|mft)\b/i,
    extract: () => ({ 'params.sensor_size': 'Micro 4/3' }),
  },
  {
    name: 'mount',
    pattern: /\b(RF|EF|FE|E-mount|Z-mount|X-mount|L-mount|MFT)\b/i,
    extract: (m) => ({ 'params.mount': m[1].toUpperCase() }),
  },
  {
    name: 'filter_diameter',
    pattern: /\b(\d{2})\s*mm\b/i,
    // Only match in "filter" context — 2-digit mm values (e.g., 77mm filter)
    extract: (m) => ({ 'params.filter_diameter': parseInt(m[1], 10) }),
    contextPattern: /filtr|cpl|nd|uv|polaryz/i,
  },
  {
    name: 'megapixels',
    pattern: /(\d+(?:\.\d+)?)\s*(?:MP|Mpx|megapiksel)/i,
    extract: (m) => ({ 'params.megapixels': parseFloat(m[1]) }),
  },
];

/**
 * Extract structured parameters from a query string.
 * Returns an object of field → value pairs suitable for ES bool.filter terms.
 */
export function extractParams(query) {
  const params = {};
  const q = query || '';

  for (const extractor of EXTRACTORS) {
    // Skip context-dependent extractors if context not present
    if (extractor.contextPattern && !extractor.contextPattern.test(q)) {
      continue;
    }

    const match = extractor.pattern.exec(q);
    if (match) {
      Object.assign(params, extractor.extract(match));
    }
  }

  return params;
}

/**
 * Strip extracted parameter patterns from query, leaving the "text" portion.
 */
export function stripParams(query) {
  let q = query || '';
  q = q.replace(/f\/\d+\.?\d*/gi, '');
  q = q.replace(/\d+-\d+\s*mm/gi, '');
  q = q.replace(/\b\d+\s*mm\b/gi, '');
  q = q.replace(/\b\d+[kK]\b/g, '');
  q = q.replace(/\d+\s*fps/gi, '');
  q = q.replace(/\b(?:full\s*frame|pełna\s*klatka|ff|aps-?c|micro\s*4\/3|m43|mft)\b/gi, '');
  q = q.replace(/\b(?:RF|EF|FE|E-mount|Z-mount|X-mount|L-mount|MFT)\b/gi, '');
  q = q.replace(/\s+/g, ' ').trim();
  return q;
}
