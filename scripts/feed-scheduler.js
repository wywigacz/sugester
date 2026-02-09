/**
 * Feed Auto-Update Scheduler
 *
 * Downloads the Cyfrowe.pl product feed and reimports into Elasticsearch
 * every 12 hours, then optionally enriches with GA4 analytics data.
 *
 * Usage:
 *   node scripts/feed-scheduler.js                # default: every 12h
 *   node scripts/feed-scheduler.js --interval 6   # every 6 hours
 *   node scripts/feed-scheduler.js --once          # run once and exit
 *   node scripts/feed-scheduler.js --skip-ga4      # skip GA4 sync step
 *
 * GA4 sync requires:
 *   - GA4_PROPERTY_ID environment variable
 *   - GOOGLE_APPLICATION_CREDENTIALS or GA4_KEY_FILE environment variable
 *   If not set, GA4 step is skipped with a warning.
 *
 * Can also be triggered via:
 *   - Docker: add to docker-compose as a service
 *   - systemd / pm2: run as a daemon
 *   - Windows Task Scheduler: use --once flag
 *   - cron: 0 */12 * * * cd /path/to/sugester && node scripts/feed-scheduler.js --once
 */

import { execFile } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const LOG_DIR = resolve(ROOT_DIR, 'logs');
const LOG_FILE = resolve(LOG_DIR, 'feed-update.log');

// Ensure logs directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// Parse args
const args = process.argv.slice(2);
let intervalHours = 12;
let runOnce = false;
let skipGA4 = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--interval' && args[i + 1]) {
    intervalHours = parseFloat(args[++i]);
  }
  if (args[i] === '--once') {
    runOnce = true;
  }
  if (args[i] === '--skip-ga4') {
    skipGA4 = true;
  }
}

const intervalMs = intervalHours * 60 * 60 * 1000;

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore */ }
}

function runScript(scriptPath, scriptArgs = [], timeoutMin = 5) {
  return new Promise((resolveP, reject) => {
    const child = execFile('node', [scriptPath, ...scriptArgs], {
      cwd: ROOT_DIR,
      timeout: timeoutMin * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (stdout) {
        stdout.split('\n').filter(Boolean).forEach(line => log(`  ${line}`));
      }
      if (stderr) {
        stderr.split('\n').filter(Boolean).forEach(line => log(`  [STDERR] ${line}`));
      }
      if (error) {
        reject(error);
      } else {
        resolveP();
      }
    });
  });
}

function runImport() {
  log('Starting feed import from Cyfrowe.pl...');
  return runScript('scripts/import-feed.js', ['--cyfrowe', '--batch-size', '500'], 5)
    .then(() => log('Import completed successfully'))
    .catch((err) => {
      log(`Import failed: ${err.message}`);
      throw err;
    });
}

function runGA4Sync() {
  // Check if GA4 credentials are configured
  if (!process.env.GA4_PROPERTY_ID) {
    log('GA4 sync skipped — GA4_PROPERTY_ID not set');
    log('  To enable: set GA4_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS env vars');
    return Promise.resolve();
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GA4_KEY_FILE) {
    log('GA4 sync skipped — no service account key configured');
    log('  Set GOOGLE_APPLICATION_CREDENTIALS or GA4_KEY_FILE env var');
    return Promise.resolve();
  }

  log('Starting GA4 data sync...');
  return runScript('scripts/ga4-sync.js', [], 10)
    .then(() => log('GA4 sync completed successfully'))
    .catch((err) => {
      // GA4 sync failure is non-fatal — products still work without analytics
      log(`GA4 sync warning: ${err.message} (non-fatal, continuing)`);
    });
}

async function flushRedisCache() {
  try {
    const { createClient } = await import('redis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    // Flush only sugester keys, not entire Redis
    const keys = await redis.keys('sugester:*');
    if (keys.length > 0) {
      await redis.del(keys);
      log(`Flushed ${keys.length} Redis cache keys`);
    } else {
      log(`No Redis cache keys to flush`);
    }
    await redis.quit();
  } catch (err) {
    log(`Redis flush warning: ${err.message} (non-fatal)`);
  }
}

async function updateCycle() {
  const start = Date.now();
  log(`=== Feed update cycle started ===`);

  try {
    // Step 1: Import product feed
    await runImport();

    // Step 2: Enrich with GA4 analytics (if configured)
    if (!skipGA4) {
      await runGA4Sync();
    } else {
      log('GA4 sync skipped (--skip-ga4 flag)');
    }

    // Step 3: Flush Redis cache so new data is served immediately
    await flushRedisCache();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`=== Feed update cycle completed in ${elapsed}s ===`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`=== Feed update cycle FAILED after ${elapsed}s: ${err.message} ===`);
  }
}

async function main() {
  log(`Feed Scheduler starting (interval: ${intervalHours}h, once: ${runOnce}, skipGA4: ${skipGA4})`);

  // Run immediately
  await updateCycle();

  if (runOnce) {
    log('Single run mode — exiting.');
    process.exit(0);
  }

  // Schedule recurring
  log(`Next update in ${intervalHours} hours`);
  setInterval(async () => {
    await updateCycle();
    log(`Next update in ${intervalHours} hours`);
  }, intervalMs);

  // Keep process alive
  process.on('SIGINT', () => {
    log('Scheduler stopped (SIGINT)');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('Scheduler stopped (SIGTERM)');
    process.exit(0);
  });
}

main();
