import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// __dirname ไม่มีในตัวใน ESM ต้องคำนวณเองจาก import.meta.url — คำนวณจากตำแหน่ง
// ไฟล์นี้เสมอ ไม่ขึ้นกับว่ารัน `npm run dev` จากโฟลเดอร์ไหน
const __dirname = dirname(fileURLToPath(import.meta.url));

// backend/src -> backend -> root ของ repo ที่ .env อยู่
config({ path: resolve(__dirname, "../../.env") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (ตรวจ .env ที่ root repo)`);
  }
  return value;
}
