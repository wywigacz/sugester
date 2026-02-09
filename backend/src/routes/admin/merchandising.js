import { reloadRules, getPinnedProducts, getBlacklistedProducts } from '../../services/merchandising.js';
import { flushCache } from '../../services/cache.js';

export default async function adminMerchandisingRoutes(fastify) {
  /**
   * GET /api/admin/merchandising
   * Returns current merchandising rules.
   */
  fastify.get('/merchandising', async (request, reply) => {
    const counts = await reloadRules();
    return {
      status: 'ok',
      ...counts,
    };
  });

  /**
   * POST /api/admin/merchandising/reload
   * Reloads merchandising rules from JSON files + flushes cache.
   */
  fastify.post('/merchandising/reload', async (request, reply) => {
    const counts = await reloadRules();
    const flushed = await flushCache(fastify.redis);

    return {
      status: 'ok',
      ...counts,
      cacheEntriesFlushed: flushed,
    };
  });
}
