import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { getSummary, getTimeline, getTop } from "../logs/stats-repository.js";

const RangeQuery = {
  from: z.string().datetime(),
  to: z.string().datetime(),
  tenant: z.string().optional(),
};

const ErrorResponse = z.object({ error: z.string(), message: z.string() });

const SummaryResponse = z.object({
  total: z.number(),
  unique_src_ip: z.number(),
  alerts: z.number(),
  parse_errors: z.number(),
});

const TimelineResponse = z.array(
  z.object({ bucket: z.string(), source: z.string(), count: z.number() })
);

const TopItem = z.object({ value: z.string(), count: z.number() });
const TopResponse = z.object({
  top_src_ip: z.array(TopItem),
  top_user: z.array(TopItem),
  top_event_type: z.array(TopItem),
});

export function registerStatsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/stats/summary",
    {
      preHandler: [requireAuth],
      schema: { querystring: z.object(RangeQuery), response: { 200: SummaryResponse, 403: ErrorResponse } },
    },
    async (req, reply) => {
      const result = await getSummary(req.scope!, req.query);
      if (result === "forbidden_tenant") {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      return reply.send(result);
    }
  );

  app.get(
    "/api/v1/stats/timeline",
    {
      preHandler: [requireAuth],
      schema: {
        querystring: z.object({ ...RangeQuery, interval: z.string().default("1 hour") }),
        response: { 200: TimelineResponse, 403: ErrorResponse },
      },
    },
    async (req, reply) => {
      const result = await getTimeline(req.scope!, req.query);
      if (result === "forbidden_tenant") {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      return reply.send(result);
    }
  );

  app.get(
    "/api/v1/stats/top",
    {
      preHandler: [requireAuth],
      schema: {
        querystring: z.object({ ...RangeQuery, limit: z.coerce.number().int().min(1).max(50).default(10) }),
        response: { 200: TopResponse, 403: ErrorResponse },
      },
    },
    async (req, reply) => {
      const result = await getTop(req.scope!, req.query);
      if (result === "forbidden_tenant") {
        return reply.code(403).send({ error: "forbidden", message: "no access to requested tenant" });
      }
      return reply.send(result);
    }
  );
}
