/**
 * Central Elasticsearch query construction.
 * Builds autocomplete (_msearch) and full search queries per intent.
 */

import { extractParams, stripParams } from './param-extractor.js';

const INDEX_NAME = process.env.INDEX_NAME || 'products';

// Brand case normalization map — ES stores brands as keywords with specific casing.
// Maps lowercase → ES keyword value. Brands not listed default to Title Case.
const BRAND_CASE_MAP = {
  dji: 'DJI',
  nisi: 'NISI',
  nanlite: 'NANLITE',
  'b+w': 'B+W',
  'gopro': 'GoPro',
  'glareone': 'GlareOne',
  'peak design': 'Peak Design',
  'om system': 'OM System',
  'easycover': 'EasyCover',
  'blackmagic': 'Blackmagic',
  'venus optics': 'Venus Optics',
  'insta360': 'Insta360',
};

/**
 * Normalize brand string to match ES keyword casing.
 * "sony" → "Sony", "dji" → "DJI", "peak design" → "Peak Design"
 */
function normalizeBrandCase(brand) {
  const lower = brand.toLowerCase();
  if (BRAND_CASE_MAP[lower]) return BRAND_CASE_MAP[lower];
  // Default: capitalize first letter of each word
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Field boost configuration for multi_match
const NAME_FIELDS = [
  'name.exact^10',
  'model_code^8',
  'name.prefix^4',
  'name.folded^3',
  'name.morfologik^2',
  'name.stempel^1',
  'description^0.5',
];

const NAME_FIELDS_LIGHT = [
  'name.exact^10',
  'name.prefix^4',
  'name.folded^3',
  'name.morfologik^2',
];

// Categories where the "body" product lives (cameras, kits, drones)
// When user searches "sony a7", these categories get a huge boost
const BODY_CATEGORIES = [
  'Aparaty cyfrowe', 'Używane aparaty cyfrowe',
  'Kamery cyfrowe', 'Kamery sportowe',
  'Drony',
];

// Closely related categories that should also rank well for body queries
const RELATED_CATEGORIES = [
  'Obiektywy do bezlusterkowców', 'Obiektywy do lustrzanek',
  'Obiektywy do filmowania', 'Używane obiektywy',
  'Adaptery bagnetowe',
];

/**
 * Build _msearch body for autocomplete endpoint.
 * Returns array of header+body pairs for 4 sub-queries in a single HTTP request.
 */
export function buildAutocompleteQuery(q, intent, limit = 5) {
  const bodies = [];
  const header = { index: INDEX_NAME };

  // Sub-query 1: Completion suggester → query suggestions
  bodies.push(header);
  bodies.push({
    suggest: {
      product_suggest: {
        prefix: q,
        completion: {
          field: 'suggest',
          size: limit,
          skip_duplicates: true,
          fuzzy: {
            fuzziness: 'AUTO',
            prefix_length: 1,
          },
        },
      },
    },
    _source: false,
    size: 0,
  });

  // Sub-query 2: Category aggregation → category suggestions
  bodies.push(header);
  bodies.push({
    size: 0,
    query: buildBaseMatchQuery(q, intent),
    aggs: {
      categories: {
        terms: {
          field: 'category',
          size: 3,
        },
      },
    },
  });

  // Sub-query 3: Brand aggregation → brand suggestions
  bodies.push(header);
  bodies.push({
    size: 0,
    query: buildBaseMatchQuery(q, intent),
    aggs: {
      brands: {
        terms: {
          field: 'brand',
          size: 2,
        },
      },
    },
  });

  // Sub-query 4: Product results (in_stock only for autocomplete)
  bodies.push(header);
  bodies.push({
    size: limit,
    query: {
      bool: {
        must: [buildIntentQuery(q, intent)],
        filter: [
          { term: { availability: 'in_stock' } },
        ],
      },
    },
    _source: [
      'id', 'name', 'brand', 'category', 'category_path',
      'price', 'sale_price', 'is_promo', 'currency',
      'availability', 'image_url', 'product_url', 'has_image',
      'avg_rating', 'review_count', 'is_new',
      'description', 'sku', 'condition', 'is_bestseller', 'is_highlighted',
    ],
  });

  return bodies;
}

/**
 * Build full search query with filters, pagination, sorting, facets.
 */
export function buildSearchQuery(q, intent, { filters = {}, page = 1, perPage = 20, sort = 'relevance' } = {}) {
  const from = (page - 1) * perPage;
  const filterClauses = buildFilterClauses(filters);
  // COMPOUND handles its own param filters inside buildIntentQuery, skip here.
  // For all other intents, use params from intent (universally extracted) or extract on the fly.
  const params = intent.type === 'COMPOUND' ? {} : (intent.params || (intent.type === 'PARAMETRIC' ? extractParams(q) : {}));
  const paramFilters = buildParamFilters(params);

  const baseQuery = buildIntentQuery(q, intent);

  const body = {
    from,
    size: perPage,
    query: {
      bool: {
        must: [baseQuery],
        filter: [...filterClauses, ...paramFilters],
      },
    },
    aggs: {
      brands: { terms: { field: 'brand', size: 20 } },
      categories: { terms: { field: 'category', size: 20 } },
      availability_facet: { terms: { field: 'availability', size: 5 } },
      mounts: { terms: { field: 'compatible_mounts', size: 15 } },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: '0-500', to: 500 },
            { key: '500-1000', from: 500, to: 1000 },
            { key: '1000-3000', from: 1000, to: 3000 },
            { key: '3000-5000', from: 3000, to: 5000 },
            { key: '5000-10000', from: 5000, to: 10000 },
            { key: '10000+', from: 10000 },
          ],
        },
      },
    },
    _source: [
      'id', 'name', 'brand', 'category', 'category_path',
      'price', 'sale_price', 'is_promo', 'currency',
      'availability', 'image_url', 'product_url', 'has_image',
      'avg_rating', 'review_count', 'is_new', 'sales_30d',
      'description', 'sku', 'condition', 'is_bestseller', 'is_highlighted',
      'ga4.popularity_score', 'ga4.conversion_score', 'ga4.trending_score',
    ],
  };

  // Sorting
  if (sort !== 'relevance') {
    body.sort = buildSortClause(sort);
  }

  return body;
}

