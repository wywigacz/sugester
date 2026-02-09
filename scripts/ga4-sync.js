/**
 * GA4 Data Sync — Fetches product page metrics from Google Analytics 4
 * and enriches Elasticsearch documents with popularity/conversion scores.
 *
 * Prerequisites:
 *   1. Create a Google Cloud project with Analytics Data API enabled
 *   2. Create a Service Account and download the JSON key file
 *   3. Add the Service Account email as a Viewer in GA4 Admin → Property Access Management
 *   4. Set environment variables:
 *      - GA4_PROPERTY_ID=123456789  (GA4 property ID, numeric)
 *      - GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
 *      OR
 *      - GA4_KEY_FILE=/path/to/service-account-key.json
 *
 * Usage:
 *   node scripts/ga4-sync.js                    # full sync (30d + 365d)
 *   node scripts/ga4-sync.js --period 30d       # only last 30 days
 *   node scripts/ga4-sync.js --period 365d      # only last year
 *   node scripts/ga4-sync.js --dry-run          # fetch but don't write to ES
 *
 * The script:
 *   1. Fetches page-level metrics from GA4 (pageviews, bounce rate, sessions, purchases, add-to-carts)
 *   2. Fetches item-level ecommerce metrics (item views, items purchased, item revenue)
 *   3. Matches GA4 data to ES products by URL path
 *   4. Computes composite scores (popularity, conversion, trending)
 *   5. Bulk-updates ES documents with ga4.* fields
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createEsClient } from './es-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Config ----------

const INDEX_NAME = process.env.INDEX_NAME || 'products';
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GA4_KEY_FILE = process.env.GA4_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!GA4_PROPERTY_ID) {
  console.error('ERROR: GA4_PROPERTY_ID environment variable is required.');
  console.error('Set it to your GA4 property ID (numeric), e.g. GA4_PROPERTY_ID=123456789');
  console.error('');
  console.error('Full setup:');
  console.error('  1. Go to Google Cloud Console → APIs & Services → Enable "Google Analytics Data API"');
  console.error('  2. Create a Service Account → download JSON key');
  console.error('  3. In GA4 Admin → Property Access Management → add the Service Account email as Viewer');
  console.error('  4. Set environment variables:');
  console.error('     GA4_PROPERTY_ID=<your-property-id>');
  console.error('     GOOGLE_APPLICATION_CREDENTIALS=<path-to-key.json>');
  process.exit(1);
}

// ---------- CLI args ----------

const args = process.argv.slice(2);
let periods = ['30d', '365d'];
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--period') periods = [args[++i]];
  if (args[i] === '--dry-run') dryRun = true;
}

// ---------- Clients ----------

const analyticsClient = new BetaAnalyticsDataClient(
  GA4_KEY_FILE ? { keyFilename: resolve(GA4_KEY_FILE) } : {}
);
const esClient = createEsClient();

// ---------- Date helpers ----------

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function periodToDates(period) {
  const days = period === '365d' ? 365 : 30;
  return { startDate: daysAgoStr(days), endDate: 'today' };
}

// ---------- GA4 API calls ----------

/**
 * Fetch page-level metrics grouped by pagePath.
 * Compatible combo: pagePath (page-scoped) + all event/session metrics.
 */
async function fetchPageMetrics(period) {
  const { startDate, endDate } = periodToDates(period);
  console.log(`  Fetching page metrics (${period}: ${startDate} → ${endDate})...`);

  const allRows = [];
  let offset = 0;
  const limit = 10000;

  while (true) {
    const [response] = await analyticsClient.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'addToCarts' },
        { name: 'ecommercePurchases' },
        { name: 'purchaseRevenue' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'CONTAINS',
            value: '-p.html', // Cyfrowe.pl product URLs end with -p.html
          },
        },
      },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      offset,
      limit,
    });

    const rows = response.rows || [];
    allRows.push(...rows);
    console.log(`    Fetched ${allRows.length} page rows so far...`);

    if (rows.length < limit) break;
    offset += limit;
  }

  console.log(`    Total page rows: ${allRows.length}`);
  return allRows;
}

