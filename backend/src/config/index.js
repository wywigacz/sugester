import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenvConfig({ path: resolve(__dirname, '..', '..', '..', '.env') });

export const config = {
  ES_URL: process.env.ES_URL || 'http://localhost:9200',
  ES_CLOUD_ID: process.env.ES_CLOUD_ID || '',
  ES_USERNAME: process.env.ES_USERNAME || '',
  ES_PASSWORD: process.env.ES_PASSWORD || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  INDEX_NAME: process.env.INDEX_NAME || 'products',
  ANALYTICS_INDEX_PREFIX: process.env.ANALYTICS_INDEX_PREFIX || 'sugester-analytics',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Validate required config — ES_CLOUD_ID or ES_URL must be set
if (!config.ES_CLOUD_ID && !config.ES_URL) {
  throw new Error('Missing required config: ES_CLOUD_ID or ES_URL');
}
if (!config.INDEX_NAME) {
  throw new Error('Missing required config: INDEX_NAME');
}
