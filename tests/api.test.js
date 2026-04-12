/**
 * Integration tests for ProfitForce Next.js API routes.
 * Run: npx jest tests/api.test.js --runInBand
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function fetchJSON(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ok: res.ok };
}

describe('Public API endpoints', () => {
  test('GET /api/indices returns index data', async () => {
    const r = await fetchJSON('/api/indices');
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('indices');
    expect(Array.isArray(r.data.indices)).toBe(true);
  });

  test('GET /api/signal requires symbol', async () => {
    const r = await fetchJSON('/api/signal');
    expect(r.status).toBe(400);
  });

  test('GET /api/signal?symbol=INFY.NS returns signal', async () => {
    const r = await fetchJSON('/api/signal?symbol=INFY.NS');
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('signal');
  });

  test('GET /api/scan returns scan results', async () => {
    const r = await fetchJSON('/api/scan');
    expect(r.status).toBe(200);
    const results = r.data?.all ?? r.data?.results ?? [];
    expect(Array.isArray(results)).toBe(true);
  });

  test('GET /api/history requires symbol', async () => {
    const r = await fetchJSON('/api/history');
    expect(r.status).toBe(400);
  });
});

describe('Model API endpoints', () => {
  test('GET /api/model returns model registry', async () => {
    const r = await fetchJSON('/api/model');
    expect(r.status).toBe(200);
  });

  test('GET /api/inference/model-info returns model status', async () => {
    const r = await fetchJSON('/api/inference/model-info');
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('model_loaded');
  });
});

describe('Auth-protected endpoints', () => {
  test('GET /api/predict without auth returns 401', async () => {
    const r = await fetchJSON('/api/predict?symbol=INFY.NS');
    expect(r.status).toBe(401);
  });

  test('GET /api/watchlist without auth returns 401', async () => {
    const r = await fetchJSON('/api/watchlist');
    expect(r.status).toBe(401);
  });

  test('POST /api/watchlist without auth returns 401', async () => {
    const r = await fetchJSON('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol: 'INFY.NS' }) });
    expect(r.status).toBe(401);
  });
});

describe('Stripe endpoints', () => {
  test('POST /api/stripe/create-checkout-session without body returns error', async () => {
    const r = await fetchJSON('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    // Should return 400 or 500 (missing params or stripe unconfigured)
    expect([400, 500]).toContain(r.status);
  });
});

describe('Admin endpoints', () => {
  test('GET /api/admin/subscribers requires admin', async () => {
    const r = await fetchJSON('/api/admin/subscribers');
    // Should return 401 or 403
    expect([401, 403]).toContain(r.status);
  });
});
