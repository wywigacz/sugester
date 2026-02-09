/**
 * Intent classifier — regex cascade (first match wins).
 * Determines search intent from user query to route to optimal ES query strategy.
 */

// Known brands for MODEL intent detection (from Cyfrowe.pl feed)
const KNOWN_BRANDS = [
  'canon', 'sony', 'nikon', 'fujifilm', 'fuji', 'panasonic', 'lumix',
  'olympus', 'om system', 'leica', 'sigma', 'tamron', 'viltrox', 'samyang',
  'godox', 'profoto', 'manfrotto', 'benro', 'gitzo', 'peak design',
  'lowepro', 'hoya', 'b+w', 'nisi', 'dji', 'gopro', 'sandisk', 'lexar',
  'kingston', 'zhiyun', 'rode', 'sennheiser', 'smallrig', 'fomei',
  'patona', 'newell', 'savage', 'marumi', 'epson', 'glareone',
  'hasselblad', 'ricoh', 'pentax', 'zeiss', 'tokina', 'laowa',
  'joby', 'tether tools', 'elinchrom', 'broncolor', 'aputure',
];

const BRAND_PATTERN = new RegExp(
  `\\b(${KNOWN_BRANDS.map((b) => b.replace(/[+]/g, '\\$&')).join('|')})\\b`,
  'i'
);

// Known categories for CATEGORY intent (mapped to real Cyfrowe.pl categories)
const CATEGORY_NAMES = new Map([
  // Aparaty
  ['aparaty', 'Aparaty cyfrowe'],
  ['aparaty cyfrowe', 'Aparaty cyfrowe'],
  ['aparaty bezlusterkowe', 'Aparaty cyfrowe'],
  ['bezlusterkowce', 'Aparaty cyfrowe'],
  ['mirrorless', 'Aparaty cyfrowe'],
  ['lustrzanki', 'Aparaty cyfrowe'],
  ['dslr', 'Aparaty cyfrowe'],
  ['aparaty analogowe', 'Aparaty analogowe'],
  ['analogowe', 'Aparaty analogowe'],

  // Obiektywy
  ['obiektywy', 'Obiektywy do bezlusterkowców'],
  ['obiektyw', 'Obiektywy do bezlusterkowców'],
  ['obiektywy do bezlusterkowców', 'Obiektywy do bezlusterkowców'],
  ['obiektywy do lustrzanek', 'Obiektywy do lustrzanek'],

  // Statywy
  ['statywy', 'Statywy i akcesoria'],
  ['statyw', 'Statywy i akcesoria'],

  // Oświetlenie
  ['lampy błyskowe', 'Lampy błyskowe'],
  ['lampy', 'Lampy błyskowe'],
  ['flesz', 'Lampy błyskowe'],
  ['flash', 'Lampy błyskowe'],
  ['lampy studyjne', 'Lampy błyskowe studyjne'],
  ['oświetlenie', 'Lampy światła ciągłego'],
  ['lampy wideo', 'Lampy wideo'],
  ['softboxy', 'Softboxy i akcesoria'],

  // Filtry
  ['filtry', 'Filtry, pokrywki'],
  ['filtr', 'Filtry, pokrywki'],
  ['filtry nd', 'Filtry, pokrywki'],
  ['filtry uv', 'Filtry, pokrywki'],
  ['filtry prostokątne', 'Filtry prostokątne'],

  // Pamięć / karty
  ['karty pamięci', 'Karty pamięci'],
  ['karty sd', 'Karty pamięci'],
  ['karty cf', 'Karty pamięci'],

  // Torby, plecaki
  ['torby', 'Torby, plecaki, walizki'],
  ['plecaki', 'Torby, plecaki, walizki'],
  ['plecak', 'Torby, plecaki, walizki'],
  ['walizki', 'Torby, plecaki, walizki'],

  // Drony
  ['drony', 'Drony'],
  ['dron', 'Drony'],

  // Kamery
  ['kamery', 'Kamery cyfrowe'],
  ['kamera', 'Kamery cyfrowe'],
  ['kamery sportowe', 'Kamery sportowe'],
  ['gopro', 'Kamery sportowe'],
  ['kamery internetowe', 'Kamery internetowe'],

  // Stabilizatory
  ['gimbale', 'Systemy stabilizacji'],
  ['gimbal', 'Systemy stabilizacji'],
  ['stabilizatory', 'Systemy stabilizacji'],

  // Audio
  ['audio', 'Audio'],
  ['mikrofon', 'Audio'],
  ['mikrofony', 'Audio'],
  ['słuchawki', 'Słuchawki'],

  // Zasilanie
  ['akumulatory', 'Akumulatory'],
  ['akumulator', 'Akumulatory'],
  ['baterie', 'Akumulatory'],
  ['ładowarki', 'Ładowarki'],
  ['zasilanie', 'Zasilanie'],

  // Optyka
  ['lornetki', 'Lornetki'],
  ['lornetka', 'Lornetki'],
  ['lunety', 'Lunety'],
  ['teleskopy', 'Teleskopy'],

  // Inne
  ['monitory', 'Monitory'],
  ['monitor', 'Monitory'],
  ['drukarki', 'Drukarki'],
  ['drukarka', 'Drukarki'],
  ['skanery', 'Skanery'],
  ['tablety', 'Tablety'],
  ['etui', 'Etui'],
  ['paski', 'Paski i szelki'],
  ['adaptery', 'Adaptery bagnetowe'],
  ['dyski', 'Dyski twarde'],
  ['tła', 'Tła i systemy zawieszania'],
  ['papier', 'Papier fotograficzny'],
  ['używane', 'Używane aparaty cyfrowe'],
]);

