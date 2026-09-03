import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

// Important: never throw at module load time. Railway build can run without
// DATABASE_URL, and Next.js would otherwise fail to even start the dev server.
// We expose a `db` that proxies calls; queries fail gracefully at runtime.
function createNoopDb(): NodePgDatabase<typeof schema> {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "execute") {
        return async () => {
          throw new Error("DATABASE_URL is not configured");
        };
      }
      if (prop === "select" || prop === "insert" || prop === "update" || prop === "delete") {
        return new Proxy(function () {}, handler);
      }
      return undefined;
    },
    apply() {
      throw new Error("DATABASE_URL is not configured");
    },
  };
  return new Proxy({}, handler) as unknown as NodePgDatabase<typeof schema>;
}

const globalForDb = globalThis as typeof globalThis & {
  __footballAppPool?: Pool;
};

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl!,
    // Avoid hanging the request thread forever in serverless contexts.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export const pool: Pool | null = databaseUrl
  ? globalForDb.__footballAppPool ?? createPool()
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__footballAppPool = pool;
}

export const db: NodePgDatabase<typeof schema> = pool
  ? drizzle(pool, { schema })
  : createNoopDb();

export const isDbConfigured = Boolean(databaseUrl);
