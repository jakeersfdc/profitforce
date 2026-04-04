const fs = require('fs').promises;
const path = require('path');
const db = require('./db');

const USERS_PATH = path.join(process.cwd(), 'data', 'users.json');

async function _ensure() {
  await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  try { await fs.access(USERS_PATH); } catch (e) { await fs.writeFile(USERS_PATH, '[]'); }
}

async function getUserProfile(userId) {
  if (!userId) return null;
  // prefer DB
  try {
    if (db.pool) {
      const res = await db.pool.query('SELECT id, email, capital, risk_per_trade_pct FROM users WHERE id=$1 LIMIT 1', [userId]);
      if (res.rows && res.rows[0]) return res.rows[0];
    }
  } catch (e) {
    // fallback to file
  }

  await _ensure();
  try {
    const raw = await fs.readFile(USERS_PATH, 'utf-8');
    const arr = JSON.parse(raw || '[]');
    const u = arr.find((x) => x.id === userId);
    if (u) return u;
  } catch (e) {}
  return null;
}

async function upsertUserProfile(profile) {
  if (!profile || !profile.id) throw new Error('missing id');
  try {
    if (db.pool) {
      await db.pool.query(
        `INSERT INTO users(id,email,capital,risk_per_trade_pct) VALUES($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, capital=EXCLUDED.capital, risk_per_trade_pct=EXCLUDED.risk_per_trade_pct`,
        [profile.id, profile.email || null, profile.capital || 100000, profile.risk_per_trade_pct || 0.02]
      );
      return;
    }
  } catch (e) {
    // fallback to file
  }

  await _ensure();
  const raw = await fs.readFile(USERS_PATH, 'utf-8');
  const arr = JSON.parse(raw || '[]');
  const idx = arr.findIndex((x) => x.id === profile.id);
  const entry = { id: profile.id, email: profile.email || null, capital: profile.capital || 100000, risk_per_trade_pct: profile.risk_per_trade_pct || 0.02 };
  if (idx >= 0) arr[idx] = entry; else arr.push(entry);
  await fs.writeFile(USERS_PATH, JSON.stringify(arr, null, 2));
}

module.exports = { getUserProfile, upsertUserProfile };
