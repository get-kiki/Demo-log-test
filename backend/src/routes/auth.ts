import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findUserByEmail, findUserById } from "../users/repository.js";
import { verifyPassword } from "../auth/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../auth/tokens.js";
import {
  createSession,
  findSessionByToken,
  revokeSession,
  revokeAllSessionsForUser,
} from "../auth/sessions-repository.js";
import { requireAuth } from "../auth/middleware.js";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

const UserPublic = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "viewer"]),
  tenants: z.array(z.string()),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LoginResponse = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(),
  user: UserPublic,
});

const ErrorResponse = z.object({
  error: z.string(),
  message: z.string(),
});

export function registerAuthRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------
  // POST /api/v1/auth/login
  // ---------------------------------------------------------------------
  app.post(
    "/api/v1/auth/login",
    { schema: { body: LoginBody, response: { 200: LoginResponse, 401: ErrorResponse } } },
    async (req, reply) => {
      const { email, password } = req.body;
      const user = await findUserByEmail(email);

      // ข้อความ error เดียวกันไม่ว่าจะเป็น "ไม่มี email นี้" หรือ "password ผิด"
      // — ไม่บอกผู้โจมตีว่า email ไหนมีอยู่จริงในระบบบ้าง (user enumeration)
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return reply.code(401).send({ error: "invalid_credentials", message: "email หรือ password ไม่ถูกต้อง" });
      }

      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        tenants: user.tenants,
      });
      const refreshToken = signRefreshToken(user.id);
      await createSession(user.id, refreshToken);

      setRefreshCookie(reply, refreshToken);
      return reply.send({
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: 15 * 60,
        user: { id: user.id, email: user.email, role: user.role, tenants: user.tenants },
      });
    }
  );

  // ---------------------------------------------------------------------
  // POST /api/v1/auth/refresh — จุดที่ reuse detection เกิดขึ้นจริง
  // ---------------------------------------------------------------------
  app.post(
    "/api/v1/auth/refresh",
    { schema: { response: { 200: LoginResponse, 401: ErrorResponse } } },
    async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) {
        return reply.code(401).send({ error: "unauthorized", message: "missing refresh token" });
      }

      try {
        verifyRefreshToken(token); // เช็คแค่ลายเซ็น + ยังไม่หมดอายุ (7 วัน)
      } catch {
        reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        return reply.code(401).send({ error: "unauthorized", message: "invalid or expired refresh token" });
      }

      const session = await findSessionByToken(token);
      if (!session) {
        // JWT ลายเซ็นถูกแต่หา session ใน DB ไม่เจอเลย — ไม่ควรเกิดขึ้นได้ในทาง
        // ปกติ ปฏิเสธไปเฉยๆ ไม่ต้องเดาว่าเกิดจากอะไร
        return reply.code(401).send({ error: "unauthorized", message: "session not found" });
      }

      if (session.revoked_at) {
        // token นี้ "เคยถูกใช้ไปแล้วครั้งหนึ่ง" (rotate ไปแล้ว) แต่มีคนเอามันมาใช้
        // อีกรอบ — ทางเดียวที่เป็นไปได้คือมีสำเนา token หลุดไปอยู่ที่อื่น
        // (ดูรายละเอียด scenario เต็มๆ ที่คุยกันไว้ก่อนหน้านี้) เตะทุก session
        // ของ user คนนี้ทิ้งทันที ไม่ใช่แค่ตัวนี้ตัวเดียว
        await revokeAllSessionsForUser(session.user_id);
        reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        return reply.code(401).send({ error: "token_reuse_detected", message: "all sessions revoked, please log in again" });
      }

      const user = await findUserById(session.user_id);
      if (!user) {
        return reply.code(401).send({ error: "unauthorized", message: "user no longer exists" });
      }

      // rotation: ปิด session เก่า เปิดใหม่ — ถ้า token เก่า (ที่เพิ่งปิด) โผล่มา
      // ใช้อีกครั้งในอนาคต จะเข้าเงื่อนไข session.revoked_at ด้านบนทันที
      await revokeSession(session.id);
      const newAccessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        tenants: user.tenants,
      });
      const newRefreshToken = signRefreshToken(user.id);
      await createSession(user.id, newRefreshToken);

      setRefreshCookie(reply, newRefreshToken);
      return reply.send({
        access_token: newAccessToken,
        token_type: "Bearer" as const,
        expires_in: 15 * 60,
        user: { id: user.id, email: user.email, role: user.role, tenants: user.tenants },
      });
    }
  );

  // ---------------------------------------------------------------------
  // POST /api/v1/auth/logout — revoke แค่ session ของอุปกรณ์นี้ (ไม่ใช่ทุกอุปกรณ์)
  // ---------------------------------------------------------------------
  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) {
      const session = await findSessionByToken(token);
      if (session && !session.revoked_at) {
        await revokeSession(session.id);
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------
  // GET /api/v1/auth/me
  // ---------------------------------------------------------------------
  app.get(
    "/api/v1/auth/me",
    { preHandler: [requireAuth], schema: { response: { 200: UserPublic } } },
    async (req, reply) => {
      // ดึงจาก DB สดๆ ไม่ใช่จาก claim ใน token เฉยๆ — เผื่อ role/tenants ถูก
      // admin แก้ไปหลังจาก token นี้ถูกออกแล้ว
      const user = await findUserById(req.scope!.userId);
      if (!user) {
        return reply.code(401).send({ error: "unauthorized", message: "user no longer exists" });
      }
      return reply.send({ id: user.id, email: user.email, role: user.role, tenants: user.tenants });
    }
  );
}

function setRefreshCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    // secure ควรเป็น true เสมอตอน deploy จริง (โหมด SaaS มี HTTPS บังคับอยู่แล้ว
    // ตามข้อสอบ) แต่ appliance/dev รันบน http เฉยๆ ยังไม่มี TLS จนกว่าจะถึงสเต็ป
    // Caddy — ปล่อย false ไว้ก่อน แล้วมาแก้เป็น dynamic ตาม request.protocol ตอน
    // ต่อ Caddy จริง
    secure: false,
  });
}
