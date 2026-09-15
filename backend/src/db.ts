import pg from "pg";
import { requireEnv } from "./env.js";

// connection pool ตัวเดียวใช้ร่วมกันทั้งแอป — Fastify request handler ทุกตัวขอ
// connection จาก pool นี้ ไม่สร้างการเชื่อมต่อใหม่เอง
export const pool = new pg.Pool({
  connectionString: requireEnv("POSTGRES_URL"),
});
