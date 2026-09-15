import "./env.js";
import { getEnabledRules } from "./rules-repository.js";
import { evaluateRule } from "./evaluator.js";

const INTERVAL_MS = 60_000;

async function tick(): Promise<void> {
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
