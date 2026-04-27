#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Ensure migrations table exists before we query it.
  await client.query(`CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  )`);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const id = file;
    const res = await client.query('SELECT id FROM migrations WHERE id = $1', [id]);
    if (res.rows.length) {
      console.log('Skipping', id);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log('Applying', id);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations(id) VALUES($1)', [id]);
      await client.query('COMMIT');
      console.log('Applied', id);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Failed to apply', id, e);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('Migrations complete');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