// Camera/body model patterns per brand
// When a user types "sony a7" or "canon eos r6", they want cameras, not accessories
const BODY_MODEL_PATTERNS = {
  sony: /^a[1-9]\b|^a7[crs]?\b|^a6[0-9]{3}\b|^a9\b|^alpha\b|^fx[0-9]/i,
  canon: /^eos\b|^r[0-9]\b|^r5\b|^r6\b|^r7\b|^r8\b|^r10\b|^r50\b|^r100\b|^powershot\b|^1d\b|^5d\b|^6d\b|^7d\b|^80d\b|^90d\b/i,
  nikon: /^z[0-9]\b|^z5\b|^z6\b|^z7\b|^z8\b|^z9\b|^z30\b|^z50\b|^zf\b|^zfc\b|^d[0-9]{3,4}\b/i,
  fujifilm: /^x-?[a-z][0-9]|^x-?[thsep]\d|^x100\b|^gfx\b/i,
  fuji: /^x-?[a-z][0-9]|^x-?[thsep]\d|^x100\b|^gfx\b/i,
  panasonic: /^s[0-9]\b|^s5\b|^gh[0-9]\b|^g[0-9]\b|^lumix\b/i,
  lumix: /^s[0-9]\b|^s5\b|^gh[0-9]\b|^g[0-9]\b/i,
  olympus: /^om-?[0-9]\b|^e-?m[0-9]\b|^pen\b/i,
  'om system': /^om-?[0-9]\b|^e-?m[0-9]\b/i,
  leica: /^sl[0-9]?\b|^q[0-9]?\b|^m[0-9]{1,2}\b|^cl\b/i,
  hasselblad: /^x[0-9]d\b|^907\b/i,
  ricoh: /^gr\b|^theta\b/i,
  pentax: /^k-?[0-9]\b/i,
  dji: /^mavic\b|^mini\b|^air\b|^phantom\b|^osmo\b|^pocket\b|^avata\b|^action\b/i,
  gopro: /^hero\b|^max\b/i,
};

/**
 * Detect if query after brand name refers to a camera body / main product.
 * "sony a7" → true, "sony np-fw50" (battery SKU) → false
 */
function detectBodyQuery(brand, afterBrand) {
  const brandLower = brand.toLowerCase();
  const pattern = BODY_MODEL_PATTERNS[brandLower];
  if (pattern && pattern.test(afterBrand)) {
    return true;
  }
  return false;
}

// Reverse map: model/series name → brand
// Detects brand from model name when user omits the brand (e.g. "eos r6" → canon)
const MODEL_TO_BRAND = [
  { pattern: /\beos\b|^r[0-9]\b|^r5\b|^r6\b|^r7\b|^r8\b|^r10\b|^r50\b|^r100\b|^powershot\b|\b1d\b|\b5d\b|\b6d\b|\b7d\b|\b80d\b|\b90d\b/i, brand: 'canon' },
  { pattern: /\balpha\b|^a[1-9]\b|^a7[crs]?\b|^a6[0-9]{3}\b|^a9\b|^zv-?[0-9e]/i, brand: 'sony' },
  { pattern: /\blumix\b|^gh[0-9]\b|^g[0-9]\b|^s5\b/i, brand: 'panasonic' },
  { pattern: /^x-?t[0-9]|^x-?[hsep][0-9]|^x100\b|^gfx\b|^x-?pro/i, brand: 'fujifilm' },
  { pattern: /^z[5-9]\b|^z30\b|^z50\b|^zf\b|^zfc\b|^d[3-9][0-9]{2}\b|^d[0-9]{4}\b/i, brand: 'nikon' },
  { pattern: /\bmavic\b|\bosmo\b|\bphantom\b|\bavata\b/i, brand: 'dji' },
  { pattern: /\bhero\b/i, brand: 'gopro' },
  { pattern: /^om-?[0-9]\b|^e-?m[0-9]\b|^pen\b/i, brand: 'olympus' },
  { pattern: /^gr\b|^theta\b/i, brand: 'ricoh' },
  { pattern: /^k-?[0-9]\b/i, brand: 'pentax' },
];

