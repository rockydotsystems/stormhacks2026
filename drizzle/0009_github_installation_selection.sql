CREATE TABLE "github_selections" (
	"hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_selections" ADD CONSTRAINT "github_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_selections" ADD CONSTRAINT "github_selections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_selections_expiry_idx" ON "github_selections" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "github_oauth_states" DROP COLUMN "account_login";