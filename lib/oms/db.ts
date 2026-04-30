/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared typed PG pool for the OMS / risk / audit modules.
 * Singleton; reused across cold-start.
 */
import { Pool, type QueryResult, type QueryResultRow } from "pg";

let _pool: Pool | null = null;

export function pool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");
  _pool = new Pool({ connectionString: url, max: 4 });
  _pool.on("error", (e) => console.error("[oms/db] pool error:", e));
  return _pool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool().query<T>(text, params as any);
}
