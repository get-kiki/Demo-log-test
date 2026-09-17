import "./setup-env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../worker/src/db.js";
import { evaluateRule } from "../../worker/src/evaluator.js";
import { getEnabledRules } from "../../worker/src/rules-repository.js";
import type { AlertRule } from "../../worker/src/rules-repository.js";

// ทดสอบ alert rule "ที่มีอยู่แล้วจริง" จาก db/seed/seed.sql — ไม่ได้สร้าง tenant/rule
// ปลอมขึ้นมาเองแบบรอบก่อน แต่อ่าน rule จริง ("Repeated failed login (5 min)" ของ
// tenant demoA: action=deny, event_type มีคำว่า login, threshold=3 ครั้งใน 5 นาที,
// group_by src_ip) ผ่าน getEnabledRules() ตัวเดียวกับที่ worker/src/main.ts เรียกใช้จริง
// ทุก 60 วินาที แล้วยิง log จำลองให้ตรงเงื่อนไข rule นั้นพอดี
//
// precondition: ต้องรัน `make seed` (หรือ db/seed/seed.sql ตรงๆ) มาก่อนแล้ว ไม่งั้นจะ
// หา rule นี้ไม่เจอ (ต่างจาก tests/backend/tenant-scope.test.ts ที่ไม่ต้องมี Postgres
// หรือ seed อะไรเลย)
//
// รัน:
//   docker compose up -d postgres --wait
//   make seed
//   npm run test:integration

const TEST_SRC_IP = "203.0.113.99"; // TEST-NET-3 (RFC 5737) — สงวนไว้สำหรับเอกสาร/ทดสอบ ไม่ใช่ IP จริงที่ใครส่งเข้ามา
let rule: AlertRule;

before(async () => {
  const rules = await getEnabledRules();
  const found = rules.find((r) => r.tenant === "demoA" && r.name === "Repeated failed login (5 min)");
  if (!found) {
    throw new Error(
      "ไม่พบ rule 'Repeated failed login (5 min)' ของ demoA ใน alert_rules — รัน `make seed` ก่อนแล้วค่อยรันเทสนี้"
    );
  }
  rule = found;

  // เคลียร์ของค้างจากรอบก่อน (เผื่อ after() รอบก่อนพังกลางคัน) — ถ้ามี alert_events
  // สถานะ open ค้างอยู่แล้วสำหรับ (rule.id, TEST_SRC_IP) การ insert รอบนี้จะโดน
  // ON CONFLICT DO NOTHING เงียบๆ ทำให้เทสเช็คผิดว่า "ไม่มี alert ใหม่เกิดขึ้น"
  await pool.query(`DELETE FROM alert_events WHERE rule_id = $1 AND dedupe_key = $2`, [rule.id, TEST_SRC_IP]);
  await pool.query(`DELETE FROM logs WHERE tenant = 'demoA' AND src_ip = $1`, [TEST_SRC_IP]);

  // จำลอง "login fail จาก IP เดิม" ให้ครบตาม threshold ของ rule จริงพอดี (3 ครั้ง)
  // ภายในหน้าต่าง 5 นาที — insert ตรงเข้า logs เหมือนที่ Vector postgres sink จะทำจริง
  // ตอน ingest (เทสนี้ไม่ได้ทดสอบ ingest จึงข้าม Vector ไปเลย)
  const now = new Date();
  for (let i = 0; i < rule.condition.threshold; i++) {
    const ts = new Date(now.getTime() - i * 30_000); // ห่างกันทีละ 30 วิ อยู่ในหน้าต่าง 5 นาทีแน่นอน
    await pool.query(
      `INSERT INTO logs (event_id, ts, ingested_at, tenant, source, event_type, severity, action, src_ip, attrs, tags)
       VALUES (gen_random_uuid(), $1, now(), 'demoA', 'api', 'app_login_failed', 6, 'deny', $2, '{}'::jsonb, '{}')`,
      [ts.toISOString(), TEST_SRC_IP]
    );
  }
});

after(async () => {
  // ลบเฉพาะแถวที่เทสนี้สร้างเอง ไม่แตะ rule (เป็น fixture ที่ใช้ร่วมกัน) หรือ log
  // อื่นของ demoA เลย
  await pool.query(`DELETE FROM alert_events WHERE rule_id = $1 AND dedupe_key = $2`, [rule.id, TEST_SRC_IP]);
  await pool.query(`DELETE FROM logs WHERE tenant = 'demoA' AND src_ip = $1`, [TEST_SRC_IP]);
  await pool.end();
});

test("evaluateRule: rule จริงจาก seed ('Repeated failed login') -> เกิด alert เมื่อ login fail ครบ threshold", async () => {
  await evaluateRule(rule);

  const result = await pool.query<{ status: string; details: { hits: number } }>(
    `SELECT status, details FROM alert_events WHERE rule_id = $1 AND dedupe_key = $2`,
    [rule.id, TEST_SRC_IP]
  );

  assert.equal(result.rows.length, 1, "ควรมี alert_events เกิดขึ้นใหม่พอดี 1 แถวสำหรับ IP นี้");
  assert.equal(result.rows[0].status, "open");
  assert.equal(result.rows[0].details.hits, rule.condition.threshold);
});