/**
 * Fetch item-level ecommerce metrics grouped by itemName.
 * Compatible combo: itemName (item-scoped) + item-scoped metrics.
 */
async function fetchItemMetrics(period) {
  const { startDate, endDate } = periodToDates(period);
  console.log(`  Fetching item ecommerce metrics (${period}: ${startDate} → ${endDate})...`);

  const allRows = [];
  let offset = 0;
  const limit = 10000;

  while (true) {
    const [response] = await analyticsClient.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'itemName' }],
      metrics: [
        { name: 'itemsViewed' },
        { name: 'itemsPurchased' },
        { name: 'itemRevenue' },
        { name: 'cartToViewRate' },
      ],
      orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
      offset,
      limit,
    });

    const rows = response.rows || [];
    allRows.push(...rows);
    console.log(`    Fetched ${allRows.length} item rows so far...`);

    if (rows.length < limit) break;
    offset += limit;
  }

  console.log(`    Total item rows: ${allRows.length}`);
  return allRows;
}

// ---------- Data parsing ----------

function parsePageRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const pagePath = row.dimensionValues[0].value;
    map.set(pagePath, {
      pageviews: parseInt(row.metricValues[0].value) || 0,
      sessions: parseInt(row.metricValues[1].value) || 0,
      bounceRate: parseFloat(row.metricValues[2].value) || 0,
      engagementRate: parseFloat(row.metricValues[3].value) || 0,
      avgSessionDuration: parseFloat(row.metricValues[4].value) || 0,
      addToCarts: parseInt(row.metricValues[5].value) || 0,
      ecommercePurchases: parseInt(row.metricValues[6].value) || 0,
      purchaseRevenue: parseFloat(row.metricValues[7].value) || 0,
    });
  }
  return map;
}

function parseItemRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const itemName = row.dimensionValues[0].value;
    map.set(itemName, {
      itemViews: parseInt(row.metricValues[0].value) || 0,
      itemsPurchased: parseInt(row.metricValues[1].value) || 0,
      itemRevenue: parseFloat(row.metricValues[2].value) || 0,
      cartToViewRate: parseFloat(row.metricValues[3].value) || 0,
    });
  }
  return map;
}

// ---------- Match GA4 data to ES products ----------

/**
 * Extract URL path from full product URL.
 * E.g., "https://www.cyfrowe.pl/canon-eos-r5-p.html" → "/canon-eos-r5-p.html"
 */
function urlToPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function loadProductURLMap() {
  console.log('  Loading product URLs from Elasticsearch...');
  const products = new Map();
  const nameMap = new Map();

  // Scroll through all products to build URL → id and name → id maps
  let response = await esClient.search({
    index: INDEX_NAME,
    scroll: '2m',
    size: 1000,
    _source: ['id', 'product_url', 'name'],
  });

  let scrollId = response._scroll_id;
  let hits = response.hits.hits;

  while (hits.length > 0) {
    for (const hit of hits) {
      const src = hit._source;
      if (src.product_url) {
        const path = urlToPath(src.product_url);
        products.set(path, hit._id);
      }
      if (src.name) {
        // Normalize name for fuzzy matching with GA4 itemName
        nameMap.set(src.name.toLowerCase().trim(), hit._id);
      }
    }

    response = await esClient.scroll({ scroll_id: scrollId, scroll: '2m' });
    scrollId = response._scroll_id;
    hits = response.hits.hits;
  }

  await esClient.clearScroll({ scroll_id: scrollId });
  console.log(`    Loaded ${products.size} product URLs, ${nameMap.size} product names`);
  return { urlMap: products, nameMap };
}

// ---------- Compute composite scores ----------

/**
 * Compute normalized scores from raw GA4 metrics.
 * These are used in ES function_score for ranking.
 *
 * popularity_score: how much traffic/interest a product gets (0-100)
 * conversion_score: how well a product converts (0-100)
 * trending_score:   recent momentum vs historical (0-100)
 */
