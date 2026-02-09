/**
 * Ranking service — wraps base query with multiplicative function_score.
 * score_mode: multiply, boost_mode: multiply — preserves BM25 relevance ordering
 * while layering business signals + GA4 analytics + sales data.
 *
 * Signal weights (from strongest to weakest):
 *   1. Sales data (30d + 365d) — strongest signal, actual purchases
 *   2. GA4 popularity (traffic)  — pageviews, sessions, item views
 *   3. GA4 conversion (quality)  — purchase rate, cart-to-view, engagement
 *   4. GA4 trending (momentum)   — 30d vs 365d monthly average
 *   5. Revenue (revenue per product)
 *   6. Availability, promo, badges, rating — standard business signals
 */

// Core categories that should rank higher than accessories
const CORE_CATEGORIES = new Set([
  'Aparaty fotograficzne', 'Aparaty bezlusterkowe', 'Lustrzanki cyfrowe',
  'Aparaty kompaktowe', 'Obiektywy', 'Obiektywy zmiennoogniskowe',
  'Obiektywy stałoogniskowe', 'Obiektywy makro', 'Drony',
  'Drony konsumenckie', 'Drony profesjonalne',
]);

// Accessory categories — penalized when user searches for a camera model
const ACCESSORY_CATEGORIES = [
  'Rigi i akcesoria', 'Akumulatory', 'Ładowarki', 'Akcesoria drobne',
  'Osłony', 'Torby, plecaki, walizki', 'Filtry, pokrywki', 'Paski i szelki',
  'Zasilanie', 'Zasilacze', 'Kable', 'Etui', 'Czytniki', 'Lampy wideo',
  'Wyzwalanie lamp studyjnych', 'Slidery', 'Monitory podglądowe',
];

// Core product categories — boosted when user searches for a camera model
const BODY_PRODUCT_CATEGORIES = [
  'Aparaty cyfrowe', 'Używane aparaty cyfrowe',
  'Kamery cyfrowe', 'Kamery sportowe', 'Drony',
];

/**
 * Wrap a base ES query with function_score for business ranking.
 * @param {object} baseQuery — the ES query to wrap
 * @param {object} [intent] — optional intent from classifyIntent(), used for context-dependent boosts
 */
