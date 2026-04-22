/**
 * Dhan adapter.
 * Docs: https://dhanhq.co/docs/v2/orders/
 *
 * Required creds (per user):
 *   - accessToken  (Dhan access token — long-lived, ~30 days)
 *   - clientId     (Dhan client id, e.g. "1000000001")
 *
 * Endpoint: POST https://api.dhan.co/v2/orders
 * Headers:  access-token: <token>,  Content-Type: application/json
 */

const DHAN_BASE = 'https://api.dhan.co';

function mapExchangeSegment(symbol, override) {
  if (override) return override;
  const s = String(symbol || '').toUpperCase();
  if (s.endsWith('=F')) return 'MCX_COMM';
  if (s.endsWith('.BS') || s.endsWith('.BSE') || s.endsWith('.BO')) return 'BSE_EQ';
  return 'NSE_EQ';
}

async function placeDhanOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null, creds = {}, securityId, exchangeSegment, productType = 'INTRADAY' }) {
  const { accessToken, clientId } = creds || {};
  if (!accessToken || !clientId) throw new Error('Dhan credentials not configured (accessToken + clientId required)');
  if (!securityId) throw new Error('Dhan requires numeric securityId (instrument id)');

  const body = {
    dhanClientId: String(clientId),
    correlationId: clientOrderId ? String(clientOrderId).slice(0, 25) : undefined,
    transactionType: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
    exchangeSegment: mapExchangeSegment(symbol, exchangeSegment),
    productType, // INTRADAY | CNC | MARGIN | MTF | CO | BO
    orderType: type === 'limit' ? 'LIMIT' : 'MARKET',
    validity: 'DAY',
    securityId: String(securityId),
    quantity: Number(qty),
    disclosedQuantity: 0,
    price: type === 'limit' && price ? Number(price) : 0,
    triggerPrice: 0,
    afterMarketOrder: false,
  };

  const res = await fetch(`${DHAN_BASE}/v2/orders`, {
    method: 'POST',
    headers: {
      'access-token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.errorCode) {
    throw new Error(`Dhan order failed: ${res.status} ${json?.errorMessage || json?.message || text}`);
  }
  return {
    status: 'submitted',
    broker: 'dhan',
    orderId: json?.orderId || clientOrderId,
    raw: json,
  };
}

module.exports = { placeDhanOrder };
