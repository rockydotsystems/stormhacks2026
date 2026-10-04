CREATE TABLE "project_repositories" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	CONSTRAINT "project_repositories_project_id_repository_id_pk" PRIMARY KEY("project_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_repository_fk" FOREIGN KEY ("organization_id","repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_repositories_repository_idx" ON "project_repositories" USING btree ("repository_id");--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docs_project_idx" ON "docs" USING btree ("project_id");
--> statement-breakpoint
-- Preserve each legacy doc's repository set without inventing project groupings.
INSERT INTO projects (id, organization_id, name, created_at)
SELECT d.id, d.organization_id,
  coalesce(nullif((SELECT title FROM doc_changes WHERE doc_id = d.id ORDER BY id DESC LIMIT 1), ''), 'Imported doc ' || d.id::text),
  d.created_at
FROM docs d;
--> statement-breakpoint
INSERT INTO project_repositories (organization_id, project_id, repository_id)
SELECT organization_id, doc_id, repository_id FROM doc_repositories;
--> statement-breakpoint
-- Only the migration may fill the new ownership column on existing docs.
ALTER TABLE docs DISABLE TRIGGER docs_identity_guard;
--> statement-breakpoint
UPDATE docs SET project_id = id;
--> statement-breakpoint
ALTER TABLE docs ENABLE TRIGGER docs_identity_guard;
--> statement-breakpoint
ALTER TABLE docs ALTER COLUMN project_id SET NOT NULL;
--> statement-breakpoint
DROP TABLE doc_repositories;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_doc_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Doc identity, organization, and project are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_project_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Project identity and organization are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER projects_identity_guard BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION guard_project_identity();
