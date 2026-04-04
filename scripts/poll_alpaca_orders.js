/**
 * Poll Alpaca for submitted orders and reconcile status to local storage / DB.
 * Run periodically (cron/CI) or manually for testing.
 */
const path = require('path');
const fs = require('fs').promises;
const db = require('../lib/db');
const { getAlpacaOrder } = require('../lib/execution/alpacaAdapter');

async function readJson(p) { try { return JSON.parse(await fs.readFile(p,'utf-8')); } catch(e){ return []; } }
async function writeJson(p,v){ await fs.writeFile(p, JSON.stringify(v,null,2)); }

const ORDERS_PATH = path.join(process.cwd(), 'data', 'orders.json');
const LEDGER_PATH = path.join(process.cwd(), 'data', 'ledger.json');

async function run() {
  const orders = await readJson(ORDERS_PATH);
  let changed = false;
  for (const o of orders) {
    if (o.status === 'submitted' && o.brokerResponse && o.brokerResponse.id) {
      try {
        const remote = await getAlpacaOrder(o.brokerResponse.id);
        if (remote.status === 'filled' || remote.status === 'cancelled' || remote.status === 'partial') {
          o.status = remote.status === 'filled' ? 'filled' : remote.status;
          o.filledQty = remote.filled_qty || o.filledQty;
          o.fillPrice = remote.filled_avg_price || o.fillPrice;
          o.executedAt = remote.filled_at || new Date().toISOString();
          // append ledger
          const ledger = await readJson(LEDGER_PATH);
          const pnl = 0; // actual pnl should be computed later via positions
          ledger.push({ ...o, pnl, recordedAt: new Date().toISOString() });
          await writeJson(LEDGER_PATH, ledger);
          if (db.pool) {
            await db.appendLedger({ id: o.id, userId: o.userId, symbol: o.symbol, filledQty: o.filledQty, fillPrice: o.fillPrice, pnl });
            await db.pool.query('UPDATE orders SET status=$1 WHERE id=$2', [o.status, o.id]);
          }
          changed = true;
          console.log('Reconciled order', o.id, 'status->', o.status);
        }
      } catch (e) {
        console.error('poll error for', o.id, e.message || e);
      }
    }
  }
  if (changed) await writeJson(ORDERS_PATH, orders);
}

run().catch(e=>{ console.error(e); process.exit(1); });
