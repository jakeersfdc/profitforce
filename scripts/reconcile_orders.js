/**
 * Simple reconciliation script for submitted orders.
 * - Reads data/orders.json
 * - Marks any 'submitted' orders as 'filled' with simulated fill price
 * - Appends ledger entries with PnL (naive simulation)
 * Run: node scripts/reconcile_orders.js
 */
const fs = require('fs').promises;
const path = require('path');

const ORDERS_PATH = path.join(process.cwd(), 'data', 'orders.json');
const LEDGER_PATH = path.join(process.cwd(), 'data', 'ledger.json');

async function readJson(p) { try { return JSON.parse(await fs.readFile(p,'utf-8')); } catch(e){ return []; } }
async function writeJson(p,v){ await fs.writeFile(p, JSON.stringify(v,null,2)); }

async function run(){
  const orders = await readJson(ORDERS_PATH);
  let updated = false;
  for (const o of orders) {
    if (o.status === 'submitted') {
      const fillPrice = o.price || Number((100*(0.95+Math.random()*0.1)).toFixed(2));
      o.status = 'filled';
      o.filledQty = o.qty;
      o.fillPrice = fillPrice;
      o.executedAt = new Date().toISOString();
      // append ledger
      const ledger = await readJson(LEDGER_PATH);
      const pnl = (Math.random() - 0.5) * 2 * (o.qty * (fillPrice || 100) * 0.02); // tiny random pnl
      ledger.push({ ...o, pnl, pnlPct: (pnl / ((o.qty||1)*(fillPrice||100)))*100, recordedAt: new Date().toISOString() });
      await writeJson(LEDGER_PATH, ledger);
      updated = true;
      console.log('Filled order', o.id, o.symbol, o.filledQty, o.fillPrice);
      // if DB configured, also insert ledger and update order
      try {
        const db = require('../lib/db');
        if (db.pool) {
          await db.appendLedger({ id: o.id, userId: o.userId, symbol: o.symbol, filledQty: o.filledQty, fillPrice, pnl });
          await db.pool.query('UPDATE orders SET status=$1, broker_response=$2 WHERE id=$3', ['filled', JSON.stringify(o.brokerResponse||null), o.id]);
        }
      } catch (e) {
        // ignore DB errors here
      }
    }
  }
  if (updated) await writeJson(ORDERS_PATH, orders);
}

run().catch(e=>{ console.error(e); process.exit(1); });
