import { pool } from "./db.js";
import { AlertCondition } from "@log-platform/shared";

export interface AlertRule {
  id: string;
  tenant: string;
  name: string;
  condition: AlertCondition;
  channel: "ui" | "webhook" | "email";
  channel_config: Record<string, unknown>;
}

export async function getEnabledRules(): Promise<AlertRule[]> {
  const result = await pool.query(
    `SELECT id, tenant, name, condition, channel, channel_config FROM alert_rules WHERE enabled = true`
  );
  return result.rows.map((row) => ({
    ...row,
    condition: AlertCondition.parse(row.condition),
  }));
}
