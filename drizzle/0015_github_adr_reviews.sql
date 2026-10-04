CREATE TABLE "github_review_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"pull_number" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"result" jsonb,
	"reason" text,
	"review_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_review_jobs_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "github_review_jobs" ADD CONSTRAINT "github_review_jobs_delivery_id_github_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."github_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_review_jobs" ADD CONSTRAINT "github_review_jobs_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_review_jobs" ADD CONSTRAINT "github_review_jobs_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_review_jobs_pending_idx" ON "github_review_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "github_review_jobs_pull_idx" ON "github_review_jobs" USING btree ("repository_id","pull_number");