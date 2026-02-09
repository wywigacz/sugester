import { config } from '../../config/index.js';

export default async function adminSynonymsRoutes(fastify) {
  /**
   * POST /api/admin/synonyms/reload
   * Reloads search analyzers to pick up updated synonym files.
   * Synonym files must be updated on the ES node first (via volume mount).
   */
  fastify.post('/synonyms/reload', async (request, reply) => {
    const result = await fastify.es.indices.reloadSearchAnalyzers({
      index: config.INDEX_NAME,
    });

    return {
      status: 'ok',
      reloaded: result,
    };
  });
}
