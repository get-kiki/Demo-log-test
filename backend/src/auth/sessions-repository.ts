import { pool } from "../db.js";
import { hashToken, REFRESH_TOKEN_TTL_SECONDS } from "./tokens.js";

export interface SessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

export async function createSession(userId: string, refreshToken: string): Promise<void> {
  await pool.query(
    `INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, now() + $3 * interval '1 second')`,
    [userId, hashToken(refreshToken), REFRESH_TOKEN_TTL_SECONDS]
  );
}

// จงใจไม่กรอง revoked_at IS NULL ที่นี่ — /refresh ต้องแยกได้ระหว่าง "ไม่เจอเลย"
// (token ปลอม) กับ "เจอแต่ revoked แล้ว" (สัญญาณ token ถูกใช้ซ้ำ = หลุด)
export async function findSessionByToken(refreshToken: string): Promise<SessionRecord | null> {
  const result = await pool.query<SessionRecord>(
    `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
     FROM sessions WHERE refresh_token_hash = $1`,
    [hashToken(refreshToken)]
  );
  return result.rows[0] ?? null;
}

export async function revokeSession(id: string): Promise<void> {
  await pool.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
}

// ใช้ทั้งตอน "logout ทุกอุปกรณ์" (user กดเอง) และตอน reuse detection (ระบบสั่งเอง)
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}
