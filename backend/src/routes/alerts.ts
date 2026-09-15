import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { listAlerts, updateAlertStatus } from "../alerts/events-repository.js";

const StatusEnum = z.enum(["open", "ack", "closed"]);

const AlertResponse = z.object({
  id: z.string().uuid(),
  rule_id: z.string().uuid(),
  rule_name: z.string(),
  tenant: z.string(),
  triggered_at: z.string(),
  status: StatusEnum,
  dedupe_key: z.string(),
  details: z.record(z.unknown()),
});

const ErrorResponse = z.object({ error: z.string(), message: z.string() });

export function registerAlertsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/alerts",
    {
      preHandler: [requireAuth],
      schema: {
        querystring: z.object({ status: StatusEnum.optional() }),
        response: { 200: z.array(AlertResponse) },
      },
    },
    async (req) => listAlerts(req.scope!.tenants, req.query.status)
  );

  app.patch(
    "/api/v1/alerts/:id",
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ status: z.enum(["ack", "closed"]) }),
        response: { 200: AlertResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const alert = await updateAlertStatus(req.params.id, req.scope!.tenants, req.body.status);
      if (!alert) return reply.code(404).send({ error: "not_found", message: "alert not found" });
      return reply.send(alert);
    }
  );
}
