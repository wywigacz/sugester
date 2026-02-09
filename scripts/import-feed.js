/**
 * Import product feed into Elasticsearch.
 *
 * Supports:
 *   --file <path>          Local JSON file (generic or Cyfrowe.pl DataFeedWatch format)
 *   --url <url>            Remote JSON feed URL (downloads first)
 *   --cyfrowe              Use the default Cyfrowe.pl feed URL
 *   --batch-size <n>       Bulk batch size (default 500)
 *
 * Examples:
 *   node scripts/import-feed.js --cyfrowe
 *   node scripts/import-feed.js --url https://feeds.datafeedwatch.com/45030/...json
 *   node scripts/import-feed.js --file data/feed-cyfrowe.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createEsClient } from './es-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INDEX_NAME = process.env.INDEX_NAME || 'products';
const CYFROWE_FEED_URL = 'https://feeds.datafeedwatch.com/45030/1bd454d6181e5dcd030ff29a5a90f82cc823145a.json';

const client = createEsClient();

// ---------- CLI args ----------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { batchSize: 500 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        opts.file = resolve(args[++i]);
        break;
      case '--url':
        opts.url = args[++i];
        break;
      case '--cyfrowe':
        opts.url = CYFROWE_FEED_URL;
        break;
      case '--batch-size':
        opts.batchSize = parseInt(args[++i], 10);
        break;
    }
  }

  if (!opts.file && !opts.url) {
    console.error('Usage: node scripts/import-feed.js --cyfrowe');
    console.error('       node scripts/import-feed.js --url <feed-url>');
    console.error('       node scripts/import-feed.js --file <path.json>');
    process.exit(1);
  }
  return opts;
}

// ---------- Download ----------

function downloadJSON(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    console.log(`Downloading feed from: ${url}`);
    const chunks = [];
    lib.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ---------- Parameter extraction ----------

const PARAM_PATTERNS = {
  aperture: /f\/(\d+\.?\d*)/i,
  focal_range: /(\d+)-(\d+)\s*mm/i,
  focal_fixed: /(\d+)\s*mm/i,
  megapixels: /(\d+\.?\d*)\s*(?:MP|Mpx|megapiksel)/i,
  video_resolution: /\b(4K|6K|8K|5\.3K|6\.2K)\b/i,
  video_fps: /(\d+)\s*fps/i,
};

function extractParamsFromName(name) {
  const params = {};
  if (!name) return params;

  const apertureMatch = name.match(PARAM_PATTERNS.aperture);
  if (apertureMatch) params.aperture = apertureMatch[1];

  const rangeMatch = name.match(PARAM_PATTERNS.focal_range);
  if (rangeMatch) {
    params.focal_length_min = parseInt(rangeMatch[1]);
    params.focal_length_max = parseInt(rangeMatch[2]);
  } else {
    const fixedMatch = name.match(PARAM_PATTERNS.focal_fixed);
    if (fixedMatch) {
      const focal = parseInt(fixedMatch[1]);
      const filterDiameters = [37, 40.5, 43, 46, 49, 52, 55, 58, 62, 67, 72, 77, 82, 86, 95, 100, 105, 112];
      if (!filterDiameters.includes(focal)) {
        params.focal_length_min = focal;
        params.focal_length_max = focal;
      }
    }
  }

  const mpMatch = name.match(PARAM_PATTERNS.megapixels);
  if (mpMatch) params.megapixels = parseFloat(mpMatch[1]);

  const vrMatch = name.match(PARAM_PATTERNS.video_resolution);
  if (vrMatch) params.video_resolution = vrMatch[1].toUpperCase();

  const fpsMatch = name.match(PARAM_PATTERNS.video_fps);
  if (fpsMatch) params.video_fps = parseInt(fpsMatch[1]);

  return params;
}

// ---------- Normalize Cyfrowe.pl feed product ----------

function normalizeCyfroweProduct(raw) {
  const price = parseFloat(raw.price) || 0;
  const promoPrice = parseFloat(raw.promoPrice) || price;
  const isPromo = promoPrice < price && promoPrice > 0;

  // Map availability: "in stock" → in_stock, "out of stock" → out_of_stock, "preorder" → na_zamowienie
  let availability = 'out_of_stock';
  const avail = (raw.availibility || '').toLowerCase().trim();
  if (avail === 'in stock') availability = 'in_stock';
  else if (avail === 'preorder') availability = 'na_zamowienie';
  else availability = 'out_of_stock';

  // Feed flags: product_zo = na zamówienie, product_n = nowość, product_p = promocja,
  //             product_h = hit/bestseller, product_w = wyróżniony/highlighted
  const isNew = raw.product_n === '1';
  const isBestseller = raw.product_h === '1';
  const isHighlighted = raw.product_w === '1';
  const isZamowienie = raw.product_zo === '1';

  // Override availability if product_zo flag is set
  if (isZamowienie && availability === 'out_of_stock') {
    availability = 'na_zamowienie';
  }

  const hasImage = !!raw.image1 && raw.image1.length > 10;

  const name = (raw.name || '').trim();
  const brand = (raw.brand || '').trim();

  // Build suggest input: name, brand, sku, id_erp
  const suggestInputs = [name];
  if (brand) suggestInputs.push(brand);
  if (raw.sku) suggestInputs.push(raw.sku);
  if (raw.id_erp) suggestInputs.push(raw.id_erp);

  // Generate a pseudo sales_30d from flags for ranking
  // Bestsellers and highlighted products get boosted
  let sales30d = 0;
  if (isBestseller) sales30d += 50;
  if (isHighlighted) sales30d += 30;
  if (isPromo) sales30d += 10;
  if (availability === 'in_stock') sales30d += 5;

  return {
    id: raw.id_erp || raw.sku,
    sku: raw.sku || '',
    ean: raw.ean || '',
    id_erp: raw.id_erp || '',
    manufacturer_code: raw.id_erp || '',
    model_code: '',

    name,
    description: (raw.description || '').trim(),

    brand,
    category: (raw.category || '').trim(),
    subcategory: (raw.subcategory || '').trim(),
    section_name: (raw.sectionName || '').trim(),
    category_id: raw.id_category || '',
    subcategory_id: raw.id_subcategory || '',
    category_path: raw.sectionName
      ? `${raw.sectionName} > ${raw.category}${raw.subcategory ? ' > ' + raw.subcategory : ''}`
      : raw.category || '',
    google_category: raw.googleCategory || '',

    tags: [raw.category, raw.subcategory, raw.sectionName, brand].filter(Boolean),

    price: price,
    sale_price: isPromo ? promoPrice : null,
    is_promo: isPromo,
    currency: 'PLN',

    availability,
    condition: raw.condition || 'new',

    image_url: raw.image1 || '',
    product_url: raw.url || '',
    has_image: hasImage,

    sales_30d: sales30d,
    margin_pct: 10,
    is_new: isNew,
    is_high_margin: false,
    is_bestseller: isBestseller,
    is_highlighted: isHighlighted,

    avg_rating: 0,
    review_count: 0,

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    params: extractParamsFromName(name),

    suggest: {
      input: suggestInputs,
      contexts: {
        category: [raw.category || 'Inne'],
      },
    },
  };
}

// ---------- Normalize generic product ----------

function normalizeGenericProduct(raw) {
  const product = { ...raw };

  if (product.name) product.name = product.name.trim();
  if (product.description) product.description = product.description.trim();
  if (product.brand) product.brand = product.brand.trim();

  if (typeof product.price === 'string') product.price = parseFloat(product.price);
  if (typeof product.sale_price === 'string') product.sale_price = parseFloat(product.sale_price) || null;

  if (product.is_promo === undefined) {
    product.is_promo = product.sale_price != null && product.sale_price < product.price;
  }
  if (product.has_image === undefined) {
    product.has_image = !!product.image_url;
  }

  const avail = (product.availability || '').toLowerCase().trim();
  if (['in_stock', 'instock', 'available', 'dostępny', '1', 'true'].includes(avail)) {
    product.availability = 'in_stock';
  } else if (['na_zamowienie', 'backorder', 'preorder'].includes(avail)) {
    product.availability = 'na_zamowienie';
  } else if (!product.availability) {
    product.availability = 'in_stock';
  }

  product.params = extractParamsFromName(product.name, product.params || {});

  if (!product.suggest) {
    const inputs = [product.name, product.brand, product.sku].filter(Boolean);
    if (product.model_code) inputs.push(product.model_code);
    product.suggest = {
      input: inputs,
      contexts: { category: [product.category || 'Inne'] },
    };
  }

  product.sales_30d = product.sales_30d || 0;
  product.margin_pct = product.margin_pct || 10;
  product.avg_rating = product.avg_rating || 0;
  product.review_count = product.review_count || 0;
  product.currency = product.currency || 'PLN';
  product.updated_at = new Date().toISOString();
  product.created_at = product.created_at || product.updated_at;

  return product;
}

// ---------- Detect format and normalize ----------

function isCyfroweFeed(data) {
  // DataFeedWatch feed has { channel_info, products } structure
  return data && data.channel_info && Array.isArray(data.products);
}

function isCyfroweProduct(product) {
  // Cyfrowe.pl products have id_erp, availibility (with typo), image1, url fields
  return product.id_erp !== undefined || product.image1 !== undefined || product.availibility !== undefined;
}

function normalizeProducts(data) {
  let rawProducts;

  if (isCyfroweFeed(data)) {
    console.log('Detected: Cyfrowe.pl DataFeedWatch feed');
    rawProducts = data.products;
    return rawProducts.map(normalizeCyfroweProduct);
  }

  if (Array.isArray(data)) {
    rawProducts = data;
  } else {
    rawProducts = [data];
  }

  if (rawProducts.length > 0 && isCyfroweProduct(rawProducts[0])) {
    console.log('Detected: Cyfrowe.pl product array');
    return rawProducts.map(normalizeCyfroweProduct);
  }

  console.log('Detected: Generic product format');
  return rawProducts.map(normalizeGenericProduct);
}

// ---------- Bulk import ----------

async function importProducts(products, batchSize) {
  console.log(`Importing ${products.length} products into "${INDEX_NAME}" (batch size: ${batchSize})...`);

  let totalSucceeded = 0;
  let totalFailed = 0;
  const allErrors = [];

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const operations = batch.flatMap((doc) => [
      { index: { _index: INDEX_NAME, _id: doc.id || doc.sku } },
      doc,
    ]);

    const { errors, items } = await client.bulk({
      refresh: i + batchSize >= products.length, // only refresh on last batch
      operations,
    });

    const succeeded = items.filter((it) => it.index.status === 201 || it.index.status === 200).length;
    const failed = items.filter((it) => it.index.status >= 400).length;
    totalSucceeded += succeeded;
    totalFailed += failed;

    if (errors) {
      const errorItems = items.filter((it) => it.index.error);
      allErrors.push(...errorItems.slice(0, 3));
    }

    const pct = Math.round(((i + batch.length) / products.length) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${products.length} (${pct}%) — ${totalSucceeded} ok, ${totalFailed} err`);
  }

  console.log('');
  console.log(`\nResults: ${totalSucceeded} indexed, ${totalFailed} failed`);

  if (allErrors.length > 0) {
    console.error('\nSample errors:');
    for (const item of allErrors.slice(0, 5)) {
      console.error(`  ${item.index._id}: ${item.index.error?.reason || JSON.stringify(item.index.error)}`);
    }
  }

  const count = await client.count({ index: INDEX_NAME });
  console.log(`Total documents in index: ${count.count}`);
}

// ---------- Main ----------

async function main() {
  const opts = parseArgs();
  let data;

  if (opts.url) {
    data = await downloadJSON(opts.url);
    // Save a local cache copy
    const cachePath = resolve(__dirname, '..', 'data', 'feed-cyfrowe.json');
    writeFileSync(cachePath, JSON.stringify(data), 'utf-8');
    console.log(`Feed cached to: ${cachePath}`);
  } else {
    console.log(`Reading file: ${opts.file}`);
    data = JSON.parse(readFileSync(opts.file, 'utf-8'));
  }

  const products = normalizeProducts(data);
  console.log(`Normalized ${products.length} products`);

  // Log some stats
  const inStock = products.filter((p) => p.availability === 'in_stock').length;
  const promos = products.filter((p) => p.is_promo).length;
  const brands = new Set(products.map((p) => p.brand)).size;
  const cats = new Set(products.map((p) => p.category)).size;
  console.log(`  In stock: ${inStock}, Promos: ${promos}, Brands: ${brands}, Categories: ${cats}`);

  await importProducts(products, opts.batchSize);
}

main().catch((err) => {
  console.error('\nImport failed:', err.message);
  if (err.meta?.body?.error) {
    console.error(JSON.stringify(err.meta.body.error, null, 2));
  }
  process.exit(1);
});
