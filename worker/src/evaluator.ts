import { pool } from "./db.js";
import type { AlertRule } from "./rules-repository.js";
import { sendWebhook } from "./channels/webhook.js";
import { sendEmail } from "./channels/email.js";

export async function evaluateRule(rule: AlertRule): Promise<void> {
  const { condition } = rule;
  const groupCols = condition.group_by; // ผ่าน AlertCondition.parse() มาแล้ว (enum) ปลอดภัยที่จะต่อ SQL ตรงๆ

  const conditions: string[] = [`tenant = $1`, `ts >= now() - $2::interval`];
  const params: unknown[] = [rule.tenant, `${condition.window_minutes} minutes`];

  if (condition.action) {
    params.push(condition.action);
    conditions.push(`action = $${params.length}`);
  }
  if (condition.event_type_contains) {
    params.push(`%${condition.event_type_contains}%`);
    conditions.push(`event_type ILIKE $${params.length}`);
  }
  params.push(condition.threshold);
  const thresholdParam = params.length;

  const groupColsSql = groupCols.map((c) => (c === "user" ? `"user"` : c)).join(", ");
  const sql = `
    SELECT ${groupColsSql}, count(*)::int AS hits
    FROM logs
    WHERE ${conditions.join(" AND ")}
    GROUP BY ${groupColsSql}
    HAVING count(*) >= $${thresholdParam}
  `;

  const result = await pool.query(sql, params);

  for (const row of result.rows) {
    const groupValues = Object.fromEntries(groupCols.map((c) => [c, row[c]]));
    const dedupeKey = groupCols.map((c) => String(row[c])).join("|");
    const details = { ...groupValues, hits: row.hits, window_minutes: condition.window_minutes, threshold: condition.threshold };

    // ON CONFLICT ต้องระบุ WHERE ให้ตรงกับ partial unique index เป๊ะ (ดู
    // db/migrations/001_init.sql: CREATE UNIQUE INDEX ... WHERE status = 'open')
    // RETURNING id ว่างเปล่า = ถูกปฏิเสธเพราะมี alert เปิดอยู่แล้วสำหรับกลุ่มนี้
    // (ยังไม่ถูก ack/close) = dedupe ทำงาน ไม่ต้องแจ้งซ้ำ
    const inserted = await pool.query(
      `INSERT INTO alert_events (rule_id, tenant, dedupe_key, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (rule_id, dedupe_key) WHERE status = 'open' DO NOTHING
       RETURNING id`,
      [rule.id, rule.tenant, dedupeKey, details]
    );

    const isNewAlert = inserted.rows.length > 0;
    if (isNewAlert && rule.channel === "webhook") {
      await sendWebhook(rule, { rule_name: rule.name, ...details });
    } else if (isNewAlert && rule.channel === "email") {
      await sendEmail(rule, { rule_name: rule.name, ...details });
    }
  }
}
