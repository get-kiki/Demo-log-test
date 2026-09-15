import nodemailer from "nodemailer";
import type { AlertRule } from "../rules-repository.js";

// transporter ตัวเดียวใช้ร่วมกันทั้ง process (เหมือน pool ของ pg) — สร้างใหม่ทุก
// ครั้งที่ส่งอีเมลจะเปิด/ปิด SMTP connection ซ้ำโดยไม่จำเป็น
//
// auth ใส่เฉพาะตอนมี SMTP_USER จริง (SMTP provider จริงตอน production) — Mailhog
// (default ตอน dev/เดโม ดู docker-compose.yml) ไม่รองรับคำสั่ง AUTH เลย ถ้าส่ง
// auth ไปให้ handshake ล้มเหลวทันที
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "mailhog",
  port: Number(process.env.SMTP_PORT ?? 1025),
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

export async function sendEmail(rule: AlertRule, payload: Record<string, unknown>): Promise<void> {
  const to = rule.channel_config?.to;
  if (typeof to !== "string") {
    console.error(`[email] rule ${rule.id} (${rule.name}) channel=email แต่ channel_config.to ไม่ใช่ string`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "alerts@log-platform.local",
      to,
      subject: `[Alert] ${rule.name}`,
      text: JSON.stringify({ rule_id: rule.id, tenant: rule.tenant, ...payload }, null, 2),
    });
  } catch (err) {
    // เหมือน webhook.ts — ส่งอีเมลพังไม่ควรทำให้ evaluator หลักพังตาม alert
    // ถูกบันทึกลง DB สำเร็จไปแล้ว (เห็นได้ผ่าน GET /alerts) แค่การแจ้งเตือน
    // ภายนอกไม่ถึงเท่านั้น
    console.error(`[email] rule ${rule.id}: ส่งไม่สำเร็จ`, err);
  }
}
