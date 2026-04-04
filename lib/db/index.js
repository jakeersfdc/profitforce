const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

let pool = null;

function initPool() {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
}

async function ensureSchema() {
  if (!pool) return;
  const dir = path.join(process.cwd(), 'scripts', 'migrations');
  try {
    const files = await fs.readdir(dir);
    for (const f of files.sort()) {
      const sql = await fs.readFile(path.join(dir, f), 'utf-8');
      await pool.query(sql);
    }
  } catch (e) {
    // ignore if migrations folder missing
  }
}

async function insertOrder(order) {
  if (!pool) return null;
  const res = await pool.query(
    `INSERT INTO orders(id, user_id, symbol, qty, side, type, price, created_at, status, source, broker_response)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING RETURNING *`,
    [order.id, order.userId, order.symbol, order.qty, order.side, order.type, order.price, order.createdAt, order.status, order.source, JSON.stringify(order.brokerResponse || null)]
  );
  return res.rows[0];
}

async function findOrderById(id) {
  if (!pool) return null;
  const res = await pool.query('SELECT * FROM orders WHERE id=$1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function appendLedger(entry) {
  if (!pool) return null;
  const res = await pool.query(
    `INSERT INTO ledger(order_id, user_id, symbol, qty, fill_price, pnl, recorded_at)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [entry.id, entry.userId, entry.symbol, entry.filledQty || entry.qty, entry.fillPrice || null, entry.pnl || null, new Date().toISOString()]
  );
  return res.rows[0];
}

async function todaysLoss(userId) {
  if (!pool) return 0;
  const today = new Date().toISOString().slice(0,10) + '%';
  const res = await pool.query("SELECT COALESCE(SUM(pnl),0) as total FROM ledger WHERE user_id=$1 AND recorded_at::text LIKE $2", [userId, today]);
  return Number(res.rows[0]?.total || 0);
}

initPool();

module.exports = { initPool, ensureSchema, insertOrder, findOrderById, appendLedger, todaysLoss, pool };
