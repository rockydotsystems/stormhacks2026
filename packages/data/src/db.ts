import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type Database = PostgresJsDatabase;
export type Page = { offset: number; limit: number };
