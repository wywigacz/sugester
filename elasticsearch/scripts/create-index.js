import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createEsClient } from '../../scripts/es-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INDEX_NAME = process.env.INDEX_NAME || 'products';
const FORCE = process.argv.includes('--force');

const client = createEsClient();

async function createIndex() {
  console.log('Connecting to Elasticsearch...');

  // Check cluster health
  const health = await client.cluster.health();
  console.log(`Cluster: ${health.cluster_name}, status: ${health.status}`);

  // Check if index exists
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists) {
    if (FORCE) {
      console.log(`Deleting existing index "${INDEX_NAME}"...`);
      await client.indices.delete({ index: INDEX_NAME });
    } else {
      console.log(`Index "${INDEX_NAME}" already exists. Use --force to recreate.`);
      process.exit(0);
    }
  }

  // Read settings and mappings (use --cloud for Elastic Cloud compatible settings)
  const useCloud = process.argv.includes('--cloud');
  const settingsFile = useCloud ? 'index-settings-cloud.json' : 'index-settings.json';
  const settingsPath = resolve(__dirname, '..', settingsFile);
  const mappingsPath = resolve(__dirname, '..', 'index-mappings.json');
  if (useCloud) console.log('Using cloud-compatible settings (no morfologik, inline synonyms)');

  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const mappings = JSON.parse(readFileSync(mappingsPath, 'utf-8'));

  // Create index
  console.log(`Creating index "${INDEX_NAME}"...`);
  await client.indices.create({
    index: INDEX_NAME,
    body: {
      ...settings,
      ...mappings,
    },
  });

  console.log(`Index "${INDEX_NAME}" created successfully.`);

  // Verify
  const indexInfo = await client.indices.get({ index: INDEX_NAME });
  const analyzerCount = Object.keys(
    indexInfo[INDEX_NAME].settings.index.analysis?.analyzer || {}
  ).length;
  console.log(`  Analyzers: ${analyzerCount}`);
  console.log(`  Fields: ${Object.keys(indexInfo[INDEX_NAME].mappings.properties).length}`);
}

createIndex().catch((err) => {
  console.error('Failed to create index:', err.message);
  if (err.meta?.body?.error) {
    console.error(JSON.stringify(err.meta.body.error, null, 2));
  }
  process.exit(1);
});
