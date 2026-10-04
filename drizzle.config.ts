import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Set DATABASE_URL in .env.local before running database commands.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./packages/data/src/**/schema.ts",
    "./src/features/notes/server/schema.ts",
    "./src/features/planning/server/schema.ts",
    "./src/features/project-chat/server/schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
});
