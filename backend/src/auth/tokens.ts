import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { requireEnv } from "../env.js";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 วัน

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: "admin" | "viewer";
  tenants: string[];
}

export interface RefreshTokenPayload {
  sub: string; // user id เท่านั้น — ของจริงที่ตัดสิน valid/revoked อยู่ที่ DB
  jti: string; // สุ่มใหม่ทุกครั้ง — กัน token ชนกันเป๊ะเวลาออกในวินาทีเดียวกัน
  // (jwt.sign ใส่ iat ละเอียดระดับวินาที ถ้าไม่มี jti, login แล้ว refresh ทันที
  // จะได้ payload {sub, iat, exp} เหมือนกันเป๊ะ → HMAC เป็น deterministic →
  // ได้ token string เดิมซ้ำ → 2 แถวใน sessions ชน hash กัน → reuse detection
  // ทำงานผิดพลาดได้ — เจอบั๊กนี้จริงตอนทดสอบ)
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, requireEnv("JWT_ACCESS_SECRET"), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, requireEnv("JWT_ACCESS_SECRET")) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, jti: randomUUID() };
  return jwt.sign(payload, requireEnv("JWT_REFRESH_SECRET"), {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, requireEnv("JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}

// ใช้แปลง refresh token ดิบเป็นค่าที่เก็บ/ค้นหาใน sessions.refresh_token_hash —
// ต้องเรียกฟังก์ชันเดียวกันนี้ทั้งตอน insert (login) และตอน lookup (refresh/
// logout) ไม่งั้น hash จะไม่ตรงกัน
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
