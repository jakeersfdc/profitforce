/**
 * Upstox v2 adapter.
 * Docs: https://upstox.com/developer/api-documentation/v2/place-order
 *
 * Required creds (per user):
 *   - accessToken (Bearer token from Upstox OAuth)
 *
 * Endpoint: POST https://api.upstox.com/v2/order/place
 * Body JSON: { quantity, product, validity, price, tag, instrument_token, order_type, transaction_type, disclosed_quantity, trigger_price, is_amo }
 */

const UPSTOX_BASE = 'https://api.upstox.com';

async function placeUpstoxOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null, creds = {}, instrumentKey, product = 'I', validity = 'DAY' }) {
  const { accessToken } = creds || {};
  if (!accessToken) throw new Error('Upstox credentials not configured (accessToken required)');
  // Upstox requires `instrument_token` (e.g. "NSE_EQ|INE848E01016"). The `symbol` alone isn't enough.
  const instrument = instrumentKey || (String(symbol || '').includes('|') ? symbol : null);
  if (!instrument) throw new Error('Upstox requires instrumentKey (e.g. "NSE_EQ|INE...")');

  const body = {
    quantity: Number(qty),
    product, // 'I' (intraday), 'D' (delivery), 'CO', 'MTF'
    validity,
    price: type === 'limit' && price ? Number(price) : 0,
    tag: clientOrderId ? String(clientOrderId).slice(0, 20) : 'profitforce',
    instrument_token: instrument,
    order_type: type === 'limit' ? 'LIMIT' : 'MARKET',
    transaction_type: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
    disclosed_quantity: 0,
    trigger_price: 0,
    is_amo: false,
  };

  const res = await fetch(`${UPSTOX_BASE}/v2/order/place`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.status === 'error') {
    throw new Error(`Upstox order failed: ${res.status} ${json?.errors?.[0]?.message || json?.message || text}`);
  }
  return {
    status: 'submitted',
    broker: 'upstox',
    orderId: json?.data?.order_id || clientOrderId,
    raw: json,
  };
}

module.exports = { placeUpstoxOrder };
