CREATE TABLE "project_chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"client_message_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"via" text NOT NULL,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_chat_turns_retry_unique" UNIQUE("chat_id","client_message_id"),
	CONSTRAINT "project_chat_turns_via_check" CHECK ("project_chat_turns"."via" in ('text', 'voice'))
);
--> statement-breakpoint
CREATE TABLE "project_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"turn_token" uuid,
	"turn_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_chat_turns" ADD CONSTRAINT "project_chat_turns_chat_id_project_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."project_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_chats" ADD CONSTRAINT "project_chats_organization_id_project_id_projects_organization_id_id_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_chat_turns_chat_idx" ON "project_chat_turns" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "project_chats_owner_project_idx" ON "project_chats" USING btree ("owner_id","project_id","updated_at");