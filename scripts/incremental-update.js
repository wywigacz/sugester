/**
 * Incremental update — delta update prices + stock only.
 * Usage: node scripts/incremental-update.js --file data/delta.json
 *
 * Delta file format: [{ "id": "prod_0001", "price": 12999, "availability": "in_stock" }, ...]
 */

import { readFile } from 'fs/promises';
import { createEsClient } from './es-client.js';

const INDEX_NAME = process.env.INDEX_NAME || 'products';

const client = createEsClient();

const fileArg = process.argv.find((a) => a.startsWith('--file'));
const filePath = fileArg ? process.argv[process.argv.indexOf(fileArg) + 1] : process.argv[2];

if (!filePath) {
  console.error('Usage: node incremental-update.js --file <path-to-delta.json>');
  process.exit(1);
}

async function run() {
  const raw = await readFile(filePath, 'utf-8');
  const updates = JSON.parse(raw);

  console.log(`Processing ${updates.length} incremental updates...`);

  const operations = updates.flatMap((doc) => {
    const { id, ...fields } = doc;
    // Derive flags
    if (fields.price && fields.sale_price) {
      fields.is_promo = fields.sale_price < fields.price;
    }
    fields.updated_at = new Date().toISOString();

    return [
      { update: { _index: INDEX_NAME, _id: id } },
      { doc: fields },
    ];
  });

  const result = await client.bulk({ body: operations, refresh: true });

  const failed = result.items.filter((i) => i.update?.error);
  console.log(`Updated: ${updates.length - failed.length}, Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.error('Failed updates:', failed.map((i) => ({ id: i.update._id, error: i.update.error.reason })));
  }
}

run().catch((err) => {
  console.error('Incremental update failed:', err.message);
  process.exit(1);
});
