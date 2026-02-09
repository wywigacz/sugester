/**
 * Zero-results recovery cascade.
 * Goal: user should ALWAYS see results — empty page is UX failure.
 *
 * Cascade steps:
 * 1. Spell correction (ES phrase suggester)
 * 2. Query relaxation (drop terms)
 * 3. Category fallback
 * 4. Bestsellers fallback
 */

import { buildSearchQuery, buildSpellCheckQuery } from './query-builder.js';
import { wrapWithFunctionScore } from './ranking.js';

const INDEX_NAME = process.env.INDEX_NAME || 'products';

/**
 * Execute zero-results recovery cascade.
 * Returns { products, total, didYouMean, fallbackType }
 */
export async function recoverZeroResults(es, originalQuery, intent, options = {}) {
  // Step 1: Spell correction via phrase suggester
  const spellResult = await trySpellCorrection(es, originalQuery);
  if (spellResult) {
    const correctedQuery = spellResult.text;
    const body = buildSearchQuery(correctedQuery, { type: 'GENERAL', query: correctedQuery }, options);
    body.query = wrapWithFunctionScore(body.query);

    const result = await es.search({ index: INDEX_NAME, body });
    if (result.hits.total.value > 0) {
      return {
        products: result.hits.hits,
        total: result.hits.total.value,
        aggregations: result.aggregations,
        didYouMean: correctedQuery,
        fallbackType: 'spell_correction',
      };
    }
  }

  // Step 2: Query relaxation — drop shortest/last terms iteratively
  const relaxedResult = await tryQueryRelaxation(es, originalQuery, options);
  if (relaxedResult) {
    return relaxedResult;
  }

  // Step 3: Category fallback — if intent had category signal
  if (intent.type === 'CATEGORY' && intent.category) {
    const catResult = await tryCategoryFallback(es, intent.category);
    if (catResult) {
      return catResult;
    }
  }

  // Step 4: Bestsellers — ultimate fallback
  return await getBestsellers(es);
}

async function trySpellCorrection(es, query) {
  try {
    const body = buildSpellCheckQuery(query);
    const result = await es.search({ index: INDEX_NAME, body });
    const suggestions = result.suggest?.spell_check;
    if (suggestions && suggestions[0]?.options?.length > 0) {
      const best = suggestions[0].options[0];
      if (best.score > 0.5 && best.text !== query) {
        return { text: best.text, score: best.score };
      }
    }
  } catch {
    // Spell check failure is non-critical
  }
  return null;
}

async function tryQueryRelaxation(es, query, options) {
  const words = query.split(/\s+/);
  if (words.length <= 1) return null;

  // Try dropping the last word, then last 2 words
  for (let drop = 1; drop < words.length; drop++) {
    const relaxed = words.slice(0, words.length - drop).join(' ');
    if (!relaxed) continue;

    const body = buildSearchQuery(relaxed, { type: 'GENERAL', query: relaxed }, options);
    body.query = wrapWithFunctionScore(body.query);

    try {
      const result = await es.search({ index: INDEX_NAME, body });
      if (result.hits.total.value > 0) {
        return {
          products: result.hits.hits,
          total: result.hits.total.value,
          aggregations: result.aggregations,
          didYouMean: null,
          fallbackType: 'query_relaxation',
          relaxedQuery: relaxed,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function tryCategoryFallback(es, category) {
  try {
    const result = await es.search({
      index: INDEX_NAME,
      body: {
        size: 10,
        query: {
          bool: {
            must: [{ term: { category } }],
            filter: [{ term: { availability: 'in_stock' } }],
          },
        },
        sort: [{ sales_30d: 'desc' }],
        _source: [
          'id', 'name', 'brand', 'category', 'price', 'sale_price',
          'is_promo', 'currency', 'availability', 'image_url',
          'product_url', 'has_image', 'avg_rating', 'review_count',
        ],
      },
    });

    if (result.hits.total.value > 0) {
      return {
        products: result.hits.hits,
        total: result.hits.total.value,
        aggregations: null,
        didYouMean: null,
        fallbackType: 'category_fallback',
        fallbackCategory: category,
      };
    }
  } catch {
    // Category fallback failure
  }
  return null;
}

async function getBestsellers(es) {
  try {
    const result = await es.search({
      index: INDEX_NAME,
      body: {
        size: 10,
        query: {
          bool: {
            filter: [{ term: { availability: 'in_stock' } }],
          },
        },
        sort: [{ sales_30d: 'desc' }],
        _source: [
          'id', 'name', 'brand', 'category', 'price', 'sale_price',
          'is_promo', 'currency', 'availability', 'image_url',
          'product_url', 'has_image', 'avg_rating', 'review_count',
        ],
      },
    });

    return {
      products: result.hits.hits,
      total: result.hits.total.value,
      aggregations: null,
      didYouMean: null,
      fallbackType: 'bestsellers',
    };
  } catch {
    return {
      products: [],
      total: 0,
      aggregations: null,
      didYouMean: null,
      fallbackType: 'error',
    };
  }
}
