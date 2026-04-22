/**
 * Zerodha Kite Connect adapter.
 * Docs: https://kite.trade/docs/connect/v3/orders/
 *
 * Required creds (per user):
 *   - apiKey       (Kite Connect app API key)
 *   - accessToken  (obtained via OAuth login flow)
 *
 * Place order endpoint: POST https://api.kite.trade/orders/regular
 * Auth header:          Authorization: token {apiKey}:{accessToken}
 * Body (form-encoded):  tradingsymbol, exchange, transaction_type, order_type,
 *                       quantity, product, validity, price (optional)
 */

const KITE_BASE = 'https://api.kite.trade';

function guessExchange(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s.endsWith('.NS') || s.endsWith('.NSE')) return { sym: s.replace(/\.(NS|NSE)$/, ''), exchange: 'NSE' };
  if (s.endsWith('.BS') || s.endsWith('.BSE') || s.endsWith('.BO')) return { sym: s.replace(/\.(BS|BSE|BO)$/, ''), exchange: 'BSE' };
  // MCX commodities — Yahoo feed uses `=F` suffix, but Kite symbols differ (e.g. GOLD26APRFUT).
  // Caller must pass the actual MCX tradingsymbol; we just strip Yahoo suffix as a safety.
  if (s.endsWith('=F')) return { sym: s.replace(/=F$/, ''), exchange: 'MCX' };
  return { sym: s, exchange: 'NSE' };
}

async function placeZerodhaOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null, creds = {}, exchange, product = 'MIS', validity = 'DAY' }) {
  const { apiKey, accessToken } = creds || {};
  if (!apiKey || !accessToken) throw new Error('Zerodha credentials not configured (apiKey + accessToken required)');

  const mapped = guessExchange(symbol);
  const tradingsymbol = mapped.sym;
  const exch = exchange || mapped.exchange;

  const body = new URLSearchParams({
    tradingsymbol,
    exchange: exch,
    transaction_type: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
    order_type: type === 'limit' ? 'LIMIT' : 'MARKET',
    quantity: String(qty),
    product,
    validity,
  });
  if (type === 'limit' && price) body.set('price', String(price));
  if (clientOrderId) body.set('tag', String(clientOrderId).slice(0, 20));

  const res = await fetch(`${KITE_BASE}/orders/regular`, {
    method: 'POST',
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${apiKey}:${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.status === 'error') {
    throw new Error(`Zerodha order failed: ${res.status} ${json.message || text}`);
  }
  return {
    status: 'submitted',
    broker: 'zerodha',
    orderId: json?.data?.order_id || clientOrderId,
    raw: json,
  };
}

async function getZerodhaOrder({ orderId, creds = {} }) {
  const { apiKey, accessToken } = creds || {};
  if (!apiKey || !accessToken) throw new Error('Zerodha credentials not configured');
  const res = await fetch(`${KITE_BASE}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${apiKey}:${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`Zerodha get order failed: ${res.status}`);
  return res.json();
}

module.exports = { placeZerodhaOrder, getZerodhaOrder };

