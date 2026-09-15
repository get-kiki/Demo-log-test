import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { CanonicalEvent } from "@log-platform/shared";
import { requireAuth } from "../auth/middleware.js";
import { searchLogs } from "../logs/repository.js";

const SearchQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  tenant: z.string().optional(),
  // string ธรรมดา ไม่ใช่ SourceEnum แล้ว — เป็น substring ตอนนี้ (ดู
  // logs/repository.ts) ค่าที่พิมพ์มาไม่จำเป็นต้องตรง enum เป๊ะ
  source: z.string().optional(),
  event_type: z.string().optional(),
  src_ip: z.string().ip().optional(),
  severity_min: z.coerce.number().int().min(0).max(10).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(), // keyset ไม่ใช่ OFFSET — ดูเหตุผลใน logs/repository.ts
});

const SearchResult = z.object({
  items: z.array(CanonicalEvent),
  next_cursor: z.string().nullable(),
});

const ErrorResponse = z.object({ error: z.string(), message: z.string() });

export function registerSearchRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/search",
    {
      preHandler: [requireAuth],
      schema: {
        querystring: SearchQuery,
        response: { 200: SearchResult, 403: ErrorResponse },
      },
    },
    // scope เป็น argument แรกเสมอ (ตามที่ design doc ย้ำไว้) — ลืมส่งไม่ได้
    // ไม่งั้น repository ไม่มีทางรู้เลยว่า tenant ไหนที่ user คนนี้มีสิทธิ์เห็น
    async (req, reply) => {
      const result = await searchLogs(req.scope!, req.query);
      if (result === "forbidden_tenant") {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      return reply.send(result);
    }
  );
}
