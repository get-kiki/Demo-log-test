import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AlertCondition } from "@log-platform/shared";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { listRules, createRule, updateRule, deleteRule, testCondition } from "../alerts/rules-repository.js";

const ChannelEnum = z.enum(["ui", "webhook", "email"]);

const RuleResponse = z.object({
  id: z.string().uuid(),
  tenant: z.string(),
  name: z.string(),
  condition: AlertCondition,
  channel: ChannelEnum,
  channel_config: z.record(z.unknown()),
  enabled: z.boolean(),
  created_at: z.string(),
});

const CreateRuleBody = z.object({
  tenant: z.string(),
  name: z.string().min(1),
  condition: AlertCondition,
  channel: ChannelEnum,
  channel_config: z.record(z.unknown()).default({}),
});

const PatchRuleBody = z.object({
  name: z.string().min(1).optional(),
  condition: AlertCondition.optional(),
  channel: ChannelEnum.optional(),
  channel_config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const TestRuleBody = z.object({
  tenant: z.string(),
  condition: AlertCondition,
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const TestRuleResponse = z.object({
  matches: z.array(
    z.object({
      group: z.record(z.string()),
      hits: z.number(),
      would_trigger: z.boolean(),
    })
  ),
});

const ErrorResponse = z.object({ error: z.string(), message: z.string() });
const PREHANDLER = [requireAuth, requireRole("admin")];

export function registerRulesRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/rules",
    { preHandler: PREHANDLER, schema: { response: { 200: z.array(RuleResponse) } } },
    async (req) => listRules(req.scope!.tenants)
  );

  app.post(
    "/api/v1/rules",
    {
      preHandler: PREHANDLER,
      schema: { body: CreateRuleBody, response: { 201: RuleResponse, 403: ErrorResponse } },
    },
    async (req, reply) => {
      if (!req.scope!.tenants.includes(req.body.tenant)) {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      const rule = await createRule(req.body);
      return reply.code(201).send(rule);
    }
  );

  // ทดสอบ "เงื่อนไข" กับ log ย้อนหลังโดยยังไม่ต้องบันทึก rule ก่อน — ไม่แตะตาราง
  // alert_rules/alert_events เลย เป็นแค่ query อ่านอย่างเดียว ใช้ตอนแก้ threshold
  // ในฟอร์มไปเรื่อยๆ จนกว่าจะพอใจแล้วค่อยกด "บันทึก" จริง
  app.post(
    "/api/v1/rules/test",
    {
      preHandler: PREHANDLER,
      schema: { body: TestRuleBody, response: { 200: TestRuleResponse, 403: ErrorResponse } },
    },
    async (req, reply) => {
      if (!req.scope!.tenants.includes(req.body.tenant)) {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      const matches = await testCondition(req.body.tenant, req.body.condition, req.body.from, req.body.to);
      return reply.send({ matches });
    }
  );

  app.patch(
    "/api/v1/rules/:id",
    {
      preHandler: PREHANDLER,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: PatchRuleBody,
        response: { 200: RuleResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const rule = await updateRule(req.params.id, req.scope!.tenants, req.body);
      if (!rule) return reply.code(404).send({ error: "not_found", message: "rule not found" });
      return reply.send(rule);
    }
  );

  app.delete(
    "/api/v1/rules/:id",
    {
      preHandler: PREHANDLER,
      schema: { params: z.object({ id: z.string().uuid() }), response: { 404: ErrorResponse } },
    },
    async (req, reply) => {
      const deleted = await deleteRule(req.params.id, req.scope!.tenants);
      if (!deleted) return reply.code(404).send({ error: "not_found", message: "rule not found" });
      return reply.code(204).send();
    }
  );
}
