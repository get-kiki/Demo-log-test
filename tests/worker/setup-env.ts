// ต้อง import ไฟล์นี้เป็นบรรทัดแรกสุดของไฟล์เทสในโฟลเดอร์นี้เสมอ (ก่อน import อะไรที่
// พึ่ง worker/src/db.ts) — import ถูก hoist ขึ้นบนสุดและรันตามลำดับที่เขียนไว้ แยกไฟล์
// นี้ออกมาต่างหากเพื่อให้ side effect (แก้ process.env) เกิดขึ้นจบก่อน db.ts จะถูก
// evaluate จริง
//
// เหตุผล: .env ตั้ง POSTGRES_URL ด้วย hostname "postgres" — ใช้ได้แค่ตอนรันข้างใน
// docker network เดียวกัน (worker service ตัวจริงรันเป็น container) แต่เทสนี้รันบน
// เครื่อง host เอง (`npx tsx`) resolve hostname "postgres" ไม่เจอ ("ENOTFOUND postgres")
// ต้องสลับไปต่อผ่าน "localhost:5433" แทน ซึ่งเป็นพอร์ตที่ docker-compose.yml publish
// ออกมาให้ host debug อยู่แล้ว (ดูคอมเมนต์ที่ services.postgres.ports ในไฟล์นั้น)
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

if (process.env.POSTGRES_URL?.includes("@postgres:5432")) {
  process.env.POSTGRES_URL = process.env.POSTGRES_URL.replace("@postgres:5432", "@localhost:5433");
}
