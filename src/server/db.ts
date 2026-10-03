import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

function createDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for database access.");
  return drizzle(
    postgres(url, { max: 10, prepare: false, connect_timeout: 5 }),
  );
}

export type Database = ReturnType<typeof createDatabase>;

// Reuse the pool across development hot reloads. Never store request data here.
const globalForDb = globalThis as typeof globalThis & { database?: Database };

export function getDatabase(): Database {
  return (globalForDb.database ??= createDatabase());
}
