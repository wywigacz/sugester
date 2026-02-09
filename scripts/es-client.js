import { Client } from '@elastic/elasticsearch';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env') });

export function createEsClient() {
  const opts = { maxRetries: 3, requestTimeout: 15000 };

  const cloudId = process.env.ES_CLOUD_ID;
  const esUrl = process.env.ES_URL || 'http://localhost:9200';

  if (cloudId) {
    opts.cloud = { id: cloudId };
  } else {
    opts.node = esUrl;
  }

  const username = process.env.ES_USERNAME;
  const password = process.env.ES_PASSWORD;
  if (username && password) {
    opts.auth = { username, password };
  }

  return new Client(opts);
}
