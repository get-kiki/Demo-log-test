import type { FastifyInstance } from "fastify";
import { findTenantByApiKey } from "../auth/api-keys-repository.js";

const API_KEY_HEADER = "x-api-key";

// เรียกจาก Caddy เท่านั้น (forward_auth ใน Caddyfile) ไม่ได้อยู่ใต้ /api/v1/*
// เลยไม่มีทางที่ user ภายนอกจะยิงมาถึง endpoint นี้ตรงๆ ผ่าน public URL ได้ —
// Caddy คุยกับ api:3000 ตรงๆ ผ่าน docker network ภายในเท่านั้น (path /internal/*
// ไม่ได้ถูก proxy ออกให้ handle /api/* จับเลย)
//
// ตอบ 204 (ไม่มี body) ไม่ใช่ 200 + JSON เพราะ Caddy forward_auth สนใจแค่
// status code ของ response ไม่อ่าน body เลย ส่งอะไรกลับไปเพิ่มก็เสียเปล่า
export function registerInternalRoutes(app: FastifyInstance) {
  app.get("/internal/verify-key", async (req, reply) => {
    const key = req.headers[API_KEY_HEADER];
    if (typeof key !== "string" || key.length === 0) {
      return reply.code(401).send();
    }

    const match = await findTenantByApiKey(key);
    if (!match) {
      return reply.code(401).send();
    }

    // ส่ง tenant ที่ resolve ได้จริงจาก key กลับไปใน header เผื่อไว้ — ตอนนี้
    // Caddyfile ยังไม่ได้ copy_headers ตัวนี้ต่อเข้า Vector (Vector ยังเชื่อ
    // .tenant ที่ผู้ส่งเขียนเองใน JSON body อยู่) เป็นสเต็ปถัดไปถ้าจะปิดช่องที่
    // เจ้าของ key tenant หนึ่งแอบอ้างเป็นอีก tenant ผ่าน body ได้ — ใส่ไว้ตรงนี้
    // ก่อนเพราะไม่มีต้นทุนเพิ่ม (resolve มาแล้วจากขั้นตอนเช็ค key อยู่แล้ว)
    reply.header("X-Tenant", match.tenant);
    return reply.code(204).send();
  });
}
