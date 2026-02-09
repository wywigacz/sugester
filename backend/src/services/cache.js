/**
 * Redis caching layer — cache-aside pattern.
 * Key structure: autocomplete:{query} / search:{query}:{hash}
 * TTL: 60-300s depending on query length.
 */

import { createHash } from 'crypto';
import { normalizeCacheKey } from '../utils/normalizers.js';

const AUTOCOMPLETE_PREFIX = 'ac:';
const SEARCH_PREFIX = 'sr:';

// Short queries (1-2 chars) are more cacheable — longer TTL
function getTTL(query, type = 'autocomplete') {
  const len = (query || '').length;
  if (type === 'autocomplete') {
    if (len <= 2) return 300;  // 5 min for prefix queries like "c", "ca"
    if (len <= 4) return 120;  // 2 min
    return 60;                  // 1 min
  }
  // Search results — shorter TTL
  return 60;
}

function hashFilters(filters) {
  const sorted = JSON.stringify(filters, Object.keys(filters).sort());
  return createHash('md5').update(sorted).digest('hex').slice(0, 8);
}

/**
 * Get cached autocomplete result.
 */
export async function getCachedAutocomplete(redis, query) {
  if (!redis) return null;
  try {
    const key = AUTOCOMPLETE_PREFIX + normalizeCacheKey(query);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

/**
 * Set autocomplete result in cache.
 */
export async function setCachedAutocomplete(redis, query, data) {
  if (!redis) return;
  try {
    const key = AUTOCOMPLETE_PREFIX + normalizeCacheKey(query);
    const ttl = getTTL(query, 'autocomplete');
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Get cached search result.
 */
export async function getCachedSearch(redis, query, filters = {}, sort = 'relevance', page = 1) {
  if (!redis) return null;
  try {
    const filterHash = hashFilters({ ...filters, sort, page });
    const key = SEARCH_PREFIX + normalizeCacheKey(query) + ':' + filterHash;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

/**
 * Set search result in cache.
 */
export async function setCachedSearch(redis, query, filters, sort, page, data) {
  if (!redis) return;
  try {
    const filterHash = hashFilters({ ...filters, sort, page });
    const key = SEARCH_PREFIX + normalizeCacheKey(query) + ':' + filterHash;
    const ttl = getTTL(query, 'search');
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Flush all sugester cache keys.
 */
export async function flushCache(redis) {
  if (!redis) return 0;
  try {
    const acKeys = await redis.keys(AUTOCOMPLETE_PREFIX + '*');
    const srKeys = await redis.keys(SEARCH_PREFIX + '*');
    const allKeys = [...acKeys, ...srKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }
    return allKeys.length;
  } catch {
    return 0;
  }
}
