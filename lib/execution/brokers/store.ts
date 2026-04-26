/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Encrypted broker-credential vault.
 *
 * Every credential blob is JSON-encrypted at rest with AES-256-GCM
 * (see lib/security/crypto.ts). We never log decrypted values.
 */
import { Pool } from "pg";
import { encryptJson, decryptJson } from "@/lib/security/crypto";
import type { BrokerProvider, BrokerCredentials } from "./types";

let _pool: Pool | null = null;
function pool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");
  _pool = new Pool({ connectionString: url, max: 4 });
  return _pool;
}

export interface BrokerConnectionRow {
  id: number;
  clerkId: string;
  provider: BrokerProvider;
  accountId: string | null;
  accountName: string | null;
  status: "active" | "revoked" | "expired";
  expiresAt: Date | null;
  scope: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrokerConnectionWithCreds extends BrokerConnectionRow {
  credentials: BrokerCredentials;
}

function rowFrom(r: any): BrokerConnectionRow {
  return {
    id: r.id,
    clerkId: r.clerk_id,
    provider: r.provider,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    scope: r.scope,
    metadata: r.metadata || {},
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export async function listConnections(clerkId: string): Promise<BrokerConnectionRow[]> {
  const res = await pool().query(
    `SELECT id, clerk_id, provider, account_id, account_name, status, expires_at, scope, metadata, created_at, updated_at
     FROM broker_connections WHERE clerk_id = $1 ORDER BY provider`,
    [clerkId]
  );
  return res.rows.map(rowFrom);
}

export async function getConnection(
  clerkId: string,
  provider: BrokerProvider
): Promise<BrokerConnectionWithCreds | null> {
  const res = await pool().query(
    `SELECT id, clerk_id, provider, account_id, account_name, status, expires_at, scope, metadata, enc_payload, created_at, updated_at
     FROM broker_connections WHERE clerk_id = $1 AND provider = $2 LIMIT 1`,
    [clerkId, provider]
  );
  const r = res.rows[0];
  if (!r) return null;
  let credentials: BrokerCredentials = {};
  try {
    credentials = decryptJson<BrokerCredentials>(r.enc_payload);
  } catch (e) {
    console.error(`[brokers/store] decrypt failed for ${clerkId}/${provider}:`, (e as Error).message);
    throw new Error("vault_decrypt_failed");
  }
  return { ...rowFrom(r), credentials };
}

export async function upsertConnection(args: {
  clerkId: string;
  provider: BrokerProvider;
  accountId?: string | null;
  accountName?: string | null;
  credentials: BrokerCredentials;
  scope?: string | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<BrokerConnectionRow> {
  const enc = encryptJson(args.credentials);
  const res = await pool().query(
    `INSERT INTO broker_connections
       (clerk_id, provider, account_id, account_name, enc_payload, scope, expires_at, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     ON CONFLICT (clerk_id, provider) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       account_name = EXCLUDED.account_name,
       enc_payload = EXCLUDED.enc_payload,
       scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata,
       status = 'active',
       updated_at = NOW()
     RETURNING id, clerk_id, provider, account_id, account_name, status, expires_at, scope, metadata, created_at, updated_at`,
    [
      args.clerkId,
      args.provider,
      args.accountId ?? null,
      args.accountName ?? null,
      enc,
      args.scope ?? null,
      args.expiresAt ?? null,
      JSON.stringify(args.metadata ?? {}),
    ]
  );
  return rowFrom(res.rows[0]);
}

export async function disconnect(clerkId: string, provider: BrokerProvider): Promise<void> {
  await pool().query(
    `UPDATE broker_connections SET status='revoked', enc_payload='', updated_at=NOW()
     WHERE clerk_id=$1 AND provider=$2`,
    [clerkId, provider]
  );
}

export async function setDefaultBroker(clerkId: string, provider: BrokerProvider): Promise<void> {
  await pool().query(
    `INSERT INTO users (clerk_id, default_broker) VALUES ($1, $2)
     ON CONFLICT (clerk_id) DO UPDATE SET default_broker = EXCLUDED.default_broker`,
    [clerkId, provider]
  );
}

export async function getDefaultBroker(clerkId: string): Promise<BrokerProvider | null> {
  const res = await pool().query(`SELECT default_broker FROM users WHERE clerk_id=$1 LIMIT 1`, [clerkId]);
  return (res.rows[0]?.default_broker as BrokerProvider) ?? null;
}

// ─── OAuth state (CSRF) ────────────────────────────────────────────────────

export async function saveOAuthState(args: {
  state: string;
  clerkId: string;
  provider: BrokerProvider;
  returnUrl?: string | null;
}): Promise<void> {
  await pool().query(
    `INSERT INTO broker_oauth_states (state, clerk_id, provider, return_url) VALUES ($1, $2, $3, $4)`,
    [args.state, args.clerkId, args.provider, args.returnUrl ?? null]
  );
}

export async function consumeOAuthState(state: string): Promise<{
  clerkId: string;
  provider: BrokerProvider;
  returnUrl: string | null;
} | null> {
  const res = await pool().query(
    `DELETE FROM broker_oauth_states WHERE state=$1 AND expires_at > NOW()
     RETURNING clerk_id, provider, return_url`,
    [state]
  );
  const r = res.rows[0];
  if (!r) return null;
  return { clerkId: r.clerk_id, provider: r.provider, returnUrl: r.return_url };
}
