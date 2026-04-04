const fs = require('fs').promises;
const path = require('path');

const SUB_PATH = path.join(process.cwd(), 'data', 'subscriptions.json');

async function _ensure() {
  await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  try { await fs.access(SUB_PATH); } catch (e) { await fs.writeFile(SUB_PATH, '[]'); }
}

async function _read() {
  try { return JSON.parse(await fs.readFile(SUB_PATH, 'utf-8')); } catch (e) { return []; }
}

async function isActiveSubscription(userId) {
  await _ensure();
  // if Postgres configured, check subscriptions table
  try {
    const db = require('../db');
    if (db.pool) {
      const res = await db.pool.query('SELECT active, expires_at FROM subscriptions WHERE user_id=$1 ORDER BY id DESC LIMIT 1', [userId]);
      const row = res.rows[0];
      if (!row) return false;
      if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
      return row.active !== false;
    }
  } catch (e) {
    // fallback to file
  }

  const subs = await _read();
  const found = subs.find((s) => s.userId === userId);
  if (!found) return false;
  if (found.expiresAt && new Date(found.expiresAt) < new Date()) return false;
  return found.active !== false;
}

module.exports = { isActiveSubscription };
