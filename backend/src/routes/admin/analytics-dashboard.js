import { config } from '../../config/index.js';

export default async function adminAnalyticsDashboardRoutes(fastify) {
  const ANALYTICS_INDEX = `${config.ANALYTICS_INDEX_PREFIX}-*`;

  /**
   * GET /api/admin/analytics/top-queries
   * Top 20 queries by volume.
   */
  fastify.get('/analytics/top-queries', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          size: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { size, days } = request.query;

    const result = await fastify.es.search({
      index: ANALYTICS_INDEX,
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { event_type: 'search_performed' } },
              { range: { '@timestamp': { gte: `now-${days}d` } } },
            ],
          },
        },
        aggs: {
          top_queries: {
            terms: { field: 'query.keyword', size },
          },
        },
      },
    });

    return {
      queries: (result.aggregations?.top_queries?.buckets || []).map((b) => ({
        query: b.key,
        count: b.doc_count,
      })),
    };
  });

  /**
   * GET /api/admin/analytics/zero-results
   * Top 20 zero-result queries (for weekly synonym review).
   */
  fastify.get('/analytics/zero-results', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          size: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { size, days } = request.query;

    const result = await fastify.es.search({
      index: ANALYTICS_INDEX,
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { event_type: 'zero_results' } },
              { range: { '@timestamp': { gte: `now-${days}d` } } },
            ],
          },
        },
        aggs: {
          zero_queries: {
            terms: { field: 'query.keyword', size },
          },
        },
      },
    });

    return {
      queries: (result.aggregations?.zero_queries?.buckets || []).map((b) => ({
        query: b.key,
        count: b.doc_count,
      })),
    };
  });

  /**
   * GET /api/admin/analytics/ctr
   * Click-through rate by position.
   */
  fastify.get('/analytics/ctr', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { days } = request.query;

    const result = await fastify.es.search({
      index: ANALYTICS_INDEX,
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              { terms: { event_type: ['product_clicked', 'suggestion_clicked'] } },
              { range: { '@timestamp': { gte: `now-${days}d` } } },
            ],
          },
        },
        aggs: {
          by_position: {
            terms: { field: 'position', size: 20, order: { _key: 'asc' } },
          },
          by_section: {
            terms: { field: 'section.keyword', size: 10 },
          },
        },
      },
    });

    return {
      by_position: (result.aggregations?.by_position?.buckets || []).map((b) => ({
        position: b.key,
        clicks: b.doc_count,
      })),
      by_section: (result.aggregations?.by_section?.buckets || []).map((b) => ({
        section: b.key,
        clicks: b.doc_count,
      })),
    };
  });

  /**
   * GET /api/admin/analytics/summary
   * Overall analytics summary.
   */
  fastify.get('/analytics/summary', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { days } = request.query;

    const result = await fastify.es.search({
      index: ANALYTICS_INDEX,
      body: {
        size: 0,
        query: {
          range: { '@timestamp': { gte: `now-${days}d` } },
        },
        aggs: {
          by_event: {
            terms: { field: 'event_type.keyword', size: 10 },
          },
          unique_sessions: {
            cardinality: { field: 'session_id.keyword' },
          },
        },
      },
    });

    const byEvent = {};
    for (const b of result.aggregations?.by_event?.buckets || []) {
      byEvent[b.key] = b.doc_count;
    }

    return {
      period_days: days,
      total_events: result.hits.total.value,
      unique_sessions: result.aggregations?.unique_sessions?.value || 0,
      searches: byEvent.search_performed || 0,
      zero_results: byEvent.zero_results || 0,
      product_clicks: byEvent.product_clicked || 0,
      suggestion_clicks: byEvent.suggestion_clicked || 0,
      category_clicks: byEvent.category_clicked || 0,
    };
  });
}
