import { buildTrendingQuery } from '../services/query-builder.js';
import { formatProducts } from '../utils/response-formatter.js';
import { config } from '../config/index.js';

export default async function trendingRoutes(fastify) {
  fastify.get('/trending', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit } = request.query;

    // Check Redis cache for trending (longer TTL)
    try {
      const cached = await fastify.redis.get('trending');
      if (cached) return JSON.parse(cached);
    } catch {
      // Cache miss or error
    }

    const body = buildTrendingQuery(limit);

    const result = await fastify.es.search({
      index: config.INDEX_NAME,
      body,
    });

    const products = formatProducts(result.hits.hits);
    const categories = (result.aggregations?.top_categories?.buckets || []).map((b) => ({
      name: b.key,
      count: b.doc_count,
    }));

    const response = {
      products,
      categories,
      queries: [],
    };

    // Cache trending for 5 minutes
    try {
      await fastify.redis.set('trending', JSON.stringify(response), 'EX', 300);
    } catch {
      // Cache write failure is non-critical
    }

    return response;
  });
}