/**
 * Try to infer brand from query when no explicit brand name was found.
 * "eos r6 używany" → { brand: 'canon', isBodyQuery: true }
 */
function inferBrandFromModel(q) {
  // Strip condition words before matching
  const cleaned = q.replace(USED_PATTERN, '').replace(NEW_PATTERN, '').trim();
  for (const { pattern, brand } of MODEL_TO_BRAND) {
    if (pattern.test(cleaned)) {
      const isBodyQuery = detectBodyQuery(brand, cleaned);
      return { brand, isBodyQuery };
    }
  }
  return null;
}

// Condition preference — user explicitly wants used or new products
// Supports partial typing for autocomplete: "używ" → used, "now" → new
// Uses (?:\b|$) at end to match both mid-string words and end-of-string prefixes
const USED_PATTERN = /\b(?:używ\w*|uzyw\w*|second[\s-]?hand|poleasingow\w*)(?:\b|$)/i;
const NEW_PATTERN = /\b(?:now[yaeio]|fabrycznie?\s*now[yaeio]|nówka)(?:\b|$)/i;

// Accessory preference — user wants accessories, not the main product
// Supports partial typing: "akceso" → true
const ACCESSORY_PATTERN = /\b(?:akceso\w*|accesso\w*|klatk[aię]\w*|grip\w*|osłon\w*|etui\w*|filtr\w*|torb[aęy]\w*|plecak\w*|pasek\w*|ładowark\w*|akumulat\w*|bateri\w*)(?:\b|$)/i;

// Intent patterns
const PATTERNS = {
  EAN: /^\d{8}$|^\d{13}$/,
  // Matches manufacturer codes like LP-E6NH, NP-FW50, BG-R10, SB-300, EN-EL15c
  // Pattern: 2-4 letters + dash/underscore + alphanumeric part with at least one digit
  SKU: /^[A-Z]{2,4}[-_][A-Z]*\d[A-Z0-9]*/i,
  PARAMETRIC_APERTURE: /f\/\d+\.?\d*/i,
  PARAMETRIC_FOCAL: /\d+(?:-\d+)?\s*mm/i,
  PARAMETRIC_RES: /\b\d+[kK]\b/,
  PARAMETRIC_FPS: /\d+\s*fps/i,
  PARAMETRIC_SENSOR: /\b(?:full\s*frame|aps-?c|micro\s*4\/3|m43|pełna\s*klatka)\b/i,
  PARAMETRIC_MOUNT: /\b(?:RF|EF|FE|E-mount|Z-mount|X-mount|L-mount|MFT)\b/i,
  PRICE: /(?:do\s+(\d+)\s*(?:zł|pln)?|poniżej\s+(\d+)|tani[ae]?\b)/i,
};

/**
 * Detect condition preference from query.
 * Returns 'used' | 'new' | null
 */
function detectConditionPreference(q) {
  if (USED_PATTERN.test(q)) return 'used';
  if (NEW_PATTERN.test(q)) return 'new';
  return null;
}

/**
 * Detect if user wants accessories instead of the main product.
 */
function detectAccessoryPreference(q) {
  return ACCESSORY_PATTERN.test(q);
}

// Map accessory words to their ES category for filtering
const ACCESSORY_TO_CATEGORY = new Map([
  ['akumulator', 'Akumulatory'], ['akumulatory', 'Akumulatory'], ['bateria', 'Akumulatory'], ['baterie', 'Akumulatory'],
  ['ładowarka', 'Ładowarki'], ['ładowarki', 'Ładowarki'],
  ['filtr', 'Filtry, pokrywki'], ['filtry', 'Filtry, pokrywki'],
  ['torba', 'Torby, plecaki, walizki'], ['torby', 'Torby, plecaki, walizki'],
  ['plecak', 'Torby, plecaki, walizki'], ['plecaki', 'Torby, plecaki, walizki'],
  ['etui', 'Etui'],
  ['grip', 'Akumulatory'], ['gripy', 'Akumulatory'],
  ['klatka', 'Rigi i akcesoria'], ['klatki', 'Rigi i akcesoria'],
  ['osłona', 'Akcesoria drobne'], ['osłony', 'Akcesoria drobne'],
  ['pasek', 'Paski i szelki'], ['paski', 'Paski i szelki'],
  ['akcesoria', null], // generic — no specific category filter
]);

/**
 * Try to map the accessory words in query to a specific ES category.
 * "akumulator" → "Akumulatory", "ładowarka" → "Ładowarki", null if generic/unknown
 */
