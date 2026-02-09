/**
 * Merchandising service — manages pinned and blacklisted products.
 * Loads from JSON files and watches for changes.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', '..', 'data', 'merchandising');

let pinnedRules = {};
let blacklistedRules = {};

async function loadJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function loadMerchandisingRules() {
  pinnedRules = await loadJsonFile(resolve(DATA_DIR, 'pinned.json'));
  blacklistedRules = await loadJsonFile(resolve(DATA_DIR, 'blacklisted.json'));
}

// Load on import
loadMerchandisingRules();

/**
 * Get product IDs pinned for a given query.
 * Matches if query starts with or equals a pinned key.
 */
export function getPinnedProducts(query) {
  const q = (query || '').toLowerCase().trim();
  for (const [key, productIds] of Object.entries(pinnedRules)) {
    if (q === key || q.startsWith(key + ' ')) {
      return productIds;
    }
  }
  return [];
}

/**
 * Get product IDs blacklisted for a given query.
 */
export function getBlacklistedProducts(query) {
  const q = (query || '').toLowerCase().trim();
  for (const [key, productIds] of Object.entries(blacklistedRules)) {
    if (q === key || q.startsWith(key + ' ')) {
      return productIds;
    }
  }
  return [];
}

/**
 * Apply merchandising rules to a product list.
 * - Removes blacklisted products
 * - Inserts pinned products at the top with is_pinned flag
 */
export function applyMerchandising(products, query, allProductsById = {}) {
  const blacklisted = new Set(getBlacklistedProducts(query));
  const pinnedIds = getPinnedProducts(query);

  // Remove blacklisted
  let filtered = products.filter((p) => !blacklisted.has(p.id));

  // Add pinned products at the top
  if (pinnedIds.length > 0) {
    const pinnedProducts = [];
    const existingIds = new Set(filtered.map((p) => p.id));

    for (const pid of pinnedIds) {
      if (allProductsById[pid]) {
        pinnedProducts.push({ ...allProductsById[pid], is_pinned: true });
        existingIds.add(pid);
      } else {
        // Product already in results — move to top and flag
        const idx = filtered.findIndex((p) => p.id === pid);
        if (idx >= 0) {
          const [product] = filtered.splice(idx, 1);
          pinnedProducts.push({ ...product, is_pinned: true });
        }
      }
    }

    filtered = [...pinnedProducts, ...filtered];
  }

  return filtered;
}

/**
 * Reload merchandising rules (for admin API).
 */
export async function reloadRules() {
  await loadMerchandisingRules();
  return { pinned: Object.keys(pinnedRules).length, blacklisted: Object.keys(blacklistedRules).length };
}
