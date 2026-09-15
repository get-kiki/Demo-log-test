import type { AlertRule } from "../rules-repository.js";

export async function sendWebhook(rule: AlertRule, payload: Record<string, unknown>): Promise<void> {
  const url = rule.channel_config?.url;
  if (typeof url !== "string") {
    console.error(`[webhook] rule ${rule.id} (${rule.name}) channel=webhook แต่ channel_config.url ไม่ใช่ string`);
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_id: rule.id, tenant: rule.tenant, ...payload }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[webhook] rule ${rule.id}: ${url} ตอบ ${res.status}`);
    }
  } catch (err) {
    // webhook พังไม่ควรทำให้ evaluator หลักพังตาม — alert ถูกบันทึกลง DB
    // สำเร็จไปแล้ว (เห็นได้ผ่าน GET /alerts) แค่การแจ้งเตือนภายนอกไม่ถึงเท่านั้น
    console.error(`[webhook] rule ${rule.id}: ส่งไม่สำเร็จ`, err);
  }
}