function computeScores(ga4Data) {
  const {
    pageviews_30d = 0, pageviews_365d = 0,
    sessions_30d = 0, sessions_365d = 0,
    add_to_carts_30d = 0, add_to_carts_365d = 0,
    ecommerce_purchases_30d = 0, ecommerce_purchases_365d = 0,
    purchase_revenue_30d = 0, purchase_revenue_365d = 0,
    item_views_30d = 0, item_views_365d = 0,
    items_purchased_30d = 0, items_purchased_365d = 0,
    item_revenue_30d = 0, item_revenue_365d = 0,
    engagement_rate_30d = 0,
    cart_to_view_rate_30d = 0,
  } = ga4Data;

  // Popularity: weighted sum of pageviews + sessions + item views
  // Use log scale to reduce impact of extreme outliers
  const popularityRaw =
    Math.log1p(pageviews_30d) * 3 +
    Math.log1p(pageviews_365d) * 1 +
    Math.log1p(sessions_30d) * 2 +
    Math.log1p(item_views_30d) * 2 +
    Math.log1p(add_to_carts_30d) * 5 +
    Math.log1p(ecommerce_purchases_30d) * 10;

  // Conversion: purchase rate + cart-to-view + engagement
  const views = Math.max(pageviews_30d, item_views_30d, 1);
  const purchaseRate = (ecommerce_purchases_30d + items_purchased_30d) / views;
  const addToCartRate = add_to_carts_30d / views;

  const conversionRaw =
    purchaseRate * 40 +
    addToCartRate * 30 +
    cart_to_view_rate_30d * 20 +
    engagement_rate_30d * 10;

  // Trending: 30d metrics vs. monthly average from 365d
  // If 30d performance >> monthly average → trending up
  const monthlyAvgPV = pageviews_365d / 12;
  const monthlyAvgPurchases = (ecommerce_purchases_365d + items_purchased_365d) / 12;
  const trendingPV = monthlyAvgPV > 0 ? pageviews_30d / monthlyAvgPV : (pageviews_30d > 0 ? 2 : 0);
  const trendingPurchases = monthlyAvgPurchases > 0
    ? (ecommerce_purchases_30d + items_purchased_30d) / monthlyAvgPurchases
    : ((ecommerce_purchases_30d + items_purchased_30d) > 0 ? 2 : 0);

  const trendingRaw = (trendingPV * 0.4 + trendingPurchases * 0.6);

  return {
    popularity_score: Math.round(Math.min(popularityRaw, 100) * 100) / 100,
    conversion_score: Math.round(Math.min(conversionRaw * 100, 100) * 100) / 100,
    trending_score: Math.round(Math.min(trendingRaw * 50, 100) * 100) / 100,
  };
}

// ---------- Bulk update ES ----------

async function bulkUpdateGA4(updates) {
  if (updates.length === 0) {
    console.log('  No updates to write.');
    return;
  }

  console.log(`  Writing ${updates.length} GA4 updates to Elasticsearch...`);

  const batchSize = 500;
  let totalOk = 0;
  let totalErr = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const operations = batch.flatMap(({ docId, ga4Data }) => [
      { update: { _index: INDEX_NAME, _id: docId } },
      { doc: { ga4: ga4Data, updated_at: new Date().toISOString() } },
    ]);

    const { errors, items } = await esClient.bulk({
      refresh: i + batchSize >= updates.length,
      operations,
    });

    const ok = items.filter(it => it.update?.status === 200).length;
    const err = items.filter(it => it.update?.status >= 400).length;
    totalOk += ok;
    totalErr += err;

    if (errors) {
      const errItems = items.filter(it => it.update?.error);
      errItems.slice(0, 2).forEach(it => {
        console.error(`    Error: ${it.update._id} — ${it.update.error?.reason}`);
      });
    }

    const pct = Math.round(((i + batch.length) / updates.length) * 100);
    process.stdout.write(`\r    Progress: ${i + batch.length}/${updates.length} (${pct}%)`);
  }

  console.log(`\n  Results: ${totalOk} updated, ${totalErr} errors`);
}

