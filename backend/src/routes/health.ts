import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";

export function registerHealthRoutes(app: FastifyInstance) {
  // process ยังไม่ตาย — ไม่แตะ dependency ใดๆ ตอบเร็วที่สุดเท่าที่จะทำได้
  app.get("/healthz", async () => ({ status: "ok" }));

  // พร้อมรับ traffic จริงไหม — ต้องต่อ Postgres ได้ ถ้าต่อไม่ได้ตอบ 503 เพื่อให้
  // reverse proxy (Caddy) หยุดส่ง request มาจนกว่า DB จะกลับมา
  app.get("/readyz", async (_req, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch (err) {
      app.log.error(err, "readyz: postgres unreachable");
      return reply.code(503).send({ status: "not_ready" });
    }
  });
}
