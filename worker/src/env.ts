import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// เหมือน backend/src/env.ts เป๊ะ — คำนวณ path จากตำแหน่งไฟล์นี้เอง ไม่พึ่ง CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (ตรวจ .env ที่ root repo)`);
  }
  return value;
}