function detectAccessoryCategory(q) {
  const words = q.toLowerCase().split(/\s+/);
  for (const word of words) {
    // Try exact match first, then prefix match for partial typing
    if (ACCESSORY_TO_CATEGORY.has(word)) {
      return ACCESSORY_TO_CATEGORY.get(word);
    }
    // Prefix match for partial typing (e.g. "akumulat" → "akumulator")
    for (const [key, cat] of ACCESSORY_TO_CATEGORY) {
      if (key.startsWith(word) && word.length >= 4) {
        return cat;
      }
    }
  }
  return null;
}

/**
 * Strip accessory/condition words from query, leaving just the model/brand part.
 * "eos r6 akumulator" → "eos r6"
 * "sony a7 iv używany akcesoria" → "sony a7 iv"
 */
function stripModifierWords(q) {
  return q
    .replace(ACCESSORY_PATTERN, '')
    .replace(USED_PATTERN, '')
    .replace(NEW_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(query) {
  const q = (query || '').trim();

  // Detect condition preference across all intent types
  const conditionPref = detectConditionPreference(q);
  const wantsAccessories = detectAccessoryPreference(q);
  const accessoryCategory = wantsAccessories ? detectAccessoryCategory(q) : null;

  // RULE 1: EAN barcode (exact 8 or 13 digits)
  if (PATTERNS.EAN.test(q)) {
    return { type: 'EAN', query: q, conditionPref, wantsAccessories };
  }

  // RULE 2: SKU / manufacturer code pattern
  if (PATTERNS.SKU.test(q)) {
    return { type: 'SKU', query: q, conditionPref, wantsAccessories };
  }

  // RULE 3: MODEL or BRAND — brand name detected
  const brandMatch = BRAND_PATTERN.exec(q);
  if (brandMatch) {
    const afterBrand = q.slice(brandMatch.index + brandMatch[0].length).trim();
    // Has alphanumeric model identifier after brand → MODEL intent
    if (/[a-z0-9]/i.test(afterBrand)) {
      // wantsAccessories overrides isBodyQuery — user explicitly wants accessories
      const isBodyQuery = wantsAccessories ? false : detectBodyQuery(brandMatch[1], afterBrand);
      const modelQuery = stripModifierWords(q);
      return { type: 'MODEL', query: q, modelQuery, brand: brandMatch[1], isBodyQuery, conditionPref, wantsAccessories, accessoryCategory };
    }
    // Brand name alone (or brand + non-alphanumeric) → BRAND intent
    return { type: 'BRAND', query: q, brand: brandMatch[1], conditionPref, wantsAccessories, accessoryCategory };
  }

  // RULE 3b: MODEL without explicit brand — infer brand from model/series name
  // e.g. "eos r6 używany" → brand: canon, "alpha 7 iv" → brand: sony
  const inferred = inferBrandFromModel(q);
  if (inferred) {
    const isBodyQuery = wantsAccessories ? false : inferred.isBodyQuery;
    const modelQuery = stripModifierWords(q);
    return { type: 'MODEL', query: q, modelQuery, brand: inferred.brand, isBodyQuery, conditionPref, wantsAccessories, accessoryCategory };
  }

  // RULE 4: PARAMETRIC — contains photo-video parameter patterns
  const hasParam =
    PATTERNS.PARAMETRIC_APERTURE.test(q) ||
    PATTERNS.PARAMETRIC_FOCAL.test(q) ||
    PATTERNS.PARAMETRIC_RES.test(q) ||
    PATTERNS.PARAMETRIC_FPS.test(q) ||
    PATTERNS.PARAMETRIC_SENSOR.test(q) ||
    PATTERNS.PARAMETRIC_MOUNT.test(q);
  if (hasParam) {
    return { type: 'PARAMETRIC', query: q, conditionPref, wantsAccessories };
  }

  // RULE 5: CATEGORY — exact match to known category
  const qLower = q.toLowerCase();
  const mappedCategory = CATEGORY_NAMES.get(qLower);
  if (mappedCategory) {
    return { type: 'CATEGORY', query: q, category: mappedCategory, conditionPref, wantsAccessories };
  }

  // RULE 6: PRICE — contains price constraint
  const priceMatch = PATTERNS.PRICE.exec(q);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1] || priceMatch[2], 10) || null;
    const cleanQuery = q.replace(PATTERNS.PRICE, '').trim();
    return { type: 'PRICE', query: cleanQuery || q, maxPrice, conditionPref, wantsAccessories };
  }

  // DEFAULT: GENERAL — full hybrid search
  return { type: 'GENERAL', query: q, conditionPref, wantsAccessories };
}

export { KNOWN_BRANDS, CATEGORY_NAMES };