// ---------- Update top-level sales & revenue fields from GA4 ----------

async function updateSalesFields(updates) {
  console.log('  Syncing sales & revenue fields from GA4 purchase data...');

  const batchSize = 500;
  const ops = updates
    .filter(u => {
      const g = u.ga4Data;
      return (g.ecommerce_purchases_30d > 0 || g.items_purchased_30d > 0 ||
              g.ecommerce_purchases_365d > 0 || g.items_purchased_365d > 0 ||
              g.purchase_revenue_30d > 0 || g.item_revenue_30d > 0 ||
              g.purchase_revenue_365d > 0 || g.item_revenue_365d > 0);
    })
    .map(({ docId, ga4Data }) => {
      // Combine ecommerce_purchases (page-level) + items_purchased (item-level)
      // Use max of both since they may overlap
      const sales30d = Math.max(
        (ga4Data.ecommerce_purchases_30d || 0),
        (ga4Data.items_purchased_30d || 0)
      );
      const sales365d = Math.max(
        (ga4Data.ecommerce_purchases_365d || 0),
        (ga4Data.items_purchased_365d || 0)
      );
      // Revenue: sum page-level purchase_revenue + item-level item_revenue
      // Use max to avoid double-counting
      const revenue30d = Math.max(
        (ga4Data.purchase_revenue_30d || 0),
        (ga4Data.item_revenue_30d || 0)
      );
      const revenue365d = Math.max(
        (ga4Data.purchase_revenue_365d || 0),
        (ga4Data.item_revenue_365d || 0)
      );
      return { docId, sales30d, sales365d, revenue30d, revenue365d };
    });

  if (ops.length === 0) {
    console.log('  No sales data to update.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < ops.length; i += batchSize) {
    const batch = ops.slice(i, i + batchSize);
    const operations = batch.flatMap(({ docId, sales30d, sales365d, revenue30d, revenue365d }) => [
      { update: { _index: INDEX_NAME, _id: docId } },
      {
        doc: {
          sales_30d: sales30d,
          sales_365d: sales365d,
          revenue_30d: Math.round(revenue30d * 100) / 100,
          revenue_365d: Math.round(revenue365d * 100) / 100,
        },
      },
    ]);
    await esClient.bulk({ operations, refresh: i + batchSize >= ops.length });
    updated += batch.length;
  }

  // Log top sellers
  const topSellers = [...ops].sort((a, b) => b.sales30d - a.sales30d).slice(0, 5);
  console.log(`  Updated sales/revenue for ${updated} products`);
  console.log('  Top 5 sellers (30d):');
  topSellers.forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.docId}: ${s.sales30d} sales, ${s.revenue30d.toFixed(0)} PLN (365d: ${s.sales365d} sales, ${s.revenue365d.toFixed(0)} PLN)`);
  });
}

// ---------- Main ----------

async function main() {
  console.log('=== GA4 Data Sync ===');
  console.log(`Property: ${GA4_PROPERTY_ID}, Periods: ${periods.join(', ')}, Dry run: ${dryRun}`);
  console.log('');

  // 1. Load product URL map from ES
  const { urlMap, nameMap } = await loadProductURLMap();

  // 2. Fetch GA4 data for each period
  const pageData = {};
  const itemData = {};

  for (const period of periods) {
    console.log(`\nFetching GA4 data for period: ${period}`);

    const pageRows = await fetchPageMetrics(period);
    pageData[period] = parsePageRows(pageRows);
    console.log(`  Page data: ${pageData[period].size} unique paths`);

    const itemRows = await fetchItemMetrics(period);
    itemData[period] = parseItemRows(itemRows);
    console.log(`  Item data: ${itemData[period].size} unique items`);
  }

  // 3. Match and merge data per product
  console.log('\nMatching GA4 data to products...');
  const updates = [];
  const matchedPaths = new Set();
  const matchedNames = new Set();

  // Match by URL path (page-level metrics)
  for (const period of periods) {
    const suffix = period === '30d' ? '_30d' : '_365d';

    for (const [path, metrics] of pageData[period]) {
      const docId = urlMap.get(path);
      if (!docId) continue;

      matchedPaths.add(path);

      // Find or create update entry
      let entry = updates.find(u => u.docId === docId);
      if (!entry) {
        entry = { docId, ga4Data: {} };
        updates.push(entry);
      }

      entry.ga4Data[`pageviews${suffix}`] = metrics.pageviews;
      entry.ga4Data[`sessions${suffix}`] = metrics.sessions;
      entry.ga4Data[`add_to_carts${suffix}`] = metrics.addToCarts;
      entry.ga4Data[`ecommerce_purchases${suffix}`] = metrics.ecommercePurchases;
      entry.ga4Data[`purchase_revenue${suffix}`] = metrics.purchaseRevenue;

      if (period === '30d') {
        entry.ga4Data.bounce_rate_30d = metrics.bounceRate;
        entry.ga4Data.engagement_rate_30d = metrics.engagementRate;
        entry.ga4Data.avg_session_duration_30d = metrics.avgSessionDuration;
      }
    }
  }

  // Match by item name (item-level ecommerce metrics)
  for (const period of periods) {
    const suffix = period === '30d' ? '_30d' : '_365d';

    for (const [itemName, metrics] of itemData[period]) {
      const normName = itemName.toLowerCase().trim();
      const docId = nameMap.get(normName);
      if (!docId) continue;

      matchedNames.add(normName);

      let entry = updates.find(u => u.docId === docId);
      if (!entry) {
        entry = { docId, ga4Data: {} };
        updates.push(entry);
      }

      entry.ga4Data[`item_views${suffix}`] = metrics.itemViews;
      entry.ga4Data[`items_purchased${suffix}`] = metrics.itemsPurchased;
      entry.ga4Data[`item_revenue${suffix}`] = metrics.itemRevenue;

      if (period === '30d') {
        entry.ga4Data.cart_to_view_rate_30d = metrics.cartToViewRate;
      }
    }
  }

  console.log(`  Matched: ${matchedPaths.size} URL paths, ${matchedNames.size} item names`);
  console.log(`  Total products to update: ${updates.length}`);

  // 4. Compute composite scores
  console.log('\nComputing composite scores...');
  for (const entry of updates) {
    const scores = computeScores(entry.ga4Data);
    entry.ga4Data.popularity_score = scores.popularity_score;
    entry.ga4Data.conversion_score = scores.conversion_score;
    entry.ga4Data.trending_score = scores.trending_score;
    entry.ga4Data.last_synced = new Date().toISOString();
  }

  // Log top products by score
  const topPop = [...updates].sort((a, b) =>
    (b.ga4Data.popularity_score || 0) - (a.ga4Data.popularity_score || 0)
  ).slice(0, 5);
  console.log('\n  Top 5 by popularity_score:');
  topPop.forEach((u, i) => {
    console.log(`    ${i + 1}. ${u.docId}: pop=${u.ga4Data.popularity_score}, conv=${u.ga4Data.conversion_score}, trend=${u.ga4Data.trending_score}`);
  });

  const topConv = [...updates].sort((a, b) =>
    (b.ga4Data.conversion_score || 0) - (a.ga4Data.conversion_score || 0)
  ).slice(0, 5);
  console.log('\n  Top 5 by conversion_score:');
  topConv.forEach((u, i) => {
    console.log(`    ${i + 1}. ${u.docId}: conv=${u.ga4Data.conversion_score}, pop=${u.ga4Data.popularity_score}`);
  });

  // 5. Write to ES
  if (dryRun) {
    console.log('\n  DRY RUN — skipping Elasticsearch update');
  } else {
    console.log('');
    await bulkUpdateGA4(updates);
    await updateSalesFields(updates);
  }

  console.log('\n=== GA4 Sync complete ===');
}

main().catch((err) => {
  console.error('GA4 Sync failed:', err.message);
  if (err.details) console.error('Details:', err.details);
  process.exit(1);
});