/**
 * Build intent-specific base query.
 */
function buildIntentQuery(q, intent) {
  switch (intent.type) {
    case 'EAN':
      return { term: { ean: q } };

    case 'SKU': {
      // User typed a specific product code (e.g. LP-E6NH, NP-FW50).
      // The MAIN product (akumulator LP-E6NH) must rank above accessories
      // that merely mention this code in their name ("ładowarka do LP-E6NH").
      // Strategy: broad multi_match in must (finds everything), strong should boosts
      // for products where the code IS the product (sku, manufacturer_code, model_code match).
      const skuUpper = q.toUpperCase();
      const skuLower = q.toLowerCase();
      return {
        bool: {
          must: [
            { multi_match: { query: q, fields: NAME_FIELDS_LIGHT, type: 'best_fields' } },
          ],
          should: [
            // Strongest: exact SKU / manufacturer code / model_code match → this IS the product
            // Try multiple case variants (keyword fields are case-sensitive)
            { term: { sku: { value: q, boost: 200 } } },
            { term: { sku: { value: skuUpper, boost: 200 } } },
            { term: { sku: { value: skuLower, boost: 200 } } },
            { term: { manufacturer_code: { value: q, boost: 200 } } },
            { term: { manufacturer_code: { value: skuUpper, boost: 200 } } },
            { term: { manufacturer_code: { value: skuLower, boost: 200 } } },
            { term: { model_code: { value: q, boost: 200 } } },
            { term: { model_code: { value: skuUpper, boost: 200 } } },
            { term: { model_code: { value: skuLower, boost: 200 } } },
            // Phrase match on name — rewards "Akumulator LP-E6NH" over "Ładowarka do LP-E6NH"
            { match_phrase: { 'name.morfologik': { query: q, boost: 50 } } },
          ],
        },
      };
    }

    case 'MODEL': {
      const modelBrand = intent.brand ? normalizeBrandCase(intent.brand) : null;
      const modelQuery = intent.modelQuery || q;

      // When user wants accessories for a model (e.g. "eos r6 akumulator"):
      // Accessories often don't have the model name in their name - they use the battery code
      // (e.g. "Newell zamiennik LP-E6NH" with "Canon EOS R5 i R6" only in description).
      // Strategy: require model match in name OR description, and boost accessory keyword matches.
      if (intent.wantsAccessories && modelQuery !== q) {
        // Extract the accessory keyword(s) by removing model part from full query
        const accessoryPart = q.replace(new RegExp(modelQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
        const accCategory = intent.accessoryCategory; // e.g. "Akumulatory" from "akumulator"

        const mustClauses = [
          // Model must appear somewhere — name OR description
          {
            bool: {
              should: [
                { multi_match: { query: modelQuery, fields: ['name.folded^3', 'name.morfologik^2', 'name.prefix^1'], type: 'best_fields' } },
                { match: { description: { query: modelQuery, operator: 'and' } } },
              ],
              minimum_should_match: 1,
            },
          },
        ];
        // If we know the specific accessory category (e.g. "akumulator" → "Akumulatory"),
        // add it as a hard filter — dramatically narrows results to the right product type.
        if (accCategory) {
          mustClauses.push({ term: { category: accCategory } });
        }

        const shouldClauses = [
          // Full query in name — strong boost when everything matches in name
          { multi_match: { query: q, fields: NAME_FIELDS, type: 'cross_fields', boost: 5 } },
          // Accessory keyword match in name or category
          ...(accessoryPart ? [
            { multi_match: { query: accessoryPart, fields: ['name.folded^5', 'name.morfologik^3'], type: 'best_fields', boost: 3 } },
          ] : []),
          // Model in name (not just description) — extra boost for products that have it
          { multi_match: { query: modelQuery, fields: ['name.folded^3', 'name.morfologik^2'], type: 'best_fields', boost: 2 } },
        ];
        if (modelBrand) {
          shouldClauses.push({ term: { brand: { value: modelBrand, boost: 8 } } });
        }
        return {
          bool: {
            must: mustClauses,
            should: shouldClauses,
          },
        };
      }

      // Standard MODEL query: combine broad matching (must) with exact-sequence boosting (should).
      // match_phrase on name.morfologik (no word_delimiter_graph, no split search analyzer)
      // rewards products where query tokens appear as a contiguous phrase,
      // so "sony a7 iv" ranks A7 IV above A7R III.
      //
      // If params were extracted (e.g. "sony 50mm" → focal=50), strip them from text query
      // so "50mm" doesn't create noise in the text match. Params are applied as filters
      // in buildSearchQuery.
      const hasParams = intent.params && Object.keys(intent.params).length > 0;
      const textQ = hasParams ? stripParams(q) : q;

      const shouldClauses = [
        // Exact phrase boost — strong reward for precise model sequence
        {
          match_phrase: {
            'name.morfologik': {
              query: q,
              boost: 50,
            },
          },
        },
        // Phrase with slop — rewards close proximity tokens
        {
          match_phrase: {
            'name.morfologik': {
              query: q,
              slop: 2,
              boost: 25,
            },
          },
        },
        // Exact match on model_code
        {
          match_phrase: {
            model_code: {
              query: q,
              boost: 30,
            },
          },
        },
      ];
      // Brand boost — products BY this brand rank above accessories FOR this brand
      if (modelBrand) {
        shouldClauses.push({
          term: {
            brand: {
              value: modelBrand,
              boost: 15,
            },
          },
        });
      }
      return {
        bool: {
          must: [
            {
              multi_match: {
                query: textQ,
                fields: ['name.exact^10', 'model_code^8', 'name.folded^5', 'name.prefix^3'],
                type: 'best_fields',
                fuzziness: 1,
                prefix_length: 2,
              },
            },
          ],
          should: shouldClauses,
        },
      };
    }

    case 'BRAND': {
      // User typed a brand name (e.g. "sony", "canon").
      // Match all products mentioning the brand, but strongly prefer
      // products OF that brand over accessories FOR that brand.
      // Normalize brand to match ES keyword casing (e.g. "sony" → "Sony", "dji" → "DJI")
      const brandNorm = normalizeBrandCase(intent.brand);
      return {
        bool: {
          should: [
            // Strong boost: exact brand field match (products BY this brand)
            {
              term: {
                brand: {
                  value: brandNorm,
                  boost: 20,
                },
              },
            },
            // Weaker: brand name in product name/description
            // (catches "Smallrig cage for Sony" etc.)
            {
              multi_match: {
                query: q,
                fields: NAME_FIELDS,
                type: 'best_fields',
              },
            },
          ],
        },
      };
    }

    case 'COMPOUND': {
      // Compound intent: category word + brand + optional parameters.
      // e.g. "obiektyw Canon 50 mm" → category=Obiektywy, brand=Canon, focal=50
      // e.g. "statyw Manfrotto" → category=Statywy, brand=Manfrotto
      // e.g. "obiektyw do Canon R6" → category=Obiektywy, compatible_mounts=Canon RF
      const brandNorm = intent.brand ? normalizeBrandCase(intent.brand) : null;
      const paramFilters = buildParamFilters(intent.params || {});
      const textQuery = intent.textQuery || q;

      // Category filter is always a hard constraint
      const mustClauses = [
        { term: { category: intent.detectedCategory } },
      ];

      // Mount compatibility filter: "obiektyw do Canon" → filter by Canon RF/EF mounts
      if (intent.compatibilityMode && intent.compatMounts) {
        mustClauses.push({
          terms: { compatible_mounts: intent.compatMounts },
        });
      }

      const shouldClauses = [
        // Full query phrase match for ordering
        {
          match_phrase: {
            'name.morfologik': {
              query: q,
              slop: 3,
              boost: 20,
            },
          },
        },
        // Text relevance on remaining terms
        {
          multi_match: {
            query: textQuery,
            fields: NAME_FIELDS,
            type: 'best_fields',
          },
        },
      ];

      // Brand boost (not hard filter — allows third-party lenses for the mount)
      if (brandNorm && !intent.compatibilityMode) {
        shouldClauses.push({
          term: { brand: { value: brandNorm, boost: 10 } },
        });
      }

      return {
        bool: {
          must: mustClauses,
          should: shouldClauses,
          filter: paramFilters,
        },
      };
    }

    case 'PARAMETRIC': {
      const textPart = stripParams(q);
      if (!textPart) {
        return { match_all: {} };
      }
      return {
        multi_match: {
          query: textPart,
          fields: NAME_FIELDS,
          type: 'best_fields',
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      };
    }

    case 'CATEGORY': {
      // Category filter + name relevance scoring.
      // Without name matching, all products in the category get equal score (1.0),
      // so "ochraniacze na statyw" can outrank actual "statywy" due to sales signals.
      //
      // Strategy: use function_score with script to check if query appears
      // at the START of the product name (case-insensitive). Products where
      // the category keyword IS the product type (e.g. "Statyw Vanguard...")
      // get a much higher score than accessories that merely mention it
      // (e.g. "KUPO Ochraniacze na statyw").
      const qLower = q.toLowerCase();
      return {
        function_score: {
          query: {
            bool: {
              must: [{ term: { category: intent.category } }],
              should: [
                // BM25 text relevance on name
                {
                  multi_match: {
                    query: q,
                    fields: ['name.folded^3', 'name.morfologik^2', 'name.stempel^1'],
                    type: 'best_fields',
                  },
                },
              ],
            },
          },
          functions: [
            // Primary product boost: name starts with the query word
            // "Statyw Vanguard..." → ×5.0, "Ochraniacze na statyw" → ×1.0
            {
              script_score: {
                script: {
                  source: `
                    String name = doc['name.exact'].value.toLowerCase();
                    if (name.startsWith(params.q)) {
                      return 5.0;
                    }
                    return 1.0;
                  `,
                  params: { q: qLower },
                },
              },
            },
            // Subcategory boost: "statywy (trójnogi)" > "pozostałe akcesoria"
            // Uses category_path to distinguish core vs accessory subcategories
            {
              script_score: {
                script: {
                  source: `
                    String path = '';
                    if (doc.containsKey('category_path') && doc['category_path'].size() > 0) {
                      path = doc['category_path'].value.toLowerCase();
                    }
                    if (path.contains('pozosta\u0142e') || path.contains('akcesoria drobne')) {
                      return 0.5;
                    }
                    return 1.0;
                  `,
                },
              },
            },
          ],
          score_mode: 'multiply',
          boost_mode: 'multiply',
        },
      };
    }

    case 'PRICE': {
      const textPart = intent.query;
      if (!textPart || textPart === q) {
        return { match_all: {} };
      }
      return {
        multi_match: {
          query: textPart,
          fields: NAME_FIELDS,
          type: 'best_fields',
        },
      };
    }

    case 'GENERAL':
    default: {
      // If params were extracted (e.g. "50mm f/1.4"), strip them from text
      const generalHasParams = intent.params && Object.keys(intent.params).length > 0;
      const generalTextQ = generalHasParams ? stripParams(q) : q;
      return {
        multi_match: {
          query: generalTextQ || q,
          fields: NAME_FIELDS,
          type: 'best_fields',
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      };
    }
  }
}

/**
 * Simple base match for aggregation sub-queries.
 */
function buildBaseMatchQuery(q, intent) {
  if (intent.type === 'EAN') {
    return { term: { ean: q } };
  }
  if (intent.type === 'CATEGORY') {
    return { term: { category: intent.category } };
  }
  if (intent.type === 'COMPOUND') {
    // Scope aggregations to the detected category for relevant facets
    return {
      bool: {
        must: [{ term: { category: intent.detectedCategory } }],
        should: [
          { multi_match: { query: q, fields: ['name.prefix^3', 'name.folded^2', 'name.morfologik'], type: 'best_fields' } },
        ],
      },
    };
  }
  return {
    multi_match: {
      query: q,
      fields: ['name.prefix^3', 'name.folded^2', 'name.morfologik'],
      type: 'best_fields',
    },
  };
}

/**
 * Convert URL filter params to ES filter clauses.
 */
function buildFilterClauses(filters) {
  const clauses = [];

  if (filters.brand) {
    clauses.push({ term: { brand: filters.brand } });
  }
  if (filters.category) {
    clauses.push({ term: { category: filters.category } });
  }
  if (filters.availability) {
    clauses.push({ term: { availability: filters.availability } });
  }
  if (filters.mount) {
    clauses.push({ term: { compatible_mounts: filters.mount } });
  }
  if (filters.price_min != null || filters.price_max != null) {
    const range = {};
    if (filters.price_min != null) range.gte = filters.price_min;
    if (filters.price_max != null) range.lte = filters.price_max;
    clauses.push({ range: { price: range } });
  }

  return clauses;
}

/**
 * Convert extracted params to ES filter clauses.
 */
function buildParamFilters(params) {
  const clauses = [];
  for (const [field, value] of Object.entries(params)) {
    if (field.includes('focal_length_min')) {
      clauses.push({ range: { 'params.focal_length_min': { lte: value } } });
    } else if (field.includes('focal_length_max')) {
      clauses.push({ range: { 'params.focal_length_max': { gte: value } } });
    } else {
      clauses.push({ term: { [field]: value } });
    }
  }
  return clauses;
}

/**
 * Build sort clause array.
 * 'popular' uses GA4 popularity_score when available, falls back to sales_30d.
 * 'trending' sorts by GA4 trending momentum.
 */
function buildSortClause(sort) {
  switch (sort) {
    case 'price_asc':
      return [{ price: 'asc' }, '_score'];
    case 'price_desc':
      return [{ price: 'desc' }, '_score'];
    case 'newest':
      return [{ created_at: 'desc' }, '_score'];
    case 'popular':
      return [
        {
          _script: {
            type: 'number',
            script: {
              source: `
                if (doc.containsKey('ga4.popularity_score') && doc['ga4.popularity_score'].size() > 0 && doc['ga4.popularity_score'].value > 0) {
                  return doc['ga4.popularity_score'].value;
                }
                return doc['sales_30d'].value * 0.1;
              `,
            },
            order: 'desc',
          },
        },
        '_score',
      ];
    case 'trending':
      return [
        {
          _script: {
            type: 'number',
            script: {
              source: `
                if (doc.containsKey('ga4.trending_score') && doc['ga4.trending_score'].size() > 0) {
                  return doc['ga4.trending_score'].value;
                }
                return 0;
              `,
            },
            order: 'desc',
          },
        },
        '_score',
      ];
    default:
      return ['_score'];
  }
}

/**
 * Build a phrase suggest query for spell correction.
 */
export function buildSpellCheckQuery(q) {
  return {
    suggest: {
      text: q,
      spell_check: {
        phrase: {
          field: 'name.folded',
          size: 1,
          gram_size: 3,
          direct_generator: [
            {
              field: 'name.folded',
              suggest_mode: 'missing',
            },
          ],
          highlight: {
            pre_tag: '<em>',
            post_tag: '</em>',
          },
        },
      },
    },
    size: 0,
  };
}

/**
 * Build trending products query.
 * Uses GA4 popularity_score when available, falls back to sales_30d.
 */
export function buildTrendingQuery(limit = 10) {
  return {
    size: limit,
    query: {
      bool: {
        filter: [
          { term: { availability: 'in_stock' } },
        ],
      },
    },
    sort: [
      {
        _script: {
          type: 'number',
          script: {
            source: `
              if (doc.containsKey('ga4.popularity_score') && doc['ga4.popularity_score'].size() > 0 && doc['ga4.popularity_score'].value > 0) {
                return doc['ga4.popularity_score'].value;
              }
              return doc['sales_30d'].value * 0.1;
            `,
          },
          order: 'desc',
        },
      },
    ],
    _source: [
      'id', 'name', 'brand', 'category', 'price', 'sale_price',
      'is_promo', 'currency', 'availability', 'image_url',
      'product_url', 'has_image', 'avg_rating', 'review_count',
      'ga4.popularity_score', 'ga4.trending_score',
    ],
    aggs: {
      top_categories: {
        terms: { field: 'category', size: 5 },
      },
    },
  };
}