export function wrapWithFunctionScore(baseQuery, intent = null) {
  const isBodyQuery = intent?.isBodyQuery === true;
  const wantsAccessories = intent?.wantsAccessories === true;
  const isSKUQuery = intent?.type === 'SKU';
  const conditionPref = intent?.conditionPref || null; // 'used' | 'new' | null

  // Condition weights: default favors new, but flips when user asks for used/new
  let newWeight = 1.3;
  let usedWeight = 0.55;
  if (conditionPref === 'used') {
    newWeight = 0.55;
    usedWeight = 1.8;
  } else if (conditionPref === 'new') {
    newWeight = 1.5;
    usedWeight = 0.4;
  }

  return {
    function_score: {
      query: baseQuery,
      score_mode: 'multiply',
      boost_mode: 'multiply',
      functions: [
        // ── Availability boost ──
        // in_stock ×1.5, na_zamowienie ×0.8, out_of_stock ×0.3
        {
          filter: { term: { availability: 'in_stock' } },
          weight: 1.5,
        },
        {
          filter: { term: { availability: 'na_zamowienie' } },
          weight: 0.8,
        },
        {
          filter: { term: { availability: 'out_of_stock' } },
          weight: 0.3,
        },

        // ── Sales boost (30d) — strongest signal ──
        // Actual purchase count in the last 30 days.
        // log1p scaling prevents bestsellers from completely dominating.
        // Range: 1.0 (0 sales) → ~2.1 (100 sales) → ~2.7 (500 sales)
        {
          script_score: {
            script: {
              source: `
                double s30 = doc['sales_30d'].value;
                if (s30 > 0) {
                  return 1.0 + Math.log1p(s30) * 0.25;
                }
                return 1.0;
              `,
            },
          },
        },

        // ── Sales boost (365d) — long-term popularity signal ──
        // Yearly sales provide stability — products that sell consistently
        // get a mild boost even if they had a slow last month.
        // Range: 1.0 (0 sales) → ~1.5 (100 sales) → ~1.8 (1000 sales)
        {
          script_score: {
            script: {
              source: `
                if (doc.containsKey('sales_365d') && doc['sales_365d'].size() > 0) {
                  double s365 = doc['sales_365d'].value;
                  if (s365 > 0) {
                    return 1.0 + Math.log1p(s365) * 0.1;
                  }
                }
                return 1.0;
              `,
            },
          },
        },

        // ── Revenue boost ──
        // Products generating more revenue are prioritized slightly.
        // Uses 30d revenue with 365d as fallback.
        // Range: 1.0 (0 PLN) → ~1.15 (1000 PLN) → ~1.25 (10000 PLN)
        {
          script_score: {
            script: {
              source: `
                double rev = 0;
                if (doc.containsKey('revenue_30d') && doc['revenue_30d'].size() > 0) {
                  rev = doc['revenue_30d'].value;
                }
                if (rev <= 0 && doc.containsKey('revenue_365d') && doc['revenue_365d'].size() > 0) {
                  rev = doc['revenue_365d'].value / 12.0;
                }
                if (rev > 0) {
                  return 1.0 + Math.log1p(rev) * 0.025;
                }
                return 1.0;
              `,
            },
          },
        },

        // ── GA4 Popularity score ──
        // Products with more traffic/interest get a multiplicative boost.
        // Range: 1.0 (no data) → ~1.8 (top popular products)
        {
          script_score: {
            script: {
              source: `
                if (doc.containsKey('ga4.popularity_score') && doc['ga4.popularity_score'].size() > 0) {
                  double popScore = doc['ga4.popularity_score'].value;
                  if (popScore > 0) {
                    return 1.0 + popScore * 0.008;
                  }
                }
                return 1.0;
              `,
            },
          },
        },

        // ── GA4 Conversion score ──
        // Products that convert better get a boost.
        // Range: 1.0 (no data) → ~1.4 (excellent converters)
        {
          script_score: {
            script: {
              source: `
                if (doc.containsKey('ga4.conversion_score') && doc['ga4.conversion_score'].size() > 0) {
                  double convScore = doc['ga4.conversion_score'].value;
                  if (convScore > 0) {
                    return 1.0 + convScore * 0.004;
                  }
                }
                return 1.0;
              `,
            },
          },
        },

        // ── GA4 Trending score ──
        // Products with rising momentum get a mild boost.
        // Range: 1.0 (no data / flat) → ~1.3 (strongly trending up)
        {
          script_score: {
            script: {
              source: `
                if (doc.containsKey('ga4.trending_score') && doc['ga4.trending_score'].size() > 0) {
                  double trendScore = doc['ga4.trending_score'].value;
                  if (trendScore > 0) {
                    return 1.0 + trendScore * 0.003;
                  }
                }
                return 1.0;
              `,
            },
          },
        },

        // ── Margin: subtle boost (10% margin = ×1.03, 50% = ×1.15) ──
        {
          script_score: {
            script: {
              source: "1 + doc['margin_pct'].value * 0.003",
            },
          },
        },

        // ── Novelty: Gaussian decay on created_at (60 days scale, 50% decay) ──
        {
          gauss: {
            created_at: {
              origin: 'now',
              scale: '60d',
              decay: 0.5,
            },
          },
        },

        // ── Promo boost ──
        {
          filter: { term: { is_promo: true } },
          weight: 1.3,
        },

        // ── Rating boost (only for well-reviewed products) ──
        {
          script_score: {
            script: {
              source: "doc['review_count'].value >= 3 ? 1 + (doc['avg_rating'].value - 3) * 0.1 : 1.0",
            },
          },
        },

        // ── No-image penalty ──
        {
          filter: { term: { has_image: false } },
          weight: 0.1,
        },

        // ── Condition: new vs used ──
        // Dynamic weights based on user's condition preference.
        // Default: new ×1.3, used ×0.55 (ratio ~2.36×)
        // "używany" in query: new ×0.55, used ×1.8 (flipped)
        // "nowy" in query: new ×1.5, used ×0.4 (stronger default)
        {
          filter: { term: { condition: 'new' } },
          weight: newWeight,
        },
        {
          filter: { term: { condition: 'used' } },
          weight: usedWeight,
        },

        // ── Bestseller / highlighted badge boost ──
        {
          filter: { term: { is_bestseller: true } },
          weight: 1.15,
        },
        {
          filter: { term: { is_highlighted: true } },
          weight: 1.1,
        },

        // ── SKU specificity boost ──
        // When user types a product code (LP-E6NH), prefer products where that code
        // IS the product (short name like "Newell zamiennik LP-E6NH") over accessories
        // that mention it (long name like "Ładowarka do akumulatorów LP-E6NH [4838]").
        // Inverse name length: shorter name → higher boost (max ×3.0 for very short names).
        ...(isSKUQuery ? [{
          script_score: {
            script: {
              source: `
                String name = doc['name.exact'].value;
                int len = name.length();
                if (len < 15) return 3.0;
                if (len < 30) return 2.5;
                if (len < 45) return 1.8;
                if (len < 60) return 1.2;
                return 1.0;
              `,
            },
          },
        }] : []),

        // ── Category context boosts ──
        // isBodyQuery: user wants camera/drone → boost bodies, penalize accessories
        // wantsAccessories: user explicitly wants accessories → boost accessories, penalize bodies
        ...(isBodyQuery ? [
          {
            filter: { terms: { category: BODY_PRODUCT_CATEGORIES } },
            weight: 8.0,
          },
          {
            filter: {
              terms: {
                category: [
                  'Obiektywy do bezlusterkowców', 'Obiektywy do lustrzanek',
                  'Obiektywy do filmowania', 'Używane obiektywy',
                ],
              },
            },
            weight: 3.0,
          },
          {
            filter: { terms: { category: ACCESSORY_CATEGORIES } },
            weight: 0.08,
          },
        ] : wantsAccessories ? [
          // Flip: boost accessories, penalize cameras
          {
            filter: { terms: { category: ACCESSORY_CATEGORIES } },
            weight: 5.0,
          },
          {
            filter: { terms: { category: BODY_PRODUCT_CATEGORIES } },
            weight: 0.1,
          },
        ] : []),
      ],
    },
  };
}

/**
 * Check if a category is a "core" category for the core boost.
 * Returns ×1.2 for core, ×1.0 for accessories.
 */
export function getCategoryBoost(category) {
  return CORE_CATEGORIES.has(category) ? 1.2 : 1.0;
}

export { CORE_CATEGORIES };
