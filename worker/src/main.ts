import "./env.js";
import { getEnabledRules } from "./rules-repository.js";
import { evaluateRule } from "./evaluator.js";
import { maintainLogPartitions } from "./partitions.js";

const INTERVAL_MS = 60_000;

async function tick(): Promise<void> {
  // สร้าง partition ของวันถัดๆ ไป + ลบของเก่าเกิน retention ก่อนเสมอ ทำก่อน evaluate
  // rule เพราะถ้าปล่อยให้ query logs ของ "วันนี้" ไปเจอ partition ที่ยังไม่ถูกสร้าง
  // (เช่น worker เพิ่งข้ามเที่ยงคืนมา) จะไม่เห็นข้อมูลของวันนี้เลย แยก try/catch ของ
  // ตัวเอง ไม่ให้ล้มแล้วทำให้ rule ทั้งหมดในรอบนี้ไม่ถูกประเมินตามไปด้วย
  try {
    await maintainLogPartitions();
  } catch (err) {
    console.error("[alert-worker] maintain_logs_partitions ล้มเหลว", err);
  }

  const rules = await getEnabledRules();
  for (const rule of rules) {
    try {
      await evaluateRule(rule);
    } catch (err) {
      // rule หนึ่งพังไม่ควรทำให้ rule อื่นในรอบเดียวกันไม่ถูกประเมิน
      console.error(`[alert-worker] rule ${rule.id} (${rule.name}) evaluate ล้มเหลว`, err);
    }
  }
}

console.log(`[alert-worker] เริ่มทำงาน — ประเมิน rule ทุก ${INTERVAL_MS / 1000} วินาที`);
tick().catch((err) => console.error("[alert-worker] tick แรกล้มเหลว", err));
setInterval(() => {
  tick().catch((err) => console.error("[alert-worker] tick ล้มเหลว", err));
}, INTERVAL_MS);
