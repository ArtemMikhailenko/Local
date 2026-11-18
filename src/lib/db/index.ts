import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

// Reuse one pool across hot reloads in dev and across invocations of a warm serverless instance.
const sql = globalForDb.sql ?? postgres(env.databaseUrl, { max: env.isProd ? 1 : 5, idle_timeout: 20, prepare: false });
if (!env.isProd) globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
