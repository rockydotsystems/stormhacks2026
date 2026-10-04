CREATE TABLE "linear_connections" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"linear_organization_id" text NOT NULL,
	"linear_organization_name" text NOT NULL,
	"linear_url_key" text NOT NULL,
	"connected_by" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_doc_links" (
	"doc_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"linear_project_id" text NOT NULL,
	"linear_project_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_issue_links" (
	"doc_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"linear_issue_id" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text NOT NULL,
	"parent_key" text,
	"content_hash" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "linear_issue_links_doc_id_item_key_pk" PRIMARY KEY("doc_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "linear_project_links" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"linear_team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"team_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"doc_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"plan" jsonb,
	"completed_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_connections" ADD CONSTRAINT "linear_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_connections" ADD CONSTRAINT "linear_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_doc_links" ADD CONSTRAINT "linear_doc_links_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_doc_links" ADD CONSTRAINT "linear_doc_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD CONSTRAINT "linear_issue_links_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_links" ADD CONSTRAINT "linear_project_links_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_syncs" ADD CONSTRAINT "linear_syncs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_syncs" ADD CONSTRAINT "linear_syncs_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_syncs" ADD CONSTRAINT "linear_syncs_version_id_doc_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."doc_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_syncs" ADD CONSTRAINT "linear_syncs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linear_syncs_doc_idx" ON "linear_syncs" USING btree ("doc_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_syncs_one_running_idx" ON "linear_syncs" USING btree ("doc_id") WHERE "linear_syncs"."status" = 'running';