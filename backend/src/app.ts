import Fastify from "fastify";
import cookie from "@fastify/cookie";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerRulesRoutes } from "./routes/rules.js";
import { registerAlertsRoutes } from "./routes/alerts.js";
import { registerInternalRoutes } from "./routes/internal.js";

export async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // ให้ Zod schema เป็นตัวเดียวที่ทำทั้ง validate request และ serialize response
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ต้อง register ก่อน route ที่ใช้ req.cookies / reply.setCookie (auth routes)
  await app.register(cookie);

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerSearchRoutes(app);
  registerStatsRoutes(app);
  registerRulesRoutes(app);
  registerAlertsRoutes(app);
  registerInternalRoutes(app);

  return app;
}
