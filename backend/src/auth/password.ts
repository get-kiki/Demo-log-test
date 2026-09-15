import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// เข้ากันได้กับ hash ที่ db/seed/seed.sql สร้างด้วย pgcrypto's crypt(pw,
// gen_salt('bf')) เพราะเป็น bcrypt format เดียวกัน ($2a$/$2b$) — ไม่ใช่ argon2id
// ตามที่เอกสาร architecture แนะนำไว้เดิม เปลี่ยนไม่ได้เพราะ seed ต้องรันได้ก่อน
// backend จะมีด้วยซ้ำ (ดูคอมเมนต์ใน seed.sql)
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
