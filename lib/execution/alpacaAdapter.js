/**
 * Minimal Alpaca adapter skeleton. Uses environment variables ALPACA_KEY, ALPACA_SECRET, ALPACA_BASE_URL.
 * If not configured, adapter will throw to prevent accidental live trading.
 */
const ALPACA_KEY = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

async function placeAlpacaOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null }) {
  if (!ALPACA_KEY || !ALPACA_SECRET) throw new Error('Alpaca credentials not configured');
  // lightweight implementation using fetch to call Alpaca REST API
  const url = `${ALPACA_BASE_URL}/v2/orders`;
  const body = { symbol, qty: String(qty), side, type };
  if (type === 'limit' && price) body.limit_price = price;
  if (clientOrderId) body.client_order_id = clientOrderId;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Alpaca order failed: ${res.status} ${txt}`);
  }
  return res.json();
}

async function getAlpacaOrder(orderId) {
  if (!ALPACA_KEY || !ALPACA_SECRET) throw new Error('Alpaca credentials not configured');
  const url = `${ALPACA_BASE_URL}/v2/orders/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, { headers: { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Alpaca get order failed: ${res.status} ${txt}`);
  }
  return res.json();
}

module.exports = { placeAlpacaOrder, getAlpacaOrder };
