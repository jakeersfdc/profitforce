const fs = require('fs').promises;
const path = require('path');
const { placeAlpacaOrder } = require('./alpacaAdapter');
const { sendWhatsApp } = require('../notifications/twilio');
const { sendEmail } = require('../notifications/email');
const { sendPush } = require('../notifications/fcm');
const db = require('../../lib/db');

const ORDERS_PATH = path.join(process.cwd(), 'data', 'orders.json');
const LEDGER_PATH = path.join(process.cwd(), 'data', 'ledger.json');

async function _ensureFiles() {
  await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  try { await fs.access(ORDERS_PATH); } catch (e) { await fs.writeFile(ORDERS_PATH, '[]'); }
  try { await fs.access(LEDGER_PATH); } catch (e) { await fs.writeFile(LEDGER_PATH, '[]'); }
}

async function _readJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch (e) { return []; }
}

async function _writeJson(p, v) { await fs.writeFile(p, JSON.stringify(v, null, 2)); }

/**
 * Place an order through the execution manager.
 * - If PAPER_TRADING=1 or request.dryRun true -> simulate and record a paper trade
 * - Otherwise attempt to call broker adapter (Alpaca) if configured
 */
async function placeOrder({ id, userId, symbol, qty, side, type = 'market', price = null, dryRun = false, notify = true }) {
  await _ensureFiles();
  const orders = await _readJson(ORDERS_PATH);

  // enforce risk controls before proceeding
  await _enforceRiskLimits(userId, { symbol, qty, side, price });

  // idempotency: if id exists, return existing order
  if (id) {
    // check DB first if available
    if (db.pool) {
      const foundDb = await db.findOrderById(id);
      if (foundDb) return foundDb;
    }
    const found = orders.find((o) => o.id === id);
    if (found) return found;
  }

  const order = {
    id: id || `ord_${Date.now()}`,
    userId: userId || 'unknown',
    symbol,
    qty,
    side,
    type,
    price,
    createdAt: new Date().toISOString(),
    status: 'pending',
    source: process.env.PAPER_TRADING === '1' || dryRun ? 'paper' : 'live'
  };

  // paper trading / dry run
  if (process.env.PAPER_TRADING === '1' || dryRun) {
    order.status = 'filled';
    order.filledQty = qty;
    order.fillPrice = price || await _getSimulatedPrice(symbol);
    order.executedAt = new Date().toISOString();
    orders.push(order);
    await _writeJson(ORDERS_PATH, orders);
    await _appendLedger(order);
    if (db.pool) {
      await db.insertOrder(order);
      await db.appendLedger(order);
    }
    if (notify) {
      await sendWhatsApp(order.userId, `Paper trade executed ${side} ${qty} ${symbol} @ ${order.fillPrice}`);
      await sendEmail(process.env.NOTIFY_EMAIL_TO || order.userId, 'Paper trade executed', `Paper trade executed ${side} ${qty} ${symbol} @ ${order.fillPrice}`);
      // no-op if not configured
      await sendPush(process.env.NOTIFY_PUSH_TOKEN || order.userId, { title: 'Paper trade', body: `${side} ${qty} ${symbol} @ ${order.fillPrice}` });
    }
    return order;
  }

  // live mode - attempt broker adapter
  try {
    const res = await placeAlpacaOrder({ symbol, qty, side, type, price, clientOrderId: order.id });
    order.status = 'submitted';
    order.brokerResponse = res;
    orders.push(order);
    await _writeJson(ORDERS_PATH, orders);
    if (db.pool) await db.insertOrder(order);
    // Note: adapter should send fills via webhooks or polling; here we optimistically mark submitted
    if (notify) {
      await sendWhatsApp(order.userId, `Order submitted ${side} ${qty} ${symbol}`);
      await sendEmail(process.env.NOTIFY_EMAIL_TO || order.userId, 'Order submitted', `Order submitted ${side} ${qty} ${symbol}`);
      await sendPush(process.env.NOTIFY_PUSH_TOKEN || order.userId, { title: 'Order submitted', body: `${side} ${qty} ${symbol}` });
    }
    return order;
  } catch (e) {
    order.status = 'error';
    order.error = String(e);
    orders.push(order);
    await _writeJson(ORDERS_PATH, orders);
    throw e;
  }
}

async function _appendLedger(order) {
  const ledger = await _readJson(LEDGER_PATH);
  ledger.push({ ...order, recordedAt: new Date().toISOString() });
  await _writeJson(LEDGER_PATH, ledger);
}

async function _getSimulatedPrice(symbol) {
  // naive simulation: return a random price between 90 and 110 for demo
  return Number((100 * (0.9 + Math.random() * 0.2)).toFixed(2));
}

module.exports = { placeOrder };

const users = require('../users');

async function _enforceRiskLimits(userId, { symbol, qty, side, price }) {
  const MAX_DAILY_LOSS_PCT = Number(process.env.MAX_DAILY_LOSS_PCT || 0.2); // fraction of capital
  const DEFAULT_CAPITAL = Number(process.env.DEFAULT_USER_CAPITAL || 100000);

  // load user profile if available
  let profile = null;
  try { profile = await users.getUserProfile(userId); } catch (e) { profile = null; }
  const capital = profile?.capital ? Number(profile.capital) : DEFAULT_CAPITAL;
  const userRiskPct = profile?.risk_per_trade_pct ? Number(profile.risk_per_trade_pct) : Number(process.env.MAX_RISK_PER_TRADE_PCT || 0.02);

  // compute today's realized losses
  let realizedLoss = 0;
  try {
    if (db.pool) {
      const l = await db.todaysLoss(userId || 'unknown');
      realizedLoss = Math.abs(Number(l || 0));
    } else {
      const ledger = await _readJson(LEDGER_PATH);
      const today = new Date().toISOString().slice(0,10);
      for (const e of ledger) {
        if ((e.userId || 'unknown') === (userId || 'unknown')) {
          const d = (e.recordedAt || e.executedAt || e.createdAt || '').slice(0,10);
          if (d === today) {
            const pnl = Number(e.pnl ?? e.pnlUsd ?? 0) || 0;
            if (pnl < 0) realizedLoss += Math.abs(pnl);
          }
        }
      }
    }
  } catch (e) {
    realizedLoss = 0;
  }

  const maxDailyLoss = MAX_DAILY_LOSS_PCT * capital;
  if (realizedLoss >= maxDailyLoss) throw new Error('Daily loss limit reached; trading disabled for today');

  // per-trade check using userRiskPct
  if (price && qty) {
    const notional = Math.abs(Number(qty) * Number(price));
    const maxRiskPerTrade = userRiskPct * capital;
    // assume worst-case loss of 5% unless user provides a stop estimate
    const worstLoss = 0.05 * notional;
    if (worstLoss > maxRiskPerTrade) throw new Error('Order size exceeds per-trade risk limit');
    if ((realizedLoss + worstLoss) > maxDailyLoss) throw new Error('Order would exceed daily loss limit');
  }
}
