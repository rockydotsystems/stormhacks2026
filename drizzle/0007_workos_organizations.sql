-- Preserve every existing UUID and record as text. Legacy organization rows are
-- retained, but their old local membership grants no longer authorize access.
-- WorkOS organizations use org_* IDs and require active provider membership.
CREATE TEMP TABLE workos_org_foreign_keys ON COMMIT DROP AS
SELECT conrelid::regclass::text AS table_name, conname AS constraint_name,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND conrelid IN ('docs'::regclass, 'projects'::regclass,
  'github_repositories'::regclass, 'project_repositories'::regclass,
  'organization_members'::regclass, 'personal_workspaces'::regclass,
  'planning_conversations'::regclass, 'github_installations'::regclass,
  'github_repository_access'::regclass, 'github_oauth_states'::regclass)
AND pg_get_constraintdef(oid) LIKE '%organization_id%';
--> statement-breakpoint
DO $$ DECLARE constraint_row record; BEGIN
  FOR constraint_row IN SELECT * FROM workos_org_foreign_keys LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.constraint_name);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "docs" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "github_repositories" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;--> statement-breakpoint
ALTER TABLE "project_repositories" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
ALTER TABLE "personal_workspaces" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
ALTER TABLE "planning_conversations" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
ALTER TABLE "github_installations" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
ALTER TABLE "github_repository_access" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
ALTER TABLE "github_oauth_states" ALTER COLUMN "organization_id" SET DATA TYPE text USING "organization_id"::text;
--> statement-breakpoint
DO $$ DECLARE constraint_row record; BEGIN
  FOR constraint_row IN SELECT * FROM workos_org_foreign_keys LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', constraint_row.table_name, constraint_row.constraint_name, constraint_row.definition);
  END LOOP;
END $$;
