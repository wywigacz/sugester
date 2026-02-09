import { classifyIntent } from '../services/intent-classifier.js';
import { buildSearchQuery } from '../services/query-builder.js';
import { wrapWithFunctionScore } from '../services/ranking.js';
import { recoverZeroResults } from '../services/zero-results.js';
import { applyMerchandising } from '../services/merchandising.js';
import { getCachedSearch, setCachedSearch } from '../services/cache.js';
import { formatProducts, formatFacets, formatSearchResponse } from '../utils/response-formatter.js';
import { config } from '../config/index.js';

export default async function searchRoutes(fastify) {
  fastify.get('/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          page: { type: 'integer', minimum: 1, default: 1 },
          per_page: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          sort: { type: 'string', enum: ['relevance', 'price_asc', 'price_desc', 'newest', 'popular'], default: 'relevance' },
          brand: { type: 'string' },
          category: { type: 'string' },
          availability: { type: 'string' },
          price_min: { type: 'number', minimum: 0 },
          price_max: { type: 'number', minimum: 0 },
          mount: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { q, page, per_page, sort, brand, category, availability, price_min, price_max, mount } = request.query;
    const filters = {};
    if (brand) filters.brand = brand;
    if (category) filters.category = category;
    if (availability) filters.availability = availability;
    if (price_min != null) filters.price_min = price_min;
    if (price_max != null) filters.price_max = price_max;
    if (mount) filters.mount = mount;

    // Check Redis cache
    const cached = await getCachedSearch(fastify.redis, q, filters, sort, page);
    if (cached) {
      return cached;
    }

    // Classify intent
    const intent = classifyIntent(q);

    // If PRICE intent, add price filter
    if (intent.type === 'PRICE' && intent.maxPrice) {
      filters.price_max = intent.maxPrice;
    }

    // Build search query
    const body = buildSearchQuery(q, intent, {
      filters,
      page,
      perPage: per_page,
      sort,
    });

    // Wrap with function_score ranking (pass intent for context-dependent boosts)
    body.query = wrapWithFunctionScore(body.query, intent);

    // Execute search
    const result = await fastify.es.search({
      index: config.INDEX_NAME,
      body,
    });

    const total = result.hits.total.value;
    let products = formatProducts(result.hits.hits);
    let facets = formatFacets(result.aggregations);
    let didYouMean = null;
    let fallbackType = null;

    // Zero-results recovery
    if (total === 0) {
      const recovery = await recoverZeroResults(fastify.es, q, intent, { filters, page, perPage: per_page, sort });
      products = formatProducts(recovery.products);
      didYouMean = recovery.didYouMean;
      fallbackType = recovery.fallbackType;
      if (recovery.aggregations) {
        facets = formatFacets(recovery.aggregations);
      }
    }

    // Apply merchandising
    products = applyMerchandising(products, q);

    const response = formatSearchResponse(q, {
      total: total || products.length,
      page,
      perPage: per_page,
      products,
      facets,
      didYouMean,
    });

    if (fallbackType) {
      response.fallback_type = fallbackType;
    }

    // Cache result
    await setCachedSearch(fastify.redis, q, filters, sort, page, response);

    return response;
  });
}
