CREATE TABLE "github_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"repository_id" uuid,
	"event" text NOT NULL,
	"action" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_login" text NOT NULL,
	"connected_by" text NOT NULL,
	"github_user_id" text NOT NULL,
	"github_user_login" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "github_oauth_states" (
	"hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_login" text NOT NULL,
	"verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repository_access" (
	"repository_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"github_id" text NOT NULL,
	"authorized" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "github_repository_access_remote_unique" UNIQUE("installation_id","github_id")
);
--> statement-breakpoint
ALTER TABLE "github_deliveries" ADD CONSTRAINT "github_deliveries_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_deliveries" ADD CONSTRAINT "github_deliveries_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_oauth_states" ADD CONSTRAINT "github_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_oauth_states" ADD CONSTRAINT "github_oauth_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_access" ADD CONSTRAINT "github_access_installation_fk" FOREIGN KEY ("organization_id","installation_id") REFERENCES "public"."github_installations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_access" ADD CONSTRAINT "github_access_repository_fk" FOREIGN KEY ("organization_id","repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_deliveries_installation_time_idx" ON "github_deliveries" USING btree ("installation_id","received_at");--> statement-breakpoint
CREATE INDEX "github_installations_org_idx" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "github_oauth_states_expiry_idx" ON "github_oauth_states" USING btree ("expires_at");