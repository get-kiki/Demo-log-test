import { pool } from "../db.js";
import type { AlertCondition } from "@log-platform/shared";

export interface AlertRule {
  id: string;
  tenant: string;
  name: string;
  condition: AlertCondition;
  channel: "ui" | "webhook" | "email";
  channel_config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

// pg คืน created_at (TIMESTAMPTZ) เป็น JS Date object ไม่ใช่ string เหมือนที่เจอ
// มาแล้วตอนทำ logs/repository.ts — ต้อง toISOString() เองเสมอ ไม่งั้น Zod
// response schema (z.string()) reject ตอน serialize
function rowToRule(row: any): AlertRule {
  return { ...row, created_at: row.created_at.toISOString() };
}

export async function listRules(tenants: string[]): Promise<AlertRule[]> {
  const result = await pool.query(
    `SELECT id, tenant, name, condition, channel, channel_config, enabled, created_at
     FROM alert_rules WHERE tenant = ANY($1::text[]) ORDER BY created_at DESC`,
    [tenants]
  );
  return result.rows.map(rowToRule);
}

export async function createRule(input: {
  tenant: string;
  name: string;
  condition: AlertCondition;
  channel: "ui" | "webhook" | "email";
  channel_config: Record<string, unknown>;
}): Promise<AlertRule> {
  const result = await pool.query(
    `INSERT INTO alert_rules (tenant, name, condition, channel, channel_config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant, name, condition, channel, channel_config, enabled, created_at`,
    [input.tenant, input.name, input.condition, input.channel, input.channel_config]
  );
  return rowToRule(result.rows[0]);
}

// คืน null ถ้าไม่เจอ "หรือ" เจอแต่ tenant ไม่ตรง (สองเคสนี้ route ต้องตอบ 404
// เหมือนกันเป๊ะ — ไม่ตอบ 403 ให้ต่างจาก "ไม่เจอเลย" เพราะงั้นจะเผลอบอกผู้โจมตี
// ว่า id นี้มีอยู่จริงแค่ tenant ไม่ตรง (id enumeration)
export async function updateRule(
  id: string,
  tenants: string[],
  patch: Partial<Pick<AlertRule, "name" | "condition" | "channel" | "channel_config" | "enabled">>
): Promise<AlertRule | null> {
  const result = await pool.query(
    `UPDATE alert_rules SET
       name = COALESCE($3, name),
       condition = COALESCE($4, condition),
       channel = COALESCE($5, channel),
       channel_config = COALESCE($6, channel_config),
       enabled = COALESCE($7, enabled)
     WHERE id = $1 AND tenant = ANY($2::text[])
     RETURNING id, tenant, name, condition, channel, channel_config, enabled, created_at`,
    [id, tenants, patch.name, patch.condition, patch.channel, patch.channel_config, patch.enabled]
  );
  return result.rows[0] ? rowToRule(result.rows[0]) : null;
}

export async function deleteRule(id: string, tenants: string[]): Promise<boolean> {
  const result = await pool.query(`DELETE FROM alert_rules WHERE id = $1 AND tenant = ANY($2::text[])`, [id, tenants]);
  return (result.rowCount ?? 0) > 0;
}

export interface TestMatch {
  group: Record<string, string>;
  hits: number;
  would_trigger: boolean;
}

// SQL แบบเดียวกับที่ worker/src/evaluator.ts ใช้ประเมิน rule จริง (แยกไฟล์กัน
// เพราะ backend กับ worker คนละ pool คนละ service — ไม่คุ้มตั้ง shared package
// แค่ query เดียว) ต่างกันจุดเดียว: ไม่กรอง HAVING count >= threshold ทิ้งกลุ่ม
// ที่ไม่ถึง เพราะ admin ต้องเห็นภาพรวมทั้งหมดก่อนตัดสินใจตั้ง threshold เท่าไหร่
// ถึงจะเหมาะ ไม่ใช่แค่ pass/fail ของค่าที่พิมพ์ไว้ตอนนั้น
export async function testCondition(
  tenant: string,
  condition: AlertCondition,
  from: string,
  to: string
): Promise<TestMatch[]> {
  const groupCols = condition.group_by;
  const conditions: string[] = [`tenant = $1`, `ts >= $2`, `ts <= $3`];
  const params: unknown[] = [tenant, from, to];

  if (condition.action) {
    params.push(condition.action);
    conditions.push(`action = $${params.length}`);
  }
  if (condition.event_type_contains) {
    params.push(`%${condition.event_type_contains}%`);
    conditions.push(`event_type ILIKE $${params.length}`);
  }

  const groupColsSql = groupCols.map((c) => (c === "user" ? `"user"` : c)).join(", ");
  const sql = `
    SELECT ${groupColsSql}, count(*)::int AS hits
    FROM logs
    WHERE ${conditions.join(" AND ")}
    GROUP BY ${groupColsSql}
    ORDER BY hits DESC
    LIMIT 20
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    group: Object.fromEntries(groupCols.map((c) => [c, String(row[c])])),
    hits: row.hits,
    would_trigger: row.hits >= condition.threshold,
  }));
}
