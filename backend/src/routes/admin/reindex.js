import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function adminReindexRoutes(fastify) {
  /**
   * POST /api/admin/reindex
   * Zero-downtime reindexing via alias swap:
   * 1. Create new index products-{timestamp}
   * 2. Bulk import from feed file
   * 3. Swap alias products → new index
   * 4. Delete old index
   */
  fastify.post('/reindex', {
    schema: {
      body: {
        type: 'object',
        properties: {
          feedFile: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const feedFile = request.body?.feedFile
      || resolve(__dirname, '..', '..', '..', '..', 'data', 'mock', 'products-photo.json');

    const aliasName = config.INDEX_NAME;
    const newIndexName = `${aliasName}-${Date.now()}`;

    // Load settings + mappings
    const settingsPath = resolve(__dirname, '..', '..', '..', '..', 'elasticsearch', 'index-settings.json');
    const mappingsPath = resolve(__dirname, '..', '..', '..', '..', 'elasticsearch', 'index-mappings.json');

    const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    const mappings = JSON.parse(await readFile(mappingsPath, 'utf-8'));

    // 1. Create new index
    await fastify.es.indices.create({
      index: newIndexName,
      body: {
        ...settings,
        ...mappings,
      },
    });

    // 2. Bulk import
    const feedData = JSON.parse(await readFile(feedFile, 'utf-8'));
    const operations = feedData.flatMap((doc) => [
      { index: { _index: newIndexName, _id: doc.id } },
      doc,
    ]);

    const bulkResult = await fastify.es.bulk({
      body: operations,
      refresh: true,
    });

    if (bulkResult.errors) {
      const errItems = bulkResult.items.filter((i) => i.index?.error);
      fastify.log.warn({ errors: errItems.length }, 'Bulk indexing had errors');
    }

    // 3. Alias swap
    // Find current index behind alias
    let oldIndices = [];
    try {
      const aliasInfo = await fastify.es.indices.getAlias({ name: aliasName });
      oldIndices = Object.keys(aliasInfo);
    } catch {
      // Alias doesn't exist yet — might be a direct index
      const exists = await fastify.es.indices.exists({ index: aliasName });
      if (exists) {
        // Delete the direct index to make room for alias
        await fastify.es.indices.delete({ index: aliasName });
      }
    }

    // Create/update alias
    const actions = [
      { add: { index: newIndexName, alias: aliasName } },
    ];
    for (const oldIndex of oldIndices) {
      actions.push({ remove: { index: oldIndex, alias: aliasName } });
    }

    await fastify.es.indices.updateAliases({ body: { actions } });

    // 4. Delete old indices
    for (const oldIndex of oldIndices) {
      try {
        await fastify.es.indices.delete({ index: oldIndex });
      } catch (err) {
        fastify.log.warn({ err, index: oldIndex }, 'Failed to delete old index');
      }
    }

    return {
      status: 'ok',
      newIndex: newIndexName,
      documentsIndexed: feedData.length,
      errors: bulkResult.errors ? bulkResult.items.filter((i) => i.index?.error).length : 0,
    };
  });
}
