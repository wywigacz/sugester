import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import elasticsearchPlugin from './plugins/elasticsearch.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import redisPlugin from './plugins/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import autocompleteRoutes from './routes/autocomplete.js';
import searchRoutes from './routes/search.js';
import trendingRoutes from './routes/trending.js';
import analyticsRoutes from './routes/analytics.js';
import adminReindexRoutes from './routes/admin/reindex.js';
import adminSynonymsRoutes from './routes/admin/synonyms.js';
import adminMerchandisingRoutes from './routes/admin/merchandising.js';
import adminAnalyticsDashboardRoutes from './routes/admin/analytics-dashboard.js';

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: opts.logLevel || 'info',
      transport: opts.prettyLog !== false ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    },
    ...opts,
  });

  // Register plugins
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(elasticsearchPlugin);
  await app.register(redisPlugin);

  // Health check
  app.get('/health', async (request, reply) => {
    const health = { status: 'ok', services: {} };

    try {
      const esHealth = await app.es.cluster.health();
      health.services.elasticsearch = {
        status: esHealth.status,
        cluster_name: esHealth.cluster_name,
        number_of_nodes: esHealth.number_of_nodes,
      };
    } catch (err) {
      health.status = 'degraded';
      health.services.elasticsearch = { status: 'down', error: err.message };
    }

    try {
      const pong = await app.redis.ping();
      health.services.redis = { status: pong === 'PONG' ? 'ok' : 'error' };
    } catch (err) {
      health.services.redis = { status: 'down', error: err.message };
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.code(statusCode).send(health);
  });

  // Serve frontend static files
  await app.register(fastifyStatic, {
    root: resolve(__dirname, '..', '..', 'frontend'),
    prefix: '/',
    decorateReply: false,
  });

  // Register API routes
  await app.register(autocompleteRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(trendingRoutes, { prefix: '/api' });
  await app.register(analyticsRoutes, { prefix: '/api' });

  // Admin routes
  await app.register(adminReindexRoutes, { prefix: '/api/admin' });
  await app.register(adminSynonymsRoutes, { prefix: '/api/admin' });
  await app.register(adminMerchandisingRoutes, { prefix: '/api/admin' });
  await app.register(adminAnalyticsDashboardRoutes, { prefix: '/api/admin' });

  return app;
}
