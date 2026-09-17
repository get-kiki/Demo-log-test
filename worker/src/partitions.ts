import { pool } from "./db.js";

// เรียก maintain_logs_partitions() (สร้างไว้แล้วใน db/migrations/004_tenant_partitions.sql)
// ซ้ำทุก tick ของ worker (ทุก 60 วินาที ตาม INTERVAL_MS ใน main.ts) แทนที่จะพึ่ง pg_cron
// หรือ cron container แยก — เหตุผล:
//   1) image postgres:16-alpine ที่ docker-compose.yml ใช้อยู่เป็นตัวเปล่า ไม่มี
//      extension pg_cron ติดมาด้วย ต้องเปลี่ยนไป custom image ที่ compile เพิ่ม
//   2) worker เป็น long-running process ที่มี connection pool ต่อ Postgres อยู่แล้ว
//      และมี loop ทุก 60 วินาทีอยู่แล้ว (สำหรับ evaluate alert rule) — ใช้ loop เดิม
//      เรียกฟังก์ชันนี้ซ้ำเลย ไม่ต้องเพิ่ม service/extension ใหม่เข้า docker-compose.yml
//
// ปลอดภัยที่จะเรียกถี่ขนาดนี้เพราะฟังก์ชันฝั่ง Postgres เป็น idempotent (เช็ค pg_class
// ก่อนทุกครั้ง ค่อย CREATE/DROP เฉพาะตอนที่ partition ยังไม่มี/หมดอายุจริงเท่านั้น)
// ต้นทุนตอนไม่มีอะไรต้องทำคือแค่ query แคตาล็อกเล็กๆ ไม่กี่ตัว ถูกกว่าความเสี่ยงที่จะ
// ลืม/พลาด cron schedule แยกต่างหากไปเยอะ
export async function maintainLogPartitions(): Promise<void> {
  await pool.query("SELECT maintain_logs_partitions()");
}
