/**
 * Angel One SmartAPI adapter.
 * Docs: https://smartapi.angelbroking.com/docs/Orders
 *
 * Required creds (per user):
 *   - apiKey      (SmartAPI app key)
 *   - clientCode  (Angel client id)
 *   - jwtToken    (obtained from loginByPassword / totp flow)
 *
 * Place order: POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/placeOrder
 * Required headers include Authorization: Bearer {jwt}, X-PrivateKey, X-UserType, X-SourceID,
 * X-ClientLocalIP, X-ClientPublicIP, X-MACAddress, Content-Type, Accept.
 */

const ANGEL_BASE = 'https://apiconnect.angelbroking.com';

function guessAngelExchange(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s.endsWith('.NS') || s.endsWith('.NSE')) return { sym: s.replace(/\.(NS|NSE)$/, ''), exchange: 'NSE' };
  if (s.endsWith('.BS') || s.endsWith('.BSE') || s.endsWith('.BO')) return { sym: s.replace(/\.(BS|BSE|BO)$/, ''), exchange: 'BSE' };
  if (s.endsWith('=F')) return { sym: s.replace(/=F$/, ''), exchange: 'MCX' };
  return { sym: s, exchange: 'NSE' };
}

function angelHeaders(apiKey, jwtToken) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': apiKey,
    Authorization: `Bearer ${jwtToken}`,
  };
}

async function placeAngelOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null, creds = {}, exchange, symboltoken, producttype = 'INTRADAY', duration = 'DAY' }) {
  const { apiKey, jwtToken } = creds || {};
  if (!apiKey || !jwtToken) throw new Error('Angel credentials not configured (apiKey + jwtToken required)');

  // Angel requires `symboltoken` (numeric instrument token). Caller must supply it;
  // otherwise the API call will fail with a clear error. We still try with the symbol.
  const mapped = guessAngelExchange(symbol);

  const body = {
    variety: 'NORMAL',
    tradingsymbol: mapped.sym,
    symboltoken: symboltoken || '',
    transactiontype: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
    exchange: exchange || mapped.exchange,
    ordertype: type === 'limit' ? 'LIMIT' : 'MARKET',
    producttype,
    duration,
    price: type === 'limit' && price ? String(price) : '0',
    squareoff: '0',
    stoploss: '0',
    quantity: String(qty),
    ordertag: clientOrderId ? String(clientOrderId).slice(0, 20) : undefined,
  };

  const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
    method: 'POST',
    headers: angelHeaders(apiKey, jwtToken),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.status === false) {
    throw new Error(`Angel order failed: ${res.status} ${json?.message || text}`);
  }
  return {
    status: 'submitted',
    broker: 'angel',
    orderId: json?.data?.orderid || clientOrderId,
    raw: json,
  };
}

module.exports = { placeAngelOrder };

