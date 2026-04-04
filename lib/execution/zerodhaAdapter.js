/**
 * Zerodha/Kite adapter skeleton.
 * Real integration requires Kite Connect credentials and OAuth flow.
 * This file provides the method signatures and throws until implemented.
 */
async function placeZerodhaOrder({ symbol, qty, side, type = 'market', price = null, clientOrderId = null }) {
  throw new Error('Zerodha adapter not implemented. Implement Kite Connect OAuth and order placement here.');
}

module.exports = { placeZerodhaOrder };
