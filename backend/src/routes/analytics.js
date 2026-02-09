import { config } from '../config/index.js';

export default async function analyticsRoutes(fastify) {
  fastify.post('/analytics/event', {
    schema: {
      body: {
        type: 'object',
        required: ['event_type'],
        properties: {
          event_type: { type: 'string', enum: ['search_performed', 'suggestion_clicked', 'product_clicked', 'category_clicked', 'zero_results', 'search_exit'] },
          query: { type: 'string' },
          product_id: { type: 'string' },
          suggestion_text: { type: 'string' },
          section: { type: 'string' },
          position: { type: 'integer' },
          category_name: { type: 'string' },
          results_count: { type: 'integer' },
          had_results: { type: 'boolean' },
          price: { type: 'number' },
          session_id: { type: 'string' },
          timestamp: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const event = request.body;

    // Index analytics event to time-based index
    const now = new Date();
    const indexName = `${config.ANALYTICS_INDEX_PREFIX}-${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
      await fastify.es.index({
        index: indexName,
        body: {
          ...event,
          '@timestamp': event.timestamp || now.toISOString(),
          user_agent: request.headers['user-agent'],
          ip: request.ip,
        },
      });
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to index analytics event');
    }

    return { status: 'ok' };
  });
}
