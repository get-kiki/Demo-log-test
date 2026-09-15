import pg from "pg";
import { requireEnv } from "./env.js";

export const pool = new pg.Pool({
  connectionString: requireEnv("POSTGRES_URL"),
});
