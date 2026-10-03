import "server-only";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDatabase() {
  const url = env.HYPERDRIVE.connectionString;
  return drizzle(
    postgres(url, {
      max: 5,
      fetch_types: false,
      prepare: true,
      connect_timeout: 5,
    }),
  );
}

export type Database = ReturnType<typeof createDatabase>;
