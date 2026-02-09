import fp from 'fastify-plugin';
import { Client } from '@elastic/elasticsearch';
import { config } from '../config/index.js';

async function elasticsearchPlugin(fastify) {
  const clientOpts = {
    maxRetries: 3,
    requestTimeout: 10000,
  };

  if (config.ES_CLOUD_ID) {
    clientOpts.cloud = { id: config.ES_CLOUD_ID };
  } else {
    clientOpts.node = config.ES_URL;
  }

  if (config.ES_USERNAME && config.ES_PASSWORD) {
    clientOpts.auth = {
      username: config.ES_USERNAME,
      password: config.ES_PASSWORD,
    };
  }

  const client = new Client(clientOpts);

  fastify.decorate('es', client);

  fastify.addHook('onClose', async () => {
    await client.close();
  });
}

export default fp(elasticsearchPlugin, {
  name: 'elasticsearch',
});
