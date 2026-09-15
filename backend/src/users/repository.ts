import { pool } from "../db.js";

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: "admin" | "viewer";
  tenants: string[];
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT id, email, password_hash, role, tenants FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT id, email, password_hash, role, tenants FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
