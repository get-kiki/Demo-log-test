import bcrypt from "bcryptjs";
import { pool } from "../db.js";

export interface ApiKeyMatch {
  tenant: string;
  source: string | null;
}

// เหมือน users.password_hash เป๊ะ (ดู auth/password.ts): เก็บแค่ bcrypt hash
// ของ key ไม่เก็บค่าดิบ ถ้า DB รั่วคนอ่านไม่ได้ key ที่ยังเอาไปยิง /ingest ต่อได้
//
// เทียบ SQL ตรงๆ ไม่ได้ (WHERE key_hash = ...) เพราะ bcrypt สุ่ม salt ใหม่ทุก
// แถว hash เดียวกันของ key เดียวกันจะได้ค่าไม่ซ้ำกันทุกครั้งที่สร้าง ต้องวน
// bcrypt.compare() ทีละแถวแทน — จำนวนแถวของตารางนี้เล็กมาก (seed ไว้แค่ 1 key
// ต่อ tenant/source) O(n) ต่อ request จึงไม่ใช่ปัญหาที่สเกลเดโมนี้
export async function findTenantByApiKey(rawKey: string): Promise<ApiKeyMatch | null> {
  const result = await pool.query<{ tenant: string; source: string | null; key_hash: string }>(
    `SELECT tenant, source, key_hash FROM api_keys WHERE revoked_at IS NULL`
  );
  for (const row of result.rows) {
    if (await bcrypt.compare(rawKey, row.key_hash)) {
      return { tenant: row.tenant, source: row.source };
    }
  }
  return null;
}
