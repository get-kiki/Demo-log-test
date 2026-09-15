import { pool } from "../db.js";

export interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  tenant: string;
  triggered_at: string;
  status: "open" | "ack" | "closed";
  dedupe_key: string;
  details: Record<string, unknown>;
}

// เจอปัญหาเดียวกับ rules-repository.ts: TIMESTAMPTZ คืนมาเป็น Date ต้อง
// toISOString() เอง
function rowToAlert(row: any): AlertEvent {
  return { ...row, triggered_at: row.triggered_at.toISOString() };
}

export async function listAlerts(tenants: string[], status?: string): Promise<AlertEvent[]> {
  const params: unknown[] = [tenants];
  let statusFilter = "";
  if (status) {
    params.push(status);
    statusFilter = `AND status = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT ae.id, ae.rule_id, ar.name AS rule_name, ae.tenant, ae.triggered_at,
            ae.status, ae.dedupe_key, ae.details
     FROM alert_events ae
     JOIN alert_rules ar ON ar.id = ae.rule_id
     WHERE ae.tenant = ANY($1::text[]) ${statusFilter}
     ORDER BY ae.triggered_at DESC`,
    params
  );
  return result.rows.map(rowToAlert);
}

export async function updateAlertStatus(
  id: string,
  tenants: string[],
  status: "ack" | "closed"
): Promise<AlertEvent | null> {
  // RETURNING ทำ JOIN ตรงๆ ไม่ได้ — ใช้ subquery แทนเพื่อยังได้ rule_name กลับมา
  // ในการเรียกเดียว ไม่ต้อง SELECT ซ้ำอีกรอบ
  const result = await pool.query(
    `UPDATE alert_events SET status = $3
     WHERE id = $1 AND tenant = ANY($2::text[])
     RETURNING id, rule_id, tenant, triggered_at, status, dedupe_key, details,
       (SELECT name FROM alert_rules WHERE id = alert_events.rule_id) AS rule_name`,
    [id, tenants, status]
  );
  return result.rows[0] ? rowToAlert(result.rows[0]) : null;
}
