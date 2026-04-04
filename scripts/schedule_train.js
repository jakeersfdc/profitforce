// Simple scheduler to POST /api/train for configured symbols using node-cron
// Usage: node scripts/schedule_train.js

const cron = require('node-cron');

// Prefer global fetch (Node 18+). If unavailable, fall back to node-fetch if installed.
let fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
if (!fetchFn) {
  try {
    fetchFn = require('node-fetch');
  } catch (e) {
    console.error('No fetch available (global fetch missing and node-fetch not installed).');
    fetchFn = null;
  }
}

const CONFIG = {
  // cron schedule: daily at 02:00
  schedule: process.env.TRAIN_SCHEDULE || '0 2 * * *',
  symbols: [],
  serverBase: process.env.SERVER_BASE || 'http://localhost:3000',
};

// try to load symbols from data/nifty50.ts
try {
  const nifty = require('fs').readFileSync(require('path').join(process.cwd(), 'data', 'nifty50.ts'), 'utf8');
  const re = /\{\s*symbol:\s*"([A-Z0-9\.\/-]+)"/g;
  let m;
  while ((m = re.exec(nifty)) !== null) {
    CONFIG.symbols.push((m[1].endsWith('.NS') ? m[1] : `${m[1]}.NS`));
  }
} catch (e) {
  // fallback to default symbols
  CONFIG.symbols = ['RELIANCE.NS', 'TCS.NS'];
}

async function runTrainFor(symbol) {
  const maxRetries = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxRetries) {
    attempt += 1;
    try {
      if (!fetchFn) throw new Error('fetch is not available');
      console.log(new Date().toISOString(), `train attempt ${attempt} for`, symbol);
      const resp = await fetchFn(`${CONFIG.serverBase}/api/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        lastErr = json ?? `HTTP ${resp.status}`;
        console.warn(new Date().toISOString(), 'train response not ok', symbol, lastErr);
        // exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      console.log(new Date().toISOString(), 'train result for', symbol, json ?? 'OK');
      return;
    } catch (e) {
      lastErr = e && e.message ? e.message : e;
      console.error(new Date().toISOString(), 'train call failed', symbol, lastErr);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  console.error(new Date().toISOString(), `train failed after ${maxRetries} attempts for ${symbol}:`, lastErr);
}

console.log('Starting training scheduler with cron', CONFIG.schedule, 'symbols:', CONFIG.symbols.join(','));
cron.schedule(CONFIG.schedule, () => {
  console.log(new Date().toISOString(), 'Running scheduled training for', CONFIG.symbols.join(','));
  CONFIG.symbols.forEach((s) => runTrainFor(s));
});

// optional initial run; set SKIP_INITIAL=1 to skip
if (process.env.SKIP_INITIAL !== '1') {
  (async () => {
    console.log('Initial training run');
    for (const s of CONFIG.symbols) await runTrainFor(s);
  })();
} else {
  console.log('Skipping initial training run (SKIP_INITIAL=1)');
}
