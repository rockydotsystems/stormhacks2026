CREATE TABLE "doc_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "doc_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"doc_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_changes_doc_id_unique" UNIQUE("doc_id","id")
);
--> statement-breakpoint
CREATE TABLE "doc_repositories" (
	"organization_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	CONSTRAINT "doc_repositories_doc_id_repository_id_pk" PRIMARY KEY("doc_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "doc_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"change_id" bigint NOT NULL,
	"number" integer DEFAULT 0 NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_versions_doc_number_unique" UNIQUE("doc_id","number"),
	CONSTRAINT "doc_versions_doc_change_unique" UNIQUE("doc_id","change_id"),
	CONSTRAINT "doc_versions_positive_number" CHECK ("doc_versions"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docs_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "github_repositories_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "github_repositories_org_slug_unique" UNIQUE("organization_id","owner","name")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_changes" ADD CONSTRAINT "doc_changes_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_changes" ADD CONSTRAINT "doc_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_repositories" ADD CONSTRAINT "doc_repositories_organization_id_doc_id_docs_organization_id_id_fk" FOREIGN KEY ("organization_id","doc_id") REFERENCES "public"."docs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_repositories" ADD CONSTRAINT "doc_repositories_organization_id_repository_id_github_repositories_organization_id_id_fk" FOREIGN KEY ("organization_id","repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_doc_id_change_id_doc_changes_doc_id_id_fk" FOREIGN KEY ("doc_id","change_id") REFERENCES "public"."doc_changes"("doc_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_repositories_repository_idx" ON "doc_repositories" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");
--> statement-breakpoint
-- Serialize history mutations on the doc, including callers outside the service.
CREATE FUNCTION guard_doc_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_doc uuid;
  target_change bigint;
  published_boundary bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Snapshots are append-only; write a new change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    target_doc := OLD.doc_id;
    target_change := OLD.id;
  ELSE
    target_doc := NEW.doc_id;
    target_change := NEW.id;
  END IF;
  PERFORM 1 FROM docs WHERE id = target_doc FOR UPDATE;
  SELECT max(change_id) INTO published_boundary FROM doc_versions WHERE doc_id = target_doc;
  IF target_change <= published_boundary THEN
    RAISE EXCEPTION 'Published history is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER doc_changes_guard BEFORE INSERT OR UPDATE OR DELETE ON doc_changes
FOR EACH ROW EXECUTE FUNCTION guard_doc_change();
--> statement-breakpoint
CREATE FUNCTION guard_doc_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest_number integer;
  published_boundary bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Versions cannot be changed or unpublished' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM docs WHERE id = NEW.doc_id FOR UPDATE;
  SELECT coalesce(max(number), 0), coalesce(max(change_id), 0)
    INTO latest_number, published_boundary FROM doc_versions WHERE doc_id = NEW.doc_id;
  IF NEW.change_id <= published_boundary THEN
    RAISE EXCEPTION 'Publish a change after the latest version' USING ERRCODE = '23514';
  END IF;
  IF NEW.number <> 0 AND NEW.number <> latest_number + 1 THEN
    RAISE EXCEPTION 'Version numbers must be sequential' USING ERRCODE = '23514';
  END IF;
  NEW.number := latest_number + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER doc_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON doc_versions
FOR EACH ROW EXECUTE FUNCTION guard_doc_version();
--> statement-breakpoint
CREATE FUNCTION guard_doc_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Doc identity and organization are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER docs_identity_guard BEFORE UPDATE ON docs
FOR EACH ROW EXECUTE FUNCTION guard_doc_identity();
