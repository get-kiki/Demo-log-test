import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTenants } from "../../backend/src/logs/tenant-scope.js";
import { searchLogs } from "../../backend/src/logs/repository.js";
import type { RequestScope } from "../../backend/src/auth/middleware.js";

// scope จำลอง viewer ของ demoA เพียง tenant เดียว — ตรงกับ user จริงใน db/seed/seed.sql
const viewerDemoA: RequestScope = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "viewer@demoa.local",
  role: "viewer",
  tenants: ["demoA"],
};

const adminMultiTenant: RequestScope = {
  userId: "00000000-0000-0000-0000-000000000002",
  email: "admin@example.local",
  role: "admin",
  tenants: ["demoA", "demoB"],
};

test("resolveTenants: ไม่ระบุ tenant -> คืน tenant ทั้งหมดที่ scope มีสิทธิ์", () => {
  assert.deepEqual(resolveTenants(viewerDemoA, undefined), ["demoA"]);
  assert.deepEqual(resolveTenants(adminMultiTenant, undefined), ["demoA", "demoB"]);
});

test("resolveTenants: ระบุ tenant ที่ scope มีสิทธิ์ -> คืนเฉพาะ tenant นั้น", () => {
  assert.deepEqual(resolveTenants(adminMultiTenant, "demoB"), ["demoB"]);
});

test("resolveTenants: ระบุ tenant ที่ scope ไม่มีสิทธิ์ -> คืน null (forbidden)", () => {
  assert.equal(resolveTenants(viewerDemoA, "demoB"), null);
});

// ทดสอบผ่าน searchLogs() ของจริง (ฟังก์ชันเดียวกับที่ route GET /api/v1/search เรียกใช้)
// ไม่ใช่แค่ resolveTenants() เฉยๆ — พิสูจน์ว่า endpoint จริงบล็อกด้วย ไม่ใช่แค่ helper ที่
// เทสผ่านแต่บังเอิญลืมเอาไปเรียกใช้จริงตรงไหนสักจุด
//
// ปลอดภัยที่จะเทสแบบนี้ได้โดยไม่ต้องมี Postgres รันอยู่เลย เพราะ searchLogs() เช็ค
// resolveTenants() เป็นบรรทัดแรกเสมอ แล้ว return "forbidden_tenant" ทันที "ก่อน" จะแตะ
// pool.query() เลยด้วยซ้ำ (ดู backend/src/logs/repository.ts) — เคสนี้จึงไม่มีการเชื่อมต่อ
// DB เกิดขึ้นจริงในเทส ต่างจาก "เคสที่อนุญาต" ที่เดินทะลุไปเรียก pool.query() จริง ซึ่งต้อง
// มี Postgres รันอยู่ (เป็น integration test คนละกลุ่ม ไม่ได้เทสในไฟล์นี้)
test("searchLogs: viewer ของ demoA ขอดู tenant demoB -> forbidden_tenant (ไม่แตะ DB เลย)", async () => {
  const result = await searchLogs(viewerDemoA, {
    from: "2025-01-01T00:00:00Z",
    to: "2025-01-02T00:00:00Z",
    tenant: "demoB",
    limit: 50,
  });
  assert.equal(result, "forbidden_tenant");
});
