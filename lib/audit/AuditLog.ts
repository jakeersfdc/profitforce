/**
 * AuditLog — tamper-evident append-only log with SHA-256 hash chain.
 *
 * Every row's hash = SHA-256(prev_hash || category || action || ref_id || JSON(payload) || created_at).
 * Verifying integrity = walk rows in order, recompute hash, compare. A single
 * tampered or removed row breaks the chain.
 *
 * Categories:
 *   ORDER  — new order, modify, cancel
 *   FILL   — execution/partial-fill
 *   RISK   — risk-engine block / approve
 *   KILL   — kill-switch toggled
 *   SIGNAL — strategy emitted a signal
 *   AUTH   — broker connect / disconnect
 */
import { createHash } from "crypto";
import { q } from "@/lib/oms/db";

export type AuditCategory = "ORDER" | "FILL" | "RISK" | "KILL" | "SIGNAL" | "AUTH";

export interface AuditEvent {
  clerkId: string | null;
  category: AuditCategory;
  action: string;
  refId?: string | null;
  payload?: Record<string, unknown>;
}

interface AuditRow {
  id: number;
  clerk_id: string | null;
  category: string;
  action: string;
  ref_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  created_at: Date;
}

function rowHash(prev: string, e: AuditEvent, createdAtIso: string): string {
  const payloadStr = JSON.stringify(e.payload ?? {});
  const buf = `${prev}|${e.category}|${e.action}|${e.refId ?? ""}|${payloadStr}|${createdAtIso}`;
  return createHash("sha256").update(buf).digest("hex");
}

export async function appendAudit(e: AuditEvent): Promise<{ id: number; hash: string }> {
  const prevRes = await q<{ hash: string }>(
    "SELECT hash FROM oms_audit_log ORDER BY id DESC LIMIT 1"
  );
  const prevHash = prevRes.rows[0]?.hash ?? "";
  const createdAt = new Date().toISOString();
  const hash = rowHash(prevHash, e, createdAt);
  const ins = await q<{ id: number }>(
    `INSERT INTO oms_audit_log (clerk_id, category, action, ref_id, payload, prev_hash, hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [e.clerkId, e.category, e.action, e.refId ?? null, e.payload ?? {}, prevHash, hash, createdAt]
  );
  return { id: ins.rows[0].id, hash };
}

/**
 * Re-walk the entire log and return integrity status.
 * O(n); for very large logs run in batches off-hours.
 */
export async function verifyAuditChain(limit?: number): Promise<{
  ok: boolean;
  checked: number;
  brokenAtId?: number;
}> {
  const sql = limit
    ? "SELECT * FROM oms_audit_log ORDER BY id ASC LIMIT $1"
    : "SELECT * FROM oms_audit_log ORDER BY id ASC";
  const res = await q<AuditRow>(sql, limit ? [limit] : []);
  let prev = "";
  for (const r of res.rows) {
    if (r.prev_hash !== prev) {
      return { ok: false, checked: res.rows.indexOf(r), brokenAtId: r.id };
    }
    const expected = rowHash(prev, {
      clerkId: r.clerk_id,
      category: r.category as AuditCategory,
      action: r.action,
      refId: r.ref_id,
      payload: r.payload,
    }, new Date(r.created_at).toISOString());
    if (expected !== r.hash) {
      return { ok: false, checked: res.rows.indexOf(r), brokenAtId: r.id };
    }
    prev = r.hash;
  }
  return { ok: true, checked: res.rows.length };
}
