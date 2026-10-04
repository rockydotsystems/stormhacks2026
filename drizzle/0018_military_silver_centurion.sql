CREATE TABLE "slack_channels" (
	"team_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "slack_channels_team_id_channel_id_pk" PRIMARY KEY("team_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "slack_users" (
	"team_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "slack_users_team_id_slack_user_id_pk" PRIMARY KEY("team_id","slack_user_id"),
	CONSTRAINT "slack_users_team_id_user_id_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "slack_workspaces" (
	"team_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "slack_workspaces_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_team_id_slack_workspaces_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."slack_workspaces"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_team_id_slack_workspaces_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."slack_workspaces"("team_id") ON DELETE cascade ON UPDATE no action;
