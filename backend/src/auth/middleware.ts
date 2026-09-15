import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";

export interface RequestScope {
  userId: string;
  email: string;
  role: "admin" | "viewer";
  tenants: string[];
}

// ประกาศเพิ่มให้ FastifyRequest รู้จัก .scope — Fastify ไม่มี field นี้ในตัว
declare module "fastify" {
  interface FastifyRequest {
    scope?: RequestScope;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "unauthorized", message: "missing bearer token" });
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "unauthorized", message: "invalid or expired token" });
  }

  request.scope = {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    tenants: payload.tenants,
  };
}

// ใช้ต่อจาก requireAuth เสมอ (ต้องมี request.scope อยู่แล้ว) — เช็คว่า role
// ตรงตามที่ endpoint กำหนดไหม เช่น preHandler: [requireAuth, requireRole("admin")]
export function requireRole(role: "admin" | "viewer") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.scope?.role !== role) {
      return reply.code(403).send({ error: "forbidden", message: `requires role: ${role}` });
    }
  };
}
