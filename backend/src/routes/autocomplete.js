import { classifyIntent } from '../services/intent-classifier.js';
import { buildAutocompleteQuery } from '../services/query-builder.js';
import { wrapWithFunctionScore } from '../services/ranking.js';
import { applyMerchandising } from '../services/merchandising.js';
import { getCachedAutocomplete, setCachedAutocomplete } from '../services/cache.js';
import { formatProducts, formatAutocompleteResponse } from '../utils/response-formatter.js';

export default async function autocompleteRoutes(fastify) {
  fastify.get('/autocomplete', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const { q, limit } = request.query;

    // Check Redis cache
    const cached = await getCachedAutocomplete(fastify.redis, q);
    if (cached) {
      return cached;
    }

    // Classify intent
    const intent = classifyIntent(q);

    // Build _msearch body (4 sub-queries in one request)
    const msearchBody = buildAutocompleteQuery(q, intent, limit);

    // Apply function_score ranking to the product sub-query (last pair)
    const productBody = msearchBody[msearchBody.length - 1];
    const originalMust = productBody.query.bool.must[0];
    productBody.query.bool.must[0] = wrapWithFunctionScore(originalMust, intent);

    // Execute _msearch
    const msearchResult = await fastify.es.msearch({
      body: msearchBody,
    });

    const responses = msearchResult.responses;

    // Parse sub-query results
    // 1. Completion suggestions
    const suggestResponse = responses[0];
    const suggestions = [];
    const completionOptions = suggestResponse.suggest?.product_suggest?.[0]?.options || [];
    for (const opt of completionOptions) {
      suggestions.push({
        text: opt.text,
        score: opt._score,
      });
    }

    // 2. Category aggregation
    const catResponse = responses[1];
    const categories = (catResponse.aggregations?.categories?.buckets || []).map((b) => ({
      name: b.key,
      count: b.doc_count,
    }));

    // 3. Brand aggregation
    const brandResponse = responses[2];
    const brands = (brandResponse.aggregations?.brands?.buckets || []).map((b) => ({
      name: b.key,
      count: b.doc_count,
    }));

    // 4. Product results
    const productResponse = responses[3];
    let products = formatProducts(productResponse.hits?.hits || []);

    // Apply merchandising (pinned/blacklisted)
    products = applyMerchandising(products, q);

    const response = formatAutocompleteResponse(q, {
      suggestions,
      categories,
      brands,
      products,
    });

    // Cache result
    await setCachedAutocomplete(fastify.redis, q, response);

    return response;
  });
}
